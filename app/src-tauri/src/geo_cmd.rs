//! Polygon sampling commands used by the map generator: honeycomb grid, random
//! and Poisson fills, point-in-polygon, and bounds.

use crate::selections::PolygonGeometry;
use crate::types::{AppError, AppResult};

/// One row of honeycomb points: `count` points from `lng` eastward, each `lngStep` degrees
/// apart.
#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HoneycombRun {
    pub lat: f64,
    pub lng: f64,
    pub lng_step: f64,
    pub count: u32,
}

/// The points of a honeycomb about `spacingM` metres apart that fall inside the polygon,
/// one entry per row of points.
#[tauri::command]
#[specta::specta]
pub async fn honeycomb_points(
    polygon: PolygonGeometry,
    spacing_m: f64,
) -> AppResult<Vec<HoneycombRun>> {
    if !(spacing_m.is_finite() && spacing_m >= 1.0) {
        return Err(AppError::from(
            "honeycomb_points: spacing_m must be at least 1 metre",
        ));
    }
    let polygons: Vec<Vec<Vec<[f64; 2]>>> = polygon.parts().map(<[_]>::to_vec).collect();
    let mut bb = [f64::MAX, f64::MAX, f64::MIN, f64::MIN];
    let mut any = false;
    for outer in polygons.iter().filter_map(|p| p.first()) {
        mma_geo::extend_bbox_with_ring(&mut bb, &mut any, outer);
    }
    if !any {
        return Ok(Vec::new());
    }
    let grid = mma_geo::HexGrid::new(
        (bb[1] + bb[3]) / 2.0,
        mma_geo::fold_lng((bb[0] + bb[2]) / 2.0, -180.0),
        spacing_m,
    );
    let mut runs = Vec::new();
    grid.for_each_run(&polygons, |lat, lng, lng_step, count| {
        runs.push(HoneycombRun {
            lat,
            lng,
            lng_step,
            count,
        })
    });
    Ok(runs)
}

/// Up to `count` points drawn uniformly at random inside the polygon, as `[lng, lat]`
/// pairs. Fewer come back when the polygon fills little of its bounding box.
#[tauri::command]
#[specta::specta]
pub async fn polygon_random_points(polygon: PolygonGeometry, count: u32) -> Vec<[f64; 2]> {
    mma_geo::random_points(&polygon.prepared(), count as usize, fastrand::f64)
}

/// Points covering the polygon with no two closer than `spacingM` metres and no gap
/// wider than about twice that, in random order.
#[tauri::command]
#[specta::specta]
pub async fn polygon_poisson_points(
    polygon: PolygonGeometry,
    spacing_m: f64,
) -> AppResult<Vec<[f64; 2]>> {
    if !(spacing_m.is_finite() && spacing_m >= 1.0) {
        return Err(AppError::from(
            "polygon_poisson_points: spacing_m must be at least 1 metre",
        ));
    }
    Ok(mma_geo::poisson_points(
        &polygon.prepared(),
        spacing_m,
        fastrand::f64,
    ))
}

/// Whether each of the points sits inside the polygon.
#[tauri::command]
#[specta::specta]
pub async fn polygon_contains_points(
    polygon: PolygonGeometry,
    lats: Vec<f64>,
    lngs: Vec<f64>,
) -> AppResult<Vec<bool>> {
    if lats.len() != lngs.len() {
        return Err(AppError::from(
            "polygon_contains_points: lats and lngs must be the same length",
        ));
    }
    let prepared = polygon.prepared();
    Ok(lats
        .iter()
        .zip(&lngs)
        .map(|(&lat, &lng)| prepared.contains(lng, lat))
        .collect())
}

/// Bounding box `[west, south, east, north]` of the polygon itself, or `null` when it
/// has no vertices. `west > east` means the box crosses the antimeridian.
#[tauri::command]
#[specta::specta]
pub async fn polygon_bounds(polygon: PolygonGeometry) -> Option<[f64; 4]> {
    Some(crossing_bounds(polygon.prepared().bbox()?))
}

/// An anchored bbox in the crossing form: both edges in [-180, 180), `west > east` when
/// the box spans the antimeridian, the whole world when the span reaches a full turn
/// (folding both edges of that box would collapse it to zero width).
fn crossing_bounds([w, s, e, n]: [f64; 4]) -> [f64; 4] {
    if e - w >= 360.0 {
        return [-180.0, s, 180.0, n];
    }
    [
        mma_geo::fold_lng(w, -180.0),
        s,
        mma_geo::fold_lng(e, -180.0),
        n,
    ]
}
