use super::*;
use crate::types::Location;
use crate::arrow_bridge::locations_to_batch;

fn loc(id: u32, lat: f64, lng: f64) -> Location {
    Location {
        id, lat, lng, heading: 0.0, pitch: 0.0, zoom: 1.0,
        pano_id: None, flags: crate::types::LocationFlags::empty(), tags: vec![], extra: None,
        created_at: 0, modified_at: None,
    }
}

fn make_view<'a>(
    batch: Option<&'a RecordBatch>,
    dead: &'a HashSet<u32>,
    patches: &'a HashMap<u32, Location>,
    adds: &'a [Location],
) -> LocView<'a> {
    LocView::new(batch, dead, patches, adds, None)
}

// for_each must visit every alive location exactly once, overlay applied: dead rows
// skipped, patched rows surfaced with the patch's coordinates, then the overlay adds.
#[test]
fn for_each_visits_alive_overlay_applied() {
    let base = vec![loc(1, 1.0, 1.0), loc(2, 2.0, 2.0), loc(3, 3.0, 3.0)];
    let batch = locations_to_batch(&base);

    let mut dead = HashSet::new();
    dead.insert(2); // removed

    let mut patches = HashMap::new();
    patches.insert(3, loc(3, 30.0, 30.0)); // moved

    let adds = vec![loc(4, 4.0, 4.0)];
    let view = make_view(Some(&batch), &dead, &patches, &adds);

    let mut seen: Vec<(u32, f64, f64)> = Vec::new();
    view.for_each(|row| {
        seen.push((row.id(), row.lat(), row.lng()));
    });

    // id 1 from base, id 2 skipped (dead), id 3 with patched coords, id 4 the add.
    assert_eq!(seen, vec![(1, 1.0, 1.0), (3, 30.0, 30.0), (4, 4.0, 4.0)]);
}

// -----------------------------------------------------------------------
// Geometry: point_in_ring / point_in_polygon
// -----------------------------------------------------------------------

#[test]
fn point_inside_square() {
    let ring = vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]];
    assert!(point_in_ring(5.0, 5.0, &ring));
}

#[test]
fn point_outside_square() {
    let ring = vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]];
    assert!(!point_in_ring(15.0, 5.0, &ring));
}

#[test]
fn point_in_polygon_with_hole() {
    let outer = vec![[0.0, 0.0], [20.0, 0.0], [20.0, 20.0], [0.0, 20.0], [0.0, 0.0]];
    let hole = vec![[5.0, 5.0], [15.0, 5.0], [15.0, 15.0], [5.0, 15.0], [5.0, 5.0]];
    let coords = vec![outer, hole];
    assert!(point_in_polygon(2.0, 2.0, &coords)); // outside hole, inside outer
    assert!(!point_in_polygon(10.0, 10.0, &coords)); // inside hole
}

#[test]
fn point_in_geometry_extra_polygons() {
    let main = vec![vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]];
    let extra = vec![vec![[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0], [20.0, 20.0]]];
    let geom = PolygonGeometry {
        coordinates: main,
        extra_polygons: Some(vec![extra]),
        properties: None,
    };
    assert!(point_in_geometry(5.0, 5.0, &geom));
    assert!(point_in_geometry(25.0, 25.0, &geom));
    assert!(!point_in_geometry(15.0, 15.0, &geom));
}

// -----------------------------------------------------------------------
// Polygon bbox broad-phase reject
// -----------------------------------------------------------------------

#[test]
fn geometry_bbox_spans_all_rings() {
    // Outer [0..10] plus an extra polygon [20..30] -> bbox covers both.
    let main = vec![vec![[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]];
    let extra = vec![vec![[20.0, 20.0], [30.0, 20.0], [30.0, 30.0], [20.0, 30.0], [20.0, 20.0]]];
    let geom = PolygonGeometry { coordinates: main, extra_polygons: Some(vec![extra]), properties: None };
    // [min_lng, min_lat, max_lng, max_lat]
    assert_eq!(geometry_bbox(&geom), Some([0.0, 0.0, 30.0, 30.0]));
    assert_eq!(geometry_bbox(&PolygonGeometry { coordinates: vec![], extra_polygons: None, properties: None }), None);
}

#[test]
fn in_bbox_edges_and_outside() {
    let bb = [0.0, 0.0, 10.0, 10.0]; // min_lng, min_lat, max_lng, max_lat
    assert!(in_bbox(5.0, 5.0, &bb));
    assert!(in_bbox(0.0, 0.0, &bb)); // corner inclusive
    assert!(in_bbox(10.0, 10.0, &bb));
    assert!(!in_bbox(-0.1, 5.0, &bb));
    assert!(!in_bbox(5.0, 10.1, &bb));
}

// The bbox reject must not change WHICH points a polygon selection returns. The
// tricky case is a point inside the bbox but outside the (concave) polygon: the
// broad-phase lets it through, the full crossing test must still exclude it.
#[test]
fn polygon_resolve_matches_full_test_with_bbox_reject() {
    // L-shaped (concave) polygon: covers bbox [0..10]x[0..10] but the top-right
    // quadrant (>5,>5) is carved out.
    let l_shape = vec![vec![
        [0.0, 0.0], [10.0, 0.0], [10.0, 5.0], [5.0, 5.0], [5.0, 10.0], [0.0, 10.0], [0.0, 0.0],
    ]];
    let geom = PolygonGeometry { coordinates: l_shape, extra_polygons: None, properties: None };

    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![
        loc(1, 1.0, 1.0),   // inside L  -> selected
        loc(2, 8.0, 8.0),   // inside bbox, in the carved-out notch -> NOT selected
        loc(3, 50.0, 50.0), // outside bbox -> rejected by broad-phase
        loc(4, 1.0, 8.0),   // inside L (left column) -> selected
    ];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Polygon {
        polygon: geom.clone(),
        include_informational: true,
    });
    assert!(ids.contains(&1));
    assert!(!ids.contains(&2)); // bbox would include it; full test must exclude
    assert!(!ids.contains(&3));
    assert!(ids.contains(&4));

    // Cross-check: resolve agrees with point_in_geometry applied directly.
    for l in &adds {
        let want = point_in_geometry(l.lng, l.lat, &geom);
        assert_eq!(ids.contains(&l.id), want, "mismatch for loc {}", l.id);
    }
}

// -----------------------------------------------------------------------
// Antimeridian
// -----------------------------------------------------------------------

#[test]
fn point_in_ring_across_antimeridian() {
    // Polygon spanning the antimeridian: 170E to 170W (i.e., 170 to -170)
    let ring = vec![
        [170.0, -10.0], [-170.0, -10.0], [-170.0, 10.0], [170.0, 10.0], [170.0, -10.0],
    ];
    assert!(point_in_ring(175.0, 0.0, &ring));   // inside, east side
    assert!(point_in_ring(-175.0, 0.0, &ring));  // inside, west side
    assert!(point_in_ring(180.0, 0.0, &ring));   // on the dateline
    assert!(!point_in_ring(160.0, 0.0, &ring));  // outside, well west
    assert!(!point_in_ring(-160.0, 0.0, &ring)); // outside, well east
    assert!(!point_in_ring(0.0, 0.0, &ring));    // outside, other side of world
}

#[test]
fn geometry_bbox_antimeridian() {
    let ring = vec![
        [170.0, -10.0], [-170.0, -10.0], [-170.0, 10.0], [170.0, 10.0], [170.0, -10.0],
    ];
    let geom = PolygonGeometry { coordinates: vec![ring], extra_polygons: None, properties: None };
    let bb = geometry_bbox(&geom).unwrap();
    // After normalization: 170 and 190 (= -170 + 360)
    assert_eq!(bb[0], 170.0); // min_lng
    assert_eq!(bb[2], 190.0); // max_lng

    // in_bbox handles the normalized space transparently
    assert!(in_bbox(175.0, 0.0, &bb));
    assert!(in_bbox(-175.0, 0.0, &bb)); // negative lng auto-shifted
    assert!(!in_bbox(0.0, 0.0, &bb));
}

#[test]
fn polygon_resolve_across_antimeridian() {
    let ring = vec![
        [170.0, -10.0], [-170.0, -10.0], [-170.0, 10.0], [170.0, 10.0], [170.0, -10.0],
    ];
    let geom = PolygonGeometry { coordinates: vec![ring], extra_polygons: None, properties: None };
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![
        loc(1, 5.0, 175.0),   // inside (east of dateline)
        loc(2, 5.0, -175.0),  // inside (west of dateline)
        loc(3, 5.0, 0.0),     // outside (other side of world)
        loc(4, 5.0, 160.0),   // outside (west of polygon)
    ];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Polygon {
        polygon: geom,
        include_informational: true,
    });
    assert!(ids.contains(&1));
    assert!(ids.contains(&2));
    assert!(!ids.contains(&3));
    assert!(!ids.contains(&4));
}

#[test]
fn point_in_ring_unwrapped_antimeridian() {
    // Rectangle-style unwrapped: east > 180 instead of negative
    let ring = vec![
        [170.0, -10.0], [190.0, -10.0], [190.0, 10.0], [170.0, 10.0], [170.0, -10.0],
    ];
    assert!(point_in_ring(175.0, 0.0, &ring));
    assert!(point_in_ring(-175.0, 0.0, &ring)); // = 185 after normalization
    assert!(!point_in_ring(0.0, 0.0, &ring));
    assert!(!point_in_ring(160.0, 0.0, &ring));
}

#[test]
fn polygon_resolve_unwrapped_antimeridian() {
    // Rectangle-mode coordinates: east=190 instead of -170
    let ring = vec![
        [170.0, -10.0], [190.0, -10.0], [190.0, 10.0], [170.0, 10.0], [170.0, -10.0],
    ];
    let geom = PolygonGeometry { coordinates: vec![ring], extra_polygons: None, properties: None };
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![
        loc(1, 5.0, 175.0),   // inside
        loc(2, 5.0, -175.0),  // inside (other side of IDL)
        loc(3, 5.0, 0.0),     // outside
    ];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Polygon {
        polygon: geom,
        include_informational: true,
    });
    assert!(ids.contains(&1));
    assert!(ids.contains(&2));
    assert!(!ids.contains(&3));
}

// -----------------------------------------------------------------------
// Haversine
// -----------------------------------------------------------------------

#[test]
fn haversine_zero_distance() {
    assert_eq!(haversine_m(0.0, 0.0, 0.0, 0.0), 0.0);
}

#[test]
fn haversine_known_distance() {
    // London to Paris ~ 343 km
    let d = haversine_m(51.5074, -0.1278, 48.8566, 2.3522);
    assert!((d - 343_500.0).abs() < 5000.0, "London-Paris should be ~343km, got {:.0}m", d);
}

// -----------------------------------------------------------------------
// compare_filter
// -----------------------------------------------------------------------

#[test]
fn filter_eq_string() {
    assert!(compare_filter(&serde_json::json!("BR"), "eq", &serde_json::json!("BR"), None));
    assert!(!compare_filter(&serde_json::json!("US"), "eq", &serde_json::json!("BR"), None));
}

#[test]
fn filter_neq() {
    assert!(compare_filter(&serde_json::json!("US"), "neq", &serde_json::json!("BR"), None));
    assert!(!compare_filter(&serde_json::json!("BR"), "neq", &serde_json::json!("BR"), None));
}

#[test]
fn filter_gt_numeric() {
    assert!(compare_filter(&serde_json::json!(100), "gt", &serde_json::json!(50), None));
    assert!(!compare_filter(&serde_json::json!(50), "gt", &serde_json::json!(100), None));
}

#[test]
fn filter_between() {
    assert!(compare_filter(&serde_json::json!(500), "between", &serde_json::json!(100), Some(&serde_json::json!(1000))));
    assert!(!compare_filter(&serde_json::json!(50), "between", &serde_json::json!(100), Some(&serde_json::json!(1000))));
}

#[test]
fn filter_between_anyyear_normal_range() {
    // April 15 2023 00:00 UTC = 1681516800
    let apr15 = serde_json::json!(1681516800.0);
    // May 1 2021 00:00 UTC = 1619827200
    let may1 = serde_json::json!(1619827200.0);
    // June 10 2020 00:00 UTC = 1591747200
    let jun10 = serde_json::json!(1591747200.0);

    let lo = serde_json::json!("04-15");
    let hi = serde_json::json!("05-15");

    assert!(compare_filter(&apr15, "between_anyyear", &lo, Some(&hi)));
    assert!(compare_filter(&may1, "between_anyyear", &lo, Some(&hi)));
    assert!(!compare_filter(&jun10, "between_anyyear", &lo, Some(&hi)));
}

#[test]
fn filter_between_anyyear_wrapping_range() {
    // Dec 1 2022 00:00 UTC = 1669852800
    let dec1 = serde_json::json!(1669852800.0);
    // Jan 15 2023 00:00 UTC = 1673740800
    let jan15 = serde_json::json!(1673740800.0);
    // July 4 2021 00:00 UTC = 1625356800
    let jul4 = serde_json::json!(1625356800.0);

    let lo = serde_json::json!("11-15");
    let hi = serde_json::json!("02-15");

    assert!(compare_filter(&dec1, "between_anyyear", &lo, Some(&hi)));
    assert!(compare_filter(&jan15, "between_anyyear", &lo, Some(&hi)));
    assert!(!compare_filter(&jul4, "between_anyyear", &lo, Some(&hi)));
}

#[test]
fn filter_between_anyyear_string_field() {
    let ym = serde_json::json!("2023-04");
    let lo = serde_json::json!("03-01");
    let hi = serde_json::json!("05-01");
    assert!(compare_filter(&ym, "between_anyyear", &lo, Some(&hi)));

    let ym_out = serde_json::json!("2023-07");
    assert!(!compare_filter(&ym_out, "between_anyyear", &lo, Some(&hi)));
}

#[test]
fn filter_between_anytime_normal_range() {
    // 2023-04-15 14:30 UTC = 1681567800
    let ts_1430 = serde_json::json!(1681567800.0);
    // 2021-05-01 08:00 UTC = 1619856000
    let ts_0800 = serde_json::json!(1619856000.0);
    // 2020-06-10 22:00 UTC = 1591826400
    let ts_2200 = serde_json::json!(1591826400.0);

    let lo = serde_json::json!("08:00");
    let hi = serde_json::json!("15:00");

    assert!(compare_filter(&ts_1430, "between_anytime", &lo, Some(&hi)));
    assert!(compare_filter(&ts_0800, "between_anytime", &lo, Some(&hi)));
    assert!(!compare_filter(&ts_2200, "between_anytime", &lo, Some(&hi)));
}

#[test]
fn filter_between_anytime_wrapping_range() {
    // 2023-01-01 23:00 UTC = 1672614000
    let ts_2300 = serde_json::json!(1672614000.0);
    // 2023-01-01 02:00 UTC = 1672538400
    let ts_0200 = serde_json::json!(1672538400.0);
    // 2023-01-01 12:00 UTC = 1672574400
    let ts_1200 = serde_json::json!(1672574400.0);

    let lo = serde_json::json!("22:00");
    let hi = serde_json::json!("06:00");

    assert!(compare_filter(&ts_2300, "between_anytime", &lo, Some(&hi)));
    assert!(compare_filter(&ts_0200, "between_anytime", &lo, Some(&hi)));
    assert!(!compare_filter(&ts_1200, "between_anytime", &lo, Some(&hi)));
}

#[test]
fn filter_between_anytime_string_field_returns_false() {
    let ym = serde_json::json!("2023-04");
    let lo = serde_json::json!("08:00");
    let hi = serde_json::json!("15:00");
    assert!(!compare_filter(&ym, "between_anytime", &lo, Some(&hi)));
}

#[test]
fn filter_has_nothas() {
    assert!(compare_filter(&serde_json::json!("anything"), "has", &serde_json::json!(null), None));
    assert!(!compare_filter(&serde_json::json!("anything"), "nothas", &serde_json::json!(null), None));
}

#[test]
fn val_eq_same_type() {
    assert!(val_eq(&serde_json::json!("BR"), &serde_json::json!("BR")));
    assert!(val_eq(&serde_json::json!(42), &serde_json::json!(42)));
    assert!(!val_eq(&serde_json::json!("a"), &serde_json::json!("b")));
}

#[test]
fn val_eq_cross_type() {
    // number vs string
    assert!(val_eq(&serde_json::json!(2), &serde_json::json!("2")));
    assert!(val_eq(&serde_json::json!("2"), &serde_json::json!(2)));
    assert!(val_eq(&serde_json::json!(10), &serde_json::json!("10")));
    assert!(!val_eq(&serde_json::json!(2), &serde_json::json!("3")));
    // float vs int
    assert!(val_eq(&serde_json::json!(2.0), &serde_json::json!(2)));
    assert!(val_eq(&serde_json::json!(100), &serde_json::json!(100.0)));
    // float vs string
    assert!(val_eq(&serde_json::json!(3.5), &serde_json::json!("3.5")));
    // bool never equals number/string
    assert!(!val_eq(&serde_json::json!(true), &serde_json::json!(1)));
    assert!(!val_eq(&serde_json::json!(true), &serde_json::json!("true")));
    // null
    assert!(val_eq(&serde_json::json!(null), &serde_json::json!(null)));
    assert!(!val_eq(&serde_json::json!(null), &serde_json::json!(0)));
    assert!(!val_eq(&serde_json::json!(null), &serde_json::json!("")));
}

// -----------------------------------------------------------------------
// resolve with LocView (overlay adds only, no batch)
// -----------------------------------------------------------------------

#[test]
fn resolve_everything() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![loc(1, 10.0, 20.0), loc(2, 30.0, 40.0)];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Everything);
    assert_eq!(ids.len(), 2);
}

#[test]
fn resolve_tag_on_adds() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.tags = vec![10];
    let l2 = loc(2, 0.0, 0.0);
    let adds = vec![l1, l2];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Tag { tag_id: 10 });
    assert_eq!(ids, vec![1]);
}

#[test]
fn resolve_untagged() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.tags = vec![10];
    let l2 = loc(2, 0.0, 0.0);
    let adds = vec![l1, l2];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Untagged);
    assert_eq!(ids, vec![2]);
}

#[test]
fn resolve_reviewed_is_an_id_set_leaf_over_batch() {
    let locs = vec![loc(1, 0.0, 0.0), loc(2, 0.0, 0.0), loc(3, 0.0, 0.0), loc(4, 0.0, 0.0)];
    let batch = locations_to_batch(&locs);
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds: Vec<Location> = vec![];
    let view = make_view(Some(&batch), &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Reviewed {
        locations: vec![2, 4],
        session_id: "abc".into(),
        mode: "reviewed".into(),
    });
    assert_eq!(ids, vec![2, 4]);
}

#[test]
fn resolve_reviewed_on_adds() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![loc(1, 0.0, 0.0), loc(2, 0.0, 0.0), loc(3, 0.0, 0.0)];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Reviewed {
        locations: vec![1, 3],
        session_id: "s".into(),
        mode: "unreviewed".into(),
    });
    assert_eq!(ids, vec![1, 3]);
}

// -----------------------------------------------------------------------
// Tag membership index (roaring fast-path) — must match the scan path exactly.
// -----------------------------------------------------------------------

// Build a batch of tagged locations + the matching tag index, so the indexed Tag
// leaf and the scan-path Tag leaf can be compared on identical data.
fn tagged_batch_and_index(locs: &[Location]) -> (RecordBatch, HashMap<u32, RoaringBitmap>) {
    let batch = locations_to_batch(locs);
    let mut sets: HashMap<u32, RoaringBitmap> = HashMap::new();
    for l in locs {
        for &t in &l.tags { sets.entry(t).or_default().insert(l.id); }
    }
    (batch, sets)
}

#[test]
fn tag_index_matches_scan_path() {
    let mut a = loc(1, 0.0, 0.0); a.tags = vec![10, 20];
    let mut b = loc(2, 0.0, 0.0); b.tags = vec![20];
    let mut c = loc(3, 0.0, 0.0); c.tags = vec![10];
    let locs = vec![a, b, c];
    let (batch, sets) = tagged_batch_and_index(&locs);
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds: Vec<Location> = vec![];

    let scan = LocView::new(Some(&batch), &dead, &patches, &adds, None);
    let idx = LocView::new(Some(&batch), &dead, &patches, &adds, Some(&sets));

    for tag_id in [10u32, 20, 99] {
        let s = resolve(&scan, &SelectionProps::Tag { tag_id });
        let i = resolve(&idx, &SelectionProps::Tag { tag_id });
        assert_eq!(s, i, "tag {tag_id}: scan {s:?} != index {i:?}");
    }
    // sanity on the actual membership
    assert_eq!(resolve(&idx, &SelectionProps::Tag { tag_id: 10 }), vec![1, 3]);
}

#[test]
fn tag_index_excludes_dead_includes_adds() {
    let mut a = loc(1, 0.0, 0.0); a.tags = vec![10];
    let mut b = loc(2, 0.0, 0.0); b.tags = vec![10];
    let (batch, sets) = tagged_batch_and_index(&[a, b]);
    let mut dead = HashSet::new();
    dead.insert(2u32); // kill row 2
    let patches = HashMap::new();
    let mut add = loc(3, 0.0, 0.0); add.tags = vec![10]; // overlay add carries the tag
    let adds = vec![add];

    let idx = LocView::new(Some(&batch), &dead, &patches, &adds, Some(&sets));
    // 2 is dead -> excluded; 3 is an overlay add -> included; 1 stays.
    assert_eq!(resolve(&idx, &SelectionProps::Tag { tag_id: 10 }), vec![1, 3]);
}

#[test]
fn tag_index_honors_patches() {
    // Base: loc 1 has tag 10, loc 2 has nothing. Index reflects the base.
    let mut a = loc(1, 0.0, 0.0); a.tags = vec![10];
    let b = loc(2, 0.0, 0.0);
    let (batch, sets) = tagged_batch_and_index(&[a, b]);
    let dead = HashSet::new();
    // Patch: loc 1 LOSES tag 10, loc 2 GAINS tag 10 (uncommitted edits the index can't see).
    let mut p1 = loc(1, 0.0, 0.0); p1.tags = vec![];
    let mut p2 = loc(2, 0.0, 0.0); p2.tags = vec![10];
    let mut patches = HashMap::new();
    patches.insert(1u32, p1);
    patches.insert(2u32, p2);
    let adds: Vec<Location> = vec![];

    let idx = LocView::new(Some(&batch), &dead, &patches, &adds, Some(&sets));
    // Patches must override the stale index: 1 dropped, 2 added.
    assert_eq!(resolve(&idx, &SelectionProps::Tag { tag_id: 10 }), vec![2]);
}

#[test]
fn tag_index_in_composite() {
    let mut a = loc(1, 0.0, 0.0); a.tags = vec![10, 20];
    let mut b = loc(2, 0.0, 0.0); b.tags = vec![10];
    let mut c = loc(3, 0.0, 0.0); c.tags = vec![20];
    let (batch, sets) = tagged_batch_and_index(&[a, b, c]);
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds: Vec<Location> = vec![];
    let idx = LocView::new(Some(&batch), &dead, &patches, &adds, Some(&sets));

    let t10 = Selection { key: "t10".into(), color: [0,0,0], props: SelectionProps::Tag { tag_id: 10 }, count: None };
    let t20 = Selection { key: "t20".into(), color: [0,0,0], props: SelectionProps::Tag { tag_id: 20 }, count: None };
    // 10 AND 20 -> only loc 1
    let inter = resolve(&idx, &SelectionProps::Intersection { selections: vec![t10.clone(), t20.clone()] });
    assert_eq!(inter, vec![1]);
    // 10 OR 20 -> all three
    let union = resolve(&idx, &SelectionProps::Union { selections: vec![t10, t20] });
    assert_eq!(union, vec![1, 2, 3]);
}

#[test]
fn resolve_unpanned() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let l1 = loc(1, 0.0, 0.0); // heading = 0
    let mut l2 = loc(2, 0.0, 0.0);
    l2.heading = 90.0;
    let adds = vec![l1, l2];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Unpanned);
    assert_eq!(ids, vec![1]);
}

#[test]
fn resolve_panoids() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.flags = crate::types::LocationFlags::LOAD_AS_PANO_ID;
    let l2 = loc(2, 0.0, 0.0);
    let adds = vec![l1, l2];
    let view = make_view(None, &dead, &patches, &adds);
    let pano = resolve(&view, &SelectionProps::PanoIds);
    let not_pano = resolve(&view, &SelectionProps::NotPanoIds);
    assert_eq!(pano, vec![1]);
    assert_eq!(not_pano, vec![2]);
}

#[test]
fn resolve_with_dead_batch_rows() {
    let locs = vec![loc(1, 10.0, 20.0), loc(2, 30.0, 40.0), loc(3, 50.0, 60.0)];
    let batch = locations_to_batch(&locs);
    let mut dead = HashSet::new();
    dead.insert(2);
    let patches = HashMap::new();
    let adds: Vec<Location> = vec![];
    let view = make_view(Some(&batch), &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Everything);
    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&1));
    assert!(ids.contains(&3));
    assert!(!ids.contains(&2));
}

#[test]
fn resolve_with_patched_tags() {
    let locs = vec![loc(1, 0.0, 0.0), loc(2, 0.0, 0.0)];
    let batch = locations_to_batch(&locs);
    let dead = HashSet::new();
    let mut patched = loc(1, 0.0, 0.0);
    patched.tags = vec![10];
    let mut patches = HashMap::new();
    patches.insert(1, patched);
    let adds: Vec<Location> = vec![];
    let view = make_view(Some(&batch), &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Tag { tag_id: 10 });
    assert_eq!(ids, vec![1]);
}

// -----------------------------------------------------------------------
// Composite selections
// -----------------------------------------------------------------------

#[test]
fn resolve_intersection() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.tags = vec![10];
    l1.flags = crate::types::LocationFlags::LOAD_AS_PANO_ID;
    let mut l2 = loc(2, 0.0, 0.0);
    l2.tags = vec![10];
    let mut l3 = loc(3, 0.0, 0.0);
    l3.flags = crate::types::LocationFlags::LOAD_AS_PANO_ID;
    let adds = vec![l1, l2, l3];
    let view = make_view(None, &dead, &patches, &adds);
    let props = SelectionProps::Intersection {
        selections: vec![
            Selection { key: "a".into(), color: [0,0,0], count: None, props: SelectionProps::Tag { tag_id: 10 } },
            Selection { key: "b".into(), color: [0,0,0], count: None, props: SelectionProps::PanoIds },
        ],
    };
    let ids = resolve(&view, &props);
    assert_eq!(ids, vec![1]); // only l1 has both tag 10 and PanoId flag
}

#[test]
fn resolve_union() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.tags = vec![10];
    let mut l2 = loc(2, 0.0, 0.0);
    l2.flags = crate::types::LocationFlags::LOAD_AS_PANO_ID;
    let l3 = loc(3, 0.0, 0.0);
    let adds = vec![l1, l2, l3];
    let view = make_view(None, &dead, &patches, &adds);
    let props = SelectionProps::Union {
        selections: vec![
            Selection { key: "a".into(), color: [0,0,0], count: None, props: SelectionProps::Tag { tag_id: 10 } },
            Selection { key: "b".into(), color: [0,0,0], count: None, props: SelectionProps::PanoIds },
        ],
    };
    let ids = resolve(&view, &props);
    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&1));
    assert!(ids.contains(&2));
}

#[test]
fn resolve_invert() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.flags = crate::types::LocationFlags::LOAD_AS_PANO_ID;
    let l2 = loc(2, 0.0, 0.0);
    let l3 = loc(3, 0.0, 0.0);
    let adds = vec![l1, l2, l3];
    let view = make_view(None, &dead, &patches, &adds);
    let props = SelectionProps::Invert {
        selections: vec![
            Selection { key: "a".into(), color: [0,0,0], count: None, props: SelectionProps::PanoIds },
        ],
    };
    let ids = resolve(&view, &props);
    assert_eq!(ids.len(), 2);
    assert!(ids.contains(&2));
    assert!(ids.contains(&3));
}

// -----------------------------------------------------------------------
// Duplicates
// -----------------------------------------------------------------------

#[test]
fn duplicates_finds_nearby() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![
        loc(1, 51.5000, -0.1000),
        loc(2, 51.5000, -0.1000), // exact same
        loc(3, 0.0, 0.0),         // far away
    ];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Duplicates { distance: 1.0 });
    assert!(ids.contains(&1));
    assert!(ids.contains(&2));
    assert!(!ids.contains(&3));
}

// 0.00001 deg latitude ~= 1.11 m. Three points spaced one step apart chain pairwise
// (1-2, 2-3) but 1-3 (~2.22 m) exceeds a 2 m threshold: only transitivity unites them.
#[test]
fn duplicate_groups_are_transitive() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![
        loc(1, 0.00000, 0.0),
        loc(2, 0.00001, 0.0),
        loc(3, 0.00002, 0.0),
    ];
    let view = make_view(None, &dead, &patches, &adds);
    let groups = find_duplicate_groups(&view, 2.0);
    assert_eq!(groups, vec![vec![1, 2, 3]]);
}

#[test]
fn duplicate_groups_separate_clusters_and_drop_singletons() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![
        loc(1, 0.00000, 0.0),
        loc(2, 0.00001, 0.0), // with 1
        loc(4, 0.50000, 0.0),
        loc(5, 0.50001, 0.0), // with 4
        loc(6, 0.80000, 0.0), // alone -> excluded
    ];
    let view = make_view(None, &dead, &patches, &adds);
    let groups = find_duplicate_groups(&view, 2.0);
    assert_eq!(groups, vec![vec![1, 2], vec![4, 5]]);
}

#[test]
fn duplicate_groups_empty_when_all_far() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let adds = vec![loc(1, 0.0, 0.0), loc(2, 0.5, 0.0), loc(3, 1.0, 0.0)];
    let view = make_view(None, &dead, &patches, &adds);
    assert!(find_duplicate_groups(&view, 2.0).is_empty());
}

// -----------------------------------------------------------------------
// prune_duplicates (original-app semantics)
// -----------------------------------------------------------------------

fn no_keep() -> HashSet<u32> { HashSet::new() }

// <= 25m relevance mode: the best-scored location in a cluster survives.
#[test]
fn prune_relevance_keeps_highest_score() {
    let mut best = loc(1, 0.00000, 0.0);
    best.pano_id = Some("p".into());
    best.tags = vec![7];
    let locs = vec![best, loc(2, 0.00001, 0.0), loc(3, 0.00002, 0.0)];
    let mut removed = prune_duplicates(&locs, 10.0, &no_keep());
    removed.sort_unstable();
    assert_eq!(removed, vec![2, 3]);
}

// Keep-tag bonus (+5) outweighs raw tag count.
#[test]
fn prune_relevance_keep_tag_beats_tag_count() {
    let mut tagged = loc(1, 0.00000, 0.0);
    tagged.tags = vec![1, 2, 3];
    let mut keep = loc(2, 0.00001, 0.0);
    keep.tags = vec![9];
    let keep_ids: HashSet<u32> = [9].into_iter().collect();
    let removed = prune_duplicates(&[tagged, keep], 10.0, &keep_ids);
    assert_eq!(removed, vec![1]);
}

// Score tie: the oldest location survives.
#[test]
fn prune_relevance_tie_keeps_oldest() {
    let mut old = loc(1, 0.00000, 0.0);
    old.created_at = 100;
    let mut new = loc(2, 0.00001, 0.0);
    new.created_at = 200;
    let removed = prune_duplicates(&[new, old], 10.0, &no_keep());
    assert_eq!(removed, vec![2]);
}

// Informational locations are never pruned and never anchor a cluster.
#[test]
fn prune_never_touches_informational() {
    let mut info = loc(1, 0.00000, 0.0);
    info.flags = crate::types::LocationFlags::INFORMATIONAL;
    let locs = vec![info, loc(2, 0.00001, 0.0), loc(3, 0.00002, 0.0)];
    let removed = prune_duplicates(&locs, 10.0, &no_keep());
    assert_eq!(removed.len(), 1);
    assert!(!removed.contains(&1));
}

// Chain at ~1.1m steps with 2m threshold: clusters are radius-based, not transitive.
// Anchor 1's cluster {1,2} keeps 1; then 3 is alone (2 pruned) -> 3 survives too.
#[test]
fn prune_relevance_is_radius_scoped_not_transitive() {
    let locs = vec![loc(1, 0.00000, 0.0), loc(2, 0.00001, 0.0), loc(3, 0.00002, 0.0)];
    let removed = prune_duplicates(&locs, 2.0, &no_keep());
    assert_eq!(removed, vec![2]);
}

// > 25m thinning mode: the chain's hub (most neighbours) goes first, endpoints survive.
// 0.0003 deg ~= 33m; threshold 40m links 1-2 and 2-3 but not 1-3 (~66m).
#[test]
fn prune_thinning_drops_hub_keeps_endpoints() {
    let locs = vec![loc(1, 0.0000, 0.0), loc(2, 0.0003, 0.0), loc(3, 0.0006, 0.0)];
    let removed = prune_duplicates(&locs, 40.0, &no_keep());
    assert_eq!(removed, vec![2]);
}

// Thinning invariant: no two survivors remain within the distance.
#[test]
fn prune_thinning_no_survivors_in_range() {
    let mut locs = Vec::new();
    for i in 0..12u32 {
        locs.push(loc(i + 1, 0.0003 * f64::from(i), 0.0)); // ~33m spacing
    }
    let removed = prune_duplicates(&locs, 40.0, &no_keep());
    let removed_set: HashSet<u32> = removed.iter().copied().collect();
    let survivors: Vec<&Location> = locs.iter().filter(|l| !removed_set.contains(&l.id)).collect();
    assert!(survivors.len() >= 2);
    for a in 0..survivors.len() {
        for b in (a + 1)..survivors.len() {
            let d = haversine_m(survivors[a].lat, survivors[a].lng, survivors[b].lat, survivors[b].lng);
            assert!(d > 40.0, "survivors {} and {} are {}m apart", survivors[a].id, survivors[b].id, d);
        }
    }
}

// -----------------------------------------------------------------------
// Filter on adds
// -----------------------------------------------------------------------

#[test]
fn extra_filter_eq_on_adds() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    let mut l1 = loc(1, 0.0, 0.0);
    l1.extra = Some(serde_json::from_str(r#"{"country":"BR"}"#).unwrap());
    let mut l2 = loc(2, 0.0, 0.0);
    l2.extra = Some(serde_json::from_str(r#"{"country":"US"}"#).unwrap());
    let adds = vec![l1, l2];
    let view = make_view(None, &dead, &patches, &adds);
    let ids = resolve(&view, &SelectionProps::Filter {
        field: "country".into(), op: "eq".into(),
        value: serde_json::json!("BR"), value2: None,
    });
    assert_eq!(ids, vec![1]);
}

// `between_local` buckets each location's absolute `datetime` into its own
// timezone before range-checking. Same instant, different zones -> different days.
#[test]
fn filter_between_local_buckets_per_timezone() {
    let dead = HashSet::new();
    let patches = HashMap::new();
    // 2020-03-01 00:00:00 UTC. In Tokyo that's Mar 1 09:00; in New York Feb 29 19:00.
    let ts = 1583020800u64;
    let mut tokyo = loc(1, 0.0, 0.0);
    tokyo.extra = serde_json::json!({ "datetime": ts, "timezone": "Asia/Tokyo" }).as_object().cloned();
    let mut newyork = loc(2, 0.0, 0.0);
    newyork.extra = serde_json::json!({ "datetime": ts, "timezone": "America/New_York" }).as_object().cloned();
    let mut no_tz = loc(3, 0.0, 0.0);
    no_tz.extra = serde_json::json!({ "datetime": ts }).as_object().cloned();
    let adds = vec![tokyo, newyork, no_tz];
    let view = make_view(None, &dead, &patches, &adds);

    // Filter "all of Mar 1, 2020" as wall-clock-as-UTC epoch seconds.
    let lo = serde_json::json!(1583020800u64); // 2020-03-01 00:00
    let hi = serde_json::json!(1583107140u64); // 2020-03-01 23:59
    let ids = resolve(&view, &SelectionProps::Filter {
        field: "datetime".into(), op: "between_local".into(),
        value: lo, value2: Some(hi),
    });
    // Tokyo lands on Mar 1 -> in; New York is Feb 29 -> out; no timezone -> excluded.
    assert_eq!(ids, vec![1]);
}
