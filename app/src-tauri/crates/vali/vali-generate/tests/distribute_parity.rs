use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct Golden {
    file: String,
    total: usize,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    goal: i64,
    min_min: Option<i32>,
    already: usize,
    empty: bool,
    min_distance: i32,
    node_ids: Vec<i64>,
}

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name)
}

fn run(bin_name: &str, golden_name: &str) {
    let golden_path = fixture(golden_name);
    let golden: Golden = serde_json::from_slice(
        &std::fs::read(&golden_path)
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", golden_path.display())),
    )
    .expect("parse distribute golden");

    let locations = vali_data::decode_file(&fixture(bin_name)).expect("decode fixture bin");
    assert_eq!(
        locations.len(),
        golden.total,
        "{}: decoded {} locations, oracle saw {}",
        golden.file,
        locations.len(),
        golden.total
    );
    assert!(!golden.cases.is_empty(), "golden had no cases");

    let candidates: Vec<(f64, f64)> = locations.iter().map(|l| (l.lat, l.lng)).collect();
    let mut failures: Vec<String> = Vec::new();

    for (ci, case) in golden.cases.iter().enumerate() {
        let cands: &[(f64, f64)] = if case.empty { &[] } else { &candidates };
        let already = &candidates[..case.already.min(candidates.len())];
        let (selected, min_distance) =
            vali_geo::with_max_min_distance(cands, case.goal as usize, case.min_min, already);
        let node_ids: Vec<i64> = selected
            .iter()
            .map(|&i| locations[i as usize].node_id)
            .collect();

        let mut errors: Vec<String> = Vec::new();
        if min_distance != case.min_distance {
            errors.push(format!(
                "min_distance {} != oracle {}",
                min_distance, case.min_distance
            ));
        }
        if node_ids != case.node_ids {
            let first_diff = node_ids
                .iter()
                .zip(&case.node_ids)
                .position(|(a, b)| a != b)
                .unwrap_or(node_ids.len().min(case.node_ids.len()));
            errors.push(format!(
                "node_ids differ (len {} vs {}, first divergence at {})",
                node_ids.len(),
                case.node_ids.len(),
                first_diff
            ));
        }
        if !errors.is_empty() {
            failures.push(format!(
                "case {ci} (goal={}, min_min={:?}, already={}, empty={}): {}",
                case.goal,
                case.min_min,
                case.already,
                case.empty,
                errors.join("; ")
            ));
        }
    }

    assert!(
        failures.is_empty(),
        "{}/{} distribution cases diverged for {}:\n{}",
        failures.len(),
        golden.cases.len(),
        golden.file,
        failures.join("\n")
    );
}

#[test]
fn distribution_matches_oracle_ru_al() {
    run("ru-al-1000.bin", "ru-al.distribute.json");
}

#[test]
fn distribution_matches_oracle_no_21() {
    run("no-21.bin", "no-21.distribute.json");
}
