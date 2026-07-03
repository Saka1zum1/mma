// Vendored from vali-rs @ e70fadd. Do not edit; regenerate instead.

pub mod bucketize;
pub mod distance;
pub mod distribute;
pub mod geohash;
pub use bucketize::{bucketize, nearby};
pub use distance::points_are_closer_than;
pub use distribute::{get_some, place_spaced, with_max_min_distance, DISTANCES};
pub use geohash::{bounding_box, encode, neighbors, BoundingBox, HashPrecision};
