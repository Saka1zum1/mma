// Data lives in resources/tables/subdivision_weights.json; see tables.rs.

use crate::tables::{tables, Weights};

pub fn subdivision_weights(country_code: &str) -> Option<Weights> {
    tables().subdivision_weights(country_code)
}
