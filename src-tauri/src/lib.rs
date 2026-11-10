pub mod commands;
pub mod discord;
pub mod history;
pub mod i18n;
pub mod state;

use state::AppState;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            app_version,
            commands::fetch_games,
            commands::get_games,
            commands::check_discord_status,
            commands::get_history,
            commands::clear_history,
            commands::export_history,
            commands::import_history,
            commands::set_language,
            commands::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Discord Badge Utility");
}
