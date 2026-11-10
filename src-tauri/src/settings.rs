//! User settings persisted next to the history file.
//!
//! The file only contains UI preferences: no account data, no tokens and no
//! machine identifiers.

use crate::history::app_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    /// BCP-47-ish language code used for backend messages.
    pub language: String,
    /// When enabled, the game database is read from the cache only.
    pub offline: bool,
    /// Whether the first-run disclaimer was accepted.
    pub disclaimer_accepted: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "ru".to_string(),
            offline: false,
            disclaimer_accepted: false,
        }
    }
}

fn settings_path() -> PathBuf {
    app_dir().join("settings.json")
}

pub fn load() -> Settings {
    fs::read_to_string(settings_path())
        .ok()
        .and_then(|data| serde_json::from_str::<Settings>(&data).ok())
        .unwrap_or_default()
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(settings_path(), json).map_err(|error| error.to_string())
}
