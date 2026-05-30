//! Delta-chain version control core.
//!
//! Each commit's payload is a single Arrow delta file on disk
//! (`arrow/commits/<map_id>/<commit_id>.arrow`); SQL only tracks the commit graph.
//! A commit's full state is materialized by replaying its ancestor delta files
//! from genesis forward. `diff_states` produces the delta between two states.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{params, Connection};

use crate::arrow_bridge;
use crate::fast_io;
use crate::types::Location;

/// Ordered chain of commit ids from genesis (first) to `commit_id` (last),
/// walked via `parent_id` links.
fn commit_chain(conn: &Connection, commit_id: &str) -> Result<Vec<String>, String> {
    let mut chain = Vec::new();
    let mut current = Some(commit_id.to_string());
    while let Some(id) = current {
        let parent: Option<String> = conn
            .query_row("SELECT parent_id FROM commits WHERE id = ?1", params![id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        chain.push(id);
        current = parent;
    }
    chain.reverse();
    Ok(chain)
}

/// Fold delta `(created, removed)` pairs in genesis-first order into a final state.
/// `removed` ids are dropped, then `created` (which includes updated rows) inserted,
/// so an in-place update (same id in both) resolves to the created value.
pub(crate) fn replay_deltas(deltas: &[(Vec<Location>, Vec<Location>)]) -> BTreeMap<u32, Location> {
    let mut state: BTreeMap<u32, Location> = BTreeMap::new();
    for (created, removed) in deltas {
        for loc in removed {
            state.remove(&loc.id);
        }
        for loc in created {
            state.insert(loc.id, loc.clone());
        }
    }
    state
}

/// Materialize the full location set captured by `commit_id` by replaying its
/// ancestor delta files from genesis forward. Locations are keyed (and thus
/// returned sorted) by id.
pub(crate) fn materialize_commit(
    app: &tauri::AppHandle,
    conn: &Connection,
    map_id: &str,
    commit_id: &str,
) -> Result<BTreeMap<u32, Location>, String> {
    let chain = commit_chain(conn, commit_id)?;
    let mut deltas = Vec::with_capacity(chain.len());
    for id in &chain {
        let path = fast_io::commit_delta_path(app, map_id, id)?;
        let batch = fast_io::read_arrow_ipc(&path)?;
        deltas.push(arrow_bridge::batch_to_delta(&batch));
    }
    Ok(replay_deltas(&deltas))
}

/// Compute the delta from `parent` state to `current` state.
/// Returns `(created, removed, added_count, removed_count, modified_count)`.
/// `created` holds added + updated-new rows; `removed` holds deleted + updated-old
/// rows. An updated id appears in both (old in `removed`, new in `created`).
pub(crate) fn diff_states(
    parent: &BTreeMap<u32, Location>,
    current: &[Location],
) -> (Vec<Location>, Vec<Location>, u32, u32, u32) {
    let current_ids: HashSet<u32> = current.iter().map(|l| l.id).collect();
    let mut created = Vec::new();
    let mut removed = Vec::new();
    let (mut added_n, mut removed_n, mut modified_n) = (0u32, 0u32, 0u32);

    for (id, ploc) in parent {
        if !current_ids.contains(id) {
            removed.push(ploc.clone());
            removed_n += 1;
        }
    }
    for loc in current {
        match parent.get(&loc.id) {
            None => {
                created.push(loc.clone());
                added_n += 1;
            }
            Some(ploc) => {
                if ploc != loc {
                    removed.push(ploc.clone());
                    created.push(loc.clone());
                    modified_n += 1;
                }
            }
        }
    }
    (created, removed, added_n, removed_n, modified_n)
}

#[cfg(test)]
#[path = "vcs_delta.test.rs"]
mod tests;
