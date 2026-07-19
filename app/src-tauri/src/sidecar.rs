//! Sidecar-binary distribution for plugins.
//!
//! A plugin whose manifest declares a `sidecar` gets its native binary + models
//! downloaded from GitHub Releases on install (one click, no PATH setup), extracted
//! under `{appData}/plugins/{plugin_id}/sidecar/`, and spawned by `sidecar_spawn`.
//! Process I/O is streamed to the frontend as `sidecar-stdout` / `sidecar-stderr` /
//! `sidecar-exit` events; download progress as `sidecar-install-progress`.
//! stderr (the sidecar diagnostics channel) is also forwarded to the app log;
//! stdout is not (it is the data channel, one JSON line per unit of work).

use crate::types::{AppError, AppResult};
use crate::{emit_event, validate_plugin_id, validate_sidecar_name};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::Child;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SidecarProgress {
    plugin_id: String,
    downloaded: u64,
    total: u64,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SidecarLine {
    run_id: u32,
    line: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SidecarExit {
    run_id: u32,
    code: Option<i32>,
}

/// GitHub release asset platform tag for the running target.
pub(crate) fn platform_tag() -> AppResult<&'static str> {
    Ok(match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("macos", "aarch64") => "macos-arm64",
        // No macos-x64: ort ships no prebuilt ONNX Runtime for x86_64-apple-darwin.
        ("macos", "x86_64") => {
            return Err(AppError(
                "Sidecar plugins are not available on Intel Macs".into(),
            ));
        }
        ("linux", "x86_64") => "linux-x64",
        (os, arch) => return Err(AppError(format!("Unsupported platform: {os}-{arch}"))),
    })
}

fn sidecar_dir(plugin_id: &str) -> AppResult<std::path::PathBuf> {
    Ok(crate::storage::app_data_dir()?
        .join("plugins")
        .join(plugin_id)
        .join("sidecar"))
}

/// Fetch the expected SHA-256 for `asset` from the release's `checksums.txt`
/// (lines are `<hash>  <filename>`). None if the file or line is absent.
fn fetch_expected_sha(
    client: &reqwest::blocking::Client,
    plugin_id: &str,
    version: &str,
    asset: &str,
) -> Option<String> {
    let url = format!(
        "https://github.com/Saka1zum1/mma/releases/download/{plugin_id}-v{version}/checksums.txt"
    );
    let text = client
        .get(&url)
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .ok()?;
    for line in text.lines() {
        let mut it = line.split_whitespace();
        if let (Some(hash), Some(file)) = (it.next(), it.next()) {
            if file == asset {
                return Some(hash.to_string());
            }
        }
    }
    None
}

fn install_blocking(plugin_id: String, name: String, version: String) -> AppResult<()> {
    let platform = platform_tag()?;
    let asset = format!("{name}-{platform}.zip");
    let url =
        format!("https://github.com/Saka1zum1/mma/releases/download/{plugin_id}-v{version}/{asset}");
    log::info!("[sidecar] downloading {url}");

    let final_dir = sidecar_dir(&plugin_id)?;
    let plugin_root = final_dir.parent().unwrap().to_path_buf();
    std::fs::create_dir_all(&plugin_root)?;

    let client = reqwest::blocking::Client::builder()
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(600))
        .build()?;

    // checksums.txt (per-release, computed from the shipped zips) is the sole source
    // of truth for integrity. Absent (older releases) -> no verification.
    let expected_sha256 = fetch_expected_sha(&client, &plugin_id, &version, &asset);
    let mut resp = client.get(&url).send()?.error_for_status()?;
    let total = resp.content_length().unwrap_or(0);

    // Stream the download to a temp file instead of buffering in RAM.
    let zip_path = plugin_root.join(".sidecar-download.zip");
    let mut zip_file = std::io::BufWriter::new(std::fs::File::create(&zip_path)?);
    let mut hasher = Sha256::new();
    let mut chunk = [0u8; 65536];
    let mut downloaded = 0u64;
    let mut last_emit = 0u64;
    loop {
        let n = resp.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        zip_file.write_all(&chunk[..n])?;
        hasher.update(&chunk[..n]);
        downloaded += n as u64;
        if downloaded - last_emit >= 262_144 {
            emit_event(
                "sidecar-install-progress",
                SidecarProgress {
                    plugin_id: plugin_id.clone(),
                    downloaded,
                    total,
                },
            );
            last_emit = downloaded;
        }
    }
    zip_file.flush()?;
    drop(zip_file);

    emit_event(
        "sidecar-install-progress",
        SidecarProgress {
            plugin_id: plugin_id.clone(),
            downloaded,
            total: total.max(downloaded),
        },
    );

    let actual_sha = format!("{:x}", hasher.finalize());
    if let Some(ref expected) = expected_sha256 {
        if !expected.eq_ignore_ascii_case(&actual_sha) {
            let _ = std::fs::remove_file(&zip_path);
            return Err(AppError(format!(
                "Sidecar integrity check failed for {name}: expected {expected}, got {actual_sha}"
            )));
        }
        log::info!("[sidecar] SHA-256 verified against checksums.txt: {actual_sha}");
    } else {
        log::warn!("[sidecar] no checksums.txt for this release, skipping integrity check (hash: {actual_sha})");
    }

    let tmp_dir = plugin_root.join(".sidecar-tmp");
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)?;
    }
    std::fs::create_dir_all(&tmp_dir)?;

    let zip_reader = std::fs::File::open(&zip_path)?;
    let mut archive = zip::ZipArchive::new(std::io::BufReader::new(zip_reader))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue,
        };
        let out = tmp_dir.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut f = std::fs::File::create(&out)?;
        std::io::copy(&mut entry, &mut f)?;
    }
    drop(archive);
    let _ = std::fs::remove_file(&zip_path);

    std::fs::write(tmp_dir.join("version.txt"), &version)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let bin = tmp_dir.join(&name);
        if bin.exists() {
            std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755))?;
        }
    }

    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir)?;
    }
    std::fs::rename(&tmp_dir, &final_dir)?;
    log::info!("[sidecar] installed {name} v{version} for {plugin_id}");
    Ok(())
}

/// Download a plugin's sidecar bundle from GitHub Releases and extract it under
/// `{appData}/plugins/{plugin_id}/sidecar/`. Emits `sidecar-install-progress`.
#[tauri::command]
#[specta::specta]
pub async fn sidecar_install(plugin_id: String, name: String, version: String) -> AppResult<()> {
    validate_plugin_id(&plugin_id)?;
    validate_sidecar_name(&name)?;
    tokio::task::spawn_blocking(move || install_blocking(plugin_id, name, version))
        .await
        .map_err(|e| AppError(format!("sidecar install task failed: {e}")))?
}

/// Installed sidecar version for a plugin (from `sidecar/version.txt`), or `None`.
#[tauri::command]
#[specta::specta]
pub fn sidecar_installed_version(plugin_id: String) -> AppResult<Option<String>> {
    validate_plugin_id(&plugin_id)?;
    let path = sidecar_dir(&plugin_id)?.join("version.txt");
    Ok(std::fs::read_to_string(&path)
        .ok()
        .map(|s| s.trim().to_string()))
}

fn children() -> &'static Mutex<HashMap<u32, Arc<Mutex<Child>>>> {
    static C: OnceLock<Mutex<HashMap<u32, Arc<Mutex<Child>>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

static RUN_COUNTER: AtomicU32 = AtomicU32::new(1);

/// Spawn a plugin's installed sidecar binary. Streams stdout/stderr lines as
/// `sidecar-stdout` / `sidecar-stderr` events and the exit as `sidecar-exit`,
/// keyed by the returned run id. Runs in the sidecar dir so co-located dlls resolve.
#[tauri::command]
#[specta::specta]
pub fn sidecar_spawn(plugin_id: String, name: String, args: Vec<String>) -> AppResult<u32> {
    validate_plugin_id(&plugin_id)?;
    validate_sidecar_name(&name)?;
    let dir = sidecar_dir(&plugin_id)?;
    let bin_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name
    };
    let bin = dir.join(&bin_name);

    let mut cmd = std::process::Command::new(&bin);
    cmd.args(&args)
        .current_dir(&dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError(format!("Failed to spawn {}: {e}", bin.display())))?;

    let run_id = RUN_COUNTER.fetch_add(1, Ordering::SeqCst);
    log::info!("[sidecar] spawned {bin_name} for {plugin_id} (run_id={run_id})");

    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                emit_event("sidecar-stdout", SidecarLine { run_id, line });
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let pid = plugin_id.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                log::info!("[sidecar:{pid}] {line}");
                emit_event("sidecar-stderr", SidecarLine { run_id, line });
            }
        });
    }

    let child = Arc::new(Mutex::new(child));
    children().lock()?.insert(run_id, child.clone());

    std::thread::spawn(move || {
        let code = loop {
            let status = child.lock().map(|mut c| c.try_wait());
            match status {
                Ok(Ok(Some(s))) => break s.code(),
                Ok(Ok(None)) => std::thread::sleep(std::time::Duration::from_millis(100)),
                _ => break None,
            }
        };
        if let Ok(mut map) = children().lock() {
            map.remove(&run_id);
        }
        let desc = code.map_or("unknown".into(), |c| c.to_string());
        log::info!("[sidecar] run_id={run_id} exited (code {desc})");
        emit_event("sidecar-exit", SidecarExit { run_id, code });
    });

    Ok(run_id)
}

/// Kill a running sidecar process by run id (no-op if already exited).
#[tauri::command]
#[specta::specta]
pub fn sidecar_kill(run_id: u32) -> AppResult<()> {
    if let Some(child) = children().lock()?.get(&run_id) {
        let _ = child.lock()?.kill();
    }
    Ok(())
}

/// Kill all tracked sidecar processes. Called on app exit to prevent orphans.
pub fn kill_all_sidecars() {
    let Ok(mut map) = children().lock() else {
        return;
    };
    for (run_id, child) in map.drain() {
        if let Ok(mut c) = child.lock() {
            log::info!("[sidecar] killing orphaned sidecar (run_id={run_id})");
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}
