// Vendored from vali-rs @ 3b22983. Do not edit; regenerate instead.

use geo::{BoundingRect, Intersects};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use vali_core::GeometryFilterDef;
pub const EUROPEAN_TURKEY: &str = include_str!(
    "../resources/regions/european-turkey.geojson"
);
pub const EUROPEAN_RUSSIA: &str = include_str!(
    "../resources/regions/european-russia.geojson"
);
pub const EUROPEAN_KAZAKHSTAN: &str = include_str!(
    "../resources/regions/european-kazakhstan.geojson"
);
pub const AFRICAN_SPAIN: &str = include_str!(
    "../resources/regions/african-spain.geojson"
);
pub const HAWAII: &str = include_str!("../resources/regions/hawaii.geojson");
#[derive(Debug, Clone)]
pub enum GeometrySource {
    File(String),
    Preloaded(&'static str),
}
#[derive(Debug, Clone)]
pub struct PreparedGeometryFilter {
    pub locations_inside: bool,
    pub combination_mode: String,
    pub source: GeometrySource,
}
impl PreparedGeometryFilter {
    pub fn from_def(
        def: &GeometryFilterDef,
        combination_mode: &str,
    ) -> PreparedGeometryFilter {
        PreparedGeometryFilter {
            locations_inside: def.locations_inside(),
            combination_mode: combination_mode.to_string(),
            source: GeometrySource::File(def.file_path.clone()),
        }
    }
}
pub fn normalized_combination_mode(defs: &[GeometryFilterDef]) -> String {
    match defs.first() {
        Some(f) if !f.combination_mode.is_empty() => f.combination_mode.clone(),
        _ => "intersection".to_string(),
    }
}
pub fn prepare_list(defs: &[GeometryFilterDef]) -> Vec<PreparedGeometryFilter> {
    let mode = normalized_combination_mode(defs);
    defs.iter().map(|d| PreparedGeometryFilter::from_def(d, &mode)).collect()
}
pub fn geometries_from_file(path: &str) -> Vec<geo::Geometry<f64>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Vec<geo::Geometry<f64>>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Mutex::default);
    if let Some(cached) = cache.lock().unwrap().get(path) {
        return cached.clone();
    }
    let parsed = std::fs::read_to_string(path)
        .map_err(|e| e.to_string())
        .and_then(|text| parse_geojson(text.trim_start_matches('\u{feff}')))
        .unwrap_or_else(|_| {
            eprintln!(
                "Invalid GeoJSON in file {path}, ignoring file. Try checking using https://geojsonlint.com/."
            );
            Vec::new()
        });
    cache.lock().unwrap().insert(path.to_string(), parsed.clone());
    parsed
}
pub fn applicable(
    filters: &[PreparedGeometryFilter],
) -> Vec<(&PreparedGeometryFilter, Vec<geo::Geometry<f64>>)> {
    filters
        .iter()
        .map(|f| {
            let geometries = match &f.source {
                GeometrySource::Preloaded(text) => {
                    parse_geojson(text).expect("embedded regions are valid")
                }
                GeometrySource::File(path) if Path::new(path).exists() => {
                    geometries_from_file(path)
                }
                GeometrySource::File(_) => Vec::new(),
            };
            (f, geometries)
        })
        .filter(|(_, g)| !g.is_empty())
        .collect()
}
pub fn build_context(
    filters: &[PreparedGeometryFilter],
) -> Result<Option<GeometryContext>, String> {
    let applicable = applicable(filters);
    let Some((first, _)) = applicable.first() else {
        return Ok(None);
    };
    let mode = first.combination_mode.clone();
    let evaluated = applicable
        .into_iter()
        .map(|(f, g)| (f.locations_inside, g))
        .collect();
    GeometryContext::build(&mode, evaluated).map(Some)
}
pub fn parse_geojson(text: &str) -> Result<Vec<geo::Geometry<f64>>, String> {
    let parsed: geojson::GeoJson = text
        .parse()
        .map_err(|e| format!("invalid GeoJSON: {e}"))?;
    let to_geo = |g: geojson::Geometry| -> Result<geo::Geometry<f64>, String> {
        geo::Geometry::try_from(g)
            .map_err(|e| format!("unsupported GeoJSON geometry: {e}"))
    };
    match parsed {
        geojson::GeoJson::Geometry(g) => Ok(vec![to_geo(g) ?]),
        geojson::GeoJson::Feature(f) => {
            let g = f.geometry.ok_or("GeoJSON feature has no geometry")?;
            Ok(vec![to_geo(g) ?])
        }
        geojson::GeoJson::FeatureCollection(fc) => {
            fc.features
                .into_iter()
                .map(|f| to_geo(f.geometry.ok_or("GeoJSON feature has no geometry")?))
                .collect()
        }
    }
}
struct EvaluatedFilter {
    locations_inside: bool,
    geometries: Vec<geo::Geometry<f64>>,
}
pub struct GeometryContext {
    union: bool,
    filters: Vec<EvaluatedFilter>,
    envelope: Option<geo::Rect<f64>>,
}
impl GeometryContext {
    pub fn build(
        combination_mode: &str,
        filters: Vec<(bool, Vec<geo::Geometry<f64>>)>,
    ) -> Result<GeometryContext, String> {
        let union = match combination_mode {
            "union" => true,
            "intersection" => false,
            other => {
                return Err(
                    format!("Only union/intersection acceptable values, got '{other}'."),
                );
            }
        };
        let mut envelope: Option<geo::Rect<f64>> = None;
        for (_, geometries) in &filters {
            for g in geometries {
                if let Some(rect) = g.bounding_rect() {
                    envelope = Some(
                        match envelope {
                            None => rect,
                            Some(e) => {
                                geo::Rect::new(
                                    geo::coord! {
                                        x : e.min().x.min(rect.min().x), y : e.min().y.min(rect
                                        .min().y)
                                    },
                                    geo::coord! {
                                        x : e.max().x.max(rect.max().x), y : e.max().y.max(rect
                                        .max().y)
                                    },
                                )
                            }
                        },
                    );
                }
            }
        }
        Ok(GeometryContext {
            union,
            filters: filters
                .into_iter()
                .map(|(locations_inside, geometries)| EvaluatedFilter {
                    locations_inside,
                    geometries,
                })
                .collect(),
            envelope,
        })
    }
    pub fn matches(&self, lat: f64, lng: f64) -> bool {
        let in_envelope = self
            .envelope
            .is_some_and(|e| {
                lng >= e.min().x && lng <= e.max().x && lat >= e.min().y
                    && lat <= e.max().y
            });
        if !in_envelope {
            return if self.union {
                self.filters.iter().any(|f| !f.locations_inside)
            } else {
                self.filters.iter().all(|f| !f.locations_inside)
            };
        }
        let point = geo::Point::new(lng, lat);
        let covered = |f: &EvaluatedFilter| {
            f.geometries.iter().any(|g| g.intersects(&point)) == f.locations_inside
        };
        if self.union {
            self.filters.iter().any(covered)
        } else {
            self.filters.iter().all(covered)
        }
    }
}
