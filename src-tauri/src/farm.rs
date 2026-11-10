//! Continuous "game time" farm.
//!
//! Unlike the variety spoofer, which cycles through batches, the farm keeps a
//! fixed set of games running until the user stops it. Discord counts the
//! playtime of every running game, so 20 simultaneous games accumulate time
//! 20 times faster.
//!
//! The same safety rules apply: helper processes only, no injection, no token,
//! and a Win32 Job Object that guarantees cleanup.

use crate::discord::SpoofableGame;
use crate::history::record_batch;
use crate::i18n::pick;
use crate::spoofer::{cleanup, is_alive, spawn_process, temp_root, JobGuard, DUMMY_BYTES};
use crate::state::{ActiveGame, FarmContext, FarmTick};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

pub const MAX_FARM: usize = 20;
const MAX_RESPAWNS: u32 = 10;
const HISTORY_AFTER_SECS: u64 = 60;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn log(app: &AppHandle, level: &str, message: &str) {
    let _ = app.emit(
        "spoofer_log",
        crate::state::LogEvent {
            level: level.to_string(),
            message: message.to_string(),
        },
    );
}

struct Slot {
    id: String,
    name: String,
    executable: String,
    target: PathBuf,
    pid: u32,
    respawns: u32,
}

impl Slot {
    fn active(&self) -> ActiveGame {
        ActiveGame {
            id: self.id.clone(),
            name: self.name.clone(),
            executable: self.executable.clone(),
            pid: Some(self.pid),
        }
    }
}

fn emit(app: &AppHandle, running: bool, elapsed: u64, games: Vec<ActiveGame>, failures: usize) {
    let _ = app.emit(
        "farm_tick",
        FarmTick {
            running,
            elapsed_secs: elapsed,
            games,
            failures,
        },
    );
}

/// Copies the helper binary under the game's executable name and launches it.
fn prepare_and_spawn(
    base: &Path,
    root: &Path,
    index: usize,
    game: &SpoofableGame,
) -> Result<(PathBuf, u32), String> {
    let relative = game
        .rel_path
        .as_ref()
        .ok_or_else(|| "game has no Windows executable".to_string())?;

    let directory = root.join(format!("g{index}"));
    let target = directory.join(relative);

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::copy(base, &target).map_err(|error| error.to_string())?;

    let child = spawn_process(&target).map_err(|error| error.to_string())?;
    let pid = child.id();
    drop(child);

    Ok((target, pid))
}

pub async fn run(app: AppHandle, selected: Vec<SpoofableGame>, ctx: FarmContext) {
    let root = temp_root().join("farm");
    cleanup(&root);

    if let Err(error) = fs::create_dir_all(&root) {
        log(
            &app,
            "error",
            &format!("Не удалось создать временную папку: {error}"),
        );
        return;
    }

    let base = root.join("base.exe");
    if let Err(error) = fs::write(&base, DUMMY_BYTES) {
        log(
            &app,
            "error",
            &format!("Не удалось записать helper: {error}"),
        );
        cleanup(&root);
        return;
    }

    let job = JobGuard::new();
    if job.is_none() {
        log(
            &app,
            "warn",
            pick(
                "Job Object недоступен: после аварийного закрытия процессы могут остаться.",
                "Job Object unavailable: processes may survive an abnormal exit.",
            ),
        );
    }

    let mut slots: Vec<Slot> = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();

    for game in selected {
        if slots.len() >= MAX_FARM {
            break;
        }

        let Some(relative) = game.rel_path.as_ref() else {
            continue;
        };
        if !seen_paths.insert(relative.to_ascii_lowercase()) {
            continue;
        }

        match prepare_and_spawn(&base, &root, slots.len(), &game) {
            Ok((target, pid)) => {
                if let Some(job) = &job {
                    job.assign(pid);
                }
                slots.push(Slot {
                    id: game.id,
                    name: game.name,
                    executable: relative.clone(),
                    target,
                    pid,
                    respawns: 0,
                });
            }
            Err(error) => {
                log(
                    &app,
                    "error",
                    &format!("Не удалось запустить «{}»: {error}", game.name),
                );
            }
        }
    }

    if slots.is_empty() {
        log(
            &app,
            "error",
            pick(
                "Ни одну игру не удалось запустить.",
                "Failed to launch any game.",
            ),
        );
        cleanup(&root);
        return;
    }

    let started = Instant::now();
    let started_at = now_secs();

    *ctx.running.write().await = true;
    *ctx.started_at.write().await = Some(started_at);
    {
        let mut pids = ctx.pids.lock().await;
        *pids = slots.iter().map(|slot| slot.pid).collect();
    }
    {
        let mut games = ctx.games.write().await;
        *games = slots.iter().map(Slot::active).collect();
    }

    log(
        &app,
        "info",
        &format!(
            "Фарм запущен: {} игр. Не закрывайте Discord — он должен видеть процессы.",
            slots.len()
        ),
    );
    emit(
        &app,
        true,
        0,
        slots.iter().map(Slot::active).collect(),
        0,
    );

    let mut recorded = false;
    let mut failures = 0usize;

    loop {
        if ctx.is_cancelled() {
            break;
        }

        tokio::time::sleep(Duration::from_secs(1)).await;

        if ctx.is_cancelled() {
            break;
        }

        // Bring back helpers that were killed from outside.
        for slot in &mut slots {
            if is_alive(slot.pid) {
                continue;
            }
            if slot.respawns >= MAX_RESPAWNS {
                continue;
            }

            slot.respawns += 1;
            match spawn_process(&slot.target) {
                Ok(child) => {
                    let pid = child.id();
                    drop(child);
                    if let Some(job) = &job {
                        job.assign(pid);
                    }
                    slot.pid = pid;
                    log(
                        &app,
                        "warn",
                        &format!("«{}» был завершён и перезапущен (PID {pid}).", slot.name),
                    );
                }
                Err(error) => {
                    failures += 1;
                    if slot.respawns <= 3 {
                        log(
                            &app,
                            "error",
                            &format!("Не удалось перезапустить «{}»: {error}", slot.name),
                        );
                    }
                }
            }
        }

        {
            let mut pids = ctx.pids.lock().await;
            *pids = slots.iter().map(|slot| slot.pid).collect();
        }

        let elapsed = started.elapsed().as_secs();

        if !recorded && elapsed >= HISTORY_AFTER_SECS {
            let ids: Vec<String> = slots.iter().map(|slot| slot.id.clone()).collect();
            record_batch(&ids);
            recorded = true;
        }

        let active: Vec<ActiveGame> = slots.iter().map(Slot::active).collect();
        {
            let mut games = ctx.games.write().await;
            *games = active.clone();
        }

        emit(&app, true, elapsed, active, failures);
    }

    for slot in &slots {
        crate::spoofer::force_kill(slot.pid);
    }
    {
        let mut pids = ctx.pids.lock().await;
        pids.clear();
    }
    cleanup(&root);

    *ctx.running.write().await = false;
    *ctx.started_at.write().await = None;
    {
        let mut games = ctx.games.write().await;
        games.clear();
    }

    let elapsed = started.elapsed().as_secs();
    log(
        &app,
        "info",
        &format!(
            "Фарм остановлен. Сессия: {} мин {} с.",
            elapsed / 60,
            elapsed % 60
        ),
    );
    emit(&app, false, elapsed, Vec::new(), failures);
}
