//! Pure utility functions with no app-specific dependencies.
//!
//! Provides timestamp generation, color math, and deterministic tag color
//! assignment. No I/O, no state -- safe to call from any context.

/// Returns the current UTC time as an ISO 8601 string (e.g. "2024-03-15T08:30:00.000Z").
///
/// Uses a dependency-free civil-date algorithm (Howard Hinnant's `days_from_civil`)
/// to avoid pulling in `chrono` for a single formatting call. Milliseconds are
/// always ".000" since `SystemTime` only gives us second resolution here.
pub fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let days_since_epoch = secs / 86400;
    let time_secs = (secs % 86400) as u32;
    let z = days_since_epoch + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        y, m, d,
        time_secs / 3600, (time_secs % 3600) / 60, time_secs % 60
    )
}

/// Converts HSL to RGB. `h` is in degrees [0, 360), `s` and `l` in [0, 1].
pub fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let a = s * l.min(1.0 - l);
    let f = |n: f64| -> u8 {
        let k = (n + h / 30.0) % 12.0;
        (255.0 * (l - a * (k - 3.0).min(9.0 - k).min(1.0).max(-1.0))).round() as u8
    };
    (f(0.0), f(8.0), f(4.0))
}

/// Generates a deterministic hex color string from a tag name.
///
/// Hashes the name bytes into a hue via a linear congruential generator,
/// then converts to RGB at fixed saturation/lightness (50%/50%) so every
/// tag gets a distinct, moderately saturated color that's stable across sessions.
pub fn color_for_name(name: &str) -> String {
    let mut h: i32 = 0;
    for b in name.bytes() {
        h = h.wrapping_add((b as i32).wrapping_add(h << 5));
    }
    h = h.wrapping_mul(214013).wrapping_add(2531011);
    let hue = (h.abs() % 360) as f64;
    let (r, g, b) = hsl_to_rgb(hue, 0.5, 0.5);
    format!("#{:02x}{:02x}{:02x}", r, g, b)
}

#[cfg(test)]
#[path = "util.test.rs"]
mod tests;
