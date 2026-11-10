use std::env;
use std::path::PathBuf;
use std::process::Command;

/// Compiles the tiny helper binary that is spawned with game executable names.
///
/// The helper is a standalone `rustc` invocation on purpose: it must not pull in
/// any crate, so the resulting executable stays small and dependency-free.
fn build_dummy() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let source = manifest_dir.join("dummy_src").join("dummy.rs");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    let output = out_dir.join(if target_os == "windows" {
        "dummy.exe"
    } else {
        "dummy"
    });

    let rustc = env::var("RUSTC").unwrap_or_else(|_| "rustc".to_string());
    let status = Command::new(rustc)
        .arg(&source)
        .arg("--edition=2021")
        .arg("-C")
        .arg("opt-level=s")
        .arg("-C")
        .arg("strip=symbols")
        .arg("-o")
        .arg(&output)
        .status()
        .expect("failed to start rustc for the dummy binary");

    if !status.success() {
        panic!("failed to compile dummy_src/dummy.rs");
    }

    println!("cargo:rerun-if-changed=dummy_src/dummy.rs");
}

fn main() {
    build_dummy();
    tauri_build::build();
}
