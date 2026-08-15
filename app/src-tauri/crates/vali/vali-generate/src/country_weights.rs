// Data lives in resources/tables/country_weights.json; see tables.rs.
// These consts are table keys, not the user-visible preset slugs; the slug
// mapping stays in definition.rs.

use crate::tables::{tables, Weights};

pub const WORLD: &str = "WORLD";
pub const EUROPE: &str = "EUROPE";
pub const ASIA: &str = "ASIA";
pub const AFRICA: &str = "AFRICA";
pub const SOUTH_AMERICA: &str = "SOUTH_AMERICA";
pub const NORTH_AMERICA: &str = "NORTH_AMERICA";
pub const OCEANIA: &str = "OCEANIA";
pub const ARBITRARY_RURAL_WORLD: &str = "ARBITRARY_RURAL_WORLD";
pub const COMMUNITY_WORLD: &str = "COMMUNITY_WORLD";
pub const BALANCED_WORLD: &str = "BALANCED_WORLD";
pub const IMPROVED_WORLD: &str = "IMPROVED_WORLD";
pub const PRO_WORLD: &str = "PRO_WORLD";
pub const OFFICIAL_WORLD: &str = "OFFICIAL_WORLD";
pub const RAINBOLT_WORLD: &str = "RAINBOLT_WORLD";
pub const GEO_TIME: &str = "GEO_TIME";
pub const LESS_EXTREME_REGION_GUESSING: &str = "LESS_EXTREME_REGION_GUESSING";
pub const MOVING_WORLD: &str = "MOVING_WORLD";
pub const YELLOW_BELLY: &str = "YELLOW_BELLY";
pub const A5KABLE_WORLD: &str = "A5KABLE_WORLD";

pub const ALL: &[&str] = &[
    WORLD,
    EUROPE,
    ASIA,
    AFRICA,
    SOUTH_AMERICA,
    NORTH_AMERICA,
    OCEANIA,
    ARBITRARY_RURAL_WORLD,
    COMMUNITY_WORLD,
    BALANCED_WORLD,
    IMPROVED_WORLD,
    PRO_WORLD,
    OFFICIAL_WORLD,
    RAINBOLT_WORLD,
    GEO_TIME,
    LESS_EXTREME_REGION_GUESSING,
    MOVING_WORLD,
    YELLOW_BELLY,
    A5KABLE_WORLD,
];

pub fn preset(key: &str) -> Weights {
    tables().preset(key)
}
