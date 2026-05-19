use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

use arrow::array::{
    Array, ArrayRef, Float64Array, ListArray, RecordBatch,
    StringArray, UInt32Array,
};
use arrow::compute::concat_batches;
use arrow::datatypes::SchemaRef;
use rayon::prelude::*;
use tauri::Manager;

use crate::arrow_bridge;
use crate::fast_io;
use crate::types::{Location, Tag};
use crate::selections::{self, SelectionProps, Selection, SelectionSummary};

const GEOHASH_PRECISION: usize = 2;
const RENDER_PRECISION: usize = 1;
const MAX_UNDO_ENTRIES: usize = 1000;
const BASE32: &[u8] = b"0123456789bcdefghjkmnpqrstuvwxyz";

pub(crate) fn encode_geohash(lat: f64, lng: f64) -> String {
    let (mut min_lat, mut max_lat) = (-90.0, 90.0);
    let (mut min_lng, mut max_lng) = (-180.0, 180.0);
    let mut hash = String::with_capacity(GEOHASH_PRECISION);
    let mut bits = 0u8;
    let mut ch = 0u8;
    let mut even = true;
    while hash.len() < GEOHASH_PRECISION {
        if even {
            let mid = (min_lng + max_lng) / 2.0;
            if lng >= mid { ch = (ch << 1) | 1; min_lng = mid; } else { ch <<= 1; max_lng = mid; }
        } else {
            let mid = (min_lat + max_lat) / 2.0;
            if lat >= mid { ch = (ch << 1) | 1; min_lat = mid; } else { ch <<= 1; max_lat = mid; }
        }
        even = !even;
        bits += 1;
        if bits == 5 { hash.push(BASE32[ch as usize] as char); bits = 0; ch = 0; }
    }
    hash
}

fn render_cell_key(gh: &str) -> &str {
    &gh[..RENDER_PRECISION]
}


fn render_cell_idx(lat: f64, lng: f64) -> u8 {
    let (mut min_lat, mut max_lat) = (-90.0, 90.0);
    let (mut min_lng, mut max_lng) = (-180.0, 180.0);
    let mut ch: u8 = 0;
    let mut even = true;
    for _ in 0..5 {
        if even {
            let mid = (min_lng + max_lng) / 2.0;
            if lng >= mid { ch = (ch << 1) | 1; min_lng = mid; } else { ch <<= 1; max_lng = mid; }
        } else {
            let mid = (min_lat + max_lat) / 2.0;
            if lat >= mid { ch = (ch << 1) | 1; min_lat = mid; } else { ch <<= 1; max_lat = mid; }
        }
        even = !even;
    }
    ch
}

fn cell_key_from_idx(idx: u8) -> String {
    String::from(BASE32[idx as usize] as char)
}

// ---------------------------------------------------------------------------
// Column accessors — typed downcasts from a RecordBatch
// ---------------------------------------------------------------------------

fn col_id(b: &RecordBatch) -> &UInt32Array { b.column(0).as_any().downcast_ref().unwrap() }
fn col_lat(b: &RecordBatch) -> &Float64Array { b.column(1).as_any().downcast_ref().unwrap() }
fn col_lng(b: &RecordBatch) -> &Float64Array { b.column(2).as_any().downcast_ref().unwrap() }
fn col_heading(b: &RecordBatch) -> &Float64Array { b.column(3).as_any().downcast_ref().unwrap() }
fn col_flags(b: &RecordBatch) -> &UInt32Array { b.column(7).as_any().downcast_ref().unwrap() }
fn col_tags(b: &RecordBatch) -> &ListArray { b.column(8).as_any().downcast_ref().unwrap() }
fn col_extra(b: &RecordBatch) -> &StringArray { b.column(9).as_any().downcast_ref().unwrap() }

fn num_rows(store: &Store) -> usize { store.batch.as_ref().map_or(0, |b| b.num_rows()) }

fn schema() -> SchemaRef { Arc::new(arrow_bridge::location_schema()) }

fn empty_batch() -> RecordBatch {
    RecordBatch::new_empty(schema())
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

pub(crate) struct CellRender {
    pub id_order: Vec<u32>,
    pub id_to_index: HashMap<u32, usize>,
}

pub struct Store {
    pub(crate) map_id: Option<String>,
    // Arrow batch = immutable base snapshot, loaded from disk
    pub(crate) batch: Option<RecordBatch>,
    // Overlay: mutations accumulate here, merged into batch on save/close
    pub(crate) overlay_adds: Vec<Location>,
    overlay_dead: HashSet<u32>,
    overlay_patches: HashMap<u32, Location>,
    // Indexes (cover batch + overlay)
    pub(crate) id_to_index: HashMap<u32, usize>,
    pub(crate) geohash_index: HashMap<String, Vec<usize>>,
    dirty_geohashes: HashSet<String>,
    pub(crate) dirty: bool,
    pub(crate) tag_counts: HashMap<u32, usize>,
    next_id: u32,
    next_tag_id: u32,
    version: u64,
    // Per-cell render tracking
    pub(crate) render_cells: HashMap<String, CellRender>,
    pub(crate) id_to_cell: HashMap<u32, String>,
    pub selections: Vec<Selection>,
    pub selection_version: u64,
    selected_ids: HashSet<u32>,
    selected_colors: HashMap<u32, [u8; 3]>,
    active_id: Option<u32>,
    pub(crate) alive_count: usize,
    pub(crate) undo_stack: Vec<EditEntry>,
    pub(crate) redo_stack: Vec<EditEntry>,
    committed_blobs: HashMap<String, (String, u32)>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct EditEntry {
    pub created: Vec<Location>,
    pub removed: Vec<Location>,
}

impl Store {
    pub fn new() -> Self {
        Self {
            map_id: None,
            batch: None,
            overlay_adds: Vec::new(),
            overlay_dead: HashSet::new(),
            overlay_patches: HashMap::new(),
            id_to_index: HashMap::new(),
            geohash_index: HashMap::new(),
            dirty_geohashes: HashSet::new(),
            dirty: false,
            tag_counts: HashMap::new(),
            next_id: 1,
            next_tag_id: 1,
            version: 0,
            render_cells: HashMap::new(),
            id_to_cell: HashMap::new(),
            selections: Vec::new(),
            selection_version: 0,
            selected_ids: HashSet::new(),
            selected_colors: HashMap::new(),
            active_id: None,
            alive_count: 0,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            committed_blobs: HashMap::new(),
        }
    }

    pub(crate) fn bump(&mut self) -> u64 {
        self.version += 1;
        self.version
    }

    pub(crate) fn store_status(&self) -> StoreStatus {
        StoreStatus {
            version: self.version,
            location_count: self.alive_count,
            can_undo: !self.undo_stack.is_empty(),
            can_redo: !self.redo_stack.is_empty(),
            tag_counts: self.tag_counts.clone(),
        }
    }

    pub(crate) fn finish_mutation(&mut self, delta: RenderDelta) -> MutationResult {
        self.bump();
        let selection_sync = if !self.selections.is_empty() {
            Some(self.refresh_and_sync_selections())
        } else {
            None
        };
        MutationResult {
            status: self.store_status(),
            delta,
            selection_sync,
        }
    }

    pub(crate) fn refresh_and_sync_selections(&mut self) -> SelectionSync {
        let props: Vec<SelectionProps> = self.selections.iter().map(|s| s.props.clone()).collect();
        let masks: Vec<Vec<bool>> = {
            let view = self.loc_view();
            props.iter().map(|p| selections::resolve_bitmask(&view, p)).collect()
        };

        let counts: Vec<usize> = masks.iter()
            .map(|m| m.iter().filter(|&&b| b).count())
            .collect();

        let colors: Vec<[u8; 3]> = self.selections.iter().map(|s| s.color).collect();
        let num_sels = masks.len();
        let mut all_selected = HashSet::new();
        let mut color_map = HashMap::new();
        let mut all_ids: Vec<Vec<u32>> = vec![Vec::new(); num_sels];

        let batch_len = self.batch.as_ref().map_or(0, |b| b.num_rows());
        for si in 0..num_sels {
            let mask = &masks[si];
            if let Some(ref b) = self.batch {
                let id_col = col_id(b);
                for i in 0..b.num_rows() {
                    let id = id_col.value(i);
                    if self.overlay_dead.contains(&id) { continue; }
                    if i < mask.len() && mask[i] {
                        all_ids[si].push(id);
                        all_selected.insert(id);
                        color_map.insert(id, colors[si]);
                    }
                }
            }
            for (j, loc) in self.overlay_adds.iter().enumerate() {
                let mi = batch_len + j;
                if mi < mask.len() && mask[mi] {
                    all_ids[si].push(loc.id);
                    all_selected.insert(loc.id);
                    color_map.insert(loc.id, colors[si]);
                }
            }
        }

        for (si, ids) in all_ids.into_iter().enumerate() {
            self.selections[si].locations = ids;
        }

        let selected_count = all_selected.len();
        self.selected_ids = all_selected;
        self.selected_colors = color_map;
        self.selection_version += 1;

        // Build bitmask binary
        let num_sels = self.selections.len();
        let mut buf: Vec<u8> = Vec::new();
        buf.push(num_sels as u8);
        for sel in &self.selections {
            buf.extend_from_slice(&sel.color);
        }
        let num_cells = self.render_cells.len();
        buf.push(num_cells as u8);
        let sel_id_sets: Vec<HashSet<u32>> = self.selections.iter()
            .map(|s| s.locations.iter().copied().collect())
            .collect();
        for (cell_key, cr) in &self.render_cells {
            buf.push(cell_key.as_bytes()[0]);
            let n = cr.id_order.len();
            buf.extend_from_slice(&(n as u32).to_le_bytes());
            let mask_bytes = n.div_ceil(8);
            for si in 0..num_sels {
                let mut bitmask = vec![0u8; mask_bytes];
                for (li, &id) in cr.id_order.iter().enumerate() {
                    if sel_id_sets[si].contains(&id) {
                        bitmask[li / 8] |= 1 << (li % 8);
                    }
                }
                buf.extend_from_slice(&bitmask);
            }
        }

        let patch_file = if num_cells > 0 {
            let path = std::env::temp_dir().join("mma_sel_patches.bin");
            let _ = std::fs::write(&path, &buf);
            Some(path.to_string_lossy().into_owned())
        } else {
            None
        };

        SelectionSync { counts, patch_file, selected_count }
    }

    pub(crate) fn mark_dirty(&mut self, lat: f64, lng: f64) {
        self.dirty_geohashes.insert(encode_geohash(lat, lng));
    }

    pub(crate) fn add_tag_counts(&mut self, locs: &[Location]) {
        for loc in locs {
            for &tag in &loc.tags { *self.tag_counts.entry(tag).or_default() += 1; }
        }
    }

    pub(crate) fn remove_tag_counts(&mut self, locs: &[Location]) {
        for loc in locs {
            for &tag in &loc.tags {
                if let Some(c) = self.tag_counts.get_mut(&tag) { *c = c.saturating_sub(1); }
            }
        }
    }

    pub(crate) fn cell_add_render(&mut self, cell: &str, id: u32) -> usize {
        let cr = self.render_cells.entry(cell.to_string()).or_insert_with(|| CellRender {
            id_order: Vec::new(),
            id_to_index: HashMap::new(),
        });
        let idx = cr.id_order.len();
        cr.id_to_index.insert(id, idx);
        cr.id_order.push(id);
        self.id_to_cell.insert(id, cell.to_string());
        idx
    }

    fn cell_remove_render(&mut self, id: u32) -> Option<CellRemoval> {
        let cell = self.id_to_cell.remove(&id)?;
        let cr = self.render_cells.get_mut(&cell)?;
        let idx = cr.id_to_index.remove(&id)?;
        let last = cr.id_order.len() - 1;
        if idx != last {
            let moved_id = cr.id_order[last];
            cr.id_order[idx] = moved_id;
            cr.id_to_index.insert(moved_id, idx);
        }
        cr.id_order.pop();
        Some(CellRemoval { cell, cell_index: idx, id })
    }

    fn cell_lookup(&self, id: u32) -> Option<(String, usize)> {
        let cell = self.id_to_cell.get(&id)?;
        let cr = self.render_cells.get(cell)?;
        let idx = *cr.id_to_index.get(&id)?;
        Some((cell.clone(), idx))
    }

    pub(crate) fn alloc_id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub(crate) fn alloc_tag_id(&mut self) -> u32 {
        let id = self.next_tag_id;
        self.next_tag_id += 1;
        id
    }

    pub(crate) fn push_undo(&mut self, entry: EditEntry) {
        self.undo_stack.push(entry);
        if self.undo_stack.len() > MAX_UNDO_ENTRIES {
            self.undo_stack.drain(..self.undo_stack.len() - MAX_UNDO_ENTRIES);
        }
    }

    fn batch_ref(&self) -> &RecordBatch {
        self.batch.as_ref().expect("no map open")
    }

    fn get_loc_by_id(&self, id: u32) -> Option<Location> {
        if self.overlay_dead.contains(&id) { return None; }
        if let Some(patched) = self.overlay_patches.get(&id) { return Some(patched.clone()); }
        for loc in &self.overlay_adds {
            if loc.id == id { return Some(loc.clone()); }
        }
        if let (Some(b), Some(&idx)) = (&self.batch, self.id_to_index.get(&id)) {
            if idx < b.num_rows() {
                return Some(arrow_bridge::row_to_location(b, idx));
            }
        }
        None
    }

    fn get_loc(&self, idx: usize) -> Location {
        let loc = arrow_bridge::row_to_location(self.batch_ref(), idx);
        if let Some(patched) = self.overlay_patches.get(&loc.id) {
            return patched.clone();
        }
        loc
    }
    
    /// Collect all alive locations (batch + overlay) as Vec for serialization.
    pub(crate) fn collect_all_locations(&self) -> Vec<Location> {
        let mut locs = Vec::new();
        if let Some(ref b) = self.batch {
            for i in 0..b.num_rows() {
                let id = col_id(b).value(i);
                if self.overlay_dead.contains(&id) { continue; }
                if let Some(patched) = self.overlay_patches.get(&id) {
                    locs.push(patched.clone());
                } else {
                    locs.push(arrow_bridge::row_to_location(b, i));
                }
            }
        }
        locs.extend(self.overlay_adds.iter().cloned());
        locs
    }

    fn loc_view(&self) -> selections::LocView<'_> {
        selections::LocView::new(
            self.batch.as_ref(),
            &self.overlay_dead,
            &self.overlay_patches,
            &self.overlay_adds,
        )
    }

    pub(crate) fn overlay_add(&mut self, loc: Location) {
        self.mark_dirty(loc.lat, loc.lng);
        self.dirty = true;
        self.alive_count += 1;
        if self.id_to_index.contains_key(&loc.id) {
            self.overlay_dead.remove(&loc.id);
            self.overlay_patches.insert(loc.id, loc);
        } else {
            self.overlay_dead.remove(&loc.id);
            self.overlay_adds.push(loc);
        }
    }

    fn overlay_remove(&mut self, locs: &[Location]) {
        let remove_set: HashSet<u32> = locs.iter().map(|l| l.id).collect();
        for loc in locs {
            self.mark_dirty(loc.lat, loc.lng);
            self.alive_count -= 1;
            self.overlay_patches.remove(&loc.id);
        }
        self.overlay_dead.extend(&remove_set);
        self.overlay_adds.retain(|l| !remove_set.contains(&l.id));
        self.dirty = true;
    }

    fn overlay_update(&mut self, id: u32, patch: &LocationPatch) {
        let mut loc = match self.get_loc_by_id(id) {
            Some(l) => l,
            None => return,
        };
        self.mark_dirty(loc.lat, loc.lng);
        if let Some(v) = patch.lat { loc.lat = v; }
        if let Some(v) = patch.lng { loc.lng = v; }
        if let Some(v) = patch.heading { loc.heading = v; }
        if let Some(v) = patch.pitch { loc.pitch = v; }
        if let Some(v) = patch.zoom { loc.zoom = v; }
        if let Some(ref v) = patch.pano_id { loc.pano_id = v.clone(); }
        if let Some(v) = patch.flags { loc.flags = v; }
        if let Some(ref v) = patch.tags { loc.tags = v.clone(); }
        if let Some(ref v) = patch.extra { loc.extra = v.clone(); }
        if let Some(ref v) = patch.created_at { loc.created_at = v.clone(); }
        if let Some(ref v) = patch.modified_at { loc.modified_at = v.clone(); }
        self.mark_dirty(loc.lat, loc.lng);
        // If it's in overlay_adds, update in place
        if let Some(pos) = self.overlay_adds.iter().position(|l| l.id == id) {
            self.overlay_adds[pos] = loc;
        } else {
            self.overlay_patches.insert(id, loc);
        }
        self.dirty = true;
    }

    fn clear_overlay(&mut self) {
        self.overlay_adds.clear();
        self.overlay_dead.clear();
        self.overlay_patches.clear();
        self.dirty = false;
    }

    /// Bake overlay into the batch — called on save/close.
    pub(crate) fn bake_overlay(&mut self) {
        if !self.dirty { return; }
        let _t = std::time::Instant::now();

        let mut batch = match self.batch.take() {
            Some(b) => b,
            None => {
                // No batch yet, just convert adds
                let b = arrow_bridge::locations_to_batch(&self.overlay_adds);
                self.clear_overlay();
                self.batch = Some(b);
                self.rebuild_index();
                return;
            }
        };

        // Step 1: filter out dead rows
        if !self.overlay_dead.is_empty() {
            let ids = col_id(&batch);
            let keep: Vec<u32> = (0..batch.num_rows())
                .filter(|&i| !self.overlay_dead.contains(&ids.value(i)))
                .map(|i| i as u32)
                .collect();
            if keep.len() < batch.num_rows() {
                let take_idx = arrow::array::UInt32Array::from(keep);
                batch = RecordBatch::try_new(
                    batch.schema(),
                    batch.columns().iter().map(|col| {
                        arrow::compute::take(col.as_ref(), &take_idx, None).unwrap()
                    }).collect(),
                ).unwrap();
            }
        }

        // Step 2: apply patches -- remove patched rows, concat replacement batch
        if !self.overlay_patches.is_empty() {
            let ids = col_id(&batch);
            let keep: Vec<u32> = (0..batch.num_rows())
                .filter(|&i| !self.overlay_patches.contains_key(&ids.value(i)))
                .map(|i| i as u32)
                .collect();
            if keep.len() < batch.num_rows() {
                let patched_locs: Vec<Location> = self.overlay_patches.values().cloned().collect();
                let take_idx = arrow::array::UInt32Array::from(keep);
                let filtered = RecordBatch::try_new(
                    batch.schema(),
                    batch.columns().iter().map(|col| {
                        arrow::compute::take(col.as_ref(), &take_idx, None).unwrap()
                    }).collect(),
                ).unwrap();
                drop(batch);
                let patch_batch = arrow_bridge::locations_to_batch(&patched_locs);
                let s = schema();
                batch = arrow::compute::concat_batches(&s, &[filtered, patch_batch])
                    .expect("concat failed");
            }
        }

        // Step 3: concat adds
        if !self.overlay_adds.is_empty() {
            let add_batch = arrow_bridge::locations_to_batch(&self.overlay_adds);
            let s = schema();
            batch = arrow::compute::concat_batches(&s, &[batch, add_batch])
                .expect("concat failed");
        }

        log::debug!("[bake_overlay] total={}ms rows={}", _t.elapsed().as_millis(), batch.num_rows());
        self.batch = Some(batch);
        self.clear_overlay();
        self.rebuild_index();
    }

    pub(crate) fn rebuild_index(&mut self) {
        self.id_to_index.clear();
        self.geohash_index.clear();
        if let Some(ref b) = self.batch {
            let ids = col_id(b);
            let lats = col_lat(b);
            let lngs = col_lng(b);
            for i in 0..b.num_rows() {
                self.id_to_index.insert(ids.value(i), i);
                let gh = encode_geohash(lats.value(i), lngs.value(i));
                self.geohash_index.entry(gh).or_default().push(i);
            }
        }
    }
}

pub type StoreState = Mutex<Store>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StoreStatus {
    pub version: u64,
    pub location_count: usize,
    pub can_undo: bool,
    pub can_redo: bool,
    pub tag_counts: HashMap<u32, usize>,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub saved_chunks: usize,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SummaryResult {
    pub location_count: usize,
    pub version: u64,
    pub dirty_count: usize,
}

#[derive(serde::Serialize, Default, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderDelta {
    pub added: Vec<RenderEntry>,
    pub updated: Vec<RenderPatchEntry>,
    pub removed: Vec<CellRemoval>,
    pub color_patches: Vec<ColorPatchEntry>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub full_reset: bool,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderEntry {
    pub cell: String,
    pub id: u32,
    #[specta(type = specta_typescript::Number)]
    pub lng: f32,
    #[specta(type = specta_typescript::Number)]
    pub lat: f32,
    #[specta(type = specta_typescript::Number)]
    pub heading: f32,
    pub r: u8, pub g: u8, pub b: u8, pub a: u8,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RenderPatchEntry {
    pub cell: String,
    pub cell_index: usize,
    #[specta(type = Option<specta_typescript::Number>)]
    pub lng: Option<f32>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub lat: Option<f32>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub heading: Option<f32>,
}

#[derive(serde::Serialize, Default, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CellRemoval {
    pub cell: String,
    pub cell_index: usize,
    pub id: u32,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ColorPatchEntry {
    pub cell: String,
    pub cell_index: usize,
    pub r: u8, pub g: u8, pub b: u8, pub a: u8,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSync {
    pub counts: Vec<usize>,
    pub patch_file: Option<String>,
    pub selected_count: usize,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    #[serde(flatten)]
    pub status: StoreStatus,
    pub delta: RenderDelta,
    pub selection_sync: Option<SelectionSync>,
}

/// Deserialize a present-but-null JSON field as `Some(None)` instead of `None`.
/// Missing field → `None` (don't update), `null` → `Some(None)` (set to null),
/// `"value"` → `Some(Some("value"))` (set to value).
fn nullable<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    use serde::Deserialize;
    Ok(Some(Option::deserialize(deserializer)?))
}

#[derive(Default, serde::Deserialize, specta::Type)]
#[serde(default, rename_all = "camelCase")]
pub struct LocationPatch {
    #[specta(type = Option<specta_typescript::Number>)]
    pub lat: Option<f64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub lng: Option<f64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub heading: Option<f64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub pitch: Option<f64>,
    #[specta(type = Option<specta_typescript::Number>)]
    pub zoom: Option<f64>,
    #[serde(default, deserialize_with = "nullable")]
    #[specta(type = Option<Option<String>>)]
    pub pano_id: Option<Option<String>>,
    pub flags: Option<u32>,
    pub tags: Option<Vec<u32>>,
    #[serde(default, deserialize_with = "nullable")]
    #[specta(type = Option<Option<specta_typescript::Any>>)]
    pub extra: Option<Option<serde_json::Map<String, serde_json::Value>>>,
    pub created_at: Option<String>,
    #[serde(default, deserialize_with = "nullable")]
    #[specta(type = Option<Option<String>>)]
    pub modified_at: Option<Option<String>>,
}



// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub async fn store_open_map(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
    map_id: String,
) -> Result<StoreStatus, String> {
    let app2 = app.clone();
    let map_id2 = map_id.clone();

    let result = tokio::task::spawn_blocking(move || {
        use std::time::Instant;
        let t_total = Instant::now();

        let batch = {
            let t0 = Instant::now();
            let path = fast_io::arrow_path(&app2, &map_id2)?;
            let mut batch = if path.exists() {
                fast_io::read_arrow_ipc(&path)?
            } else {
                RecordBatch::new_empty(schema())
            };
            log::debug!("[store_open] arrow_read={}ms rows={}", t0.elapsed().as_millis(), batch.num_rows());

            let delta_path = fast_io::arrow_delta_path(&app2, &map_id2)?;
            if delta_path.exists() {
                let t_d = Instant::now();
                if let Ok(data) = std::fs::read(&delta_path) {
                    if let Ok(delta) = rmp_serde::from_slice::<DeltaOverlay>(&data) {
                        if !delta.dead_ids.is_empty() {
                            let dead_set: HashSet<u32> = delta.dead_ids.into_iter().collect();
                            let ids_col = col_id(&batch);
                            let keep: Vec<u32> = (0..batch.num_rows())
                                .filter(|&i| !dead_set.contains(&ids_col.value(i)))
                                .map(|i| i as u32)
                                .collect();
                            if keep.len() < batch.num_rows() {
                                let take_idx = UInt32Array::from(keep);
                                batch = RecordBatch::try_new(
                                    batch.schema(),
                                    batch.columns().iter().map(|col| {
                                        arrow::compute::take(col.as_ref(), &take_idx, None).unwrap()
                                    }).collect(),
                                ).unwrap();
                            }
                        }
                        if !delta.patches.is_empty() {
                            let patch_map: HashMap<u32, &Location> = delta.patches.iter().map(|l| (l.id, l)).collect();
                            let all: Vec<Location> = {
                                let ids_col = col_id(&batch);
                                (0..batch.num_rows()).map(|i| {
                                    let id = ids_col.value(i);
                                    if let Some(&patched) = patch_map.get(&id) { patched.clone() }
                                    else { arrow_bridge::row_to_location(&batch, i) }
                                }).collect()
                            };
                            batch = arrow_bridge::locations_to_batch(&all);
                        }
                        if !delta.adds.is_empty() {
                            let add_batch = arrow_bridge::locations_to_batch(&delta.adds);
                            batch = concat_batches(&schema(), &[batch, add_batch]).map_err(|e| e.to_string())?;
                        }
                        // Checkpoint: write merged batch to Arrow IPC so the delta can be discarded
                        let checkpoint_path = fast_io::arrow_path(&app2, &map_id2)?;
                        fast_io::write_arrow_ipc(&checkpoint_path, &batch)?;
                        let _ = std::fs::remove_file(&delta_path);
                        log::debug!("[store_open] delta checkpointed to Arrow IPC");
                    } else {
                        log::warn!("[store_open] delta deserialization failed, delta file preserved");
                    }
                }
                log::debug!("[store_open] delta_merge={}ms rows={}", t_d.elapsed().as_millis(), batch.num_rows());
            }
            batch
        };

        let t3 = Instant::now();
        let ids = col_id(&batch);
        let lats = col_lat(&batch);
        let lngs = col_lng(&batch);
        let n = batch.num_rows();
        let mut id_to_index: HashMap<u32, usize> = HashMap::with_capacity(n);
        let mut geohash_index: HashMap<String, Vec<usize>> = HashMap::new();
        let mut max_id: u32 = 0;
        for i in 0..n {
            let id = ids.value(i);
            id_to_index.insert(id, i);
            if id > max_id { max_id = id; }
            let gh = encode_geohash(lats.value(i), lngs.value(i));
            geohash_index.entry(gh).or_default().push(i);
        }
        log::debug!("[store_open] index_build={}ms", t3.elapsed().as_millis());

        let (undo, redo) = load_edit_history_inner(&app2, &map_id2)?;

        log::debug!("[store_open] TOTAL={}ms", t_total.elapsed().as_millis());
        Ok::<_, String>((batch, id_to_index, geohash_index, max_id, undo, redo))
    })
    .await
    .map_err(|e| e.to_string())??;

    let (batch, id_to_index, geohash_index, max_id, undo, redo) = result;

    let mut store = state.lock().map_err(|e| e.to_string())?;
    let count = batch.num_rows();
    store.bump();
    store.map_id = Some(map_id.clone());
    store.next_id = max_id + 1;
    // Build tag counts from batch
    let mut tc: HashMap<u32, usize> = HashMap::new();
    let mut max_tag_id: u32 = 0;
    {
        let b = &batch;
        let tags_col = col_tags(b);
        for i in 0..b.num_rows() {
            let list = tags_col.value(i);
            let ids = list.as_any().downcast_ref::<UInt32Array>().unwrap();
            for j in 0..ids.len() {
                let tid = ids.value(j);
                *tc.entry(tid).or_default() += 1;
                if tid > max_tag_id { max_tag_id = tid; }
            }
        }
    }
    store.batch = Some(batch);
    store.clear_overlay();
    store.alive_count = count;
    store.tag_counts = tc;
    store.next_tag_id = {
        let conn = fast_io::open_db(&app)?;
        conn.execute("UPDATE maps SET location_count = ?1 WHERE id = ?2",
            rusqlite::params![count, map_id]).map_err(|e| e.to_string())?;
        let tags = read_tags_json(&conn, &map_id);
        tags.keys().max().copied().unwrap_or(0) + 1
    };
    store.id_to_index = id_to_index;
    store.geohash_index = geohash_index;
    store.dirty_geohashes.clear();
    store.committed_blobs.clear();
    store.selections.clear();
    store.selected_ids.clear();
    store.selected_colors.clear();
    store.active_id = None;
    store.selection_version += 1;
    store.undo_stack = undo;
    store.redo_stack = redo;

    Ok(store.store_status())
}

#[tauri::command]
#[specta::specta]
pub fn store_close_map(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    if let Some(ref map_id) = store.map_id.clone() {
        if store.dirty {
            store.bake_overlay();
            if let Some(ref batch) = store.batch {
                let path = fast_io::arrow_path(&app, map_id)?;
                fast_io::write_arrow_ipc(&path, batch)?;
            }
            let delta_path = fast_io::arrow_delta_path(&app, map_id)?;
            let _ = std::fs::remove_file(delta_path);
        }
        let count = store.alive_count;
        let conn = fast_io::open_db(&app)?;
        conn.execute("UPDATE maps SET location_count = ?1 WHERE id = ?2", rusqlite::params![count, map_id])
            .map_err(|e| e.to_string())?;
        save_edit_history_inner(&app, map_id, &store.undo_stack, &store.redo_stack)?;
    }
    store.map_id = None;
    store.batch = None;
    store.clear_overlay();
    store.alive_count = 0;
    store.id_to_index.clear();
    store.geohash_index.clear();
    store.dirty_geohashes.clear();
    store.render_cells.clear();
    store.id_to_cell.clear();
    store.selected_ids.clear();
    store.selected_colors.clear();
    store.active_id = None;
    store.undo_stack.clear();
    store.redo_stack.clear();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_add_locations(
    state: tauri::State<'_, StoreState>,
    mut locations: Vec<Location>,
) -> Result<MutationResult, String> {
    let _t = std::time::Instant::now();
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let _lock = _t.elapsed().as_millis();
    // Assign IDs from the store's allocator
    for loc in &mut locations {
        loc.id = store.alloc_id();
    }
    store.push_undo(EditEntry { created: locations.clone(), removed: Vec::new() });
    store.redo_stack.clear();
    let mut added = Vec::with_capacity(locations.len());
    for loc in &locations {
        store.mark_dirty(loc.lat, loc.lng);
        let gh = encode_geohash(loc.lat, loc.lng);
        let cell = render_cell_key(&gh).to_string();
        store.cell_add_render(&cell, loc.id);
        added.push(RenderEntry {
            cell,
            id: loc.id,
            lng: loc.lng as f32, lat: loc.lat as f32, heading: loc.heading as f32,
            r: 42, g: 42, b: 42, a: 255,
        });
    }
    store.add_tag_counts(&locations);
    for loc in locations {
        store.overlay_add(loc);
    }
    log::debug!("[cmd] store_add_locations lock={}ms total={}ms", _lock, _t.elapsed().as_millis());
    Ok(store.finish_mutation(RenderDelta { added, ..Default::default() }))
}

#[tauri::command]
#[specta::specta]
pub fn store_remove_locations(
    state: tauri::State<'_, StoreState>,
    ids: Vec<u32>,
) -> Result<MutationResult, String> {
    let _t = std::time::Instant::now();
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let mut removed_locs = Vec::new();
    let mut removals = Vec::new();
    for &id in &ids {
        if let Some(loc) = store.get_loc_by_id(id) {
            removed_locs.push(loc);
        }
    }
    store.remove_tag_counts(&removed_locs);
    store.overlay_remove(&removed_locs);

    for &id in &ids {
        if let Some(removal) = store.cell_remove_render(id) {
            removals.push(removal);
        }
    }
    store.push_undo(EditEntry { created: Vec::new(), removed: removed_locs });
    store.redo_stack.clear();

    log::debug!("[cmd] store_remove_locations total={}ms ids={}", _t.elapsed().as_millis(), ids.len());
    Ok(store.finish_mutation(RenderDelta { removed: removals, ..Default::default() }))
}

fn build_update_delta(store: &mut Store, id: u32, new_loc: &Location, patch: &LocationPatch) -> RenderDelta {
    let mut delta = RenderDelta::default();
    let pos_changed = patch.lat.is_some() || patch.lng.is_some();
    let heading_changed = patch.heading.is_some();

    if pos_changed {
        let gh = encode_geohash(new_loc.lat, new_loc.lng);
        let new_cell = render_cell_key(&gh).to_string();
        let old_cell = store.id_to_cell.get(&id).cloned();
        if old_cell.as_deref() != Some(new_cell.as_str()) {
            if let Some(removal) = store.cell_remove_render(id) {
                delta.removed.push(removal);
            }
            store.cell_add_render(&new_cell, id);
            delta.added.push(RenderEntry {
                cell: new_cell,
                id,
                lng: new_loc.lng as f32, lat: new_loc.lat as f32, heading: new_loc.heading as f32,
                r: 42, g: 42, b: 42, a: 255,
            });
            return delta;
        }
    }

    if let Some((cell, ci)) = store.cell_lookup(id) {
        if pos_changed || heading_changed {
            delta.updated.push(RenderPatchEntry {
                cell,
                cell_index: ci,
                lng: if pos_changed { Some(new_loc.lng as f32) } else { None },
                lat: if pos_changed { Some(new_loc.lat as f32) } else { None },
                heading: if heading_changed { Some(new_loc.heading as f32) } else { None },
            });
        }
    }
    delta
}

#[tauri::command]
#[specta::specta]
pub fn store_update_locations(
    state: tauri::State<'_, StoreState>,
    updates: Vec<(u32, LocationPatch)>,
    record_undo: Option<bool>,
) -> Result<MutationResult, String> {
    let record_undo = record_undo.unwrap_or(true);
    let _t = std::time::Instant::now();
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let mut old_locs = Vec::new();
    let mut new_locs = Vec::new();
    let mut delta = RenderDelta::default();
    let any_tags = updates.iter().any(|(_, p)| p.tags.is_some());
    for (id, patch) in &updates {
        if let Some(old) = store.get_loc_by_id(*id) {
            old_locs.push(old);
            store.overlay_update(*id, patch);
            let new_loc = store.get_loc_by_id(*id).unwrap();
            new_locs.push(new_loc.clone());
            let d = build_update_delta(&mut store, *id, &new_loc, patch);
            delta.added.extend(d.added);
            delta.removed.extend(d.removed);
            delta.updated.extend(d.updated);
        }
    }
    if any_tags {
        store.remove_tag_counts(&old_locs);
        store.add_tag_counts(&new_locs);
    }
    if record_undo {
        let (changed_old, changed_new): (Vec<_>, Vec<_>) = old_locs.into_iter()
            .zip(new_locs)
            .filter(|(o, n)| o != n)
            .unzip();
        if !changed_old.is_empty() {
            store.push_undo(EditEntry { created: changed_new, removed: changed_old });
            store.redo_stack.clear();
        }
    }
    log::debug!("[cmd] store_update_locations n={} undo={} total={}ms", updates.len(), record_undo, _t.elapsed().as_millis());
    Ok(store.finish_mutation(delta))
}

#[tauri::command]
#[specta::specta]
pub fn store_strip_tags(
    state: tauri::State<'_, StoreState>,
    tag_ids: Vec<u32>,
) -> Result<MutationResult, String> {
    let _t = std::time::Instant::now();
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let tag_set: HashSet<u32> = tag_ids.into_iter().collect();
    let view = store.loc_view();
    let mut affected_ids = Vec::new();
    for &tag_id in &tag_set {
        let ids = selections::resolve(&view, &SelectionProps::Tag { tag_id });
        affected_ids.extend(ids);
    }
    drop(view);
    let affected_ids: HashSet<u32> = affected_ids.into_iter().collect();
    if affected_ids.is_empty() {
        return Ok(store.finish_mutation(RenderDelta::default()));
    }
    let mut old_locs = Vec::new();
    let mut new_locs = Vec::new();
    for &id in &affected_ids {
        if let Some(old) = store.get_loc_by_id(id) {
            let mut new_loc = old.clone();
            new_loc.tags.retain(|t| !tag_set.contains(t));
            old_locs.push(old);
            new_locs.push(new_loc);
        }
    }
    store.remove_tag_counts(&old_locs);
    for new_loc in &new_locs {
        let patch = LocationPatch { tags: Some(new_loc.tags.clone()), ..Default::default() };
        store.overlay_update(new_loc.id, &patch);
    }
    store.add_tag_counts(&new_locs);
    let (changed_old, changed_new): (Vec<_>, Vec<_>) = old_locs.into_iter()
        .zip(new_locs)
        .filter(|(o, n)| o != n)
        .unzip();
    if !changed_old.is_empty() {
        store.push_undo(EditEntry { created: changed_new, removed: changed_old });
        store.redo_stack.clear();
    }
    log::debug!("[cmd] store_strip_tags n={} total={}ms", affected_ids.len(), _t.elapsed().as_millis());
    Ok(store.finish_mutation(RenderDelta::default()))
}

#[tauri::command]
#[specta::specta]
pub fn store_set_active(
    state: tauri::State<'_, StoreState>,
    id: Option<u32>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    store.active_id = id;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_get_location(
    state: tauri::State<'_, StoreState>,
    id: u32,
) -> Result<Option<Location>, String> {
    let _t = std::time::Instant::now();
    let store = state.lock().map_err(|e| e.to_string())?;
    let r = Ok(store.get_loc_by_id(id));
    log::debug!("[cmd] store_get_location lock={}ms total={}ms", _t.elapsed().as_millis(), _t.elapsed().as_millis());
    r
}

#[tauri::command]
#[specta::specta]
pub fn store_get_locations_by_ids(
    state: tauri::State<'_, StoreState>,
    ids: Vec<u32>,
) -> Result<Vec<Location>, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    let mut result = Vec::with_capacity(ids.len());
    for &id in &ids {
        if let Some(loc) = store.get_loc_by_id(id) {
            result.push(loc);
        }
    }
    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn store_get_all_locations(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
) -> Result<String, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    let locs = store.collect_all_locations();
    let json = serde_json::to_vec(&locs).map_err(|e| e.to_string())?;
    let path = app.path().temp_dir().map_err(|e| e.to_string())?
        .join("mma_all_locations.json");
    std::fs::write(&path, &json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct DeltaOverlay {
    adds: Vec<Location>,
    dead_ids: Vec<u32>,
    patches: Vec<Location>,
}

#[tauri::command]
#[specta::specta]
pub async fn store_save_dirty(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
) -> Result<SaveResult, String> {
    let _t = std::time::Instant::now();
    log::debug!("[cmd] store_save_dirty ENTER");
    let (map_id, delta_data, alive, undo_bytes, redo_bytes) = {
        let store = state.lock().map_err(|e| e.to_string())?;
        let map_id = store.map_id.clone().ok_or("no map open")?;
        if !store.dirty {
            return Ok(SaveResult { saved_chunks: 0 });
        }
        let overlay = DeltaOverlay {
            adds: store.overlay_adds.clone(),
            dead_ids: store.overlay_dead.iter().cloned().collect(),
            patches: store.overlay_patches.values().cloned().collect(),
        };
        let data = rmp_serde::to_vec_named(&overlay).map_err(|e| e.to_string())?;
        let ub = rmp_serde::to_vec_named(&store.undo_stack).unwrap_or_default();
        let rb = rmp_serde::to_vec_named(&store.redo_stack).unwrap_or_default();
        (map_id, data, store.alive_count, ub, rb)
    };

    let size = delta_data.len();
    let app2 = app.clone();
    let map_id2 = map_id.clone();
    tokio::task::spawn_blocking(move || {
        let path = fast_io::arrow_delta_path(&app2, &map_id2)?;
        fast_io::atomic_write(&path, |mut file| {
            use std::io::Write;
            file.write_all(&delta_data).map_err(|e| e.to_string())
        })?;
        let conn = fast_io::open_db(&app2)?;
        conn.execute("UPDATE maps SET location_count = ?1 WHERE id = ?2",
            rusqlite::params![alive, &map_id2]).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO edit_history (map_id, undo_stack, redo_stack) VALUES (?1, ?2, ?3)",
            rusqlite::params![map_id2, undo_bytes, redo_bytes],
        ).map_err(|e| e.to_string())?;
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| e.to_string())??;

    log::debug!("[cmd] store_save_dirty total={}ms size={}", _t.elapsed().as_millis(), size);
    Ok(SaveResult { saved_chunks: size })
}

#[tauri::command]
#[specta::specta]
pub fn store_get_summary(
    state: tauri::State<'_, StoreState>,
) -> Result<SummaryResult, String> {
    let _t = std::time::Instant::now();
    let store = state.lock().map_err(|e| e.to_string())?;
    let count = store.alive_count;
    log::debug!("[cmd] store_get_summary total={}ms alive_count={}", _t.elapsed().as_millis(), count);
    Ok(SummaryResult {
        location_count: count,
        version: store.version,
        dirty_count: if store.dirty { 1 } else { 0 },
    })
}

fn save_edit_history_inner(app: &tauri::AppHandle, map_id: &str, undo: &[EditEntry], redo: &[EditEntry]) -> Result<(), String> {
    let conn = fast_io::open_db(app)?;
    let undo_capped = if undo.len() > MAX_UNDO_ENTRIES { &undo[undo.len() - MAX_UNDO_ENTRIES..] } else { undo };
    let redo_capped = if redo.len() > MAX_UNDO_ENTRIES { &redo[redo.len() - MAX_UNDO_ENTRIES..] } else { redo };
    let undo_bytes = rmp_serde::to_vec_named(undo_capped).map_err(|e| e.to_string())?;
    let redo_bytes = rmp_serde::to_vec_named(redo_capped).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO edit_history (map_id, undo_stack, redo_stack) VALUES (?1, ?2, ?3)",
        rusqlite::params![map_id, undo_bytes, redo_bytes],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_edit_history_inner(app: &tauri::AppHandle, map_id: &str) -> Result<(Vec<EditEntry>, Vec<EditEntry>), String> {
    let conn = fast_io::open_db(app)?;
    let result = conn.query_row(
        "SELECT undo_stack, redo_stack FROM edit_history WHERE map_id = ?1",
        [map_id],
        |row| Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, Vec<u8>>(1)?)),
    );
    match result {
        Ok((undo_bytes, redo_bytes)) => {
            let undo: Vec<EditEntry> = rmp_serde::from_slice(&undo_bytes).unwrap_or_default();
            let redo: Vec<EditEntry> = rmp_serde::from_slice(&redo_bytes).unwrap_or_default();
            Ok((undo, redo))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok((Vec::new(), Vec::new())),
        Err(e) => Err(e.to_string()),
    }
}

fn save_arrow_inner(store: &Store, app: &tauri::AppHandle, map_id: &str) -> Result<(), String> {
    if let Some(ref batch) = store.batch {
        let path = fast_io::arrow_path(app, map_id)?;
        fast_io::write_arrow_ipc(&path, batch)?;
        let delta = fast_io::arrow_delta_path(app, map_id)?;
        let _ = std::fs::remove_file(delta);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// VCS: snapshot / restore Arrow files
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn store_bake_and_save(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let map_id = store.map_id.clone().ok_or("no map open")?;
    store.bake_overlay();
    save_arrow_inner(&store, &app, &map_id)?;
    let count = store.batch.as_ref().map_or(0, |b| b.num_rows());
    let conn = fast_io::open_db(&app)?;
    conn.execute("UPDATE maps SET location_count = ?1 WHERE id = ?2", rusqlite::params![count, map_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CommitBlobEntry {
    pub geohash: String,
    pub blob_hash: String,
    pub location_count: u32,
}

pub(crate) fn snapshot_inner(
    app: &tauri::AppHandle,
    state: &StoreState,
) -> Result<Vec<CommitBlobEntry>, String> {
    let _t = std::time::Instant::now();
    let mut store = state.lock().map_err(|e| e.to_string())?;
    store.map_id.as_ref().ok_or("no map open")?;
    let batch = store.batch.as_ref().ok_or("no data loaded")?;
    if batch.num_rows() == 0 {
        store.committed_blobs.clear();
        store.dirty_geohashes.clear();
        return Ok(Vec::new());
    }

    let first_commit = store.committed_blobs.is_empty();
    let dirty = &store.dirty_geohashes;
    let stale_count: u32 = store.committed_blobs.values().map(|(_, c)| c).sum();
    log::debug!("[snapshot] first_commit={} batch_rows={} committed_blobs_count={} stale_loc_count={}",
        first_commit, batch.num_rows(), store.committed_blobs.len(), stale_count);

    if first_commit {
        let lats = col_lat(batch);
        let lngs = col_lng(batch);
        let schema = batch.schema();

        let mut gh_indices: HashMap<String, Vec<u32>> = HashMap::new();
        for i in 0..batch.num_rows() {
            let gh = encode_geohash(lats.value(i), lngs.value(i));
            gh_indices.entry(gh).or_default().push(i as u32);
        }

        let mut entries = Vec::with_capacity(gh_indices.len());
        for (gh, indices) in &gh_indices {
            let take_idx = arrow::array::UInt32Array::from(indices.clone());
            let columns: Vec<ArrayRef> = batch.columns().iter().map(|col| {
                arrow::compute::take(col.as_ref(), &take_idx, None).unwrap()
            }).collect();
            let cell_batch = RecordBatch::try_new(schema.clone(), columns).unwrap();
            let (hash, count) = fast_io::write_blob(app, &cell_batch)
                .expect("blob write failed");
            entries.push(CommitBlobEntry {
                geohash: gh.clone(),
                blob_hash: hash,
                location_count: count as u32,
            });
        }

        store.committed_blobs = entries.iter()
            .map(|e| (e.geohash.clone(), (e.blob_hash.clone(), e.location_count)))
            .collect();
        store.dirty_geohashes.clear();
        log::debug!("[cmd] snapshot_inner (full) total={}ms cells={}", _t.elapsed().as_millis(), entries.len());
        Ok(entries)
    } else {
        let dirty_cells: Vec<String> = dirty.iter().cloned().collect();
        let schema = batch.schema();

        let mut dirty_entries = Vec::new();
        for gh in &dirty_cells {
            let indices: Vec<u32> = match store.geohash_index.get(gh) {
                Some(v) => v.iter().map(|&i| i as u32).collect(),
                None => continue,
            };
            if indices.is_empty() { continue; }
            let take_idx = arrow::array::UInt32Array::from(indices);
            let columns: Vec<ArrayRef> = batch.columns().iter().map(|col| {
                arrow::compute::take(col.as_ref(), &take_idx, None).unwrap()
            }).collect();
            let cell_batch = RecordBatch::try_new(schema.clone(), columns).unwrap();
            let (hash, count) = fast_io::write_blob(app, &cell_batch)
                .expect("blob write failed");
            dirty_entries.push(CommitBlobEntry {
                geohash: gh.clone(),
                blob_hash: hash,
                location_count: count as u32,
            });
        }

        for entry in &dirty_entries {
            store.committed_blobs.insert(
                entry.geohash.clone(),
                (entry.blob_hash.clone(), entry.location_count),
            );
        }
        for gh in &dirty_cells {
            if !store.geohash_index.contains_key(gh) {
                store.committed_blobs.remove(gh);
            }
        }
        store.dirty_geohashes.clear();

        let entries: Vec<CommitBlobEntry> = store.committed_blobs.iter()
            .map(|(gh, (hash, count))| CommitBlobEntry {
                geohash: gh.clone(),
                blob_hash: hash.clone(),
                location_count: *count,
            })
            .collect();

        log::debug!("[cmd] snapshot_inner (incremental) total={}ms dirty={} total_cells={}",
            _t.elapsed().as_millis(), dirty_cells.len(), entries.len());
        Ok(entries)
    }
}

#[tauri::command]
#[specta::specta]
pub fn store_snapshot_commit(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
) -> Result<Vec<CommitBlobEntry>, String> {
    snapshot_inner(&app, &state)
}

pub(crate) fn restore_inner(
    app: &tauri::AppHandle,
    map_id: &str,
    blobs: Vec<CommitBlobEntry>,
) -> Result<(), String> {
    let _t = std::time::Instant::now();
    let s = schema();
    let batches: Result<Vec<RecordBatch>, String> = blobs
        .par_iter()
        .map(|entry| fast_io::read_blob(app, &entry.blob_hash))
        .collect();
    let batches = batches?;
    let batch = if batches.is_empty() {
        RecordBatch::new_empty(s)
    } else {
        concat_batches(&s, &batches).map_err(|e| e.to_string())?
    };
    let path = fast_io::arrow_path(app, map_id)?;
    fast_io::write_arrow_ipc(&path, &batch)?;
    let delta = fast_io::arrow_delta_path(app, map_id)?;
    let _ = std::fs::remove_file(delta);
    log::debug!("[cmd] restore_inner total={}ms rows={}", _t.elapsed().as_millis(), batch.num_rows());
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_restore_commit(
    app: tauri::AppHandle,
    map_id: String,
    blobs: Vec<CommitBlobEntry>,
) -> Result<(), String> {
    restore_inner(&app, &map_id, blobs)
}

// ---------------------------------------------------------------------------
// Render buffer
// ---------------------------------------------------------------------------

#[derive(Default, serde::Deserialize, specta::Type)]
#[serde(default, rename_all = "camelCase")]
pub struct RenderRequest {
    #[specta(type = specta_typescript::Number)]
    pub west: f64,
    #[specta(type = specta_typescript::Number)]
    pub south: f64,
    #[specta(type = specta_typescript::Number)]
    pub east: f64,
    #[specta(type = specta_typescript::Number)]
    pub north: f64,
    pub selected_ids: Option<Vec<u32>>,
    pub marker_style: String,
}

fn build_cell_render_buffers(store: &mut Store, req: &RenderRequest) -> Vec<u8> {
    let _t = std::time::Instant::now();
    let b = match &store.batch {
        Some(b) => b,
        None if store.overlay_adds.is_empty() => return Vec::new(),
        None => {
            let empty = arrow_bridge::locations_to_batch(&[]);
            store.batch = Some(empty);
            store.batch.as_ref().unwrap()
        }
    };
    let batch_n = b.num_rows();
    let lats = col_lat(b);
    let lngs = col_lng(b);
    let ids_col = col_id(b);
    let headings = col_heading(b);
    let has_dead = !store.overlay_dead.is_empty();
    let has_patches = !store.overlay_patches.is_empty();

    let selected_set: &HashSet<u32> = &store.selected_ids;
    let active_id = store.active_id;
    let arrow_style = req.marker_style == "arrow";

    // 32 cells indexed by render_cell_idx (0-31)
    struct CellOut { ids: Vec<u32>, positions: Vec<f32>, colors: Vec<u8>, angles: Vec<f32> }
    const NONE: Option<CellOut> = None;
    let mut cells: [Option<CellOut>; 32] = [NONE; 32];

    // Selection overlay: selected entries rendered as a separate colored layer
    let sel_colors = &store.selected_colors;
    struct SelOverlay { ids: Vec<u32>, positions: Vec<f32>, colors: Vec<u8>, angles: Vec<f32> }
    let mut sel_ov = SelOverlay { ids: Vec::new(), positions: Vec::new(), colors: Vec::new(), angles: Vec::new() };

    // Single linear pass over batch rows (cache-friendly)
    for i in 0..batch_n {
        let id = ids_col.value(i);
        if has_dead && store.overlay_dead.contains(&id) { continue; }
        let (lat, lng, heading) = if has_patches {
            if let Some(p) = store.overlay_patches.get(&id) {
                (p.lat, p.lng, p.heading)
            } else {
                (lats.value(i), lngs.value(i), headings.value(i))
            }
        } else {
            (lats.value(i), lngs.value(i), headings.value(i))
        };
        let ci = render_cell_idx(lat, lng) as usize;
        let out = cells[ci].get_or_insert_with(|| CellOut {
            ids: Vec::new(), positions: Vec::new(), colors: Vec::new(), angles: Vec::new(),
        });
        out.positions.push(lng as f32);
        out.positions.push(lat as f32);
        let angle = if arrow_style { 180.0 - heading as f32 } else { 0.0 };
        let is_hidden = selected_set.contains(&id) || active_id == Some(id);
        if is_hidden { out.colors.extend_from_slice(&[0, 0, 0, 0]); }
        else { out.colors.extend_from_slice(&[42, 42, 42, 255]); }
        out.angles.push(angle);
        out.ids.push(id);
        if let Some(&[r, g, b]) = sel_colors.get(&id) {
            sel_ov.positions.push(lng as f32);
            sel_ov.positions.push(lat as f32);
            sel_ov.colors.extend_from_slice(&[r, g, b, 255]);
            sel_ov.angles.push(angle);
            sel_ov.ids.push(id);
        }
    }
    // Overlay adds
    for loc in &store.overlay_adds {
        let ci = render_cell_idx(loc.lat, loc.lng) as usize;
        let out = cells[ci].get_or_insert_with(|| CellOut {
            ids: Vec::new(), positions: Vec::new(), colors: Vec::new(), angles: Vec::new(),
        });
        let id = loc.id;
        let is_hidden = selected_set.contains(&id) || active_id == Some(id);
        out.positions.push(loc.lng as f32);
        out.positions.push(loc.lat as f32);
        let angle = if arrow_style { 180.0 - loc.heading as f32 } else { 0.0 };
        if is_hidden { out.colors.extend_from_slice(&[0, 0, 0, 0]); }
        else { out.colors.extend_from_slice(&[42, 42, 42, 255]); }
        out.angles.push(angle);
        out.ids.push(id);
        if let Some(&[r, g, b]) = sel_colors.get(&id) {
            sel_ov.positions.push(loc.lng as f32);
            sel_ov.positions.push(loc.lat as f32);
            sel_ov.colors.extend_from_slice(&[r, g, b, 255]);
            sel_ov.angles.push(angle);
            sel_ov.ids.push(id);
        }
    }

    // Rebuild per-cell render tracking
    store.render_cells.clear();
    store.id_to_cell.clear();
    let mut total_count = 0usize;
    let mut non_empty = 0u32;
    for ci in 0..32 {
        let out = match &cells[ci] { Some(o) => o, None => continue };
        let key = cell_key_from_idx(ci as u8);
        let mut cr = CellRender { id_order: Vec::with_capacity(out.ids.len()), id_to_index: HashMap::new() };
        for (i, &id) in out.ids.iter().enumerate() {
            cr.id_to_index.insert(id, i);
            cr.id_order.push(id);
            store.id_to_cell.insert(id, key.clone());
        }
        total_count += out.ids.len();
        non_empty += 1;
        store.render_cells.insert(key, cr);
    }

    // Serialize: u32 cell_count, per cell: [1 byte geohash char][u32 count][positions][colors][angles]
    let mut buf = Vec::new();
    buf.extend_from_slice(&non_empty.to_le_bytes());
    for ci in 0..32 {
        let out = match &cells[ci] { Some(o) => o, None => continue };
        let count = out.ids.len() as u32;
        buf.push(BASE32[ci]);
        buf.extend_from_slice(&count.to_le_bytes());
        for &id in &out.ids { buf.extend_from_slice(&id.to_le_bytes()); }
        for &v in &out.positions { buf.extend_from_slice(&v.to_le_bytes()); }
        buf.extend_from_slice(&out.colors);
        for &v in &out.angles { buf.extend_from_slice(&v.to_le_bytes()); }
    }

    // Selection overlay: [u32 count][f32[] positions][u8[] colors][f32[] angles][u32[] ids]
    let sel_count = sel_ov.ids.len() as u32;
    buf.extend_from_slice(&sel_count.to_le_bytes());
    if sel_count > 0 {
        for &v in &sel_ov.positions { buf.extend_from_slice(&v.to_le_bytes()); }
        buf.extend_from_slice(&sel_ov.colors);
        for &v in &sel_ov.angles { buf.extend_from_slice(&v.to_le_bytes()); }
        for &id in &sel_ov.ids { buf.extend_from_slice(&id.to_le_bytes()); }
    }

    log::debug!("[cmd] build_cell_render_buffers total={}ms cells={} points={} sel_overlay={} bytes={}",
        _t.elapsed().as_millis(), non_empty, total_count, sel_count, buf.len());
    buf
}

#[tauri::command]
#[specta::specta]
pub async fn store_fill_render_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
    req: RenderRequest,
) -> Result<String, String> {
    log::debug!("[cmd] store_fill_render_file ENTER");
    let buf = {
        let mut store = state.lock().map_err(|e| e.to_string())?;
        build_cell_render_buffers(&mut store, &req)
    };
    let path = app.path().temp_dir().map_err(|e| e.to_string())?
        .join("mma_render_buffer.bin");
    tokio::task::spawn_blocking(move || {
        std::fs::write(&path, &buf).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub fn store_resolve_pick(
    state: tauri::State<'_, StoreState>,
    cell: String,
    cell_index: u32,
) -> Result<Option<u32>, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    Ok(store.render_cells.get(&cell)
        .and_then(|cr| cr.id_order.get(cell_index as usize).copied()))
}

// ---------------------------------------------------------------------------
// Undo / Redo
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn store_undo(state: tauri::State<'_, StoreState>) -> Result<MutationResult, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let _t = std::time::Instant::now();
    let entry = store.undo_stack.pop().ok_or("nothing to undo")?;
    log::debug!("[UNDO] stack_depth={} created={} removed={}",
        store.undo_stack.len(), entry.created.len(), entry.removed.len());
    let delta = apply_edit_reverse(&mut store, &entry);
    log::debug!("[UNDO] apply_edit={}ms delta: +{} -{}", _t.elapsed().as_millis(), delta.added.len(), delta.removed.len());
    store.redo_stack.push(entry);
    Ok(store.finish_mutation(delta))
}

#[tauri::command]
#[specta::specta]
pub fn store_redo(state: tauri::State<'_, StoreState>) -> Result<MutationResult, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let _t = std::time::Instant::now();
    let entry = store.redo_stack.pop().ok_or("nothing to redo")?;
    log::debug!("[REDO] stack_depth={} created={} removed={}",
        store.redo_stack.len(), entry.created.len(), entry.removed.len());
    let delta = apply_edit_forward(&mut store, &entry);
    log::debug!("[REDO] apply_edit={}ms delta: +{} -{}", _t.elapsed().as_millis(), delta.added.len(), delta.removed.len());
    store.push_undo(entry);
    Ok(store.finish_mutation(delta))
}

#[tauri::command]
#[specta::specta]
pub fn store_commit_diff(state: tauri::State<'_, StoreState>) -> Result<(u32, u32, u32), String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    let mut added = HashSet::new();
    let mut removed = HashSet::new();
    let mut modified = HashSet::new();
    for entry in &store.undo_stack {
        for loc in &entry.removed {
            if added.remove(&loc.id) { modified.remove(&loc.id); }
            else { removed.insert(&loc.id); }
        }
        for loc in &entry.created {
            if removed.remove(&loc.id) { modified.insert(&loc.id); }
            else if !added.contains(&loc.id) && !modified.contains(&loc.id) { added.insert(&loc.id); }
        }
    }
    Ok((added.len() as u32, removed.len() as u32, modified.len() as u32))
}

#[tauri::command]
#[specta::specta]
pub fn store_reset_undo(state: tauri::State<'_, StoreState>) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    store.undo_stack.clear();
    store.redo_stack.clear();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_can_undo_redo(state: tauri::State<'_, StoreState>) -> Result<(bool, bool), String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    Ok((!store.undo_stack.is_empty(), !store.redo_stack.is_empty()))
}

fn apply_edit(store: &mut Store, remove: &[Location], create: &[Location]) -> RenderDelta {
    let t0 = std::time::Instant::now();
    let mut delta = RenderDelta::default();
    let remove_ids: HashSet<u32> = remove.iter().map(|l| l.id).collect();
    let create_ids: HashSet<u32> = create.iter().map(|l| l.id).collect();
    let t1 = t0.elapsed();

    store.remove_tag_counts(remove);
    let t2 = t0.elapsed();

    store.overlay_remove(remove);
    let t3 = t0.elapsed();

    for id in &remove_ids {
        if !create_ids.contains(id) {
            if let Some(removal) = store.cell_remove_render(*id) {
                delta.removed.push(removal);
            }
        }
    }
    let t4 = t0.elapsed();

    let remove_by_id: HashMap<u32, &Location> = remove.iter().map(|l| (l.id, l)).collect();

    store.add_tag_counts(create);
    for loc in create {
        store.overlay_add(loc.clone());

        if remove_ids.contains(&loc.id) {
            let render_changed = remove_by_id.get(&loc.id).map_or(true, |o|
                o.lat != loc.lat || o.lng != loc.lng || o.heading != loc.heading
            );
            if render_changed {
                if let Some(removal) = store.cell_remove_render(loc.id) {
                    delta.removed.push(removal);
                }
                let gh = encode_geohash(loc.lat, loc.lng);
                let cell = render_cell_key(&gh).to_string();
                let is_selected = store.selected_ids.contains(&loc.id);
                let (r, g, b, a) = if is_selected { (0, 0, 0, 0) } else { (42, 42, 42, 255) };
                store.cell_add_render(&cell, loc.id);
                delta.added.push(RenderEntry {
                    cell, id: loc.id,
                    lng: loc.lng as f32, lat: loc.lat as f32, heading: loc.heading as f32,
                    r, g, b, a,
                });
            }
        } else {
            let gh = encode_geohash(loc.lat, loc.lng);
            let cell = render_cell_key(&gh).to_string();
            let is_selected = store.selected_ids.contains(&loc.id);
            let (r, g, b, a) = if is_selected { (0, 0, 0, 0) } else { (42, 42, 42, 255) };
            store.cell_add_render(&cell, loc.id);
            delta.added.push(RenderEntry {
                cell, id: loc.id,
                lng: loc.lng as f32, lat: loc.lat as f32, heading: loc.heading as f32,
                r, g, b, a,
            });
        }
    }
    let t5 = t0.elapsed();

    log::debug!("[apply_edit] hashsets={}ms tags_rm={}ms overlay_rm={}ms cell_rm={}ms create={}ms total={}ms",
        t1.as_millis(), (t2-t1).as_millis(), (t3-t2).as_millis(), (t4-t3).as_millis(), (t5-t4).as_millis(), t5.as_millis());
    delta
}

fn apply_edit_forward(store: &mut Store, entry: &EditEntry) -> RenderDelta {
    apply_edit(store, &entry.removed, &entry.created)
}

fn apply_edit_reverse(store: &mut Store, entry: &EditEntry) -> RenderDelta {
    apply_edit(store, &entry.created, &entry.removed)
}

// ---------------------------------------------------------------------------
// Query commands
// ---------------------------------------------------------------------------

#[tauri::command]
#[specta::specta]
pub fn store_tag_counts(state: tauri::State<'_, StoreState>) -> Result<HashMap<u32, u32>, String> {
    let _t = std::time::Instant::now();
    let store = state.lock().map_err(|e| e.to_string())?;
    let r: HashMap<u32, u32> = store.tag_counts.iter().map(|(&k, &v)| (k, v as u32)).collect();
    log::debug!("[cmd] store_tag_counts total={}ms", _t.elapsed().as_millis());
    Ok(r)
}

#[tauri::command]
#[specta::specta]
pub fn store_alloc_tag_id(state: tauri::State<'_, StoreState>) -> Result<u32, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let id = store.next_tag_id;
    store.next_tag_id += 1;
    Ok(id)
}


fn read_tags_json(conn: &rusqlite::Connection, map_id: &str) -> HashMap<u32, Tag> {
    let json: String = conn.query_row(
        "SELECT tags FROM maps WHERE id = ?1", [map_id], |row| row.get(0),
    ).unwrap_or_else(|_| "{}".into());
    let raw: HashMap<String, Tag> = serde_json::from_str(&json).unwrap_or_default();
    raw.into_iter().filter_map(|(k, v)| k.parse::<u32>().ok().map(|id| (id, v))).collect()
}

fn write_tags_json(conn: &rusqlite::Connection, map_id: &str, tags: &HashMap<u32, Tag>) -> Result<(), String> {
    let as_str_keys: HashMap<String, &Tag> = tags.iter().map(|(k, v)| (k.to_string(), v)).collect();
    let json = serde_json::to_string(&as_str_keys).map_err(|e| e.to_string())?;
    conn.execute("UPDATE maps SET tags = ?1 WHERE id = ?2", rusqlite::params![json, map_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_resolve_tag_names(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
    names: Vec<String>,
) -> Result<Vec<Tag>, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let map_id = store.map_id.as_ref().ok_or("no map open")?.clone();

    let conn = fast_io::open_db(&app)?;
    let mut tags = read_tags_json(&conn, &map_id);

    let mut name_to_id: HashMap<String, u32> = HashMap::new();
    for (id, entry) in &tags {
        name_to_id.insert(entry.name.to_lowercase(), *id);
    }

    let mut result = Vec::with_capacity(names.len());
    let mut changed = false;

    for name in &names {
        if let Some(&id) = name_to_id.get(&name.to_lowercase()) {
            result.push(tags[&id].clone());
        } else {
            let id = store.alloc_tag_id();
            let color = crate::util::color_for_name(name);
            let order = Some(tags.len() as u32);
            let tag = Tag { id, name: name.clone(), color, visible: true, order };
            tags.insert(id, tag.clone());
            name_to_id.insert(name.to_lowercase(), id);
            result.push(tag);
            changed = true;
        }
    }

    if changed {
        write_tags_json(&conn, &map_id, &tags)?;
    }

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn store_bounds(state: tauri::State<'_, StoreState>) -> Result<Option<[f64; 4]>, String> {
    let _t = std::time::Instant::now();
    let store = state.lock().map_err(|e| e.to_string())?;
    if store.batch.is_none() && store.overlay_adds.is_empty() { return Ok(None); }

    let (mut w, mut s, mut e, mut n) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    let mut count = 0usize;

    if let Some(ref b) = store.batch {
        let lats = col_lat(b);
        let lngs = col_lng(b);
        let ids = col_id(b);
        for i in 0..b.num_rows() {
            let id = ids.value(i);
            if store.overlay_dead.contains(&id) { continue; }
            let (lat, lng) = if let Some(p) = store.overlay_patches.get(&id) {
                (p.lat, p.lng)
            } else {
                (lats.value(i), lngs.value(i))
            };
            if lng < w { w = lng; }
            if lat < s { s = lat; }
            if lng > e { e = lng; }
            if lat > n { n = lat; }
            count += 1;
        }
    }
    for loc in &store.overlay_adds {
        if loc.lng < w { w = loc.lng; }
        if loc.lat < s { s = loc.lat; }
        if loc.lng > e { e = loc.lng; }
        if loc.lat > n { n = loc.lat; }
        count += 1;
    }

    log::debug!("[cmd] store_bounds total={}ms count={}", _t.elapsed().as_millis(), count);
    if count == 0 { Ok(None) } else { Ok(Some([w, s, e, n])) }
}

#[tauri::command]
#[specta::specta]
pub fn store_location_count(state: tauri::State<'_, StoreState>) -> Result<u32, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    Ok(store.alive_count as u32)
}


#[tauri::command]
#[specta::specta]
pub fn store_extra_field_values(state: tauri::State<'_, StoreState>, field: String) -> Result<Vec<String>, String> {
    let _t = std::time::Instant::now();
    let store = state.lock().map_err(|e| e.to_string())?;
    let mut seen = std::collections::BTreeSet::new();

    let mut scan_extra_json = |json_str: &str| {
        if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(json_str) {
            if let Some(v) = map.get(&field) {
                let s = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                seen.insert(s);
            }
        }
    };

    if let Some(ref b) = store.batch {
        let ids = col_id(b);
        let extras = col_extra(b);
        for i in 0..b.num_rows() {
            let id = ids.value(i);
            if store.overlay_dead.contains(&id) { continue; }
            if store.overlay_patches.contains_key(&id) { continue; }
            if !extras.is_null(i) {
                scan_extra_json(extras.value(i));
            }
        }
    }
    for loc in store.overlay_patches.values() {
        if let Some(ref extra) = loc.extra {
            if let Some(v) = extra.get(&field) {
                let s = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                seen.insert(s);
            }
        }
    }
    for loc in &store.overlay_adds {
        if let Some(ref extra) = loc.extra {
            if let Some(v) = extra.get(&field) {
                let s = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                seen.insert(s);
            }
        }
    }

    log::debug!("[cmd] store_extra_field_values field={} total={}ms", field, _t.elapsed().as_millis());
    Ok(seen.into_iter().collect())
}

#[tauri::command]
#[specta::specta]
pub fn store_has_location(state: tauri::State<'_, StoreState>, id: u32) -> Result<bool, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    Ok(store.get_loc_by_id(id).is_some())
}

// ---------------------------------------------------------------------------
// Selections
// ---------------------------------------------------------------------------

#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SelectionInput {
    pub props: SelectionProps,
    pub color: [u8; 3],
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncSelectionsResult {
    pub counts: Vec<usize>,
    pub patch_file: Option<String>,
    pub selected_count: usize,
}

#[tauri::command]
#[specta::specta]
pub async fn store_sync_selections(
    app: tauri::AppHandle,
    state: tauri::State<'_, StoreState>,
    sels: Vec<SelectionInput>,
) -> Result<SyncSelectionsResult, String> {
    let _t = std::time::Instant::now();
    let (counts, buf, selected_count, num_cells) = {
        let mut store = state.lock().map_err(|e| e.to_string())?;

        let view = store.loc_view();
        let masks: Vec<Vec<bool>> = sels.iter()
            .map(|sel| selections::resolve_bitmask(&view, &sel.props))
            .collect();
        let counts: Vec<usize> = masks.iter()
            .map(|m| m.iter().filter(|&&b| b).count())
            .collect();

        let id_to_sel = view.collect_id_to_selection(&masks);
        let all_selected: HashSet<u32> = id_to_sel.keys().copied().collect();
        let selected_count = all_selected.len();

        // Pack grouped bitmask binary:
        // [u8 num_sels][per sel: u8 r, g, b]
        // [u8 num_cells][per cell: u8 cell_char, u32 loc_count, per sel: ceil(loc_count/8) bitmask bytes]
        let num_sels = sels.len();
        let mut buf: Vec<u8> = Vec::new();
        buf.push(num_sels as u8);
        for sel in &sels {
            buf.extend_from_slice(&sel.color);
        }

        let num_cells = store.render_cells.len();
        buf.push(num_cells as u8);

        for (cell_key, cr) in &store.render_cells {
            buf.push(cell_key.as_bytes()[0]);
            let n = cr.id_order.len();
            buf.extend_from_slice(&(n as u32).to_le_bytes());
            let mask_bytes = n.div_ceil(8);
            for si in 0..num_sels {
                let mut bitmask = vec![0u8; mask_bytes];
                for (li, &id) in cr.id_order.iter().enumerate() {
                    if let Some(&sel_idx) = id_to_sel.get(&id) {
                        if sel_idx == si {
                            bitmask[li / 8] |= 1 << (li % 8);
                        }
                    }
                }
                buf.extend_from_slice(&bitmask);
            }
        }

        store.selected_ids = all_selected;
        let mut color_map = HashMap::new();
        for (&id, &si) in &id_to_sel {
            color_map.insert(id, sels[si].color);
        }
        store.selected_colors = color_map;

        store.selections = sels.iter().enumerate().map(|(i, sel)| {
            selections::Selection {
                key: format!("sync:{i}"),
                color: sel.color,
                props: sel.props.clone(),
                locations: Vec::new(),
            }
        }).collect();
        store.selection_version += 1;

        let render_total: usize = store.render_cells.values().map(|cr| cr.id_order.len()).sum();
        log::debug!("[cmd] store_sync_selections total={}ms sels={} selected={} cells={} buf_size={} batch_rows={} overlay_adds={} dead={} alive={} render_total={} mask_len={} counts={:?}",
            _t.elapsed().as_millis(), sels.len(), selected_count, num_cells, buf.len(),
            store.batch.as_ref().map_or(0, |b| b.num_rows()), store.overlay_adds.len(),
            store.overlay_dead.len(), store.alive_count, render_total,
            masks.first().map_or(0, |m| m.len()), counts);

        (counts, buf, selected_count, num_cells)
    };

    let patch_file = if num_cells > 0 {
        let path = app.path().temp_dir().map_err(|e| e.to_string())?
            .join("mma_sel_patches.bin");
        let p = path.clone();
        tokio::task::spawn_blocking(move || {
            std::fs::write(&p, &buf).map_err(|e| e.to_string())
        }).await.map_err(|e| e.to_string())??;
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    };

    Ok(SyncSelectionsResult { counts, patch_file, selected_count })
}

#[tauri::command]
#[specta::specta]
pub fn store_get_selected_ids_list(state: tauri::State<'_, StoreState>) -> Result<Vec<u32>, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    Ok(store.selected_ids.iter().copied().collect())
}

#[tauri::command]
#[specta::specta]
pub fn store_set_selected_ids(state: tauri::State<'_, StoreState>, ids: Vec<u32>) -> Result<(), String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    store.selected_ids = ids.into_iter().collect();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn store_resolve_selection(state: tauri::State<'_, StoreState>, props: SelectionProps) -> Result<Vec<u32>, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    let view = store.loc_view();
    Ok(selections::resolve(&view, &props))
}

// ---------------------------------------------------------------------------
// Selection commands
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SelectionResult {
    pub key: String,
    pub count: usize,
    pub selection_version: u64,
}

#[tauri::command]
#[specta::specta]
pub fn store_add_selection(state: tauri::State<'_, StoreState>, props: SelectionProps) -> Result<SelectionResult, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let view = store.loc_view();
    let locations = selections::resolve(&view, &props);
    let key = selection_key(&props, &locations);
    let color = color_for_key(&key);
    let count = locations.len();
    store.selections.push(Selection { key: key.clone(), color, props, locations });
    store.selection_version += 1;
    Ok(SelectionResult { key, count, selection_version: store.selection_version })
}

#[tauri::command]
#[specta::specta]
pub fn store_remove_selection(state: tauri::State<'_, StoreState>, key: String) -> Result<u32, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    store.selections.retain(|s| s.key != key);
    store.selection_version += 1;
    Ok(store.selection_version as u32)
}

#[tauri::command]
#[specta::specta]
pub fn store_reset_selections(state: tauri::State<'_, StoreState>) -> Result<u32, String> {
    let mut store = state.lock().map_err(|e| e.to_string())?;
    store.selections.clear();
    store.selection_version += 1;
    Ok(store.selection_version as u32)
}

#[tauri::command]
#[specta::specta]
pub fn store_get_selections(state: tauri::State<'_, StoreState>) -> Result<Vec<SelectionSummary>, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    Ok(store.selections.iter().map(|s| SelectionSummary {
        key: s.key.clone(),
        color: s.color,
        sel_type: selection_type_name(&s.props),
        count: s.locations.len(),
    }).collect())
}

#[tauri::command]
#[specta::specta]
pub fn store_get_selected_ids(state: tauri::State<'_, StoreState>) -> Result<Vec<u32>, String> {
    let store = state.lock().map_err(|e| e.to_string())?;
    let mut all = HashSet::new();
    for sel in &store.selections { for &id in &sel.locations { all.insert(id); } }
    Ok(all.into_iter().collect())
}

#[tauri::command]
#[specta::specta]
pub fn store_refresh_selections(state: tauri::State<'_, StoreState>) -> Result<u32, String> {
    let _t = std::time::Instant::now();
    let mut store = state.lock().map_err(|e| e.to_string())?;
    let resolved: Vec<Vec<u32>> = {
        let view = store.loc_view();
        store.selections.iter().map(|s| selections::resolve(&view, &s.props)).collect()
    };
    let n = resolved.len();
    for (i, ids) in resolved.into_iter().enumerate() {
        store.selections[i].locations = ids;
    }
    store.selection_version += 1;
    log::debug!("[cmd] store_refresh_selections total={}ms sels={}", _t.elapsed().as_millis(), n);
    Ok(store.selection_version as u32)
}

// --- Helpers ---

fn selection_key(props: &SelectionProps, locations: &[u32]) -> String {
    match props {
        SelectionProps::Locations { .. } => format!("locs:{}", locations.len()),
        SelectionProps::Everything => "everything".into(),
        SelectionProps::Polygon { .. } => format!("polygon:{}", uuid::Uuid::new_v4()),
        SelectionProps::Tag { tag_id } => format!("tag:{tag_id}"),
        SelectionProps::Untagged => "untagged".into(),
        SelectionProps::Unpanned => "unpanned".into(),
        SelectionProps::PanoIds => "panoids".into(),
        SelectionProps::NotPanoIds => "notpanoids".into(),
        SelectionProps::Duplicates { distance } => format!("duplicates:{distance}"),
        SelectionProps::Manual { .. } => "manual".into(),
        SelectionProps::ValidationState { state, .. } => format!("validation:{state}"),
        SelectionProps::Intersection { selections } => selections.iter().map(|s| format!("({})", s.key)).collect::<Vec<_>>().join("^"),
        SelectionProps::Union { selections } => selections.iter().map(|s| format!("({})", s.key)).collect::<Vec<_>>().join("|"),
        SelectionProps::Invert { selections } => {
            if let Some(s) = selections.first() { format!("!{}", s.key) } else { "!".into() }
        }
        SelectionProps::Filter { field, op, value, value2 } => {
            let v2 = value2.as_ref().map(|v| format!(":{v}")).unwrap_or_default();
            format!("filter:{field}:{op}:{value}{v2}")
        }
    }
}

fn selection_type_name(props: &SelectionProps) -> String {
    match props {
        SelectionProps::Locations { .. } => "Locations",
        SelectionProps::Everything => "Everything",
        SelectionProps::Polygon { .. } => "Polygon",
        SelectionProps::Tag { .. } => "Tag",
        SelectionProps::Untagged => "Untagged",
        SelectionProps::Unpanned => "Unpanned",
        SelectionProps::PanoIds => "PanoIds",
        SelectionProps::NotPanoIds => "NotPanoIds",
        SelectionProps::Duplicates { .. } => "Duplicates",
        SelectionProps::Manual { .. } => "Manual",
        SelectionProps::ValidationState { .. } => "ValidationState",
        SelectionProps::Intersection { .. } => "Intersection",
        SelectionProps::Union { .. } => "Union",
        SelectionProps::Invert { .. } => "Invert",
        SelectionProps::Filter { .. } => "Filter",
    }.into()
}

fn color_for_key(key: &str) -> [u8; 3] {
    let mut hash: u32 = 0;
    for b in key.bytes() { hash = hash.wrapping_mul(31).wrapping_add(b as u32); }
    let hue = (hash % 360) as f64;
    let (r, g, b) = crate::util::hsl_to_rgb(hue, 0.65, 0.5);
    [r, g, b]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
#[path = "location_store.test.rs"]
mod tests;
