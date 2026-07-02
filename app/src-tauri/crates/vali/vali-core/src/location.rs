// Vendored from vali-rs @ 3b22983. Do not edit; regenerate instead.

use compact_str::CompactString;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
pub type RoadType = u32;
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Location {
    pub node_id: i64,
    pub lat: f64,
    pub lng: f64,
    pub google: GoogleData,
    pub osm: OsmData,
    pub nominatim: NominatimData,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GoogleData {
    pub pano_id: CompactString,
    pub lat: f64,
    pub lng: f64,
    pub default_heading: f64,
    pub country_code: CompactString,
    pub year: i32,
    pub month: i32,
    pub driving_direction_angle: i32,
    pub arrow_count: i32,
    pub elevation: Option<i32>,
    pub description_length: Option<i32>,
    pub is_scout: bool,
    pub resolution_height: i32,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct OsmData {
    pub buildings10: i32,
    pub buildings25: i32,
    pub buildings100: i32,
    pub buildings200: i32,
    pub roads10: i32,
    pub roads25: i32,
    pub roads50: i32,
    pub roads100: i32,
    pub roads200: i32,
    pub tunnels10: i32,
    pub tunnels200: i32,
    pub is_residential: bool,
    pub surface: Option<CompactString>,
    pub roads0: i32,
    pub closest_coast: Option<i32>,
    pub road_type: RoadType,
    pub closest_lake: Option<i32>,
    pub closest_river: Option<i32>,
    pub closest_railway: Option<i32>,
    pub way_ids: SmallVec<[i64; 2]>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct NominatimData {
    pub country_code: CompactString,
    pub subdivision_code: CompactString,
    pub county: Option<CompactString>,
}
