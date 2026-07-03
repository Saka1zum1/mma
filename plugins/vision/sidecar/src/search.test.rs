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
