//! Street-view HTTP the webview cannot reliably make: Google photometa tile
//! listings, and (later) batch GetMetadata plus the Baidu id-range scanner.
//! Parsing follows various-map-gen's field layout.

use chrono::{Datelike, TimeZone, Timelike};

use crate::types::{AppError, AppResult};

fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .use_rustls_tls()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .expect("failed to build the street-view http client")
    })
}

/// Web-mercator tile of `lat`/`lng` at `zoom`, matching `wgs84_to_tile_coord`.
fn wgs84_to_tile(lat: f64, lng: f64, zoom: u32) -> (i32, i32) {
    let scale = f64::from(1u32 << zoom);
    let x = ((lng + 180.0) / 360.0) * scale;
    let lat_rad = lat.to_radians();
    let y = (1.0 - lat_rad.tan().asinh() / std::f64::consts::PI) / 2.0 * scale;
    (x.floor() as i32, y.floor() as i32)
}

/// Pano ids at `data[1][1][*][0][0][1]` after the 5-character XSSI prefix.
fn pano_ids_from_photometa(text: &str) -> Vec<String> {
    let body = text.get(5..).unwrap_or("");
    let data: serde_json::Value = match serde_json::from_str(body) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let Some(items) = data.get(1).and_then(|v| v.get(1)).and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    let mut ids = Vec::new();
    for item in items {
        let Some(id) = item
            .get(0)
            .and_then(|v| v.get(0))
            .and_then(|v| v.get(1))
            .and_then(|v| v.as_str())
        else {
            continue;
        };
        if id.is_empty() || ids.iter().any(|seen| seen == id) {
            continue;
        }
        ids.push(id.to_string());
    }
    ids
}

/// Pano ids in the z17 Google photometa tile that contains this point.
/// An empty tile or an unreadable body is an empty list; a transport failure
/// is an error so a missing endpoint is not mistaken for no coverage.
#[tauri::command]
#[specta::specta]
pub async fn photometa_pano_ids(lat: f64, lng: f64) -> AppResult<Vec<String>> {
    if !lat.is_finite() || !(-90.0..=90.0).contains(&lat) || !lng.is_finite() {
        return Err(AppError::from("photometa_pano_ids: lat/lng must be finite"));
    }
    let (x, y) = wgs84_to_tile(lat, lng, 17);
    let url = format!(
        "https://www.google.com/maps/photometa/ac/v1?pb=!1m1!1smaps_sv.tactile!6m3!1i{x}!2i{y}!3i17!8b1"
    );
    let text = http_client()
        .get(url)
        .header(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    Ok(pano_ids_from_photometa(&text))
}

/// One slice of a Baidu 27-character pano-id range scan.
#[derive(serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BaiduTraverseRequest {
    pub start_pano_id: String,
    pub end_pano_id: String,
    /// Next id's timestamp in epoch millis. `None` starts at `start_pano_id`.
    pub cursor_ms: Option<i64>,
    pub use_rough_scan: bool,
    pub scan_step_min: u32,
    pub scan_duration_sec: u32,
    pub skip_time_enabled: bool,
    pub skip_start_min: u32,
    pub skip_end_min: u32,
    pub filter_normal_cover: bool,
    pub filter_timeline_coverage: bool,
    /// In-flight `qt=sdata` batches. Clamped; 200 at once is more than this client will open.
    pub concurrency: u32,
    pub req_timeout_sec: u32,
    pub retry_times: u32,
    /// How many ids to probe before returning, so a run can abort between slices.
    pub budget: u32,
}

/// `content_json` is a JSON array of sdata `content` objects that survived the
/// traverse-only cover filters. Polygon and generator filters stay on the JS side.
#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BaiduTraverseChunk {
    pub content_json: String,
    pub probed: u32,
    pub next_cursor_ms: i64,
    pub done: bool,
}

struct ParsedPid {
    prefix: String,
    car: String,
    ms: i64,
}

fn parse_pid(id: &str) -> Result<ParsedPid, String> {
    let id = id.trim();
    if id.len() != 27 {
        return Err(format!("pano id must be 27 characters, got {}", id.len()));
    }
    let prefix = id[..10].to_string();
    let time = &id[10..25];
    let car = id[25..].to_string();
    if !time.bytes().all(|b| b.is_ascii_digit()) {
        return Err("the middle 15 characters must be digits".to_string());
    }
    let ms = baidu_time_to_ms(time).ok_or_else(|| format!("time {time} is not a real timestamp"))?;
    Ok(ParsedPid { prefix, car, ms })
}

fn baidu_time_to_ms(time: &str) -> Option<i64> {
    let n = |s: &str| s.parse::<u32>().ok();
    let year = 2000 + n(&time[0..2])?;
    let month = n(&time[2..4])?;
    let day = n(&time[4..6])?;
    let hour = n(&time[6..8])?;
    let minute = n(&time[8..10])?;
    let second = n(&time[10..12])?;
    let millis = n(&time[12..15])?;
    let dt = chrono::Utc
        .with_ymd_and_hms(year as i32, month, day, hour, minute, second)
        .single()?;
    if dt.year() != year as i32
        || dt.month() != month
        || dt.day() != day
        || dt.hour() != hour
        || dt.minute() != minute
        || dt.second() != second
    {
        return None;
    }
    Some(dt.timestamp_millis() + i64::from(millis))
}

fn format_pid(prefix: &str, ms: i64, car: &str) -> Option<String> {
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms)?;
    let millis = ms.rem_euclid(1000);
    Some(format!(
        "{prefix}{:02}{:02}{:02}{:02}{:02}{:02}{millis:03}{car}",
        dt.year().rem_euclid(100),
        dt.month(),
        dt.day(),
        dt.hour(),
        dt.minute(),
        dt.second(),
    ))
}

fn minute_of_day(ms: i64) -> u32 {
    let dt = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms);
    match dt {
        Some(dt) => dt.hour() * 60 + dt.minute(),
        None => 0,
    }
}

fn is_skip_time(ms: i64, enabled: bool, start_min: u32, end_min: u32) -> bool {
    if !enabled {
        return false;
    }
    let cur = minute_of_day(ms);
    let start = start_min.min(1439);
    let end = end_min.min(1439);
    if start <= end {
        cur >= start && cur <= end
    } else {
        cur >= start || cur <= end
    }
}

/// The next `budget` ids at or after `cursor`, and the cursor just past the last one considered.
fn take_baidu_ids(
    prefix: &str,
    car: &str,
    mut cursor: i64,
    target: i64,
    reverse: bool,
    budget: usize,
    rough: bool,
    step_min: u32,
    dur_sec: u32,
    skip: bool,
    skip_start: u32,
    skip_end: u32,
) -> (Vec<String>, i64, bool) {
    let mut ids = Vec::new();
    let jump = i64::from(step_min.max(1)) * 60_000;
    let dur = i64::from(dur_sec.max(1)) * 1000;
    let mut guard = 0u64;
    let mut done = false;
    while ids.len() < budget {
        guard += 1;
        if guard > 50_000_000 {
            break;
        }
        let skipped = is_skip_time(cursor, skip, skip_start, skip_end);
        if rough {
            if !skipped {
                let seg_end = cursor + dur;
                let mut collect = cursor;
                while collect <= seg_end && ids.len() < budget {
                    if let Some(pid) = format_pid(prefix, collect, car) {
                        ids.push(pid);
                    }
                    collect += 1;
                }
                if ids.len() >= budget && collect <= seg_end {
                    cursor = collect;
                    break;
                }
            }
            cursor += if reverse { -jump } else { jump };
        } else {
            if !skipped {
                if let Some(pid) = format_pid(prefix, cursor, car) {
                    ids.push(pid);
                }
            }
            cursor += if reverse { -1 } else { 1 };
        }
        let past = if reverse { cursor < target } else { cursor > target };
        if past {
            done = true;
            break;
        }
    }
    (ids, cursor, done)
}

fn keep_sdata(item: &serde_json::Value, filter_normal: bool, filter_timeline: bool) -> bool {
    let Some(id) = item.get("ID").and_then(|v| v.as_str()) else {
        return false;
    };
    if id.is_empty() {
        return false;
    }
    if filter_normal {
        if let Some(roads) = item.get("Roads").and_then(|v| v.as_array()) {
            if !roads.is_empty() {
                return false;
            }
        }
    }
    if filter_timeline {
        if let Some(timeline) = item.get("TimeLine").and_then(|v| v.as_array()) {
            if timeline.len() > 1 {
                return false;
            }
        }
    }
    true
}

async fn fetch_sdata_batch(
    ids: &[String],
    timeout: std::time::Duration,
    retries: u32,
    filter_normal: bool,
    filter_timeline: bool,
) -> Vec<serde_json::Value> {
    if ids.is_empty() {
        return Vec::new();
    }
    let host = (ids[0].chars().last().map(|c| c as u32).unwrap_or(0)) & 1;
    let url = format!("https://mapsv{host}.bdimg.com/?qt=sdata&sid={}", ids.join(";"));
    let backoff = [
        std::time::Duration::from_millis(800),
        std::time::Duration::from_millis(1800),
        std::time::Duration::from_millis(3000),
    ];
    let mut transfer_failed = false;
    for attempt in 0..=retries {
        match http_client().get(&url).timeout(timeout).send().await {
            Ok(resp) if resp.status().as_u16() == 403 => return Vec::new(),
            Ok(resp) if !resp.status().is_success() => {
                transfer_failed = true;
            }
            Ok(resp) => match resp.text().await {
                Ok(text) => match serde_json::from_str::<serde_json::Value>(&text) {
                    Ok(json) => {
                        let err = json.get("result").and_then(|v| v.get("error")).and_then(|v| v.as_i64());
                        if err == Some(404) {
                            return Vec::new();
                        }
                        if err.is_some() && err != Some(0) {
                            transfer_failed = true;
                        } else {
                            let content = json.get("content").and_then(|v| v.as_array());
                            return content
                                .map(|items| {
                                    items
                                        .iter()
                                        .filter(|item| keep_sdata(item, filter_normal, filter_timeline))
                                        .cloned()
                                        .collect()
                                })
                                .unwrap_or_default();
                        }
                    }
                    Err(_) => transfer_failed = true,
                },
                Err(_) => transfer_failed = true,
            },
            Err(_) => transfer_failed = true,
        }
        if attempt < retries {
            tokio::time::sleep(backoff[attempt as usize % backoff.len()]).await;
        }
    }
    if transfer_failed && ids.len() > 1 {
        let mut out = Vec::new();
        for id in ids {
            out.extend(
                fetch_sdata_once(std::slice::from_ref(id), timeout, retries, filter_normal, filter_timeline).await,
            );
        }
        return out;
    }
    Vec::new()
}

/// Same probe as `fetch_sdata_batch`, without splitting a failed batch into singles.
async fn fetch_sdata_once(
    ids: &[String],
    timeout: std::time::Duration,
    retries: u32,
    filter_normal: bool,
    filter_timeline: bool,
) -> Vec<serde_json::Value> {
    if ids.is_empty() {
        return Vec::new();
    }
    let host = (ids[0].chars().last().map(|c| c as u32).unwrap_or(0)) & 1;
    let url = format!("https://mapsv{host}.bdimg.com/?qt=sdata&sid={}", ids.join(";"));
    let backoff = [
        std::time::Duration::from_millis(800),
        std::time::Duration::from_millis(1800),
        std::time::Duration::from_millis(3000),
    ];
    for attempt in 0..=retries {
        if let Some(rows) = sdata_attempt(&url, timeout, filter_normal, filter_timeline).await {
            return rows;
        }
        if attempt < retries {
            tokio::time::sleep(backoff[attempt as usize % backoff.len()]).await;
        }
    }
    Vec::new()
}

/// `Some` is a finished answer, including an empty 403 or 404. `None` should be retried.
async fn sdata_attempt(
    url: &str,
    timeout: std::time::Duration,
    filter_normal: bool,
    filter_timeline: bool,
) -> Option<Vec<serde_json::Value>> {
    let resp = http_client().get(url).timeout(timeout).send().await.ok()?;
    if resp.status().as_u16() == 403 {
        return Some(Vec::new());
    }
    if !resp.status().is_success() {
        return None;
    }
    let text = resp.text().await.ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let err = json.get("result").and_then(|v| v.get("error")).and_then(|v| v.as_i64());
    if err == Some(404) {
        return Some(Vec::new());
    }
    if err.is_some() && err != Some(0) {
        return None;
    }
    Some(
        json.get("content")
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter(|item| keep_sdata(item, filter_normal, filter_timeline))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default(),
    )
}

/// Probe the next slice of a Baidu pano-id range. Enumeration, concurrency,
/// retries, and the sdata HTTP stay here; the generator applies its own filters.
#[tauri::command]
#[specta::specta]
pub async fn baidu_traverse_chunk(req: BaiduTraverseRequest) -> AppResult<BaiduTraverseChunk> {
    let start = parse_pid(&req.start_pano_id).map_err(AppError::from)?;
    let end = parse_pid(&req.end_pano_id).map_err(AppError::from)?;
    if start.prefix != end.prefix {
        return Err(AppError::from("start and end pano ids have different prefixes"));
    }
    if start.car != end.car {
        return Err(AppError::from("start and end pano ids have different vehicle codes"));
    }
    let reverse = start.ms > end.ms;
    let cursor = req.cursor_ms.unwrap_or(start.ms);
    let past = if reverse { cursor < end.ms } else { cursor > end.ms };
    if past {
        return Ok(BaiduTraverseChunk {
            content_json: "[]".to_string(),
            probed: 0,
            next_cursor_ms: cursor,
            done: true,
        });
    }
    let budget = req.budget.clamp(1, 5_000) as usize;
    let (ids, next, done) = take_baidu_ids(
        &start.prefix,
        &start.car,
        cursor,
        end.ms,
        reverse,
        budget,
        req.use_rough_scan,
        req.scan_step_min.clamp(1, 1440),
        req.scan_duration_sec.clamp(1, 3600),
        req.skip_time_enabled,
        req.skip_start_min,
        req.skip_end_min,
        );
    let concurrency = req.concurrency.clamp(50, 500) as usize;
    let timeout = std::time::Duration::from_secs(u64::from(req.req_timeout_sec.clamp(5, 30)));
    let retries = req.retry_times.clamp(1, 5);
    let mut kept = Vec::new();
    for wave in ids.chunks(100).collect::<Vec<_>>().chunks(concurrency) {
        let mut jobs = Vec::new();
		for batch in wave {
            jobs.push(fetch_sdata_batch(
                batch,
                timeout,
                retries,
                req.filter_normal_cover,
                req.filter_timeline_coverage,
            ));
        }
        for part in futures::future::join_all(jobs).await {
            kept.extend(part);
        }
    }
    Ok(BaiduTraverseChunk {
        content_json: serde_json::to_string(&kept)?,
        probed: ids.len() as u32,
        next_cursor_ms: next,
        done,
    })
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GoogleBatchLink {
    pub pano_id: String,
    pub heading: f64,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GoogleBatchTime {
    pub pano_id: String,
    pub date: String,
}

/// One panorama from the Maps JS GetMetadata batch endpoint.
#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GoogleBatchPano {
    pub id: String,
    pub lat: f64,
    pub lng: f64,
    pub heading: f64,
    pub image_date: String,
    pub altitude: Option<f64>,
    pub country: Option<String>,
    pub description: String,
    pub short_description: String,
    pub world_height: f64,
    pub links: Vec<GoogleBatchLink>,
    pub time: Vec<GoogleBatchTime>,
}

fn pano_wire_type(id: &str) -> i64 {
    if id.starts_with("CIHM") || id.len() != 22 { 10 } else { 2 }
}

fn metadata_payload(ids: &[String]) -> String {
    let fields: Vec<Vec<Vec<serde_json::Value>>> = ids
        .iter()
        .map(|id| vec![vec![serde_json::json!(pano_wire_type(id)), serde_json::json!(id)]])
        .collect();
    serde_json::json!([
        ["apiv3", null, null, null, "US", null, null, null, null, null, [[0]]],
        ["en", "US"],
        fields,
        [[1, 2, 3, 4, 8, 6]]
    ])
    .to_string()
}

fn json_str(value: Option<&serde_json::Value>) -> Option<String> {
    value.and_then(|v| v.as_str()).map(str::to_string).filter(|s| !s.is_empty())
}

fn month_stamp(year: i64, month: i64) -> Option<String> {
    if !(1900..2200).contains(&year) || !(1..=12).contains(&month) {
        return None;
    }
    Some(format!("{year}-{month:02}"))
}

/// `item` is one element of `response[1]`, the same object `parseGoogle` reads as `data[1][0]`.
fn parse_google_item(item: &serde_json::Value) -> Option<GoogleBatchPano> {
    let meta = item.get(5)?.get(0)?;
    let id = item.get(1)?.get(1)?.as_str()?.to_string();
    if id.is_empty() {
        return None;
    }
    let loc = meta.get(1)?;
    let lat = loc.get(0)?.get(2)?.as_f64()?;
    let lng = loc.get(0)?.get(3)?.as_f64()?;
    let heading = meta.get(2).and_then(|v| v.get(0)).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let world_height = item
        .get(2)
        .and_then(|v| v.get(2))
        .and_then(|v| v.get(0))
        .and_then(|v| v.as_f64())
        .unwrap_or(8192.0);
    let year = item.get(6).and_then(|v| v.get(7)).and_then(|v| v.get(0)).and_then(|v| v.as_i64());
    let month = item.get(6).and_then(|v| v.get(7)).and_then(|v| v.get(1)).and_then(|v| v.as_i64());
    let image_date = match (year, month) {
        (Some(y), Some(m)) => month_stamp(y, m).unwrap_or_default(),
        _ => String::new(),
    };
    let altitude = loc.get(1).and_then(|v| v.get(0)).and_then(|v| v.as_f64());
    let country = json_str(loc.get(4));
    let addr = item.get(3);
    let long = json_str(
        addr.and_then(|a| a.get(2))
            .and_then(|a| a.get(1))
            .and_then(|a| a.get(0))
            .or_else(|| addr.and_then(|a| a.get(0)).and_then(|a| a.get(0))),
    );
    let short = json_str(
        addr.and_then(|a| a.get(2))
            .and_then(|a| a.get(0))
            .and_then(|a| a.get(0))
            .or_else(|| addr.and_then(|a| a.get(0)).and_then(|a| a.get(0))),
    );
    let description = match (&short, &long) {
        (Some(s), Some(l)) => format!("{s}, {l}"),
        (Some(s), None) => s.clone(),
        (None, Some(l)) => l.clone(),
        (None, None) => String::new(),
    };
    let nodes = meta.get(3).and_then(|v| v.get(0));
    let mut links = Vec::new();
    if let (Some(nodes), Some(raw)) = (nodes.and_then(|v| v.as_array()), meta.get(6).and_then(|v| v.as_array())) {
        for link in raw {
            let Some(index) = link.get(0).and_then(|v| v.as_u64()) else { continue };
            let Some(pano_id) = nodes
                .get(index as usize)
                .and_then(|n| n.get(0))
                .and_then(|n| n.get(1))
                .and_then(|n| n.as_str())
            else {
                continue;
            };
            let heading = link.get(1).and_then(|v| v.get(3)).and_then(|v| v.as_f64()).unwrap_or(0.0);
            links.push(GoogleBatchLink { pano_id: pano_id.to_string(), heading });
        }
    }
    let mut time = Vec::new();
    if let (Some(nodes), Some(raw)) = (
        nodes.and_then(|v| v.as_array()),
        meta.get(8).and_then(|v| v.as_array()),
    ) {
        for node in raw {
            let Some(index) = node.get(0).and_then(|v| v.as_u64()) else { continue };
            let Some(pano_id) = nodes
                .get(index as usize)
                .and_then(|n| n.get(0))
                .and_then(|n| n.get(1))
                .and_then(|n| n.as_str())
            else {
                continue;
            };
            if pano_id.starts_with("CIHM") {
                continue;
            }
            let Some(date) = node
                .get(1)
                .and_then(|v| Some((v.get(0)?.as_i64()?, v.get(1)?.as_i64()?)))
                .and_then(|(y, m)| month_stamp(y, m))
            else {
                continue;
            };
            time.push(GoogleBatchTime { pano_id: pano_id.to_string(), date });
        }
    }
    if let Some(date) = month_stamp(year.unwrap_or(0), month.unwrap_or(0)) {
        time.push(GoogleBatchTime { pano_id: id.clone(), date });
    }
    time.sort_by(|a, b| a.date.cmp(&b.date));
    Some(GoogleBatchPano {
        id,
        lat,
        lng,
        heading,
        image_date,
        altitude,
        country,
        description,
        short_description: short.unwrap_or_default(),
        world_height,
        links,
        time,
    })
}

fn parse_google_batch(response: &serde_json::Value) -> Vec<GoogleBatchPano> {
    let Some(items) = response.get(1).and_then(|v| v.as_array()) else {
        return Vec::new();
    };
    items.iter().filter_map(parse_google_item).collect()
}

async fn post_metadata(ids: &[String]) -> AppResult<Vec<GoogleBatchPano>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let response = http_client()
        .post("https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetMetadata")
        .header("content-type", "application/json+protobuf")
        .header("x-user-agent", "grpc-web-javascript/0.1")
        .body(metadata_payload(ids))
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    let json: serde_json::Value = serde_json::from_str(&response)?;
    Ok(parse_google_batch(&json))
}

/// Batch GetMetadata for Google pano ids. Results are aligned with `ids`; a miss is null.
#[tauri::command]
#[specta::specta]
pub async fn google_batch_metadata(ids: Vec<String>) -> AppResult<Vec<Option<GoogleBatchPano>>> {
    if ids.len() > 500 {
        return Err(AppError::from("google_batch_metadata: at most 500 ids"));
    }
    let mut by_id = std::collections::HashMap::new();
    for chunk in ids.chunks(100) {
        for pano in post_metadata(chunk).await? {
            by_id.insert(pano.id.clone(), pano);
        }
    }
    Ok(ids.into_iter().map(|id| by_id.remove(&id)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tile_of_null_island_is_the_centre_of_z17() {
        assert_eq!(wgs84_to_tile(0.0, 0.0, 17), (65536, 65536));
    }

    #[test]
    fn photometa_ids_follow_the_xssi_json_path() {
        let body = ")]}'\n[0,[0,[[[[0,\"abc\"]]],[[[0,\"def\"]]],[[[0,\"abc\"]]]]]]";
        assert_eq!(pano_ids_from_photometa(body), vec!["abc".to_string(), "def".to_string()]);
    }

    #[test]
    fn a_short_or_non_json_body_lists_nothing() {
        assert!(pano_ids_from_photometa("nope").is_empty());
        assert!(pano_ids_from_photometa(")]}'\n{}").is_empty());
    }

    #[test]
    fn baidu_ids_step_one_millisecond_and_stop_at_the_end() {
        let prefix = "0900000000";
        let car = "01";
        let start = baidu_time_to_ms("240315120000000").unwrap();
        let end = start + 2;
        let (ids, next, done) = take_baidu_ids(prefix, car, start, end, false, 10, false, 1, 1, false, 0, 0);
        assert_eq!(ids.len(), 3);
        assert_eq!(ids[0], format_pid(prefix, start, car).unwrap());
        assert_eq!(ids[2], format_pid(prefix, start + 2, car).unwrap());
        assert_eq!(ids[0].len(), 27);
        assert!(done);
        assert!(next > end);
    }

    #[test]
    fn a_skip_window_is_not_probed() {
        let start = baidu_time_to_ms("240315120000000").unwrap();
        let (ids, _, _) = take_baidu_ids(
            "0900000000",
            "01",
            start,
            start + 5,
            false,
            10,
            false,
            1,
            1,
            true,
            12 * 60,
            12 * 60,
        );
        assert!(ids.is_empty());
    }

    #[test]
    fn batch_item_reads_the_getmetadata_layout() {
        let item = serde_json::json!([
            0,
            [0, "ABCDEFGHIJKLMNOPQRSTUV"],
            [0, 0, [4096.0, 8192.0]],
            [0, 0, [["Short"], ["Long"]]],
            0,
            [[
                0,
                [[0, 0, 1.25, 2.5], [40.0], 0, 0, "US"],
                [90.0],
                [[[[0, "LINKPANOLINKPANOLINK01"]]]],
                0,
                0,
                [[0, [0, 0, 0, 45.0]]],
                0,
                [[0, [2019, 4]]]
            ]],
            [0, 0, 0, 0, 0, 0, 0, [2024, 3]]
        ]);
        let parsed = parse_google_item(&item).expect("item");
        assert_eq!(parsed.id, "ABCDEFGHIJKLMNOPQRSTUV");
        assert_eq!(parsed.lat, 1.25);
        assert_eq!(parsed.lng, 2.5);
        assert_eq!(parsed.heading, 90.0);
        assert_eq!(parsed.image_date, "2024-03");
        assert_eq!(parsed.altitude, Some(40.0));
        assert_eq!(parsed.country.as_deref(), Some("US"));
        assert_eq!(parsed.world_height, 4096.0);
        assert_eq!(parsed.short_description, "Short");
        assert_eq!(parsed.description, "Short, Long");
        assert_eq!(parsed.links.len(), 1);
        assert_eq!(parsed.links[0].pano_id, "LINKPANOLINKPANOLINK01");
        assert_eq!(parsed.links[0].heading, 45.0);
        assert!(parsed.time.iter().any(|t| t.date == "2019-04"));
        assert!(parsed.time.iter().any(|t| t.pano_id == parsed.id && t.date == "2024-03"));
    }
}
