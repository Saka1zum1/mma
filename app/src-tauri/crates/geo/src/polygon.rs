//! Ray-casting point-in-polygon and bbox primitives, antimeridian-aware. Rings are
//! `[lng, lat]` vertex lists (GeoJSON order); a polygon is outer ring first, then holes.

use std::borrow::Cow;

/// Shortest signed longitude delta from `from` to `to`, in [-180, 180].
#[inline]
pub fn lng_delta(from: f64, to: f64) -> f64 {
    let d = (to - from) % 360.0;
    if d > 180.0 {
        d - 360.0
    } else if d < -180.0 {
        d + 360.0
    } else {
        d
    }
}

/// Rewrite longitudes so each vertex sits within 180° of its predecessor; the span may
/// run outside [-180, 180]. Edges of 180° or more fold the short way round - split them
/// first (JS `densifyRing`). Mirrors JS `unwrapRing`. Borrows when already continuous.
pub fn unwrap_ring(ring: &[[f64; 2]]) -> Cow<'_, [[f64; 2]]> {
    if ring.windows(2).all(|w| (w[1][0] - w[0][0]).abs() <= 180.0) {
        return Cow::Borrowed(ring);
    }
    let mut out = Vec::with_capacity(ring.len());
    out.push(ring[0]);
    let mut prev = ring[0][0];
    for &[lng, lat] in &ring[1..] {
        prev += lng_delta(prev, lng);
        out.push([prev, lat]);
    }
    Cow::Owned(out)
}

/// Shift `lng` by whole turns into `[min, min + 360)`.
#[inline]
pub fn fold_lng(lng: f64, min: f64) -> f64 {
    min + (lng - min).rem_euclid(360.0)
}

/// Ray-casting algorithm: cast a horizontal ray eastward from (lng, lat) and count
/// edge crossings. Odd count = inside. O(V) where V = vertices.
pub fn point_in_ring(lng: f64, lat: f64, ring: &[[f64; 2]]) -> bool {
    if ring.is_empty() {
        return false;
    }
    let ring = unwrap_ring(ring);
    let min = ring.iter().map(|v| v[0]).fold(f64::INFINITY, f64::min);
    ring_test_raw(fold_lng(lng, min), lat, &ring)
}

/// Crossing-number loop with no per-edge folding; callers pre-fold both the ring and
/// the test longitude into one frame.
#[inline]
fn ring_test_raw(lng: f64, lat: f64, ring: &[[f64; 2]]) -> bool {
    let mut inside = false;
    let n = ring.len();
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let [xi, yi] = ring[i];
        let [xj, yj] = ring[j];
        if ((yi > lat) != (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
        j = i;
    }
    inside
}

/// One ring preprocessed for repeated point tests: the unwrap pass and the bbox are
/// paid once here instead of once per tested point, so the crossing-number loop runs
/// branch-free over longitudes already in the ring's own frame.
pub struct PreparedRing<'a> {
    ring: Cow<'a, [[f64; 2]]>,
    /// `[min_lng, min_lat, max_lng, max_lat]` in the unwrapped ring's frame, so
    /// `min_lng` may sit below -180 and `max_lng` above it.
    bb: [f64; 4],
}

impl<'a> PreparedRing<'a> {
    pub fn new(ring: &'a [[f64; 2]]) -> Self {
        let ring = unwrap_ring(ring);
        let mut bb = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
        let mut any = false;
        extend_bbox_with_ring(&mut bb, &mut any, &ring);
        Self { ring, bb }
    }

    /// Bbox reject, then the raw crossing test. Equivalent to `point_in_ring`.
    #[inline]
    pub fn contains(&self, lng: f64, lat: f64) -> bool {
        let lng = fold_lng(lng, self.bb[0]);
        lng <= self.bb[2]
            && lat >= self.bb[1]
            && lat <= self.bb[3]
            && ring_test_raw(lng, lat, &self.ring)
    }
}

/// Test point-in-polygon with holes over rings yielded as slices: inside the outer
/// ring (first) and outside all hole rings (rest). The single source of truth for the
/// outer/hole composition, shared by owned `Vec`-backed and mmap'd archived geometry.
pub fn polygon_contains<'a>(
    lng: f64,
    lat: f64,
    mut rings: impl Iterator<Item = &'a [[f64; 2]]>,
) -> bool {
    let Some(outer) = rings.next() else {
        return false;
    };
    if !point_in_ring(lng, lat, outer) {
        return false;
    }
    for hole in rings {
        if point_in_ring(lng, lat, hole) {
            return false;
        }
    }
    true
}

/// Grow a running `[min_lng, min_lat, max_lng, max_lat]` to cover one ring, unwrapped
/// then shifted by whole turns to sit nearest the box so far. `any` flips true once at
/// least one vertex has been seen. Shared by owned and archived bbox computation.
pub fn extend_bbox_with_ring(bb: &mut [f64; 4], any: &mut bool, ring: &[[f64; 2]]) {
    let ring = unwrap_ring(ring);
    let (mut lo, mut hi) = (f64::MAX, f64::MIN);
    for &[lng, _] in ring.iter() {
        lo = lo.min(lng);
        hi = hi.max(lng);
    }
    if lo > hi {
        return;
    }
    let shift = if *any {
        (((bb[0] + bb[2]) - (lo + hi)) / 720.0).round() * 360.0
    } else {
        0.0
    };
    for &[lng, lat] in ring.iter() {
        let lng = lng + shift;
        if lng < bb[0] {
            bb[0] = lng;
        }
        if lat < bb[1] {
            bb[1] = lat;
        }
        if lng > bb[2] {
            bb[2] = lng;
        }
        if lat > bb[3] {
            bb[3] = lat;
        }
        *any = true;
    }
}

/// Slide a finished box so its western edge sits in [-180, 180), letting the hot
/// `in_bbox` fold a test longitude with one conditional add instead of a modulo.
#[inline]
pub fn anchor_bbox(bb: &mut [f64; 4]) {
    let shift = -((bb[0] + 180.0) / 360.0).floor() * 360.0;
    bb[0] += shift;
    bb[2] += shift;
}

/// `bb` is `[min_lng, min_lat, max_lng, max_lat]` with `min_lng` anchored in [-180, 180)
/// by `anchor_bbox`; `max_lng` may run past 180 when the box crosses the antimeridian.
/// Requires a test longitude in [-180, 180]; out-of-range longitudes miss.
#[inline]
pub fn in_bbox(lng: f64, lat: f64, bb: &[f64; 4]) -> bool {
    if lat < bb[1] || lat > bb[3] {
        return false;
    }
    let lng = if lng < bb[0] { lng + 360.0 } else { lng };
    lng <= bb[2]
}
