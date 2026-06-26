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
    pub id: u32,
    pub lat: f64,
    pub lng: f64,
    pub heading: f64,
    pub pitch: f64,
    pub zoom: f64,
    pub pano_id: Option<String>,
    /// See [`LocationFlags`].
    pub flags: LocationFlags,
    /// Tag IDs applied to this location. References `Tag.id`.
    pub tags: Vec<u32>,
    /// Arbitrary key-value metadata
    #[specta(type = Option<specta_typescript::Any>)]
    pub extra: Option<serde_json::Map<String, serde_json::Value>>,
    /// Unix timestamp (seconds)
    pub created_at: u32,
    pub modified_at: Option<u32>,
}

bitflags::bitflags! {
    /// Per-location bitfield. Serializes as a plain `u32` over IPC and Arrow so the
    /// JS side (which models the bits with its own `LocationFlag` enum) is unaffected.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
    pub struct LocationFlags: u32 {
        const LOAD_AS_PANO_ID = 1;
        const INFORMATIONAL = 2;
    }
}

impl serde::Serialize for LocationFlags {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_u32(self.bits())
    }
}

impl<'de> serde::Deserialize<'de> for LocationFlags {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::from_bits_retain(<u32 as serde::Deserialize>::deserialize(d)?))
    }
}

impl specta::Type for LocationFlags {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <u32 as specta::Type>::definition(types)
    }
}

/// Error type for every fallible backend operation and Tauri command.
#[derive(Debug, Clone)]
pub struct AppError(pub String);

/// Result alias for backend operations and commands.
pub type AppResult<T> = Result<T, AppError>;

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for AppError {}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

impl specta::Type for AppError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <String as specta::Type>::definition(types)
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self { AppError(s) }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self { AppError(s.to_string()) }
}

macro_rules! impl_app_error_from {
    ($($t:ty),* $(,)?) => {$(
        impl From<$t> for AppError {
            fn from(e: $t) -> Self { AppError(e.to_string()) }
        }
    )*};
}

impl_app_error_from!(
    std::io::Error,
    rusqlite::Error,
    serde_json::Error,
    arrow::error::ArrowError,
    rmp_serde::encode::Error,
    rmp_serde::decode::Error,
    tauri::Error,
    tokio::task::JoinError,
    zip::result::ZipError,
    reqwest::Error,
);

// `PoisonError<T>` is generic; Display is unconditional, so one blanket covers all lock types.
impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(e: std::sync::PoisonError<T>) -> Self { AppError(e.to_string()) }
}
