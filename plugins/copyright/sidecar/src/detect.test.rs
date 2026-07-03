use super::*;

#[test]
fn extract_year_finds_valid_year() {
    assert_eq!(extract_year("© 2019 Google"), Some(2019));
}

#[test]
fn extract_year_finds_year_in_garbage_ocr_text() {
    assert_eq!(extract_year("32019 Gnogle"), Some(2019));
}

#[test]
fn extract_year_supports_2030s() {
    assert_eq!(extract_year("© 2031 Google"), Some(2031));
}

#[test]
fn extract_year_no_match_returns_none() {
    assert_eq!(extract_year("no year here"), None);
    assert_eq!(extract_year(""), None);
}

#[test]
fn extract_year_rejects_out_of_range_decade() {
    assert_eq!(extract_year("© 2050 Google"), None);
    assert_eq!(extract_year("© 1999 Google"), None);
}

#[test]
fn official_pano_regex_accepts_valid_ids() {
    let prefix = "a".repeat(21);
    for suffix in ["A", "Q", "g", "w"] {
        assert!(is_official_pano(&format!("{prefix}{suffix}")));
    }
}

#[test]
fn official_pano_regex_rejects_wrong_length() {
    assert!(!is_official_pano("tooshort"));
    let too_long = format!("{}A", "a".repeat(22));
    assert!(!is_official_pano(&too_long));
    let too_short = format!("{}A", "a".repeat(20));
    assert!(!is_official_pano(&too_short));
}

#[test]
fn official_pano_regex_rejects_wrong_suffix() {
    let id = format!("{}Z", "a".repeat(21));
    assert!(!is_official_pano(&id));
}

#[test]
fn shift_crop_applies_positive_and_negative_offsets() {
    let base = [50, 350, 180, 45];
    assert_eq!(shift_crop(base, 0), [50, 350, 180, 45]);
    assert_eq!(shift_crop(base, -30), [50, 320, 180, 45]);
    assert_eq!(shift_crop(base, 60), [50, 410, 180, 45]);
}

#[test]
fn shift_crop_clamps_to_tile_bounds() {
    let base = [50, 10, 180, 45];
    // -60 would go negative, must clamp to 0
    assert_eq!(shift_crop(base, -60), [50, 0, 180, 45]);

    let base_near_bottom = [50, 500, 180, 45];
    // +60 would exceed TILE_DIM - h, must clamp to max
    let shifted = shift_crop(base_near_bottom, 60);
    assert_eq!(shifted[1], TILE_DIM - 45);
}

#[test]
fn ordered_candidate_indices_defaults_to_bucket_order() {
    assert_eq!(ordered_candidate_indices(0), vec![0, 1, 2]);
}

#[test]
fn ordered_candidate_indices_reorders_after_adaptive_hit() {
    // simulating "last successful bucket = gen1 (index 2)"
    assert_eq!(ordered_candidate_indices(2), vec![2, 0, 1]);
    assert_eq!(ordered_candidate_indices(1), vec![1, 0, 2]);
}

#[test]
fn ordered_indices_defaults_to_original_order() {
    assert_eq!(ordered_indices(5, 0), vec![0, 1, 2, 3, 4]);
}

#[test]
fn ordered_indices_puts_start_idx_first() {
    assert_eq!(ordered_indices(5, 3), vec![3, 0, 1, 2, 4]);
    assert_eq!(ordered_indices(5, 4), vec![4, 0, 1, 2, 3]);
}

#[test]
fn ordered_candidate_indices_is_ordered_indices_for_candidates_len() {
    for start in 0..CANDIDATES.len() {
        assert_eq!(ordered_candidate_indices(start), ordered_indices(CANDIDATES.len(), start));
    }
}

#[test]
fn candidates_table_matches_calibration() {
    assert_eq!(CANDIDATES.len(), 3);
    assert_eq!(CANDIDATES[0].name, "gen4");
    assert_eq!((CANDIDATES[0].zoom, CANDIDATES[0].x, CANDIDATES[0].y), (4, 9, 6));
    assert_eq!(CANDIDATES[0].crop, [50, 350, 180, 45]);
    assert_eq!(CANDIDATES[1].name, "gen2_3");
    assert_eq!((CANDIDATES[1].zoom, CANDIDATES[1].x, CANDIDATES[1].y), (4, 7, 5));
    assert_eq!(CANDIDATES[1].crop, [75, 12, 170, 45]);
    assert_eq!(CANDIDATES[2].name, "gen1");
    assert_eq!((CANDIDATES[2].zoom, CANDIDATES[2].x, CANDIDATES[2].y), (3, 4, 2));
    assert_eq!(CANDIDATES[2].crop, [225, 225, 150, 45]);
}
