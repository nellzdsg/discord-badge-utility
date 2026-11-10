//! Tiny runtime localization layer for backend-generated messages.
//!
//! The UI pushes the active language with the `set_language` command, and the
//! Rust side then picks the matching variant of every user-visible string.

use std::sync::atomic::{AtomicU8, Ordering};

const EN: u8 = 0;
const RU: u8 = 1;

static LANGUAGE: AtomicU8 = AtomicU8::new(RU);

/// Updates the language used for backend messages. Unknown values fall back to English.
pub fn set_language(code: &str) {
    let normalized = code.trim().to_ascii_lowercase();
    let value = if normalized.starts_with("ru") { RU } else { EN };
    LANGUAGE.store(value, Ordering::SeqCst);
}

pub fn is_russian() -> bool {
    LANGUAGE.load(Ordering::SeqCst) == RU
}

/// Picks the Russian or English variant depending on the active language.
pub fn pick<'a>(russian: &'a str, english: &'a str) -> &'a str {
    if is_russian() {
        russian
    } else {
        english
    }
}
