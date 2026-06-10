//! Bitmask-based selection resolution engine.
//!
//! Selections are predicates over the location set (tag membership, polygon containment,
//! duplicates, filters on arbitrary fields, etc.). This module resolves each selection to
//! a `Vec<bool>` bitmask over the unified `LocView` (batch + overlay), using rayon for
//! parallel evaluation. Composite selections (Intersection, Union, Invert) combine child
//! bitmasks. The bitmasks are then serialized into a per-cell binary format that JS reads
//! to color the selection overlay.

use std::collections::{HashMap, HashSet};
use arrow::array::{RecordBatch, StringArray, Float64Array, UInt32Array, ListArray, Array};
use roaring::RoaringBitmap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use crate::types::{Location, LocationFlags};
use crate::util::{unix_to_month_day, unix_to_hour_min, tz_offset_seconds};

/// Discriminated union of all selection types. Serialized with `{ "type": "..." }` tag
/// for JS interop. Simple types (Tag, Untagged, PanoIds, etc.) resolve in O(N) with
///  parallel batch scans. Composites (Intersection, Union, Invert) recursively resolve
/// children. Duplicates uses a grid-accelerated spatial scan.
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type")]
pub enum SelectionProps {
    Locations { locations: Vec<u32>, name: Option<String> },
    Everything,
    #[serde(rename_all = "camelCase")]
    Polygon { polygon: PolygonGeometry, #[serde(rename = "includeInformational")] include_informational: bool },
    Tag { #[serde(rename = "tagId")] tag_id: u32 },
    Untagged,
    Unpanned,
    PanoIds,
    NotPanoIds,
    Manual { locations: Vec<u32> },
    Duplicates { distance: f64 },
    ValidationState { locations: Vec<u32>, state: u8 },
    #[serde(rename_all = "camelCase")]
    Reviewed { locations: Vec<u32>, session_id: String, mode: String },
    Intersection { selections: Vec<Selection> },
    Union { selections: Vec<Selection> },
    Invert { selections: Vec<Selection> },
    Filter { field: String, op: String, #[specta(type = specta_typescript::Any)] value: serde_json::Value, #[serde(default)] #[specta(type = Option<specta_typescript::Any>)] value2: Option<serde_json::Value> },
}

/// GeoJSON-like polygon geometry. `coordinates` is the primary polygon (outer ring +
/// optional holes). `extra_polygons` allows multipolygon selections (e.g., from GeoJSON import).
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PolygonGeometry {
    pub coordinates: Vec<Vec<[f64; 2]>>,
    #[serde(default)]
    pub extra_polygons: Option<Vec<Vec<Vec<[f64; 2]>>>>,
    #[serde(default)]
    #[specta(type = Option<specta_typescript::Any>)]
    pub properties: Option<serde_json::Value>,
}

/// A named, colored selection. `key` is deterministic (e.g., `"tag:5"`, `"polygon:abc"`)
/// so JS can diff selections across syncs. `color` is the RGB overlay color.
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub key: String,
    pub color: [u8; 3],
    pub props: SelectionProps,
    /// JS-only: cached resolved count for sidebar display. Rust never sets this.
    #[serde(default)]
    pub count: Option<u32>,
}

// ---------------------------------------------------------------------------
// LocView: unified view over Arrow batch + overlay
// ---------------------------------------------------------------------------

/// Unified read-only view over Arrow batch + overlay (dead, patches, adds).
/// Caches column downcast refs on construction to avoid repeated downcasts.
pub struct LocView<'a> {
    batch: Option<&'a RecordBatch>,
    dead: &'a HashSet<u32>,
    patches: &'a HashMap<u32, Location>,
    adds: &'a [Location],
    // Cached column refs (from batch)
    ids: Option<&'a UInt32Array>,
    lats: Option<&'a Float64Array>,
    lngs: Option<&'a Float64Array>,
    headings: Option<&'a Float64Array>,
    pitches: Option<&'a Float64Array>,
    zooms: Option<&'a Float64Array>,
    flags: Option<&'a UInt32Array>,
    tags: Option<&'a ListArray>,
    extras: Option<&'a StringArray>,
    created_ats: Option<&'a UInt32Array>,
    modified_ats: Option<&'a UInt32Array>,
    batch_rows: usize,
    has_dead: bool,
    has_patches: bool,
    /// Optional `tag_id -> member location ids` index. When present, a `Tag` leaf
    /// resolves by cloning the set instead of scanning every row's tag list.
    tag_sets: Option<&'a HashMap<u32, RoaringBitmap>>,
}

/// One alive location yielded by [`LocView::for_each`]. Provides uniform field
/// access regardless of whether the data lives in an Arrow batch column or a
/// materialized `Location` struct (patch or overlay add).
pub struct RowRef<'a, 'v> {
    inner: RowInner<'a, 'v>,
}

// SAFETY: RowRef only holds shared references to immutable Arrow arrays and
// Location structs. Nothing is mutated through these references during parallel
// iteration. The borrow checker can't prove this statically because LocView
// holds non-Send references, but all accessed data is effectively read-only.
unsafe impl Send for RowRef<'_, '_> {}
unsafe impl Sync for RowRef<'_, '_> {}

enum RowInner<'a, 'v> {
    Base(&'v LocView<'a>, usize),
    Loc(&'a Location),
}

impl<'a> RowRef<'a, '_> {
    pub fn from_loc(loc: &'a Location) -> Self {
        RowRef { inner: RowInner::Loc(loc) }
    }
}

impl<'a, 'v> RowRef<'a, 'v> {
    #[inline] pub fn id(&self) -> u32 {
        match &self.inner { RowInner::Base(v, i) => v.batch_id(*i), RowInner::Loc(l) => l.id }
    }
    #[inline] pub fn lat(&self) -> f64 {
        match &self.inner { RowInner::Base(v, i) => v.lats.unwrap().value(*i), RowInner::Loc(l) => l.lat }
    }
    #[inline] pub fn lng(&self) -> f64 {
        match &self.inner { RowInner::Base(v, i) => v.lngs.unwrap().value(*i), RowInner::Loc(l) => l.lng }
    }
    #[inline] pub fn heading(&self) -> f64 {
        match &self.inner { RowInner::Base(v, i) => v.headings.unwrap().value(*i), RowInner::Loc(l) => l.heading }
    }
    #[inline] pub fn pitch(&self) -> f64 {
        match &self.inner { RowInner::Base(v, i) => v.pitches.unwrap().value(*i), RowInner::Loc(l) => l.pitch }
    }
    #[inline] pub fn zoom(&self) -> f64 {
        match &self.inner { RowInner::Base(v, i) => v.zooms.unwrap().value(*i), RowInner::Loc(l) => l.zoom }
    }
    #[inline] pub fn flags(&self) -> LocationFlags {
        match &self.inner {
            RowInner::Base(v, i) => LocationFlags::from_bits_retain(v.flags.unwrap().value(*i)),
            RowInner::Loc(l) => l.flags,
        }
    }
    pub fn has_tag(&self, tag_id: u32) -> bool {
        match &self.inner {
            RowInner::Base(v, i) => {
                let list = v.tags.unwrap().value(*i);
                let ids = list.as_any().downcast_ref::<UInt32Array>().unwrap();
                (0..ids.len()).any(|k| ids.value(k) == tag_id)
            }
            RowInner::Loc(l) => l.tags.contains(&tag_id),
        }
    }
    pub fn tags_empty(&self) -> bool {
        match &self.inner {
            RowInner::Base(v, i) => v.tags.unwrap().value(*i).is_empty(),
            RowInner::Loc(l) => l.tags.is_empty(),
        }
    }
    pub fn for_each_tag(&self, mut f: impl FnMut(u32)) {
        match &self.inner {
            RowInner::Base(v, i) => {
                let list = v.tags.unwrap().value(*i);
                let ids = list.as_any().downcast_ref::<UInt32Array>().unwrap();
                for j in 0..ids.len() { f(ids.value(j)); }
            }
            RowInner::Loc(l) => { for &t in &l.tags { f(t); } }
        }
    }
    pub fn resolve_field(&self, field: &str) -> Option<serde_json::Value> {
        match &self.inner {
            RowInner::Base(v, i) => resolve_field_arrow(v, *i, field),
            RowInner::Loc(l) => resolve_field_loc(l, field),
        }
    }
    pub fn to_location(&self) -> Location {
        match &self.inner {
            RowInner::Base(v, i) => v.loc_at(*i),
            RowInner::Loc(l) => (*l).clone(),
        }
    }
    pub fn matches(&self, props: &SelectionProps) -> bool {
        test_row(self, props)
    }
}

impl<'a> LocView<'a> {
    pub fn new(
        batch: Option<&'a RecordBatch>,
        dead: &'a HashSet<u32>,
        patches: &'a HashMap<u32, Location>,
        adds: &'a [Location],
        tag_sets: Option<&'a HashMap<u32, RoaringBitmap>>,
    ) -> Self {
        use crate::arrow_bridge::{col_id, col_lat, col_lng, col_heading, col_pitch, col_zoom, col_flags, col_tags, col_extra, col_created_at, col_modified_at};
        let batch_rows = batch.map_or(0, |b| b.num_rows());
        let ids = batch.map(col_id);
        let lats = batch.map(col_lat);
        let lngs = batch.map(col_lng);
        let headings = batch.map(col_heading);
        let pitches = batch.map(col_pitch);
        let zooms = batch.map(col_zoom);
        let flags = batch.map(col_flags);
        let tags = batch.map(col_tags);
        let extras = batch.map(col_extra);
        let created_ats = batch.map(col_created_at);
        let modified_ats = batch.map(col_modified_at);
        let has_dead = !dead.is_empty();
        let has_patches = !patches.is_empty();
        Self { batch, dead, patches, adds, ids, lats, lngs, headings, pitches, zooms, flags, tags, extras, created_ats, modified_ats, batch_rows, has_dead, has_patches, tag_sets }
    }

    /// Number of rows in the Arrow batch (before overlay).
    pub fn batch_rows(&self) -> usize { self.batch_rows }
    /// Overlay add locations (appended after batch rows in logical order).
    pub fn adds(&self) -> &[Location] { self.adds }

    /// Read the raw batch ID at row `i` (no overlay check).
    pub fn batch_id(&self, i: usize) -> u32 { self.ids.unwrap().value(i) }

    /// Whether batch row `i` is alive (not in the dead set).
    #[inline]
    pub fn is_alive(&self, i: usize) -> bool {
        !self.has_dead || !self.dead.contains(&self.batch_id(i))
    }

    /// Return the overlay patch for batch row `i`, if one exists.
    #[inline]
    pub fn patch_at(&self, i: usize) -> Option<&Location> {
        if !self.has_patches { return None; }
        self.patches.get(&self.batch_id(i))
    }

    /// Read the effective ID at batch row `i`, checking patches first.
    pub fn id_at(&self, i: usize) -> u32 {
        if self.has_patches {
            if let Some(p) = self.patches.get(&self.batch_id(i)) { return p.id; }
        }
        self.batch_id(i)
    }

    /// Read the raw lat/lng column value at batch row `i` (no overlay check).
    #[inline] pub fn lat_raw(&self, i: usize) -> f64 { self.lats.unwrap().value(i) }
    #[inline] pub fn lng_raw(&self, i: usize) -> f64 { self.lngs.unwrap().value(i) }

    /// Materialize batch row `i` into a full `Location`.
    pub fn loc_at(&self, i: usize) -> Location {
        crate::arrow_bridge::row_to_location(self.batch.unwrap(), i)
    }

    /// Visit every alive location once, overlay applied: dead rows skipped, patched
    /// rows surfaced as `RowRef::Loc`, then the overlay adds. The patch is resolved a
    /// single time per row. Serial; `f` may accumulate.
    #[inline]
    pub fn for_each(&self, mut f: impl FnMut(RowRef)) {
        for i in 0..self.batch_rows {
            if !self.is_alive(i) { continue; }
            match self.patch_at(i) {
                Some(p) => f(RowRef { inner: RowInner::Loc(p) }),
                None => f(RowRef { inner: RowInner::Base(self, i) }),
            }
        }
        for loc in self.adds {
            f(RowRef { inner: RowInner::Loc(loc) });
        }
    }

    /// Build a bool mask over all locations (batch + adds) using a per-row predicate.
    /// Batch rows are scanned in parallel with rayon. O(N) with parallel speedup.
    pub fn resolve_mask(
        &self,
        test: impl Fn(&RowRef) -> bool + Sync + Send,
    ) -> Vec<bool> {
        let mut mask: Vec<bool> = (0..self.batch_rows)
            .into_par_iter()
            .with_min_len(CHUNK_SIZE)
            .map(|i| {
                if !self.is_alive(i) { return false; }
                let row = match self.patch_at(i) {
                    Some(p) => RowRef { inner: RowInner::Loc(p) },
                    None => RowRef { inner: RowInner::Base(self, i) },
                };
                test(&row)
            })
            .collect();
        mask.extend(self.adds.iter().map(|loc| {
            test(&RowRef::from_loc(loc))
        }));
        mask
    }
}

// ---------------------------------------------------------------------------
// Bitmask resolve
// ---------------------------------------------------------------------------

fn test_row(r: &RowRef, props: &SelectionProps) -> bool {
    match props {
        SelectionProps::Everything => true,
        SelectionProps::Locations { locations, .. }
        | SelectionProps::Manual { locations }
        | SelectionProps::ValidationState { locations, .. }
        | SelectionProps::Reviewed { locations, .. } => locations.contains(&r.id()),
        SelectionProps::Tag { tag_id } => r.has_tag(*tag_id),
        SelectionProps::Untagged => r.tags_empty(),
        SelectionProps::Unpanned => r.heading() == 0.0,
        SelectionProps::PanoIds => r.flags().contains(LocationFlags::LOAD_AS_PANO_ID),
        SelectionProps::NotPanoIds => !r.flags().contains(LocationFlags::LOAD_AS_PANO_ID),
        SelectionProps::Polygon { polygon, include_informational } => {
            if !include_informational && r.flags().contains(LocationFlags::INFORMATIONAL) { return false; }
            point_in_geometry(r.lng(), r.lat(), polygon)
        }
        SelectionProps::Filter { field, op, value, value2 } => {
            if op == "between_local" {
                return compare_local_tz(r, field, value, value2.as_ref());
            }
            match r.resolve_field(field) {
                Some(ref v) => compare_filter(v, op, value, value2.as_ref()),
                None => op.as_str() == "neq" || op.as_str() == "nothas",
            }
        }
        _ => false,
    }
}

/// Minimum rayon chunk size for parallel batch iteration. Tuned to amortize
/// per-chunk overhead while keeping cache-friendly access patterns.
const CHUNK_SIZE: usize = 64 * 1024;

/// Resolve a selection into a `RoaringBitmap` of matching (alive) location **ids**.
///
/// This is the primary resolve path. Composites (`Intersection`/`Union`/`Invert`)
/// combine child bitmaps with native roaring set ops (`&`/`|`/`Sub`) — branchless,
/// sparse-aware, no per-row scanning. A `Tag` leaf hits the membership index when
/// present (O(1)-ish clone) instead of scanning every row's tag list. Geometric
/// leaves (`Polygon`/`Filter`/`Duplicates`) still scan, producing a positional mask
/// that is converted to an id set.
pub fn resolve_set(view: &LocView, props: &SelectionProps) -> RoaringBitmap {
    match props {
        // Tag leaf via index: clone the precomputed member set, minus dead ids.
        SelectionProps::Tag { tag_id } => {
            if let Some(idx) = view.tag_sets {
                let mut set = idx.get(tag_id).cloned().unwrap_or_default();
                if view.has_dead {
                    for &d in view.dead.iter() { set.remove(d); }
                }
                // Overlay adds aren't in the batch-built index; fold them in by scan.
                for loc in view.adds.iter() {
                    if loc.tags.contains(tag_id) { set.insert(loc.id); }
                }
                // Patches can change a row's tags vs the indexed (base) value: re-test
                // patched rows so the index can't go stale under uncommitted edits.
                if view.has_patches {
                    for p in view.patches.values() {
                        if p.tags.contains(tag_id) { set.insert(p.id); } else { set.remove(p.id); }
                    }
                }
                return set;
            }
            // No index: fall through to the scan path below.
        }
        SelectionProps::Intersection { selections } => {
            if selections.is_empty() { return RoaringBitmap::new(); }
            let mut acc = resolve_set(view, &selections[0].props);
            for s in &selections[1..] {
                acc &= resolve_set(view, &s.props);
                if acc.is_empty() { break; } // short-circuit: nothing left to intersect
            }
            return acc;
        }
        SelectionProps::Union { selections } => {
            let mut acc = RoaringBitmap::new();
            for s in selections { acc |= resolve_set(view, &s.props); }
            return acc;
        }
        SelectionProps::Invert { selections } => {
            // Invert = (all alive ids) - (child ids). roaring-rs has no native flip,
            // so this is a difference against the universe set.
            let universe = alive_id_set(view);
            if selections.is_empty() { return universe; }
            let inner = resolve_set(view, &selections[0].props);
            return universe - inner;
        }
        _ => {}
    }
    // Scan leaves (incl. Tag with no index): build a positional mask, convert to ids.
    let mask = resolve_leaf_mask(view, props);
    mask_to_set(view, &mask)
}

/// Set of all alive location ids (batch minus dead, plus overlay adds).
fn alive_id_set(view: &LocView) -> RoaringBitmap {
    let mut set = RoaringBitmap::new();
    view.for_each(|row| { set.insert(row.id()); });
    set
}

/// Convert a positional mask (batch rows then adds) into a roaring id set. Excludes
/// dead batch rows. O(N).
fn mask_to_set(view: &LocView, mask: &[bool]) -> RoaringBitmap {
    let mut set = RoaringBitmap::new();
    for i in 0..view.batch_rows {
        if mask[i] && view.is_alive(i) { set.insert(view.id_at(i)); }
    }
    for (j, loc) in view.adds.iter().enumerate() {
        if mask[view.batch_rows + j] { set.insert(loc.id); }
    }
    set
}

/// Resolve a single non-composite leaf into a positional bool mask. O(N) parallel
/// (or O(N^2) grid-accelerated for Duplicates). Composites are handled by `resolve_set`.
fn resolve_leaf_mask(view: &LocView, props: &SelectionProps) -> Vec<bool> {
    let n = view.batch_rows + view.adds.len();
    match props {
        SelectionProps::Locations { locations, .. }
        | SelectionProps::Manual { locations }
        | SelectionProps::ValidationState { locations, .. }
        | SelectionProps::Reviewed { locations, .. } => {
            let set: HashSet<u32> = locations.iter().copied().collect();
            view.resolve_mask(|r| set.contains(&r.id()))
        }
        SelectionProps::Duplicates { distance } => {
            let mut mask = vec![false; n];
            find_duplicates_bitmask(view, *distance, &mut mask);
            mask
        }
        SelectionProps::Polygon { polygon, include_informational } => {
            let inc = *include_informational;
            match geometry_bbox(polygon) {
                None => vec![false; n],
                Some(bb) => view.resolve_mask(|r| {
                    if !inc && r.flags().contains(LocationFlags::INFORMATIONAL) { return false; }
                    in_bbox(r.lng(), r.lat(), &bb) && point_in_geometry(r.lng(), r.lat(), polygon)
                }),
            }
        }
        _ => view.resolve_mask(|r| test_row(r, props)),
    }
}

/// Resolve a selection to a Vec of matching location IDs (sorted ascending). O(N).
pub fn resolve(view: &LocView, props: &SelectionProps) -> Vec<u32> {
    resolve_set(view, props).into_iter().collect()
}

// --- Geometry (ray-casting point-in-polygon) ---

/// Returns true if the ring involves the antimeridian — either wrapped coordinates
/// (edge lng jump > 180) or unwrapped (any vertex lng outside [-180, 180]).
fn ring_crosses_antimeridian(ring: &[[f64; 2]]) -> bool {
    let n = ring.len();
    if n < 2 { return false; }
    let mut j = n - 1;
    for i in 0..n {
        if ring[i][0] > 180.0 || ring[i][0] < -180.0 { return true; }
        if (ring[i][0] - ring[j][0]).abs() > 180.0 { return true; }
        j = i;
    }
    false
}

#[inline]
fn normalize_lng(lng: f64) -> f64 {
    if lng < 0.0 { lng + 360.0 } else { lng }
}

/// Ray-casting algorithm: cast a horizontal ray eastward from (lng, lat) and count
/// edge crossings. Odd count = inside. O(V) where V = vertices.
/// Handles antimeridian-crossing rings by shifting to [0, 360).
pub(crate) fn point_in_ring(lng: f64, lat: f64, ring: &[[f64; 2]]) -> bool {
    let crosses = ring_crosses_antimeridian(ring);
    let lng = if crosses { normalize_lng(lng) } else { lng };
    let mut inside = false;
    let n = ring.len();
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let xi = if crosses { normalize_lng(ring[i][0]) } else { ring[i][0] };
        let yi = ring[i][1];
        let xj = if crosses { normalize_lng(ring[j][0]) } else { ring[j][0] };
        let yj = ring[j][1];
        if ((yi > lat) != (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// Test point-in-polygon with holes: must be inside the outer ring (coords[0])
/// and outside all hole rings (coords[1..]).
pub(crate) fn point_in_polygon(lng: f64, lat: f64, coords: &[Vec<[f64; 2]>]) -> bool {
    if coords.is_empty() { return false; }
    if !point_in_ring(lng, lat, &coords[0]) { return false; }
    for hole in coords.iter().skip(1) {
        if point_in_ring(lng, lat, hole) { return false; }
    }
    true
}

/// Test against the full geometry (primary polygon + extra_polygons). Any hit = true.
pub(crate) fn point_in_geometry(lng: f64, lat: f64, geom: &PolygonGeometry) -> bool {
    if point_in_polygon(lng, lat, &geom.coordinates) { return true; }
    if let Some(extras) = &geom.extra_polygons {
        for poly in extras {
            if point_in_polygon(lng, lat, poly) { return true; }
        }
    }
    false
}

/// Axis-aligned bounding box `[min_lng, min_lat, max_lng, max_lat]` over every ring of
/// a geometry (outer + holes + extra polygons). Used as a cheap broad-phase reject
/// before the full crossing-number test in polygon selections. `None` if no coords.
/// When the geometry crosses the antimeridian, longitudes are normalized to [0, 360)
/// so `max_lng` may exceed 180 — `in_bbox` handles this transparently.
pub(crate) fn geometry_bbox(geom: &PolygonGeometry) -> Option<[f64; 4]> {
    let crosses = geom.coordinates.iter()
        .chain(geom.extra_polygons.iter().flat_map(|polys| polys.iter().flatten()))
        .any(|ring| ring_crosses_antimeridian(ring));
    let mut bb = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
    let mut any = false;
    let mut fold = |rings: &[Vec<[f64; 2]>]| {
        for ring in rings {
            for &[lng, lat] in ring {
                let lng = if crosses { normalize_lng(lng) } else { lng };
                if lng < bb[0] { bb[0] = lng; }
                if lat < bb[1] { bb[1] = lat; }
                if lng > bb[2] { bb[2] = lng; }
                if lat > bb[3] { bb[3] = lat; }
                any = true;
            }
        }
    };
    fold(&geom.coordinates);
    if let Some(extras) = &geom.extra_polygons {
        for poly in extras { fold(poly); }
    }
    if any { Some(bb) } else { None }
}

/// `bb` is `[min_lng, min_lat, max_lng, max_lat]`.
/// When `max_lng > 180` the bbox is in normalized [0,360) space (antimeridian crossing);
/// negative test longitudes are shifted by +360 automatically.
#[inline]
pub(crate) fn in_bbox(lng: f64, lat: f64, bb: &[f64; 4]) -> bool {
    let lng = if bb[2] > 180.0 && lng < 0.0 { lng + 360.0 } else { lng };
    lng >= bb[0] && lng <= bb[2] && lat >= bb[1] && lat <= bb[3]
}

// --- Duplicates (bitmask version) ---

/// Cell-hashed spatial grid in CSR layout (Müller, "Blazing Fast Neighbor Search
/// with Spatial Hashing"). Cells are hashed into a fixed table sized to the point
/// count, so the structure is O(n) regardless of spatial extent — no dense world
/// array. Build is two linear passes (count → prefix-sum → scatter); neighbor
/// iteration walks a contiguous slice. Hash collisions are harmless: distinct cells
/// may share a bucket, and the caller's distance test rejects any foreign points.
struct SpatialHash {
    table_size: usize,
    cell_start: Vec<u32>, // len table_size + 1; CSR offsets
    entries: Vec<u32>,    // len n; point indices grouped by bucket
}

#[inline]
fn hash_cell(cx: i32, cy: i32, table_size: usize) -> usize {
    let h = (cx.wrapping_mul(92_837_111)) ^ (cy.wrapping_mul(689_287_499));
    (h.unsigned_abs() as usize) % table_size
}

impl SpatialHash {
    /// Build from per-point integer cell coords. `table_size = max(n, 1)`.
    fn build(cells: &[(i32, i32)]) -> Self {
        let n = cells.len();
        let table_size = n.max(1);
        let mut cell_start = vec![0u32; table_size + 1];
        for &(cx, cy) in cells {
            cell_start[hash_cell(cx, cy, table_size)] += 1;
        }
        // Prefix-sum into start offsets.
        let mut sum = 0u32;
        for slot in cell_start.iter_mut() {
            let c = *slot;
            *slot = sum;
            sum += c;
        }
        // Scatter point indices; cell_start[b] temporarily advances as a write cursor.
        let mut entries = vec![0u32; n];
        for (pi, &(cx, cy)) in cells.iter().enumerate() {
            let b = hash_cell(cx, cy, table_size);
            entries[cell_start[b] as usize] = pi as u32;
            cell_start[b] += 1;
        }
        // Restore offsets: shift right by one (the scatter advanced each cursor to its end).
        for b in (1..=table_size).rev() {
            cell_start[b] = cell_start[b - 1];
        }
        cell_start[0] = 0;
        SpatialHash { table_size, cell_start, entries }
    }

    /// Point indices in the bucket that `(cx, cy)` hashes to. May include points from
    /// other cells that collide on the same bucket — caller must distance-filter.
    #[inline]
    fn bucket(&self, cx: i32, cy: i32) -> &[u32] {
        let b = hash_cell(cx, cy, self.table_size);
        &self.entries[self.cell_start[b] as usize..self.cell_start[b + 1] as usize]
    }
}

/// Grid broad-phase pair sweep shared by the duplicate bitmask/groups/prune paths.
/// Calls `pair(state, pi, pj)` (pi < pj) for every index pair within `distance_m` metres.
/// `skip_anchor(state, pi)` short-circuits a whole anchor scan — the bitmask path relies
/// on it to stay near-linear when many points share one cell. O(N) average with uniform
/// distribution, O(N^2) worst case if all points fall in one grid cell.
fn for_pairs_within<S>(
    n: usize,
    pos: impl Fn(usize) -> (f64, f64),
    distance_m: f64,
    state: &mut S,
    skip_anchor: impl Fn(&S, usize) -> bool,
    mut pair: impl FnMut(&mut S, usize, usize),
) {
    if n < 2 { return; }
    let cell_deg = distance_m / 111_000.0 * 1.5;
    let cells: Vec<(i32, i32)> = (0..n)
        .map(|i| {
            let (lat, lng) = pos(i);
            ((lng / cell_deg).floor() as i32, (lat / cell_deg).floor() as i32)
        })
        .collect();
    let grid = SpatialHash::build(&cells);
    let thresh_m2 = distance_m * distance_m;
    for pi in 0..n {
        if skip_anchor(state, pi) { continue; }
        let (lat, lng) = pos(pi);
        let (cx, cy) = cells[pi];
        let cos_lat = lat.to_radians().cos();
        for dx in -1..=1 {
            for dy in -1..=1 {
                for &pj in grid.bucket(cx + dx, cy + dy) {
                    let pj = pj as usize;
                    if pj <= pi { continue; }
                    // Bucket may hold points from collided cells; the cell-coord check
                    // keeps us to the true 3x3 neighborhood. Then the distance test.
                    if cells[pj] != (cx + dx, cy + dy) { continue; }
                    let (plat, plng) = pos(pj);
                    if equirect_m2(lat, lng, plat, plng, cos_lat) <= thresh_m2 {
                        pair(state, pi, pj);
                    }
                }
            }
        }
    }
}

/// Grid-accelerated spatial duplicate detection.
fn find_duplicates_bitmask(view: &LocView, distance_m: f64, mask: &mut [bool]) {
    struct Pt { lat: f64, lng: f64, global_idx: usize }
    let mut points = Vec::new();

    for i in 0..view.batch_rows {
        if !view.is_alive(i) { continue; }
        if let Some(p) = view.patch_at(i) {
            points.push(Pt { lat: p.lat, lng: p.lng, global_idx: i });
        } else {
            points.push(Pt { lat: view.lats.unwrap().value(i), lng: view.lngs.unwrap().value(i), global_idx: i });
        }
    }
    for (j, loc) in view.adds.iter().enumerate() {
        points.push(Pt { lat: loc.lat, lng: loc.lng, global_idx: view.batch_rows + j });
    }

    let n = points.len();
    let mut state = (vec![false; n], mask); // (in_group, mask)
    for_pairs_within(
        n,
        |i| (points[i].lat, points[i].lng),
        distance_m,
        &mut state,
        |s, pi| s.0[pi],
        |s, pi, pj| {
            if s.0[pj] { return; }
            s.0[pj] = true;
            s.1[points[pj].global_idx] = true;
            s.1[points[pi].global_idx] = true;
        },
    );
}

/// Transitive (connected-component) spatial grouping. Two locations are linked when within
/// `distance_m` metres; each returned group is a connected component of size >= 2. Same
/// grid broad-phase as `find_duplicates_bitmask`, but union-find preserves the partition
/// instead of flattening to a membership mask. Chains collapse: A~B, B~C => {A,B,C} even
/// if A and C are out of range. Output is deterministic: ids ascending within each group,
/// groups ordered by first id.
pub fn find_duplicate_groups(view: &LocView, distance_m: f64) -> Vec<Vec<u32>> {
    struct Pt { lat: f64, lng: f64, id: u32 }
    let mut points: Vec<Pt> = Vec::new();
    view.for_each(|row| points.push(Pt { lat: row.lat(), lng: row.lng(), id: row.id() }));

    let n = points.len();
    if n < 2 { return Vec::new(); }

    // Union-find with path halving.
    fn find(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        x
    }
    let mut parent: Vec<usize> = (0..n).collect();

    for_pairs_within(
        n,
        |i| (points[i].lat, points[i].lng),
        distance_m,
        &mut parent,
        |_, _| false,
        |parent, pi, pj| {
            let ra = find(parent, pi);
            let rb = find(parent, pj);
            if ra != rb { parent[ra] = rb; }
        },
    );

    let mut comps: HashMap<usize, Vec<u32>> = HashMap::new();
    for pi in 0..n {
        let r = find(&mut parent, pi);
        comps.entry(r).or_default().push(points[pi].id);
    }

    let mut groups: Vec<Vec<u32>> = comps.into_values()
        .filter(|g| g.len() >= 2)
        .map(|mut g| { g.sort_unstable(); g })
        .collect();
    groups.sort_unstable_by_key(|g| g[0]);
    groups
}

/// Prune duplicates. `locs` is the resolved selection; informational locations are
/// never pruned and never count as neighbours. Returns ids to remove.
/// - <= 25 m: relevance prune — each radius cluster keeps its best-scored location
///   (see [`prune_score`]; tie: oldest `created_at`, then lowest id), rest pruned.
/// - > 25 m: greedy max-thinning — repeatedly drop the location with the most in-range
///   neighbours until no two survivors are within `distance_m`.
pub fn prune_duplicates(locs: &[Location], distance_m: f64, keep_tag_ids: &HashSet<u32>) -> Vec<u32> {
    let locs: Vec<&Location> = locs.iter()
        .filter(|l| !l.flags.contains(LocationFlags::INFORMATIONAL))
        .collect();
    if locs.len() < 2 { return Vec::new(); }
    if distance_m > 25.0 {
        prune_thinning(&locs, distance_m)
    } else {
        prune_relevance(&locs, distance_m, keep_tag_ids)
    }
}

/// Relevance score: +1 pano, +1 per tag, +1 LoadAsPanoId, +5 keep-tag, +1 nonzero heading.
fn prune_score(l: &Location, keep_tag_ids: &HashSet<u32>) -> i64 {
    let mut s = l.tags.len() as i64;
    if l.pano_id.is_some() { s += 1; }
    if l.flags.contains(LocationFlags::LOAD_AS_PANO_ID) { s += 1; }
    if l.tags.iter().any(|t| keep_tag_ids.contains(t)) { s += 5; }
    if l.heading != 0.0 { s += 1; }
    s
}

/// Symmetric within-distance neighbour lists (indices into `locs`).
fn neighbor_lists(locs: &[&Location], distance_m: f64) -> Vec<Vec<usize>> {
    let mut out: Vec<Vec<usize>> = vec![Vec::new(); locs.len()];
    for_pairs_within(
        locs.len(),
        |i| (locs[i].lat, locs[i].lng),
        distance_m,
        &mut out,
        |_, _| false,
        |out, pi, pj| {
            out[pi].push(pj);
            out[pj].push(pi);
        },
    );
    out
}

fn prune_relevance(locs: &[&Location], distance_m: f64, keep_tag_ids: &HashSet<u32>) -> Vec<u32> {
    let neighbors = neighbor_lists(locs, distance_m);
    let mut pruned = vec![false; locs.len()];
    let mut out = Vec::new();
    for i in 0..locs.len() {
        if pruned[i] { continue; }
        let mut cluster: Vec<usize> = vec![i];
        cluster.extend(neighbors[i].iter().copied().filter(|&j| !pruned[j]));
        if cluster.len() < 2 { continue; }
        let survivor = *cluster.iter().max_by(|&&a, &&b| {
            prune_score(locs[a], keep_tag_ids).cmp(&prune_score(locs[b], keep_tag_ids))
                .then_with(|| locs[b].created_at.cmp(&locs[a].created_at)) // older wins ties
                .then_with(|| locs[b].id.cmp(&locs[a].id))
        }).unwrap();
        for &j in &cluster {
            if j != survivor {
                pruned[j] = true;
                out.push(locs[j].id);
            }
        }
    }
    out
}

fn prune_thinning(locs: &[&Location], distance_m: f64) -> Vec<u32> {
    let n = locs.len();
    let neighbors = neighbor_lists(locs, distance_m);
    let mut deg: Vec<u32> = neighbors.iter().map(|v| v.len() as u32).collect();
    let mut removed = vec![false; n];
    // Stack with O(1) membership removal: all nodes at the current max degree are
    // processed before recounting; a neighbour of a removed node leaves the stack
    // even if it still sits at max degree.
    let mut stack: Vec<usize> = Vec::new();
    let mut pos: HashMap<usize, usize> = HashMap::new();
    loop {
        let max = deg.iter().copied().max().unwrap_or(0);
        if max == 0 { break; }
        for i in 0..n {
            if deg[i] == max {
                pos.insert(i, stack.len());
                stack.push(i);
            }
        }
        while let Some(t) = stack.pop() {
            pos.remove(&t);
            deg[t] = 0;
            removed[t] = true;
            for &u in &neighbors[t] {
                if deg[u] > 0 { deg[u] -= 1; }
                if let Some(p) = pos.remove(&u) {
                    let last = stack.pop().unwrap();
                    if p < stack.len() {
                        stack[p] = last;
                        pos.insert(last, p);
                    }
                }
            }
        }
    }
    (0..n).filter(|&i| removed[i]).map(|i| locs[i].id).collect()
}

/// Great-circle distance in metres using the haversine formula. Assumes spherical Earth (R = 6371 km).
pub(crate) fn haversine_m(lat1: f64, lng1: f64, lat2: f64, lng2: f64) -> f64 {
    let r = 6_371_000.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlng = (lng2 - lng1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlng / 2.0).sin().powi(2);
    2.0 * r * a.sqrt().asin()
}

const EARTH_R_M: f64 = 6_371_000.0;

/// Squared equirectangular distance in metres², for cheap threshold tests at small
/// separations (no trig, no sqrt). `cos_lat` is `cos(reference latitude)`, precomputed
/// once per query point. Error vs haversine is sub-mm under ~1km — negligible for the
/// meter-scale radii dedup/find-nearby use. Compare against `threshold * threshold`.
#[inline]
pub(crate) fn equirect_m2(lat1: f64, lng1: f64, lat2: f64, lng2: f64, cos_lat: f64) -> f64 {
    let x = (lng2 - lng1).to_radians() * cos_lat;
    let y = (lat2 - lat1).to_radians();
    (x * x + y * y) * EARTH_R_M * EARTH_R_M
}

// --- Filter: field-level comparison predicates ---

/// Resolve a field name to its JSON value from a `Location` struct.
/// Built-in fields (lat, lng, heading, etc.) are accessed directly;
/// unknown fields fall through to `loc.extra`.
fn resolve_field_loc(loc: &Location, field: &str) -> Option<serde_json::Value> {
    match field {
        "lat" => Some(serde_json::json!(loc.lat)),
        "lng" => Some(serde_json::json!(loc.lng)),
        "heading" => Some(serde_json::json!(loc.heading)),
        "pitch" => Some(serde_json::json!(loc.pitch)),
        "zoom" => Some(serde_json::json!(loc.zoom)),
        "id" => Some(serde_json::json!(loc.id)),
        "createdAt" => Some(serde_json::json!(loc.created_at as f64)),
        "modifiedAt" => loc.modified_at.map(|ts| serde_json::json!(ts as f64)),
        _ => loc.extra.as_ref().and_then(|e| e.get(field).cloned()),
    }
}

/// Resolve a field name to its JSON value directly from Arrow columns (avoids
/// materializing a full `Location`). Falls through to `extras` JSON for unknown fields.
fn resolve_field_arrow(view: &LocView, idx: usize, field: &str) -> Option<serde_json::Value> {
    match field {
        "lat" => view.lats.map(|c| serde_json::json!(c.value(idx))),
        "lng" => view.lngs.map(|c| serde_json::json!(c.value(idx))),
        "heading" => view.headings.map(|c| serde_json::json!(c.value(idx))),
        "pitch" => view.pitches.map(|c| serde_json::json!(c.value(idx))),
        "zoom" => view.zooms.map(|c| serde_json::json!(c.value(idx))),
        "id" => view.ids.map(|c| serde_json::json!(c.value(idx))),
        "createdAt" => view.created_ats.map(|c| serde_json::json!(c.value(idx) as f64)),
        "modifiedAt" => view.modified_ats.and_then(|c| {
            if c.is_null(idx) { return None; }
            Some(serde_json::json!(c.value(idx) as f64))
        }),
        _ => {
            let extras = view.extras?;
            if extras.is_null(idx) { return None; }
            let map: serde_json::Map<String, serde_json::Value> = serde_json::from_str(extras.value(idx)).ok()?;
            map.get(field).cloned()
        }
    }
}

/// Core comparison dispatch. Supports eq, neq, has, nothas, gt, lt, gte, lte, between,
/// between_anyyear (month-day range ignoring year), and between_anytime (time-of-day range).
/// Numeric comparison is attempted first; falls back to lexicographic string comparison.
fn compare_filter(field_val: &serde_json::Value, op: &str, value: &serde_json::Value, value2: Option<&serde_json::Value>) -> bool {
    match op {
        "eq" => val_eq(field_val, value),
        "neq" => !val_eq(field_val, value),
        "has" => true,
        "nothas" => false,
        "gt" | "lt" | "gte" | "lte" | "between" => {
            let fv = as_f64(field_val);
            let cv = as_f64(value);
            match (fv, cv) {
                (Some(a), Some(b)) => match op {
                    "gt" => a > b,
                    "lt" => a < b,
                    "gte" => a >= b,
                    "lte" => a <= b,
                    "between" => {
                        let upper = value2.and_then(as_f64).unwrap_or(f64::MAX);
                        a >= b && a <= upper
                    }
                    _ => false,
                },
                _ => {
                    let fs = field_val.as_str().unwrap_or("");
                    let vs = value.as_str().unwrap_or("");
                    match op {
                        "gt" => fs > vs,
                        "lt" => fs < vs,
                        "gte" => fs >= vs,
                        "lte" => fs <= vs,
                        "between" => {
                            let upper = value2.and_then(|v| v.as_str()).unwrap_or("");
                            fs >= vs && fs <= upper
                        }
                        _ => false,
                    }
                }
            }
        }
        "between_anyyear" => {
            let lo = value.as_str().unwrap_or("");
            let hi = value2.and_then(|v| v.as_str()).unwrap_or("12-31");
            let fv_md = if let Some(ts) = as_f64(field_val) {
                let (m, d) = unix_to_month_day(ts);
                format!("{:02}-{:02}", m, d)
            } else if let Some(s) = field_val.as_str() {
                if s.len() >= 7 && s.as_bytes()[4] == b'-' {
                    if s.len() >= 10 { s[5..10].to_string() } else { format!("{}-01", &s[5..7]) }
                } else {
                    return false;
                }
            } else {
                return false;
            };
            if lo <= hi {
                fv_md.as_str() >= lo && fv_md.as_str() <= hi
            } else {
                fv_md.as_str() >= lo || fv_md.as_str() <= hi
            }
        }
        "between_anytime" => {
            let lo = value.as_str().unwrap_or("00:00");
            let hi = value2.and_then(|v| v.as_str()).unwrap_or("23:59");
            let fv_hm = if let Some(ts) = as_f64(field_val) {
                let (h, m) = unix_to_hour_min(ts);
                format!("{:02}:{:02}", h, m)
            } else {
                return false;
            };
            if lo <= hi {
                fv_hm.as_str() >= lo && fv_hm.as_str() <= hi
            } else {
                fv_hm.as_str() >= lo || fv_hm.as_str() <= hi
            }
        }
        _ => false,
    }
}

/// `between_local`: bucket a location's absolute `datetime` instant into its own
/// timezone before range-checking. `lo`/`hi` are wall-clock instants encoded as
/// UTC-epoch seconds (the numbers the user picked, the picker's wall-clock mode);
/// the location's `timezone` (IANA) supplies the DST-correct offset. Locations
/// lacking a resolvable `timezone` or `datetime` are excluded.
fn compare_local_tz(r: &RowRef, field: &str, lo: &serde_json::Value, hi: Option<&serde_json::Value>) -> bool {
    let ts = match r.resolve_field(field).as_ref().and_then(as_f64) {
        Some(t) => t,
        None => return false,
    };
    let tz_name = match r.resolve_field("timezone") {
        Some(serde_json::Value::String(s)) => s,
        _ => return false,
    };
    let offset = match tz_offset_seconds(&tz_name, ts) {
        Some(o) => o,
        None => return false,
    };
    let local = ts + offset as f64;
    let lo = as_f64(lo).unwrap_or(f64::MIN);
    let hi = hi.and_then(as_f64).unwrap_or(f64::MAX);
    local >= lo && local <= hi
}

/// Equality comparison with type coercion: tries numeric, then string, then JSON equality.
fn val_eq(a: &serde_json::Value, b: &serde_json::Value) -> bool {
    if a == b { return true; }
    if a.is_null() || b.is_null() { return false; }
    match (as_f64(a), as_f64(b)) {
        (Some(fa), Some(fb)) => fa == fb,
        _ => {
            let sa = val_to_str(a);
            let sb = val_to_str(b);
            !sa.is_empty() && sa == sb
        }
    }
}

/// Coerce a JSON value to a string for comparison. Numbers use their string repr.
fn val_to_str(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

/// Try to extract an f64 from a JSON value: native number or parseable string.
fn as_f64(v: &serde_json::Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

#[cfg(test)]
#[path = "selections.test.rs"]
mod tests;
