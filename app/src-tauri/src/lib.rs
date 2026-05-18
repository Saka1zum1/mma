use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

mod fast_io;
mod import;
mod location_store;
mod selections;
mod arrow_bridge;
mod export;
mod geocoder;
mod types;
mod util;

#[tauri::command]
fn write_temp_file(name: String, content: String) -> Result<String, String> {
    let path = std::env::temp_dir().join(format!("mma_{name}"));
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_db_uri(app: tauri::AppHandle) -> Result<String, String> {
    let path = fast_io::db_path(&app)?;
    Ok(format!("sqlite:{}", path.to_string_lossy()))
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path().app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    { std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

#[derive(serde::Serialize)]
struct PluginManifest {
    id: String,
    name: String,
    description: String,
    icon: String,
    main: String,
}

#[tauri::command]
fn list_user_plugins(app: tauri::AppHandle) -> Vec<PluginManifest> {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d.join("plugins"),
        Err(_) => return vec![],
    };
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };
    let mut plugins = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }
        let manifest_path = path.join("manifest.json");
        if let Ok(content) = std::fs::read_to_string(&manifest_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                let folder_name = path.file_name()
                    .and_then(|n| n.to_str()).unwrap_or("unknown").to_string();
                let id = val.get("id").and_then(|v| v.as_str())
                    .map(|s| s.to_string()).unwrap_or(folder_name.clone());
                let name = val.get("name").and_then(|v| v.as_str())
                    .map(|s| s.to_string()).unwrap_or(folder_name);
                let description = val.get("description").and_then(|v| v.as_str())
                    .unwrap_or("").to_string();
                let icon = val.get("icon").and_then(|v| v.as_str())
                    .unwrap_or("").to_string();
                let main = val.get("main").and_then(|v| v.as_str())
                    .unwrap_or("index.js").to_string();
                plugins.push(PluginManifest { id, name, description, icon, main });
            }
        }
    }
    plugins
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
    Migration {
        version: 1,
        description: "create_initial_tables",
        sql: "CREATE TABLE IF NOT EXISTS maps (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                folder TEXT,
                settings TEXT NOT NULL DEFAULT '{}',
                score_bounds TEXT NOT NULL DEFAULT '\"auto\"',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS tags (
                id TEXT PRIMARY KEY NOT NULL,
                map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                visible INTEGER NOT NULL DEFAULT 1
              );
              CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY NOT NULL,
                map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                heading REAL NOT NULL DEFAULT 0,
                pitch REAL NOT NULL DEFAULT 0,
                zoom REAL NOT NULL DEFAULT 0,
                pano_id TEXT,
                created_at TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS location_tags (
                location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
                tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (location_id, tag_id)
              );
              CREATE INDEX IF NOT EXISTS idx_locations_map_id ON locations(map_id);
              CREATE INDEX IF NOT EXISTS idx_tags_map_id ON tags(map_id);
              CREATE INDEX IF NOT EXISTS idx_location_tags_location ON location_tags(location_id);
              CREATE INDEX IF NOT EXISTS idx_location_tags_tag ON location_tags(tag_id);",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "chunk_storage_and_vcs",
        sql: "DROP TABLE IF EXISTS location_tags;
              DROP TABLE IF EXISTS locations;
              DROP INDEX IF EXISTS idx_locations_map_id;
              DROP INDEX IF EXISTS idx_location_tags_location;
              DROP INDEX IF EXISTS idx_location_tags_tag;
              CREATE TABLE IF NOT EXISTS blobs (
                hash TEXT PRIMARY KEY NOT NULL,
                data TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS working_tree (
                map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                geohash TEXT NOT NULL,
                blob_hash TEXT NOT NULL REFERENCES blobs(hash),
                location_count INTEGER NOT NULL,
                PRIMARY KEY (map_id, geohash)
              );
              CREATE TABLE IF NOT EXISTS commits (
                id TEXT PRIMARY KEY NOT NULL,
                map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                parent_id TEXT,
                message TEXT,
                location_count INTEGER NOT NULL,
                created_at TEXT NOT NULL
              );
              CREATE TABLE IF NOT EXISTS commit_trees (
                commit_id TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
                geohash TEXT NOT NULL,
                blob_hash TEXT NOT NULL REFERENCES blobs(hash),
                location_count INTEGER NOT NULL,
                PRIMARY KEY (commit_id, geohash)
              );
              CREATE INDEX IF NOT EXISTS idx_working_tree_map ON working_tree(map_id);
              CREATE INDEX IF NOT EXISTS idx_commits_map ON commits(map_id);",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 3,
        description: "edit_history",
        sql: "CREATE TABLE IF NOT EXISTS edit_history (
                map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                undo_stack TEXT NOT NULL DEFAULT '[]',
                redo_stack TEXT NOT NULL DEFAULT '[]'
              );",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 4,
        description: "pano_date_cache",
        sql: "CREATE TABLE IF NOT EXISTS pano_date_cache (
                pano_id TEXT PRIMARY KEY NOT NULL,
                timestamp INTEGER NOT NULL
              );",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 5,
        description: "commit_hashes_and_diff_stats",
        sql: "ALTER TABLE commits ADD COLUMN tree_hash TEXT;
              ALTER TABLE commits ADD COLUMN added INTEGER NOT NULL DEFAULT 0;
              ALTER TABLE commits ADD COLUMN removed INTEGER NOT NULL DEFAULT 0;
              ALTER TABLE commits ADD COLUMN modified INTEGER NOT NULL DEFAULT 0;",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 6,
        description: "tag_sort_order",
        sql: "ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 7,
        description: "seen_log",
        sql: "CREATE TABLE IF NOT EXISTS seen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pano_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                heading REAL NOT NULL,
                pitch REAL NOT NULL,
                zoom REAL NOT NULL,
                entered_at INTEGER NOT NULL,
                map_id TEXT,
                location_id TEXT,
                thumbnail BLOB
              );
              CREATE INDEX IF NOT EXISTS idx_seen_entered ON seen(entered_at DESC);",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 8,
        description: "seen_v2",
        sql: "DROP TABLE IF EXISTS seen;
              CREATE TABLE IF NOT EXISTS seen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pano_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                heading REAL NOT NULL,
                pitch REAL NOT NULL,
                zoom REAL NOT NULL,
                entered_at INTEGER NOT NULL,
                map_id TEXT,
                location_id TEXT,
                country_code TEXT,
                address TEXT,
                thumbnail TEXT
              );
              CREATE INDEX IF NOT EXISTS idx_seen_entered ON seen(entered_at DESC);",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 9,
        description: "map_extra",
        sql: "ALTER TABLE maps ADD COLUMN extra TEXT NOT NULL DEFAULT '{}';",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 10,
        description: "separate_blobs_db",
        sql: "CREATE TABLE IF NOT EXISTS working_tree_new (
                map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
                geohash TEXT NOT NULL,
                blob_hash TEXT NOT NULL,
                location_count INTEGER NOT NULL,
                PRIMARY KEY (map_id, geohash)
              );
              INSERT INTO working_tree_new SELECT * FROM working_tree;
              DROP TABLE working_tree;
              ALTER TABLE working_tree_new RENAME TO working_tree;
              CREATE INDEX IF NOT EXISTS idx_working_tree_map ON working_tree(map_id);

              CREATE TABLE IF NOT EXISTS commit_trees_new (
                commit_id TEXT NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
                geohash TEXT NOT NULL,
                blob_hash TEXT NOT NULL,
                location_count INTEGER NOT NULL,
                PRIMARY KEY (commit_id, geohash)
              );
              INSERT INTO commit_trees_new SELECT * FROM commit_trees;
              DROP TABLE commit_trees;
              ALTER TABLE commit_trees_new RENAME TO commit_trees;

              DROP TABLE IF EXISTS blobs;",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 11,
        description: "location_count_on_maps",
        sql: "ALTER TABLE maps ADD COLUMN location_count INTEGER NOT NULL DEFAULT 0;",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 12,
        description: "tags_on_maps_row",
        sql: "ALTER TABLE maps ADD COLUMN tags TEXT NOT NULL DEFAULT '{}';",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 13,
        description: "seen_location_id_to_integer",
        sql: "DROP TABLE IF EXISTS seen;
              CREATE TABLE seen (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pano_id TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                heading REAL NOT NULL,
                pitch REAL NOT NULL,
                zoom REAL NOT NULL,
                entered_at INTEGER NOT NULL,
                map_id TEXT,
                location_id INTEGER,
                country_code TEXT,
                address TEXT,
                thumbnail TEXT
              );
              CREATE INDEX IF NOT EXISTS idx_seen_entered ON seen(entered_at DESC);",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 14,
        description: "map_labels_and_last_opened",
        sql: "ALTER TABLE maps ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
              ALTER TABLE maps ADD COLUMN last_opened_at TEXT;",
        kind: MigrationKind::Up,
    }];

    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol("mma-buf", |_ctx, req| {
            let raw = req.uri().path().replace("%20", " ").replace("%3A", ":");
            let trimmed = raw.trim_start_matches('/');
            let clean = if trimmed.starts_with(|c: char| c.is_ascii_alphabetic())
                && trimmed.as_bytes().get(1) == Some(&b':') { trimmed } else { &raw };
            match std::fs::read(clean) {
                Ok(data) => tauri::http::Response::builder()
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Content-Type", "application/octet-stream")
                    .body(data)
                    .unwrap(),
                Err(e) => tauri::http::Response::builder()
                    .status(404)
                    .body(format!("file not found: {e}").into_bytes())
                    .unwrap(),
            }
        })
        .register_uri_scheme_protocol("mma-plugin", |ctx, req| {
            let plugins_dir = ctx.app_handle().path().app_data_dir()
                .unwrap_or_default().join("plugins");
            let path = req.uri().path().trim_start_matches('/');
            let resolved = plugins_dir.join(path);
            let canonical = resolved.canonicalize().unwrap_or_default();
            if !canonical.starts_with(&plugins_dir) {
                return tauri::http::Response::builder()
                    .status(403).body(vec![]).unwrap();
            }
            match std::fs::read(&canonical) {
                Ok(data) => {
                    let mime = if canonical.extension().is_some_and(|e| e == "js" || e == "mjs") {
                        "application/javascript"
                    } else { "application/octet-stream" };
                    tauri::http::Response::builder()
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(data).unwrap()
                }
                Err(_) => tauri::http::Response::builder()
                    .status(404).body(vec![]).unwrap(),
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(location_store::StoreState::new(location_store::Store::new()))
        .invoke_handler(tauri::generate_handler![
            write_temp_file,
            read_file,
            get_db_uri,
            get_app_data_dir,
            open_data_folder,
            list_user_plugins,
            import::bulk_import_preview,
            import::bulk_import_confirm,
            import::store_import_preview,
            import::store_import_file,
            import::store_import_paste,
            location_store::store_open_map,
            location_store::store_close_map,
            location_store::store_add_locations,
            location_store::store_remove_locations,
            location_store::store_update_locations,
            location_store::store_strip_tags,
            location_store::store_set_active,
            location_store::store_get_location,
            location_store::store_get_locations_by_ids,
            location_store::store_get_all_locations,
            location_store::store_save_dirty,
            location_store::store_get_summary,
            location_store::store_tag_counts,
            location_store::store_alloc_tag_id,
            location_store::store_resolve_tag_names,
            location_store::store_bounds,
            location_store::store_commit_diff,
            location_store::store_reset_undo,
            location_store::store_undo,
            location_store::store_redo,
            location_store::store_can_undo_redo,
            location_store::store_location_count,
            location_store::store_has_location,
            location_store::store_extra_field_values,
            location_store::store_fill_render_attrs,
            location_store::store_fill_render_file,
            location_store::store_resolve_pick,
            location_store::store_sync_selections,
            location_store::store_get_selected_ids_list,
            location_store::store_set_selected_ids,
            location_store::store_resolve_selection,
            location_store::store_add_selection,
            location_store::store_remove_selection,
            location_store::store_reset_selections,
            location_store::store_get_selections,
            location_store::store_get_selected_ids,
            location_store::store_refresh_selections,
            location_store::store_bake_and_save,
            location_store::store_snapshot_commit,
            location_store::store_restore_commit,
            export::store_export_json,
            export::store_export_csv,
            export::store_export_geojson,
            export::store_export_bulk_zip,
            geocoder::reverse_geocode,
        ])
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: Some("mma".to_string()) },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let db_uri = format!("sqlite:{}", fast_io::db_path(app.handle())?.to_string_lossy());
            log::info!("[MMA] db_uri: {}", db_uri);
            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations(&db_uri, migrations)
                    .build(),
            )?;

            #[cfg(desktop)]
            {
                app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }

            if let Some(window) = app.get_webview_window("main") {
                let png_bytes = include_bytes!("../icons/icon.png");
                let icon = tauri::image::Image::from_bytes(png_bytes).unwrap();
                let _ = window.set_icon(icon);
            }

            Ok(())
        });

    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_webdriver::init());

    builder.run(tauri::generate_context!())
        .expect("error while running tauri application");
}
