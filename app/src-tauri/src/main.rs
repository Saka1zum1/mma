// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // `--serve` runs the headless web sidecar instead of the desktop app.
  // Gated by the `web-serve` feature so release builds don't compile it in.
  #[cfg(feature = "web-serve")]
  if std::env::args().any(|a| a == "--serve") {
    app_lib::serve::run_server();
    return;
  }
  app_lib::run();
}
