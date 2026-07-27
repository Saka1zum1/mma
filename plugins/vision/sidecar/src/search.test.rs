use super::*;

// Values from models/scoring.json (google/siglip-base-patch16-224).
const SCALE: f32 = 117.330_77;
const BIAS: f32 = -12.932_437;

fn scoring() -> Scoring {
    Scoring { logit_scale: SCALE, logit_bias: BIAS }
}

#[test]
fn sigmoid_is_bounded_and_monotonic() {
    assert!((sigmoid(0.0) - 0.5).abs() < 1e-6);
    assert!(sigmoid(-40.0) < 1e-6);
    assert!(sigmoid(40.0) > 1.0 - 1e-6);
    assert!(sigmoid(1.0) > sigmoid(0.0));
}

#[test]
fn text_probability_matches_manual_formula() {
    let cos = 0.15f32;
    let expected = 1.0 / (1.0 + (-(cos * SCALE + BIAS)).exp());
    assert!((text_probability(cos, &scoring()) - expected).abs() < 1e-6);
}

#[test]
fn text_probability_low_cosine_is_near_zero() {
    // At cosine 0 the logit is the (large negative) bias, so p ~ 0.
    assert!(text_probability(0.0, &scoring()) < 1e-4);
}

#[test]
fn text_probability_crosses_half_at_bias_over_scale() {
    // Decision boundary: cos * scale + bias == 0.
    let boundary = -BIAS / SCALE;
    assert!((text_probability(boundary, &scoring()) - 0.5).abs() < 1e-4);
}

// --- search: ordering, k, threshold, exclude, max-over-crops ---

/// Cache entry whose best crop has cosine `best` against the unit-x query.
fn entry(best: f32, other: f32) -> Vec<[f32; EMBED_DIM]> {
    let mut a = [0f32; EMBED_DIM];
    a[0] = best;
    let mut b = [0f32; EMBED_DIM];
    b[0] = other;
    vec![a, b]
}

fn test_cache() -> EmbedCache {
    let mut cache = EmbedCache::default();
    cache.entries.insert("low".into(), entry(0.1, 0.05));
    cache.entries.insert("mid".into(), entry(0.5, 0.2));
    cache.entries.insert("high".into(), entry(0.9, 0.1));
    cache
}

fn query() -> [f32; EMBED_DIM] {
    let mut q = [0f32; EMBED_DIM];
    q[0] = 1.0;
    q
}

#[test]
fn search_orders_by_score_descending() {
    let hits = search(&test_cache(), &query(), None, None, None, |c| c);
    let ids: Vec<&str> = hits.iter().map(|h| h.pano_id.as_str()).collect();
    assert_eq!(ids, vec!["high", "mid", "low"]);
    assert!((hits[0].score - 0.9).abs() < 1e-4, "max crop wins, not the mean");
}

#[test]
fn search_truncates_to_k_best() {
    let hits = search(&test_cache(), &query(), Some(2), None, None, |c| c);
    let ids: Vec<&str> = hits.iter().map(|h| h.pano_id.as_str()).collect();
    assert_eq!(ids, vec!["high", "mid"]);
    assert!(search(&test_cache(), &query(), Some(0), None, None, |c| c).is_empty());
}

#[test]
fn search_applies_threshold_and_exclude() {
    let hits = search(&test_cache(), &query(), None, Some(0.3), None, |c| c);
    let ids: Vec<&str> = hits.iter().map(|h| h.pano_id.as_str()).collect();
    assert_eq!(ids, vec!["high", "mid"]);

    let hits = search(&test_cache(), &query(), None, None, Some("high"), |c| c);
    let ids: Vec<&str> = hits.iter().map(|h| h.pano_id.as_str()).collect();
    assert_eq!(ids, vec!["mid", "low"]);
}
