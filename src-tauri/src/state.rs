use crate::discord::SpoofableGame;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpooferStatus {
    Idle,
    Running,
    Paused,
    Finished,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpooferConfig {
    pub batch_size: usize,
    pub hold_secs: u64,
    pub limit: Option<usize>,
    #[serde(default)]
    pub skip_played: bool,
    #[serde(default)]
    pub exclude_adult: bool,
    #[serde(default)]
    pub cooldown_every: usize,
    #[serde(default)]
    pub cooldown_secs: u64,
    #[serde(default)]
    pub jitter: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActiveGame {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TickEvent {
    pub current: usize,
    pub total: usize,
    pub active: Vec<ActiveGame>,
    pub elapsed_secs: u64,
    pub eta_secs: u64,
    pub rate: f64,
    pub succeeded: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogEvent {
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatusEvent {
    pub status: SpooferStatus,
    pub message: Option<String>,
}

/// Periodic state of the continuous "game time" farm.
#[derive(Debug, Clone, Serialize)]
pub struct FarmTick {
    pub running: bool,
    pub elapsed_secs: u64,
    pub games: Vec<ActiveGame>,
    pub failures: usize,
}

/// Snapshot returned when the frontend reconnects to a running farm.
#[derive(Debug, Clone, Serialize)]
pub struct FarmSnapshot {
    pub running: bool,
    pub elapsed_secs: u64,
    pub games: Vec<ActiveGame>,
}

pub struct AppState {
    /// Game database currently loaded from Discord or the local cache.
    pub games: Arc<RwLock<Vec<SpoofableGame>>>,
    pub status: Arc<RwLock<SpooferStatus>>,
    pub cancel: Arc<AtomicBool>,
    pub pause: Arc<AtomicBool>,
    pub active_pids: Arc<Mutex<Vec<u32>>>,
    pub task: Arc<Mutex<Option<JoinHandle<()>>>>,

    /// Continuous farm: selected games are kept alive until stopped.
    pub farm_running: Arc<RwLock<bool>>,
    pub farm_started_at: Arc<RwLock<Option<u64>>>,
    pub farm_cancel: Arc<AtomicBool>,
    pub farm_pids: Arc<Mutex<Vec<u32>>>,
    pub farm_games: Arc<RwLock<Vec<ActiveGame>>>,
    pub farm_task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            games: Arc::new(RwLock::new(Vec::new())),
            status: Arc::new(RwLock::new(SpooferStatus::Idle)),
            cancel: Arc::new(AtomicBool::new(false)),
            pause: Arc::new(AtomicBool::new(false)),
            active_pids: Arc::new(Mutex::new(Vec::new())),
            task: Arc::new(Mutex::new(None)),
            farm_running: Arc::new(RwLock::new(false)),
            farm_started_at: Arc::new(RwLock::new(None)),
            farm_cancel: Arc::new(AtomicBool::new(false)),
            farm_pids: Arc::new(Mutex::new(Vec::new())),
            farm_games: Arc::new(RwLock::new(Vec::new())),
            farm_task: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

/// Shared flags handed to the background spoofer task.
pub struct RunContext {
    pub status: Arc<RwLock<SpooferStatus>>,
    pub cancel: Arc<AtomicBool>,
    pub pause: Arc<AtomicBool>,
    pub active_pids: Arc<Mutex<Vec<u32>>>,
}

impl RunContext {
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    pub fn is_paused(&self) -> bool {
        self.pause.load(Ordering::SeqCst)
    }
}

/// Shared flags handed to the background farm task.
pub struct FarmContext {
    pub running: Arc<RwLock<bool>>,
    pub started_at: Arc<RwLock<Option<u64>>>,
    pub cancel: Arc<AtomicBool>,
    pub pids: Arc<Mutex<Vec<u32>>>,
    pub games: Arc<RwLock<Vec<ActiveGame>>>,
}

impl FarmContext {
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}
