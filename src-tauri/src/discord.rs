//! Discord's public list of detectable applications.
//!
//! The endpoint is unauthenticated and only returns metadata about games:
//! no account data is involved. The response is cached locally so repeated
//! launches do not hit Discord's API again.

use crate::history::app_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DETECTABLE_URL: &str = "https://discord.com/api/v9/applications/detectable";
const CACHE_TTL_SECS: u64 = 12 * 60 * 60;
const CACHE_VERSION: u32 = 1;
const MAX_ATTEMPTS: u32 = 3;

/// How a game can be emulated on this platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpoofMethod {
    /// The game ships a native Windows executable.
    Process,
    /// No native binary: only Discord IPC could announce it.
    Rpc,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpoofableGame {
    pub id: String,
    pub name: String,
    pub rel_path: Option<String>,
    pub arguments: Option<String>,
    pub icon_hash: Option<String>,
    pub method: SpoofMethod,
    #[serde(default)]
    pub adult: bool,
}

#[derive(Debug, Deserialize)]
struct RawExecutable {
    name: String,
    os: String,
    #[serde(default)]
    arguments: Option<String>,
    #[serde(default)]
    is_launcher: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawApp {
    id: String,
    name: String,
    #[serde(default)]
    icon_hash: Option<String>,
    #[serde(default)]
    executables: Vec<RawExecutable>,
    #[serde(default)]
    themes: Vec<String>,
    #[serde(default)]
    content_classification: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
struct GamesCache {
    version: u32,
    fetched_at: u64,
    games: Vec<SpoofableGame>,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn cache_path() -> std::path::PathBuf {
    app_dir().join("games_cache.json")
}

fn load_cache() -> Option<GamesCache> {
    let data = fs::read_to_string(cache_path()).ok()?;
    let cache: GamesCache = serde_json::from_str(&data).ok()?;
    if cache.version != CACHE_VERSION || cache.games.is_empty() {
        return None;
    }
    Some(cache)
}

fn save_cache(games: &[SpoofableGame]) {
    let cache = GamesCache {
        version: CACHE_VERSION,
        fetched_at: now_secs(),
        games: games.to_vec(),
    };
    if let Ok(json) = serde_json::to_string(&cache) {
        let _ = fs::write(cache_path(), json);
    }
}

/// Loads the game database, preferring a fresh cache. When Discord is
/// unreachable, a stale cache is better than nothing.
///
/// Returns the games and whether they came from the cache.
pub async fn load_games(force_refresh: bool) -> Result<(Vec<SpoofableGame>, bool), String> {
    let cached = load_cache();

    if !force_refresh {
        if let Some(cache) = &cached {
            if now_secs().saturating_sub(cache.fetched_at) < CACHE_TTL_SECS {
                return Ok((cache.games.clone(), true));
            }
        }
    }

    match fetch_games().await {
        Ok(games) => {
            save_cache(&games);
            Ok((games, false))
        }
        Err(error) => match cached {
            Some(cache) => Ok((cache.games, true)),
            None => Err(error),
        },
    }
}

/// Downloads and normalizes the detectable-applications list.
pub async fn fetch_games() -> Result<Vec<SpoofableGame>, String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!(
            "discord-badge-utility/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/nellzdsg/discord-badge-utility)"
        ))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let mut attempt = 0;
    let response = loop {
        attempt += 1;
        let response = client
            .get(DETECTABLE_URL)
            .send()
            .await
            .map_err(|error| format!("Network error: {error}"))?;

        if response.status() != reqwest::StatusCode::TOO_MANY_REQUESTS {
            break response;
        }
        if attempt >= MAX_ATTEMPTS {
            return Err("Discord is rate limiting requests (429). Try again later.".to_string());
        }

        let wait = response
            .headers()
            .get("retry-after")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(5)
            .clamp(1, 30);
        tokio::time::sleep(Duration::from_secs(wait)).await;
    };

    if !response.status().is_success() {
        return Err(format!("Discord API returned status {}", response.status()));
    }

    let apps: Vec<RawApp> = response
        .json()
        .await
        .map_err(|error| format!("Failed to parse Discord response: {error}"))?;

    Ok(process_apps(apps))
}

/// Turns raw Discord entries into emulation candidates for Windows.
fn process_apps(apps: Vec<RawApp>) -> Vec<SpoofableGame> {
    let mut games = Vec::with_capacity(apps.len());

    for app in apps {
        let adult = is_adult(&app);
        let windows_entries = || {
            app.executables
                .iter()
                .filter(|entry| entry.os.eq_ignore_ascii_case("win32"))
        };

        let best = windows_entries()
            .find(|entry| entry.is_launcher != Some(true))
            .or_else(|| windows_entries().next());

        let rel_path = best.and_then(|entry| sanitize_relative_path(&entry.name));
        let arguments = best.and_then(|entry| entry.arguments.clone());

        games.push(match rel_path {
            Some(path) => SpoofableGame {
                id: app.id,
                name: app.name,
                rel_path: Some(path),
                arguments,
                icon_hash: app.icon_hash,
                method: SpoofMethod::Process,
                adult,
            },
            None => SpoofableGame {
                id: app.id,
                name: app.name,
                rel_path: None,
                arguments: None,
                icon_hash: app.icon_hash,
                method: SpoofMethod::Rpc,
                adult,
            },
        });
    }

    games.sort_by_key(|game| game.name.to_lowercase());
    games
}

/// Discord tags 18+ games with the "Erotic" theme or an ESRB "Adults Only" rating.
fn is_adult(app: &RawApp) -> bool {
    if app.themes.iter().any(|theme| theme.eq_ignore_ascii_case("erotic")) {
        return true;
    }
    app.content_classification
        .as_ref()
        .and_then(|value| value.pointer("/agency_ratings/esrb/rating"))
        .and_then(|rating| rating.as_u64())
        == Some(5)
}

/// Builds a safe relative path for the current OS.
///
/// Discord sometimes marks entries with a leading `>` ("match file name only"),
/// and executable names may contain characters Windows rejects. Parent
/// components are dropped so nothing can escape the temporary folder.
fn sanitize_relative_path(raw_name: &str) -> Option<String> {
    let trimmed = raw_name.trim().trim_start_matches('>').trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized = trimmed.replace('/', "\\");
    let mut parts: Vec<String> = Vec::new();

    for part in normalized.split('\\') {
        let cleaned: String = part
            .chars()
            .filter(|character| {
                !matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*')
                    && !character.is_control()
            })
            .collect();
        let cleaned = cleaned.trim_end_matches(|character| character == '.' || character == ' ');

        if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
            continue;
        }
        parts.push(cleaned.to_string());
    }

    if parts.is_empty() {
        return None;
    }

    let mut path = parts.join("\\");
    if !path.to_ascii_lowercase().ends_with(".exe") {
        path.push_str(".exe");
    }
    Some(path)
}

/// Checks whether a desktop Discord client is running.
#[cfg(windows)]
pub fn is_discord_running() -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    const CLIENT_EXECUTABLES: [&str; 4] = [
        "discord.exe",
        "discordcanary.exe",
        "discordptb.exe",
        "discorddevelopment.exe",
    ];

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

        let mut found = false;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let end = entry
                    .szExeFile
                    .iter()
                    .position(|&value| value == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..end]).to_ascii_lowercase();

                if CLIENT_EXECUTABLES.contains(&name.as_str()) {
                    found = true;
                    break;
                }
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);
        found
    }
}

#[cfg(not(windows))]
pub fn is_discord_running() -> bool {
    false
}
