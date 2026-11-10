use crate::discord::SpoofableGame;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpooferStatus {
    Idle,
    Running,
    Paused,
    Finished,
    Error,
}

pub struct AppState {
    /// Game database currently loaded from Discord or the local cache.
    pub games: Arc<RwLock<Vec<SpoofableGame>>>,
    pub status: Arc<RwLock<SpooferStatus>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            games: Arc::new(RwLock::new(Vec::new())),
            status: Arc::new(RwLock::new(SpooferStatus::Idle)),
        }
    }
}
