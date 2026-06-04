//! Entry point for the web sidecar slice. Build/run with `--features web-serve`.
//!
//! Example:
//!   cargo run --manifest-path app/src-tauri/Cargo.toml --features web-serve --bin mma-serve
//! Then open http://127.0.0.1:1421 in a normal browser.

fn main() {
    app_lib::serve::run_server();
}
