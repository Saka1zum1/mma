use std::collections::HashMap;
use rusqlite::params;
use crate::types::Tag;
use crate::util::now_iso;

// ---------------------------------------------------------------------------
// Typed sub-structs for MapMeta
// ---------------------------------------------------------------------------

#[derive(Clone, Default, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MapSettings {
    pub point_along_road: bool,
    #[specta(type = Option<specta_typescript::Number>)]
    pub prefer_direction: Option<f64>,
    pub prefer_official: bool,
    pub prefer_higher_quality: bool,
    pub only_official: bool,
    pub camera_types: Option<Vec<String>>,
    pub default_pano_id: bool,
    pub export_zoom: bool,
    pub export_unpanned: bool,
    pub enrich_metadata: bool,
    pub enrich_fields: Option<Vec<String>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ExtraFieldType {
    #[serde(rename = "string")]
    String,
    #[serde(rename = "number")]
    Number,
    #[serde(rename = "date")]
    Date,
    #[serde(rename = "month")]
    Month,
    #[serde(rename = "enum")]
    Enum,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ExtraFieldDef {
    #[serde(rename = "type")]
    pub field_type: ExtraFieldType,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub values: Option<Vec<String>>,
    #[serde(default)]
    pub labels: Option<HashMap<String, String>>,
}

#[derive(Clone, Default, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MapExtra {
    #[serde(default)]
    pub fields: Option<HashMap<String, ExtraFieldDef>>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(untagged)]
pub enum ScoreBounds {
    Auto(String),
    Bounds(#[specta(type = [specta_typescript::Number; 4])] [f64; 4]),
}

impl Default for ScoreBounds {
    fn default() -> Self {
        ScoreBounds::Auto("auto".into())
    }
}

// ---------------------------------------------------------------------------
// MapMeta
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MapMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub folder: Option<String>,
    pub settings: MapSettings,
    pub score_bounds: ScoreBounds,
    pub extra: MapExtra,
    pub tags: HashMap<String, Tag>,
    pub labels: Vec<String>,
    pub location_count: i64,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MapData {
    pub meta: MapMeta,
}

#[derive(Default, serde::Deserialize, specta::Type)]
#[serde(default, rename_all = "camelCase")]
pub struct MapMetaPatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub folder: Option<Option<String>>,
    pub settings: Option<MapSettings>,
    pub score_bounds: Option<ScoreBounds>,
    pub extra: Option<MapExtra>,
    pub tags: Option<HashMap<String, Tag>>,
    pub labels: Option<Vec<String>>,
}

fn row_to_map_meta(row: &rusqlite::Row<'_>) -> Result<MapMeta, rusqlite::Error> {
    let settings_str: String = row.get("settings")?;
    let score_bounds_str: String = row.get("score_bounds")?;
    let extra_str: String = row.get("extra")?;
    let tags_str: String = row.get("tags")?;
    let labels_str: String = row.get("labels")?;

    Ok(MapMeta {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        folder: row.get("folder")?,
        settings: serde_json::from_str(&settings_str).unwrap_or_default(),
        score_bounds: serde_json::from_str(&score_bounds_str).unwrap_or_default(),
        extra: serde_json::from_str(&extra_str).unwrap_or_default(),
        tags: serde_json::from_str(&tags_str).unwrap_or_default(),
        labels: serde_json::from_str(&labels_str).unwrap_or_default(),
        location_count: row.get("location_count")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        last_opened_at: row.get("last_opened_at")?,
    })
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn store_list_maps(app: tauri::AppHandle) -> Result<Vec<MapMeta>, String> {
    let conn = crate::fast_io::open_db(&app)?;
    let mut stmt = conn
        .prepare("SELECT * FROM maps")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row_to_map_meta(row))
        .map_err(|e| e.to_string())?;
    let mut maps = Vec::new();
    for row in rows {
        maps.push(row.map_err(|e| e.to_string())?);
    }
    Ok(maps)
}

#[tauri::command]
#[specta::specta]
pub fn store_get_map(app: tauri::AppHandle, id: String) -> Result<Option<MapData>, String> {
    let conn = crate::fast_io::open_db(&app)?;
    let result = conn.query_row("SELECT * FROM maps WHERE id = ?1", params![id], |row| {
        row_to_map_meta(row)
    });
    match result {
        Ok(meta) => Ok(Some(MapData { meta })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

const DEFAULT_SETTINGS: &str = r#"{"pointAlongRoad":true,"preferDirection":null,"preferOfficial":true,"preferHigherQuality":false,"onlyOfficial":false,"cameraTypes":null,"defaultPanoId":false,"exportZoom":false,"exportUnpanned":true,"enrichMetadata":false}"#;

#[tauri::command]
#[specta::specta]
pub fn store_create_map(
    app: tauri::AppHandle,
    name: String,
    folder: Option<String>,
) -> Result<MapData, String> {
    let conn = crate::fast_io::open_db(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_iso();
    conn.execute(
        "INSERT INTO maps (id, name, folder, settings, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, folder, DEFAULT_SETTINGS, now, now],
    )
    .map_err(|e| e.to_string())?;

    let meta = conn
        .query_row("SELECT * FROM maps WHERE id = ?1", params![id], |row| {
            row_to_map_meta(row)
        })
        .map_err(|e| e.to_string())?;
    Ok(MapData { meta })
}

#[tauri::command]
#[specta::specta]
pub fn store_delete_map(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    conn.execute("DELETE FROM maps WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM edit_history WHERE map_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM commits WHERE map_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM commit_trees WHERE commit_id NOT IN (SELECT id FROM commits)",
        [],
    )
    .map_err(|e| e.to_string())?;

    if let Ok(path) = crate::fast_io::arrow_path(&app, &id) {
        let _ = std::fs::remove_file(path);
    }
    if let Ok(path) = crate::fast_io::arrow_delta_path(&app, &id) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_update_map_meta(
    app: tauri::AppHandle,
    id: String,
    patch: MapMetaPatch,
) -> Result<(), String> {
    let mut sets: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref v) = patch.name {
        sets.push("name = ?".into());
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = patch.description {
        sets.push("description = ?".into());
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = patch.folder {
        sets.push("folder = ?".into());
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = patch.settings {
        sets.push("settings = ?".into());
        values.push(Box::new(serde_json::to_string(v).unwrap_or_default()));
    }
    if let Some(ref v) = patch.score_bounds {
        sets.push("score_bounds = ?".into());
        values.push(Box::new(serde_json::to_string(v).unwrap_or_default()));
    }
    if let Some(ref v) = patch.extra {
        sets.push("extra = ?".into());
        values.push(Box::new(serde_json::to_string(v).unwrap_or_default()));
    }
    if let Some(ref v) = patch.tags {
        sets.push("tags = ?".into());
        values.push(Box::new(serde_json::to_string(&v).unwrap_or_default()));
    }
    if let Some(ref v) = patch.labels {
        sets.push("labels = ?".into());
        values.push(Box::new(serde_json::to_string(v).unwrap_or_default()));
    }

    if sets.is_empty() {
        return Ok(());
    }

    let now = now_iso();
    sets.push("updated_at = ?".to_string());
    values.push(Box::new(now));
    values.push(Box::new(id));

    let sql = format!(
        "UPDATE maps SET {} WHERE id = ?",
        sets.join(", ")
    );
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|b| b.as_ref()).collect();
    let conn = crate::fast_io::open_db(&app)?;
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_save_tags(
    app: tauri::AppHandle,
    map_id: String,
    tags: HashMap<String, Tag>,
) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    let now = now_iso();
    let json = serde_json::to_string(&tags).unwrap_or_default();
    conn.execute(
        "UPDATE maps SET tags = ?1, updated_at = ?2 WHERE id = ?3",
        params![json, now, map_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_touch_map_opened(app: tauri::AppHandle, map_id: String) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    let now = now_iso();
    conn.execute(
        "UPDATE maps SET last_opened_at = ?1 WHERE id = ?2",
        params![now, map_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_rename_folder(app: tauri::AppHandle, from: String, to: String) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    conn.execute(
        "UPDATE maps SET folder = ?1 WHERE folder = ?2",
        params![to, from],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_delete_folder(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    conn.execute(
        "UPDATE maps SET folder = NULL WHERE folder = ?1",
        params![name],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_move_map_to_folder(
    app: tauri::AppHandle,
    map_id: String,
    folder: Option<String>,
) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    conn.execute(
        "UPDATE maps SET folder = ?1 WHERE id = ?2",
        params![folder, map_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_update_map_labels(
    app: tauri::AppHandle,
    map_id: String,
    labels: Vec<String>,
) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    let now = now_iso();
    let json = serde_json::to_string(&labels).unwrap_or_default();
    conn.execute(
        "UPDATE maps SET labels = ?1, updated_at = ?2 WHERE id = ?3",
        params![json, now, map_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_get_pano_date(app: tauri::AppHandle, pano_id: String) -> Result<Option<i64>, String> {
    let conn = crate::fast_io::open_db(&app)?;
    let result = conn.query_row(
        "SELECT timestamp FROM pano_date_cache WHERE pano_id = ?1",
        params![pano_id],
        |row| row.get::<_, i64>(0),
    );
    match result {
        Ok(ts) => Ok(Some(ts)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
#[specta::specta]
pub fn store_set_pano_date(
    app: tauri::AppHandle,
    pano_id: String,
    timestamp: i64,
) -> Result<(), String> {
    let conn = crate::fast_io::open_db(&app)?;
    conn.execute(
        "INSERT OR REPLACE INTO pano_date_cache (pano_id, timestamp) VALUES (?1, ?2)",
        params![pano_id, timestamp],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Debug / diagnostics
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbTableInfo {
    pub name: String,
    pub rows: i64,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DbStats {
    pub maps: i64,
    pub locations: i64,
    pub tags: i64,
    pub commits: i64,
    pub db_size_bytes: i64,
    pub journal_mode: String,
    pub foreign_keys: bool,
}

#[tauri::command]
#[specta::specta]
pub fn store_db_table_info(app: tauri::AppHandle) -> Result<Vec<DbTableInfo>, String> {
    let conn = crate::fast_io::open_db(&app)?;
    let mut stmt = conn.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx_%' AND name NOT LIKE '_mma_%' ORDER BY name"
    ).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let mut results = Vec::new();
    for name in names {
        let rows: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "")),
            [], |r| r.get(0),
        ).unwrap_or(-1);
        results.push(DbTableInfo { name, rows });
    }
    Ok(results)
}

#[tauri::command]
#[specta::specta]
pub fn store_db_clear_table(app: tauri::AppHandle, table: String) -> Result<i64, String> {
    let safe = table.replace('"', "");
    let conn = crate::fast_io::open_db(&app)?;
    let deleted = conn.execute(&format!("DELETE FROM \"{}\"", safe), [])
        .map_err(|e| e.to_string())?;
    Ok(deleted as i64)
}

#[tauri::command]
#[specta::specta]
pub fn store_db_stats(app: tauri::AppHandle) -> Result<DbStats, String> {
    let conn = crate::fast_io::open_db(&app)?;
    let maps: i64 = conn.query_row("SELECT COUNT(*) FROM maps", [], |r| r.get(0)).unwrap_or(0);
    let locations: i64 = conn.query_row("SELECT COALESCE(SUM(location_count), 0) FROM maps", [], |r| r.get(0)).unwrap_or(0);
    let tags: i64 = {
        let mut stmt = conn.prepare("SELECT tags FROM maps").map_err(|e| e.to_string())?;
        let rows: Vec<String> = stmt.query_map([], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows.iter().map(|t| {
            serde_json::from_str::<serde_json::Value>(t)
                .ok()
                .and_then(|v| v.as_object().map(|o| o.len() as i64))
                .unwrap_or(0)
        }).sum()
    };
    let commits: i64 = conn.query_row("SELECT COUNT(*) FROM commits", [], |r| r.get(0)).unwrap_or(0);
    let page_count: i64 = conn.query_row("PRAGMA page_count", [], |r| r.get(0)).unwrap_or(0);
    let page_size: i64 = conn.query_row("PRAGMA page_size", [], |r| r.get(0)).unwrap_or(4096);
    let journal_mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap_or_default();
    let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap_or(0);
    Ok(DbStats {
        maps,
        locations,
        tags,
        commits,
        db_size_bytes: page_count * page_size,
        journal_mode,
        foreign_keys: fk != 0,
    })
}
