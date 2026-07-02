// Vendored from vali-rs @ 3b22983. Do not edit; regenerate instead.

pub mod location;
pub mod map_definition;
pub use compact_str::CompactString;
pub use location::{GoogleData, Location, NominatimData, OsmData, RoadType};
pub use map_definition::{
    DistributionStrategy, GeometryFilterDef, LocationPreferenceFilterDef,
    LocationProbabilityDef, LocationWeightOverrideDef, MapDefinition, MapOutput,
    NeighborFilterDef, OrderedMap, ProximityFilterDef,
};
