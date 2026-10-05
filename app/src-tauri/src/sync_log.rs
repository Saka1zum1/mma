//! A per-map record of settled sync passes: when each ran, what started it, and what it changed
//! or why it failed. Kept per map and provider, capped, and deleted with the map.

use crate::storage;
use crate::sync::SideCounts;
use crate::types::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

/// What started a sync pass.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SyncTrigger {
    /// Sync now was pressed.
    Manual,
    /// Live sync ran it, after an edit or on its schedule.
    Live,
    /// Linking the map ran its first sync.
    Link,
    /// Resolving held conflicts ran it.
    Resolve,
}

/// How a sync pass ended.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SyncLogResult {
    /// The pass finished, with what it changed on each side.
    Ok {
        pushed: SideCounts,
        pulled: SideCounts,
        adopted: u32,
        conflicts: u32,
    },
    /// The pass stopped with this error.
    Error { message: String },
}

/// One settled sync pass.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncLogEntry {
    pub trigger: SyncTrigger,
    /// When the pass started, in milliseconds since 1970.
    pub started_at: i64,
    pub duration_ms: u32,
    pub result: SyncLogResult,
}

/// Passes kept per map and provider; the oldest go first.
pub(crate) const MAX_ENTRIES: u32 = 100;

pub(crate) fn append(
    conn: &Connection,
    provider: &str,
    map_id: &str,
    entry: &SyncLogEntry,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sync_log (map_id, provider, started_at, entry) VALUES (?, ?, ?, ?)",
        params![
            map_id,
            provider,
            entry.started_at,
            serde_json::to_string(entry)?
        ],
    )?;
    conn.execute(
        "DELETE FROM sync_log WHERE map_id = ?1 AND provider = ?2 AND id NOT IN (
            SELECT id FROM sync_log WHERE map_id = ?1 AND provider = ?2
            ORDER BY started_at DESC, id DESC LIMIT ?3)",
        params![map_id, provider, MAX_ENTRIES],
    )?;
    Ok(())
}

/// The map's passes with `provider`, newest first.
pub(crate) fn list(
    conn: &Connection,
    provider: &str,
    map_id: &str,
) -> AppResult<Vec<SyncLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT entry FROM sync_log WHERE map_id = ? AND provider = ?
         ORDER BY started_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![map_id, provider], |row| row.get::<_, String>(0))?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(serde_json::from_str(&row?)?);
    }
    Ok(entries)
}

/// Record a settled sync pass for a map. Only the most recent passes per provider are kept.
#[tauri::command]
#[specta::specta]
pub async fn sync_log_append(
    provider: String,
    map_id: String,
    entry: SyncLogEntry,
) -> AppResult<()> {
    storage::with_db(move |conn| append(conn, &provider, &map_id, &entry)).await
}

/// A map's recorded sync passes with a provider, newest first.
#[tauri::command]
#[specta::specta]
pub async fn sync_log_list(provider: String, map_id: String) -> AppResult<Vec<SyncLogEntry>> {
    storage::with_db(move |conn| list(conn, &provider, &map_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE sync_log (
                id INTEGER PRIMARY KEY,
                map_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                started_at INTEGER NOT NULL,
                entry TEXT NOT NULL
            );",
        )
        .unwrap();
        c
    }

    fn entry(started_at: i64, message: &str) -> SyncLogEntry {
        SyncLogEntry {
            trigger: SyncTrigger::Manual,
            started_at,
            duration_ms: 1,
            result: SyncLogResult::Error {
                message: message.into(),
            },
        }
    }

    #[test]
    fn newest_first_and_capped() {
        let c = conn();
        for i in 0..(MAX_ENTRIES + 5) {
            append(&c, "geoguessr", "m1", &entry(i as i64, &i.to_string())).unwrap();
        }
        let listed = list(&c, "geoguessr", "m1").unwrap();
        assert_eq!(listed.len(), MAX_ENTRIES as usize);
        assert_eq!(listed[0].started_at, (MAX_ENTRIES + 4) as i64);
        assert_eq!(listed.last().unwrap().started_at, 5);
        // A different provider is its own list.
        append(&c, "map-making.app", "m1", &entry(1, "other")).unwrap();
        assert_eq!(list(&c, "map-making.app", "m1").unwrap().len(), 1);
        assert_eq!(
            list(&c, "geoguessr", "m1").unwrap().len(),
            MAX_ENTRIES as usize
        );
    }
}
