//! Local, per-user data: which games were already emulated.
//!
//! Everything lives in `%APPDATA%\DiscordBadgeUtility`, so the app never
//! touches Discord's own folders.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct HistoryFile {
    played_ids: HashSet<String>,
}

/// Per-user data folder for caches and history.
pub fn app_dir() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("DiscordBadgeUtility");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn history_path() -> PathBuf {
    app_dir().join("history.json")
}

pub fn load_history() -> HashSet<String> {
    fs::read_to_string(history_path())
        .ok()
        .and_then(|data| serde_json::from_str::<HistoryFile>(&data).ok())
        .map(|file| file.played_ids)
        .unwrap_or_default()
}

pub fn save_history(played_ids: &HashSet<String>) -> Result<(), String> {
    let file = HistoryFile {
        played_ids: played_ids.clone(),
    };
    let json = serde_json::to_string_pretty(&file).map_err(|error| error.to_string())?;
    fs::write(history_path(), json).map_err(|error| error.to_string())
}

/// Remembers a finished batch. Failures are ignored: history is a convenience,
/// not a source of truth.
pub fn record_batch(ids: &[String]) {
    if ids.is_empty() {
        return;
    }
    let mut current = load_history();
    for id in ids {
        current.insert(id.clone());
    }
    let _ = save_history(&current);
}

pub fn clear_history() -> Result<(), String> {
    let path = history_path();
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}
