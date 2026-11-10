use crate::discord::{is_discord_running, load_games, SpoofMethod, SpoofableGame};
use crate::history;
use crate::state::AppState;
use serde::Serialize;
use tauri::State;

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
