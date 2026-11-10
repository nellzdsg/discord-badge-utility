//! Process emulation engine.
//!
//! For every game in the Discord database we copy a tiny helper executable to a
//! temporary folder, rename it to the game's executable name, launch it and keep
//! it alive for the configured duration. Discord's process scan then reports the
//! game as running, exactly as it does for a real installation.
//!
//! Nothing is injected into Discord, no token is used and the Discord client is
//! never modified.

use crate::discord::{SpoofMethod, SpoofableGame};
use crate::history::{load_history, record_batch};
use crate::i18n::is_russian;
use crate::state::{
    ActiveGame, LogEvent, RunContext, SpooferConfig, SpooferStatus, StatusEvent, TickEvent,
};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const MAX_ACTIVE: usize = 20;
const TICK_MS: u64 = 200;
const MAX_PATH_LEN: usize = 240;

#[cfg(windows)]
pub(crate) const DUMMY_BYTES: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/dummy.exe"));
#[cfg(not(windows))]
pub(crate) const DUMMY_BYTES: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/dummy"));

fn msg(russian: String, english: String) -> String {
    if is_russian() {
        russian
    } else {
        english
    }
}

fn log(app: &AppHandle, level: &str, message: &str) {
    let _ = app.emit(
        "spoofer_log",
        LogEvent {
            level: level.to_string(),
            message: message.to_string(),
        },
    );
}

async fn set_status(
    app: &AppHandle,
    ctx: &RunContext,
    status: SpooferStatus,
    message: Option<String>,
) {
    *ctx.status.write().await = status;
    let _ = app.emit("spoofer_status", StatusEvent { status, message });
}

pub(crate) fn temp_root() -> PathBuf {
    std::env::temp_dir().join("discord-badge-utility")
}

pub(crate) fn cleanup(path: &Path) {
    if path.exists() {
        let _ = fs::remove_dir_all(path);
    }
}

/// Adds a small random spread to the hold duration so batches do not look
/// perfectly periodic.
fn apply_jitter(duration: Duration, enabled: bool) -> Duration {
    if !enabled {
        return duration;
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.subsec_nanos())
        .unwrap_or(0);
    let factor = 0.75 + (nanos % 500) as f64 / 1000.0;
    duration.mul_f64(factor)
}

/// Sleeps for `remaining`, but reacts to pause and stop requests.
///
/// Returns `false` when the run was cancelled.
async fn wait_with_controls(mut remaining: Duration, ctx: &RunContext) -> bool {
    loop {
        if ctx.is_cancelled() {
            return false;
        }
        if ctx.is_paused() {
            tokio::time::sleep(Duration::from_millis(TICK_MS)).await;
            continue;
        }
        if remaining.is_zero() {
            return true;
        }

        let slice = remaining.min(Duration::from_millis(TICK_MS));
        let started = Instant::now();
        tokio::time::sleep(slice).await;
        remaining = remaining.saturating_sub(started.elapsed());
    }
}

fn emit_tick(
    app: &AppHandle,
    processed: usize,
    total: usize,
    active: &[ActiveGame],
    started: Instant,
    succeeded: usize,
    failed: usize,
) {
    let elapsed = started.elapsed().as_secs();
    let rate = if elapsed > 0 {
        processed as f64 / (elapsed as f64 / 60.0)
    } else {
        0.0
    };
    let remaining = total.saturating_sub(processed);
    let eta = if rate > 0.0 {
        (remaining as f64 / rate * 60.0).round() as u64
    } else {
        0
    };

    let _ = app.emit(
        "spoofer_tick",
        TickEvent {
            current: processed,
            total,
            active: active.to_vec(),
            elapsed_secs: elapsed,
            eta_secs: eta,
            rate,
            succeeded,
            failed,
        },
    );
}

pub(crate) fn spawn_process(path: &Path) -> std::io::Result<std::process::Child> {
    let mut command = std::process::Command::new(path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    }
    command.spawn()
}

pub fn force_kill(pid: u32) {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };

        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !handle.is_null() {
            TerminateProcess(handle, 1);
            CloseHandle(handle);
        }
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
    }
}

/// Checks whether a process is still alive. Used by the farm to respawn a
/// helper that was killed from outside (task manager, antivirus, etc.).
pub(crate) fn is_alive(pid: u32) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, STILL_ACTIVE,
        };

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }

        let mut code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);

        ok != 0 && code == STILL_ACTIVE as u32
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        false
    }
}

/// Win32 Job Object that kills every assigned process when the handle closes.
/// This is what guarantees no orphan helper processes after a crash.
#[cfg(windows)]
pub(crate) struct JobGuard {
    handle: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
impl JobGuard {
    pub(crate) fn new() -> Option<Self> {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return None;
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            let configured = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if configured == 0 {
                CloseHandle(handle);
                return None;
            }

            Some(Self { handle })
        }
    }

    pub(crate) fn assign(&self, pid: u32) {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
        };

        unsafe {
            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if !process.is_null() {
                AssignProcessToJobObject(self.handle, process);
                CloseHandle(process);
            }
        }
    }
}

#[cfg(windows)]
impl Drop for JobGuard {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.handle);
        }
    }
}

#[cfg(windows)]
unsafe impl Send for JobGuard {}
#[cfg(windows)]
unsafe impl Sync for JobGuard {}

#[cfg(not(windows))]
pub(crate) struct JobGuard;

#[cfg(not(windows))]
impl JobGuard {
    pub(crate) fn new() -> Option<Self> {
        None
    }
    pub(crate) fn assign(&self, _pid: u32) {}
}

pub async fn run(
    app: AppHandle,
    all_games: Vec<SpoofableGame>,
    config: SpooferConfig,
    ctx: RunContext,
) {
    // Only native Windows executables are used: the RPC fallback was left out on
    // purpose, because Discord does not reliably count it.
    let mut pool: Vec<SpoofableGame> = all_games
        .into_iter()
        .filter(|game| game.method == SpoofMethod::Process && game.rel_path.is_some())
        .filter(|game| !config.exclude_adult || !game.adult)
        .collect();

    // Two games sharing an executable path cannot run side by side.
    let mut seen_paths: HashSet<String> = HashSet::new();
    pool.retain(|game| match &game.rel_path {
        Some(path) => seen_paths.insert(path.to_ascii_lowercase()),
        None => false,
    });

    if config.skip_played {
        let played = load_history();
        let before = pool.len();
        pool.retain(|game| !played.contains(&game.id));
        let skipped = before - pool.len();
        if skipped > 0 {
            log(
                &app,
                "info",
                &msg(
                    format!("Пропущено {skipped} игр из истории."),
                    format!("Skipped {skipped} games from history."),
                ),
            );
        }
    }

    if let Some(limit) = config.limit {
        pool.truncate(limit);
    }

    let total = pool.len();
    if total == 0 {
        set_status(
            &app,
            &ctx,
            SpooferStatus::Finished,
            Some(msg(
                "Нет игр для обработки.".to_string(),
                "No games to process.".to_string(),
            )),
        )
        .await;
        return;
    }

    let batch_size = config.batch_size.clamp(1, MAX_ACTIVE);
    let hold = apply_jitter(
        Duration::from_secs(config.hold_secs.clamp(1, 3600)),
        config.jitter,
    );

    let root = temp_root();
    cleanup(&root);
    if let Err(error) = fs::create_dir_all(&root) {
        set_status(
            &app,
            &ctx,
            SpooferStatus::Error,
            Some(format!("Temp folder error: {error}")),
        )
        .await;
        return;
    }

    let base_dummy = root.join("base.exe");
    if let Err(error) = fs::write(&base_dummy, DUMMY_BYTES) {
        set_status(
            &app,
            &ctx,
            SpooferStatus::Error,
            Some(format!("Failed to write the helper binary: {error}")),
        )
        .await;
        cleanup(&root);
        return;
    }

    let job = JobGuard::new();
    if job.is_none() {
        log(
            &app,
            "warn",
            &msg(
                "Job Object недоступен: после аварийного закрытия процессы могут остаться."
                    .to_string(),
                "Job Object unavailable: processes may survive an abnormal exit.".to_string(),
            ),
        );
    }

    set_status(&app, &ctx, SpooferStatus::Running, None).await;
    log(
        &app,
        "info",
        &msg(
            format!(
                "Старт: {total} игр, батч {batch_size}, удержание {} с.",
                hold.as_secs()
            ),
            format!(
                "Started: {total} games, batch {batch_size}, hold {} s.",
                hold.as_secs()
            ),
        ),
    );

    let started = Instant::now();
    let mut succeeded = 0usize;
    let mut failed = 0usize;
    let mut batch_index = 0usize;
    let mut cancelled = false;

    for chunk in pool.chunks(batch_size) {
        if ctx.is_cancelled() {
            cancelled = true;
            break;
        }

        batch_index += 1;
        let batch_dir = root.join(format!("b{batch_index}"));
        if let Err(error) = fs::create_dir_all(&batch_dir) {
            failed += chunk.len();
            log(
                &app,
                "error",
                &msg(
                    format!("Не удалось создать папку батча: {error}"),
                    format!("Failed to create the batch folder: {error}"),
                ),
            );
            continue;
        }

        let mut active: Vec<ActiveGame> = Vec::new();
        let mut pids: Vec<u32> = Vec::new();
        let mut spawned = 0usize;

        for game in chunk {
            if ctx.is_cancelled() {
                cancelled = true;
                break;
            }

            let Some(relative) = game.rel_path.as_ref() else {
                continue;
            };
            let target = batch_dir.join(relative);

            if target.to_string_lossy().len() > MAX_PATH_LEN {
                failed += 1;
                log(
                    &app,
                    "warn",
                    &msg(
                        format!("Пропуск «{}»: слишком длинный путь.", game.name),
                        format!("Skipping \"{}\": path is too long.", game.name),
                    ),
                );
                continue;
            }

            if let Some(parent) = target.parent() {
                if let Err(error) = fs::create_dir_all(parent) {
                    failed += 1;
                    log(
                        &app,
                        "error",
                        &msg(
                            format!("Не удалось создать папку для «{}»: {error}", game.name),
                            format!("Failed to create a folder for \"{}\": {error}", game.name),
                        ),
                    );
                    continue;
                }
            }

            if let Err(error) = fs::copy(&base_dummy, &target) {
                failed += 1;
                log(
                    &app,
                    "error",
                    &msg(
                        format!("Не удалось подготовить «{}»: {error}", game.name),
                        format!("Failed to prepare \"{}\": {error}", game.name),
                    ),
                );
                continue;
            }

            match spawn_process(&target) {
                Ok(child) => {
                    let pid = child.id();
                    drop(child);

                    if let Some(job) = &job {
                        job.assign(pid);
                    }
                    pids.push(pid);
                    active.push(ActiveGame {
                        id: game.id.clone(),
                        name: game.name.clone(),
                        executable: relative.clone(),
                        pid: Some(pid),
                    });
                    spawned += 1;
                }
                Err(error) => {
                    failed += 1;
                    log(
                        &app,
                        "error",
                        &msg(
                            format!("Не удалось запустить «{}»: {error}", game.name),
                            format!("Failed to launch \"{}\": {error}", game.name),
                        ),
                    );
                }
            }
        }

        if spawned == 0 {
            cleanup(&batch_dir);
            emit_tick(
                &app,
                succeeded + failed,
                total,
                &[],
                started,
                succeeded,
                failed,
            );
            if cancelled {
                break;
            }
            continue;
        }

        {
            let mut guard = ctx.active_pids.lock().await;
            guard.extend(pids.iter().copied());
        }

        emit_tick(
            &app,
            succeeded + failed,
            total,
            &active,
            started,
            succeeded,
            failed,
        );

        let completed = wait_with_controls(hold, &ctx).await;

        for pid in &pids {
            force_kill(*pid);
        }
        {
            let mut guard = ctx.active_pids.lock().await;
            guard.retain(|pid| !pids.contains(pid));
        }
        cleanup(&batch_dir);

        if completed {
            succeeded += spawned;
            let ids: Vec<String> = active.iter().map(|entry| entry.id.clone()).collect();
            record_batch(&ids);
        } else {
            failed += spawned;
            cancelled = true;
        }

        emit_tick(
            &app,
            succeeded + failed,
            total,
            &[],
            started,
            succeeded,
            failed,
        );

        if cancelled {
            break;
        }

        if config.cooldown_every > 0
            && config.cooldown_secs > 0
            && batch_index % config.cooldown_every == 0
        {
            log(
                &app,
                "info",
                &msg(
                    format!("Пауза {} с перед следующим батчем…", config.cooldown_secs),
                    format!("Cooling down for {} s…", config.cooldown_secs),
                ),
            );
            if !wait_with_controls(Duration::from_secs(config.cooldown_secs), &ctx).await {
                cancelled = true;
                break;
            }
        }
    }

    cleanup(&root);

    if cancelled {
        set_status(&app, &ctx, SpooferStatus::Idle, None).await;
        log(
            &app,
            "warn",
            &msg(
                "Остановлено пользователем.".to_string(),
                "Stopped by the user.".to_string(),
            ),
        );
    } else {
        set_status(&app, &ctx, SpooferStatus::Finished, None).await;
        log(
            &app,
            "success",
            &msg(
                format!("Готово: успешно {succeeded}, с ошибками {failed}."),
                format!("Done: {succeeded} succeeded, {failed} failed."),
            ),
        );
    }
}
