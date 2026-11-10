//! Helper process that Discord sees in the OS process list.
//!
//! It has no window, no network access and no logic: it only keeps its own file
//! name alive so the Discord client can match it against its game database.
//! The parent application terminates it, and the Win32 Job Object guarantees
//! termination even if the parent crashes.

#![cfg_attr(windows, windows_subsystem = "windows")]

use std::thread;
use std::time::Duration;

fn main() {
    loop {
        thread::sleep(Duration::from_secs(3600));
    }
}
