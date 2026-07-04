use std::collections::HashMap;
use std::path::Path;

use image::{imageops, RgbImage};
use ort::session::Session;
use ort::value::Tensor;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::fetch::fetch_tiles_concurrent;

const DEFAULT_ZOOM: u32 = 4;
const DEFAULT_TX: u32 = 9;
const DEFAULT_TY: u32 = 6;
const CHUNK_SIZE: usize = 500;

// Max rows stacked into one session.run call.
const OCR_BATCH_SIZE: usize = 64;

const CROP_X: u32 = 100;
const CROP_Y: u32 = 148;
const CROP_W: u32 = 380;
const CROP_H: u32 = 28;

const REC_HEIGHT: u32 = 48;

// Google SV tiles are 512x512 regardless of zoom/pano generation.
const TILE_DIM: u32 = 512;

struct Candidate {
    name: &'static str,
    zoom: u32,
    x: u32,
    y: u32,
    crop: [u32; 4],
}

// Empirically calibrated per pano-generation worldSize bucket. Order = default sweep order.
const CANDIDATES: [Candidate; 3] = [
    Candidate { name: "gen4", zoom: 4, x: 9, y: 6, crop: [50, 350, 180, 45] },
    Candidate { name: "gen2_3", zoom: 4, x: 7, y: 5, crop: [75, 12, 170, 45] },
    Candidate { name: "gen1", zoom: 3, x: 4, y: 2, crop: [225, 225, 150, 45] },
];

// Watermark drifts vertically between panos within a generation.
const SHIFTS: [i32; 5] = [0, -30, 30, -60, 60];

fn shift_crop(crop: [u32; 4], shift: i32) -> [u32; 4] {
    let [x, y, w, h] = crop;
    let max_y = TILE_DIM.saturating_sub(h) as i32;
    let new_y = (y as i32 + shift).clamp(0, max_y) as u32;
    [x, new_y, w, h]
}

fn is_official_pano(pano_id: &str) -> bool {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[-_A-Za-z0-9]{21}[AQgw]$").unwrap())
        .is_match(pano_id)
}

// Generic "try start_idx first, then the rest in original order" reorder.
fn ordered_indices(len: usize, start_idx: usize) -> Vec<usize> {
    let mut order = vec![start_idx];
    order.extend((0..len).filter(|&i| i != start_idx));
    order
}

// Tries CANDIDATES[start_idx] first, then the rest in default order.
fn ordered_candidate_indices(start_idx: usize) -> Vec<usize> {
    ordered_indices(CANDIDATES.len(), start_idx)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectInput {
    pub pano_ids: Vec<String>,
    #[serde(default)]
    pub tile_coords: Option<TileCoords>,
    #[serde(default)]
    pub crop: Option<[u32; 4]>,
}

#[derive(Deserialize)]
pub struct TileCoords {
    pub zoom: u32,
    pub x: u32,
    pub y: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub pano_id: String,
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<usize>,
}

// Ops in the mobile rec model are too small for intra-op parallelism to pay;
// throughput comes from running N single-threaded sessions concurrently instead.
fn load_rec_sessions(model_dir: &str, n: usize) -> Vec<Session> {
    let path = Path::new(model_dir).join("rec_model.onnx");
    (0..n)
        .map(|_| {
            Session::builder()
                .expect("failed to create session builder")
                .with_intra_threads(1)
                .expect("failed to set intra threads")
                .commit_from_file(&path)
                .unwrap_or_else(|e| panic!("failed to load rec model at {}: {e}", path.display()))
        })
        .collect()
}

fn load_char_dict(model_dir: &str) -> Vec<String> {
    let path = Path::new(model_dir).join("ppocr_keys_v1.txt");
    let content = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read char dict at {}: {e}", path.display()));
    let mut chars: Vec<String> = vec!["".to_string()]; // index 0 = CTC blank
    for line in content.lines() {
        if !line.is_empty() {
            chars.push(line.to_string());
        }
    }
    chars.push(" ".to_string());
    chars
}

fn decode_tile(tile_data: &[u8]) -> Option<RgbImage> {
    image::load_from_memory(tile_data).ok().map(|img| img.to_rgb8())
}

fn preprocess_crop(img: &RgbImage, crop: [u32; 4]) -> Option<(Vec<f32>, u32)> {
    let [cx, cy, cw, ch] = crop;
    let cx = cx.min(img.width().saturating_sub(1));
    let cy = cy.min(img.height().saturating_sub(1));
    let cw = cw.min(img.width() - cx);
    let ch = ch.min(img.height() - cy);

    let cropped = imageops::crop_imm(img, cx, cy, cw, ch).to_image();
    let scale = REC_HEIGHT as f32 / cropped.height() as f32;
    let new_w = (cropped.width() as f32 * scale).round() as u32;
    let resized = imageops::resize(&cropped, new_w, REC_HEIGHT, imageops::FilterType::Triangle);

    // Normalize to [-0.5, 0.5], CHW layout
    let mut data = vec![0f32; (3 * REC_HEIGHT * new_w) as usize];
    for y in 0..REC_HEIGHT {
        for x in 0..new_w {
            let p = resized.get_pixel(x, y).0;
            for c in 0..3usize {
                data[c * (REC_HEIGHT * new_w) as usize + (y * new_w + x) as usize] = p[c] as f32 / 255.0 - 0.5;
            }
        }
    }
    Some((data, new_w))
}

fn greedy_ctc_decode(raw: &[f32], seq_len: usize, num_classes: usize, char_dict: &[String]) -> Option<String> {
    let mut text = String::new();
    let mut prev_idx = 0usize;
    for t in 0..seq_len {
        let offset = t * num_classes;
        let mut best_idx = 0;
        let mut best_val = f32::NEG_INFINITY;
        for c in 0..num_classes {
            if raw[offset + c] > best_val {
                best_val = raw[offset + c];
                best_idx = c;
            }
        }
        if best_idx != 0 && best_idx != prev_idx && best_idx < char_dict.len() {
            text.push_str(&char_dict[best_idx]);
        }
        prev_idx = best_idx;
    }
    if text.is_empty() { None } else { Some(text) }
}

// Runs one session.run call over a stacked [n, 3, REC_HEIGHT, width] batch.
// All n rows must share the same width (true within a bucket: crop dims are fixed per candidate).
fn recognize_batch(
    session: &mut Session,
    data: Vec<f32>,
    n: usize,
    width: u32,
    char_dict: &[String],
) -> Vec<Option<String>> {
    if n == 0 {
        return Vec::new();
    }
    let shape = [n as i64, 3, REC_HEIGHT as i64, width as i64];
    let Ok(tensor) = Tensor::from_array((shape.as_slice(), data.into_boxed_slice())) else {
        return vec![None; n];
    };

    let out_name = session.outputs()[0].name().to_string();
    let Ok(mut outputs) = session.run(ort::inputs!["x" => tensor]) else {
        return vec![None; n];
    };
    let Some(output) = outputs.remove(&out_name) else {
        return vec![None; n];
    };
    let Ok((shape_info, raw)) = output.try_extract_tensor::<f32>() else {
        return vec![None; n];
    };

    let dims: Vec<usize> = shape_info.iter().map(|&d| d as usize).collect();
    if dims.len() != 3 || dims[0] != n {
        return vec![None; n];
    }
    let seq_len = dims[1];
    let num_classes = dims[2];

    (0..n)
        .map(|b| {
            let row = &raw[b * seq_len * num_classes..(b + 1) * seq_len * num_classes];
            greedy_ctc_decode(row, seq_len, num_classes, char_dict)
        })
        .collect()
}

// Output classes of the rec model, probed with a dummy inference. Must equal the
// char dict length or every decode silently yields empty text.
fn model_num_classes(session: &mut Session) -> Option<usize> {
    let width = 16u32;
    let data = vec![0f32; (3 * REC_HEIGHT * width) as usize];
    let shape = [1i64, 3, REC_HEIGHT as i64, width as i64];
    let tensor = Tensor::from_array((shape.as_slice(), data.into_boxed_slice())).ok()?;
    let out_name = session.outputs()[0].name().to_string();
    let mut outputs = session.run(ort::inputs!["x" => tensor]).ok()?;
    let output = outputs.remove(&out_name)?;
    let (shape_info, _) = output.try_extract_tensor::<f32>().ok()?;
    let dims: Vec<usize> = shape_info.iter().map(|&d| d as usize).collect();
    (dims.len() == 3).then(|| dims[2])
}

fn extract_year(text: &str, max_year: u32) -> Option<u32> {
    let re = Regex::new(r"(20[0-4]\d)").unwrap();
    re.captures(text)
        .and_then(|c| c[1].parse().ok())
        .filter(|&y| y <= max_year)
}

fn current_year() -> u32 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    // Civil-from-days (Howard Hinnant); exact at year boundaries.
    let z = (secs / 86400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }) as u32
}

// Preprocesses one crop per pid, stacks in groups of OCR_BATCH_SIZE, runs recognize_batch,
// returns pid -> (year, text) for pids that yielded a non-empty OCR result.
type OcrOutput<'a> = (HashMap<&'a str, (Option<u32>, String)>, usize, u128, u128);

fn ocr_group<'a>(
    session: &mut Session,
    char_dict: &[String],
    images: &HashMap<&'a str, RgbImage>,
    pids: &[&'a str],
    crop: [u32; 4],
    max_year: u32,
) -> OcrOutput<'a> {
    let mut results = HashMap::new();
    let mut inferences = 0usize;
    let mut prep_ms = 0u128;
    let mut run_ms = 0u128;

    for batch in pids.chunks(OCR_BATCH_SIZE) {
        let prep_start = std::time::Instant::now();
        let mut batch_data = Vec::new();
        let mut batch_pids = Vec::new();
        let mut width = 0u32;
        for &pid in batch {
            let Some((data, w)) = preprocess_crop(&images[pid], crop) else { continue };
            if batch_pids.is_empty() {
                width = w;
            } else if w != width {
                // Undersized/corrupt tile; a mismatched row would corrupt the whole batch tensor.
                continue;
            }
            batch_data.extend_from_slice(&data);
            batch_pids.push(pid);
        }
        prep_ms += prep_start.elapsed().as_millis();
        if batch_pids.is_empty() {
            continue;
        }
        let run_start = std::time::Instant::now();
        let texts = recognize_batch(session, batch_data, batch_pids.len(), width, char_dict);
        run_ms += run_start.elapsed().as_millis();
        for (&pid, text) in batch_pids.iter().zip(texts) {
            inferences += 1;
            if let Some(text) = text {
                let year = extract_year(&text, max_year);
                results.insert(pid, (year, text));
            }
        }
    }
    (results, inferences, prep_ms, run_ms)
}

// Splits pids across the session pool; each session runs on its own thread.
fn ocr_batch<'a>(
    sessions: &mut [Session],
    char_dict: &[String],
    images: &HashMap<&'a str, RgbImage>,
    pids: &[&'a str],
    crop: [u32; 4],
    max_year: u32,
) -> OcrOutput<'a> {
    let group_size = pids.len().div_ceil(sessions.len()).max(1);
    let groups: Vec<&[&str]> = pids.chunks(group_size).collect();

    let outputs: Vec<_> = std::thread::scope(|scope| {
        let handles: Vec<_> = sessions
            .iter_mut()
            .zip(&groups)
            .map(|(session, group)| {
                scope.spawn(move || ocr_group(session, char_dict, images, group, crop, max_year))
            })
            .collect();
        handles.into_iter().map(|h| h.join().expect("ocr thread panicked")).collect()
    });

    let mut results = HashMap::new();
    let mut inferences = 0usize;
    let mut prep_ms = 0u128;
    let mut run_ms = 0u128;
    for (r, i, p, rn) in outputs {
        results.extend(r);
        inferences += i;
        prep_ms = prep_ms.max(p);
        run_ms = run_ms.max(rn);
    }
    (results, inferences, prep_ms, run_ms)
}

pub fn run(
    input: &DetectInput,
    model_dir: &str,
    mut emit: impl FnMut(DetectResult),
) {
    let max_year = current_year();
    let pool_size = std::thread::available_parallelism().map_or(4, |n| n.get()).min(2);
    let mut sessions = load_rec_sessions(model_dir, pool_size);
    let char_dict = load_char_dict(model_dir);
    match model_num_classes(&mut sessions[0]) {
        Some(nc) if nc == char_dict.len() => {}
        got => {
            let classes = got.map_or("unknown".into(), |n: usize| n.to_string());
            let msg = format!(
                "model/dict mismatch: model outputs {classes} classes, dict has {} entries",
                char_dict.len()
            );
            eprintln!("[copyright] FATAL: {msg}");
            let total = input.pano_ids.len();
            for (i, pid) in input.pano_ids.iter().enumerate() {
                emit(DetectResult {
                    pano_id: pid.clone(), year: None, text: None,
                    error: Some(msg.clone()),
                    done: Some(i + 1), total: Some(total),
                });
            }
            return;
        }
    }
    eprintln!("[copyright] model loaded ({pool_size} sessions), {} chars in dict", char_dict.len());

    let total = input.pano_ids.len();
    let mut done = 0;
    let pano_strs: Vec<&str> = input.pano_ids.iter().map(|s| s.as_str()).collect();

    let mut officials: Vec<&str> = Vec::with_capacity(pano_strs.len());
    for &pid in &pano_strs {
        if is_official_pano(pid) {
            officials.push(pid);
        } else {
            done += 1;
            emit(DetectResult {
                pano_id: pid.to_string(), year: None, text: None,
                error: Some("unofficial pano".into()),
                done: Some(done), total: Some(total),
            });
        }
    }

    if input.tile_coords.is_some() || input.crop.is_some() {
        let zoom = input.tile_coords.as_ref().map_or(DEFAULT_ZOOM, |t| t.zoom);
        let tx = input.tile_coords.as_ref().map_or(DEFAULT_TX, |t| t.x);
        let ty = input.tile_coords.as_ref().map_or(DEFAULT_TY, |t| t.y);
        let crop = input.crop.unwrap_or([CROP_X, CROP_Y, CROP_W, CROP_H]);

        for chunk in officials.chunks(CHUNK_SIZE) {
            let fetched = fetch_tiles_concurrent(chunk, zoom, tx, ty);

            let mut errors: HashMap<&str, String> = HashMap::new();
            let mut images: HashMap<&str, RgbImage> = HashMap::new();
            for &pid in chunk {
                match fetched.get(pid) {
                    None => { errors.insert(pid, "fetch failed".into()); }
                    Some(Err(e)) => { errors.insert(pid, e.clone()); }
                    Some(Ok(data)) => {
                        if let Some(img) = decode_tile(data) {
                            images.insert(pid, img);
                        }
                    }
                }
            }

            let ids: Vec<&str> = chunk.iter().copied().filter(|pid| images.contains_key(pid)).collect();
            let (results, _, _, _) = ocr_batch(&mut sessions, &char_dict, &images, &ids, crop, max_year);

            for &pid in chunk {
                done += 1;
                let (year, text, error) = match results.get(pid) {
                    Some((y, t)) => (*y, Some(t.clone()), None),
                    None => (None, None, errors.get(pid).cloned()),
                };
                emit(DetectResult {
                    pano_id: pid.to_string(), year, text, error,
                    done: Some(done), total: Some(total),
                });
            }
        }
        return;
    }

    let mut last_bucket = 0usize;
    let mut last_shift = 0usize;

    for chunk in officials.chunks(CHUNK_SIZE) {
        let mut remaining: Vec<&str> = chunk.to_vec();
        let mut result: HashMap<&str, (Option<u32>, Option<String>)> = HashMap::new();
        let mut fetch_errors: HashMap<&str, String> = HashMap::new();

        for cand_idx in ordered_candidate_indices(last_bucket) {
            if remaining.is_empty() {
                break;
            }
            let cand = &CANDIDATES[cand_idx];
            let fetch_start = std::time::Instant::now();
            let fetched = fetch_tiles_concurrent(&remaining, cand.zoom, cand.x, cand.y);
            let fetch_ms = fetch_start.elapsed().as_millis();

            let decode_start = std::time::Instant::now();

            let mut images: HashMap<&str, RgbImage> = HashMap::new();
            for &pid in &remaining {
                match fetched.get(pid) {
                    None => {}
                    Some(Err(e)) => { fetch_errors.insert(pid, e.clone()); }
                    Some(Ok(data)) => {
                        if let Some(img) = decode_tile(data) {
                            images.insert(pid, img);
                        }
                    }
                }
            }

            let decode_ms = decode_start.elapsed().as_millis();
            let ocr_start = std::time::Instant::now();

            let mut unresolved: Vec<&str> = remaining.iter().copied().filter(|pid| images.contains_key(pid)).collect();
            let mut resolved: HashMap<&str, (u32, String)> = HashMap::new();
            let mut inferences = 0usize;
            let mut prep_ms = 0u128;
            let mut run_ms = 0u128;

            for shift_idx in ordered_indices(SHIFTS.len(), last_shift) {
                if unresolved.is_empty() {
                    break;
                }
                let crop = shift_crop(cand.crop, SHIFTS[shift_idx]);
                let (round_results, round_inferences, round_prep, round_run) =
                    ocr_batch(&mut sessions, &char_dict, &images, &unresolved, crop, max_year);
                inferences += round_inferences;
                prep_ms += round_prep;
                run_ms += round_run;

                for (pid, (year, text)) in round_results {
                    if let Some(year) = year {
                        resolved.insert(pid, (year, text));
                        last_shift = shift_idx;
                    }
                }
                unresolved.retain(|pid| !resolved.contains_key(pid));
            }

            let hits = resolved.len();
            if hits > 0 {
                last_bucket = cand_idx;
            }
            for (pid, (year, text)) in resolved {
                result.insert(pid, (Some(year), Some(text)));
            }

            eprintln!(
                "[copyright] bucket {}: {} panos, fetch {}ms, decode {}ms, ocr {}ms (prep {}ms, run {}ms, {} inferences), {} hits",
                cand.name, remaining.len(), fetch_ms, decode_ms,
                ocr_start.elapsed().as_millis(), prep_ms, run_ms, inferences, hits
            );

            remaining.retain(|pid| !result.contains_key(pid));
        }

        for &pid in chunk {
            done += 1;
            let (year, text) = result.get(pid).cloned().unwrap_or((None, None));
            let error = if year.is_none() {
                fetch_errors.get(pid).cloned()
            } else {
                None
            };
            emit(DetectResult {
                pano_id: pid.to_string(), year, text, error,
                done: Some(done), total: Some(total),
            });
        }
    }
}

#[cfg(test)]
#[path = "detect.test.rs"]
mod tests;
