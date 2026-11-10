use crate::discord::{is_discord_running, load_games, SpoofMethod, SpoofableGame};
use crate::farm;
use crate::history;
use crate::settings as prefs;
use crate::spoofer;
use crate::state::{
    AppState, FarmContext, FarmSnapshot, FarmTick, RunContext, SpooferConfig, SpooferStatus,
    StatusEvent,
};
use serde::Serialize;
use std::collections::HashSet;
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct GamesResponse {
    pub total: usize,
    pub process_count: usize,
    pub rpc_count: usize,
    pub played_count: usize,
    pub from_cache: bool,
}

/// Loads the Discord game database into memory. Uses a fresh local cache when
/// possible, otherwise downloads the public list.
#[tauri::command]
pub async fn fetch_games(
    force: Option<bool>,
    state: State<'_, AppState>,
) -> Result<GamesResponse, String> {
    let (games, from_cache) = load_games(force.unwrap_or(false)).await?;

    let played = history::load_history();
    let total = games.len();
    let process_count = games
        .iter()
        .filter(|game| game.method == SpoofMethod::Process)
        .count();
    let played_count = games.iter().filter(|game| played.contains(&game.id)).count();

    *state.games.write().await = games;

    Ok(GamesResponse {
        total,
        process_count,
        rpc_count: total - process_count,
        played_count,
        from_cache,
    })
}

#[tauri::command]
pub async fn get_games(state: State<'_, AppState>) -> Result<Vec<SpoofableGame>, String> {
    Ok(state.games.read().await.clone())
}

#[tauri::command]
pub fn check_discord_status() -> bool {
    is_discord_running()
}

#[tauri::command]
pub async fn start_spoofer(
    config: SpooferConfig,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        let status = *state.status.read().await;
        if matches!(status, SpooferStatus::Running | SpooferStatus::Paused) {
            return Err("Emulation is already running".to_string());
        }
    }

    let games = state.games.read().await.clone();
    if games.is_empty() {
        return Err("The game database is empty. Open \"Games\" and load it first.".to_string());
    }

    state.cancel.store(false, Ordering::SeqCst);
    state.pause.store(false, Ordering::SeqCst);

    let ctx = RunContext {
        status: state.status.clone(),
        cancel: state.cancel.clone(),
        pause: state.pause.clone(),
        active_pids: state.active_pids.clone(),
    };

    let handle = tokio::spawn(async move {
        spoofer::run(app, games, config, ctx).await;
    });

    *state.task.lock().await = Some(handle);
    Ok(())
}

#[tauri::command]
pub async fn pause_spoofer(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if *state.status.read().await != SpooferStatus::Running {
        return Err("Emulation is not running".to_string());
    }

    state.pause.store(true, Ordering::SeqCst);
    *state.status.write().await = SpooferStatus::Paused;
    let _ = app.emit(
        "spoofer_status",
        StatusEvent {
            status: SpooferStatus::Paused,
            message: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn resume_spoofer(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if *state.status.read().await != SpooferStatus::Paused {
        return Err("Emulation is not paused".to_string());
    }

    state.pause.store(false, Ordering::SeqCst);
    *state.status.write().await = SpooferStatus::Running;
    let _ = app.emit(
        "spoofer_status",
        StatusEvent {
            status: SpooferStatus::Running,
            message: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn stop_spoofer(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    state.pause.store(false, Ordering::SeqCst);

    let pids: Vec<u32> = {
        let mut guard = state.active_pids.lock().await;
        std::mem::take(&mut *guard)
    };
    for pid in pids {
        spoofer::force_kill(pid);
    }

    if let Some(handle) = state.task.lock().await.take() {
        handle.abort();
    }

    *state.status.write().await = SpooferStatus::Idle;
    let _ = app.emit(
        "spoofer_status",
        StatusEvent {
            status: SpooferStatus::Idle,
            message: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn get_spoofer_state(state: State<'_, AppState>) -> Result<SpooferStatus, String> {
    Ok(*state.status.read().await)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Starts the continuous farm for the selected game IDs.
#[tauri::command]
pub async fn start_farm(
    game_ids: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if *state.farm_running.read().await {
        return Err("Фарм уже запущен".to_string());
    }

    let games = state.games.read().await.clone();
    if games.is_empty() {
        return Err("База игр пуста. Откройте «База игр» и загрузите список.".to_string());
    }

    let wanted: HashSet<String> = game_ids.into_iter().collect();
    let mut seen: HashSet<String> = HashSet::new();
    let selected: Vec<SpoofableGame> = games
        .into_iter()
        .filter(|game| wanted.contains(&game.id) && game.method == SpoofMethod::Process)
        .filter(|game| match &game.rel_path {
            Some(path) => seen.insert(path.to_ascii_lowercase()),
            None => false,
        })
        .take(farm::MAX_FARM)
        .collect();

    if selected.is_empty() {
        return Err("Выберите хотя бы одну игру с Windows-исполняемым файлом.".to_string());
    }

    state.farm_cancel.store(false, Ordering::SeqCst);

    let ctx = FarmContext {
        running: state.farm_running.clone(),
        started_at: state.farm_started_at.clone(),
        cancel: state.farm_cancel.clone(),
        pids: state.farm_pids.clone(),
        games: state.farm_games.clone(),
    };

    let handle = tokio::spawn(async move {
        farm::run(app, selected, ctx).await;
    });

    *state.farm_task.lock().await = Some(handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_farm(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state.farm_cancel.store(true, Ordering::SeqCst);

    let pids: Vec<u32> = {
        let mut guard = state.farm_pids.lock().await;
        std::mem::take(&mut *guard)
    };
    for pid in pids {
        spoofer::force_kill(pid);
    }

    if let Some(handle) = state.farm_task.lock().await.take() {
        handle.abort();
    }

    spoofer::cleanup(&spoofer::temp_root().join("farm"));

    *state.farm_running.write().await = false;
    *state.farm_started_at.write().await = None;
    {
        let mut games = state.farm_games.write().await;
        games.clear();
    }

    let _ = app.emit(
        "farm_tick",
        FarmTick {
            running: false,
            elapsed_secs: 0,
            games: Vec::new(),
            failures: 0,
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn get_farm_state(state: State<'_, AppState>) -> Result<FarmSnapshot, String> {
    let running = *state.farm_running.read().await;
    let started = *state.farm_started_at.read().await;
    let elapsed_secs = started
        .map(|value| now_secs().saturating_sub(value))
        .unwrap_or(0);
    let games = state.farm_games.read().await.clone();

    Ok(FarmSnapshot {
        running,
        elapsed_secs,
        games,
    })
}

#[tauri::command]
pub fn get_settings() -> prefs::Settings {
    prefs::load()
}

#[tauri::command]
pub fn save_settings(settings: prefs::Settings) -> Result<(), String> {
    prefs::save(&settings)?;
    crate::i18n::set_language(&settings.language);
    crate::discord::set_offline(settings.offline);
    Ok(())
}

/// Absolute path of the per-user data folder, shown in the settings tab.
#[tauri::command]
pub fn data_folder() -> String {
    history::app_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_data_folder() -> Result<(), String> {
    open_in_browser(&history::app_dir().to_string_lossy())
}

#[tauri::command]
pub fn get_history() -> Vec<String> {
    history::load_history().into_iter().collect()
}

#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    history::clear_history()
}

#[tauri::command]
pub fn export_history() -> Result<String, String> {
    let mut ids: Vec<String> = history::load_history().into_iter().collect();
    ids.sort();
    serde_json::to_string_pretty(&ids).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_history(json: String) -> Result<usize, String> {
    let incoming: Vec<String> =
        serde_json::from_str(&json).map_err(|error| format!("Invalid history JSON: {error}"))?;

    let mut current = history::load_history();
    let before = current.len();
    for id in incoming {
        current.insert(id);
    }
    history::save_history(&current)?;
    Ok(current.len() - before)
}

/// Switches the language used by backend-generated messages.
#[tauri::command]
pub fn set_language(language: String) {
    crate::i18n::set_language(&language);
}

/// Opens a link in the system browser. Only GitHub https links are allowed so a
/// compromised frontend cannot launch arbitrary commands.
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/") || url.chars().any(char::is_whitespace) {
        return Err("Blocked external URL".to_string());
    }
    open_in_browser(&url)
}

#[cfg(windows)]
fn open_in_browser(url: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let operation: Vec<u16> = "open\0".encode_utf16().collect();
    let target: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    if result as isize <= 32 {
        return Err(format!(
            "Failed to open the browser (ShellExecute code {})",
            result as isize
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn open_in_browser(url: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}
