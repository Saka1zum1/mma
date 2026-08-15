//! Oracle port, not general geometry. The constants and the order of operations mirror
//! Vali.Core exactly because the greedy distributor's accept/reject decisions cascade:
//! a "better" earth radius, a tighter early-out, or an added longitude wrap silently
//! forks generated maps. `mma-geo` stays the authority everywhere else -- do not route
//! these call sites to it. Gated by `tests/golden.rs` against the C# oracle vectors.

pub const DEG_TO_RAD: f64 = 0.017453292519943295769236907684886127;
const HALF_DEG_TO_RAD: f64 = DEG_TO_RAD * 0.5;
const METERS_PER_DEGREE_SQUARED: f64 = 6371137.0 * DEG_TO_RAD * (6371137.0 * DEG_TO_RAD);
const INVERSE_LAT_METERS_SQUARED: f64 = 1.0 / (110000.0 * 110000.0);
#[inline]
pub fn points_are_closer_than(
    lat1: f64,
    lon1: f64,
    lat2: f64,
    lon2: f64,
    meters_squared: f64,
) -> bool {
    let dlat = lat2 - lat1;
    if dlat * dlat > meters_squared * INVERSE_LAT_METERS_SQUARED {
        return false;
    }
    let dlon = lon2 - lon1;
    let cos_lat = ((lat1 + lat2) * HALF_DEG_TO_RAD).cos();
    let x = dlon * cos_lat;
    METERS_PER_DEGREE_SQUARED * (x * x + dlat * dlat) < meters_squared
}
