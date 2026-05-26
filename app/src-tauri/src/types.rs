//! Core data types shared across the Rust backend.
//!
//! These are the canonical definitions for locations and tags -- serialized to/from
//! Arrow IPC on disk, JSON over IPC to the JS frontend, and used throughout the
//! store, import, and selection engines.

/// A user-defined label that can be applied to any number of locations.
///
/// Tags are stored in `MapMeta` and referenced by id in each `Location.tags`.
/// The `count` field is maintained by callers during batch mutations, not by
/// the overlay add/remove methods.
#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, specta::Type)]
pub struct Tag {
    pub id: u32,
    pub name: String,
    /// Hex color string (e.g. "#3a7fc2"). Generated deterministically from
    /// the tag name via `util::color_for_name` when not explicitly set.
    pub color: String,
    #[serde(default = "default_visible")]
    pub visible: bool,
    /// Display order in the sidebar tag list. `None` for legacy tags
    /// that predate ordered insertion.
    #[serde(default)]
    pub order: Option<u32>,
    /// Number of locations currently carrying this tag. Denormalized for
    /// fast sidebar display -- kept in sync by callers after batch edits.
    #[serde(default)]
    pub count: usize,
}

fn default_visible() -> bool {
    true
}

/// A single Street View location on a map.
///
/// This is the atomic unit of data in the system. Locations are stored columnar
/// in Arrow IPC on disk and addressed by `id` everywhere. The `id` is unique
/// within a map and assigned by the store's monotonic allocator.
#[derive(Clone, Debug, PartialEq, serde::Deserialize, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    /// Monotonically increasing within a map. Zero is a sentinel meaning
    /// "not yet assigned" (used during import before IDs are allocated).
    #[serde(default)]
    pub id: u32,
    pub lat: f64,
    pub lng: f64,
    pub heading: f64,
    pub pitch: f64,
    /// Street View zoom level (0-5), not map zoom.
    pub zoom: f64,
    pub pano_id: Option<String>,
    /// Bitfield: bit 1 = LoadAsPanoId, bit 2 = Informational.
    pub flags: u32,
    /// Tag IDs applied to this location. References `Tag.id`.
    pub tags: Vec<u32>,
    /// Arbitrary key-value metadata from imports (e.g. GeoGuessr extra fields).
    /// Not populated by the editor itself -- preserved round-trip from import data.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[specta(type = Option<specta_typescript::Any>)]
    pub extra: Option<serde_json::Map<String, serde_json::Value>>,
    /// ISO 8601 timestamp, generated via `util::now_iso()`.
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
}
