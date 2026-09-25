use std::path::Path;
use std::sync::{Arc, OnceLock};

use image::RgbImage;
use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

const IN: usize = 160;
const CLASSES: [&str; 4] = ["normal", "smallcam", "truck", "trekker"];
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub pano_id: String,
    pub heading: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectInput {
    pub items: Vec<Item>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub pano_id: String,
    pub heading: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn runtime() -> &'static tokio::runtime::Runtime {
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(UA)
            .timeout(std::time::Duration::from_secs(25))
            .build()
            .unwrap()
    })
}

fn thumb_url(pano_id: &str, heading: f64) -> String {
    format!(
        "https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid={pano_id}&cb_client=maps_sv.tactile.gps&w=512&h=512&yaw={heading}&pitch=90&thumbfov=120"
    )
}

async fn fetch_jpeg(url: &str) -> Result<Vec<u8>, String> {
    let mut last = String::from("fetch failed");
    for attempt in 0..3 {
        match client().get(url).send().await {
            Ok(resp) => match resp.error_for_status() {
                Ok(resp) => match resp.bytes().await {
                    Ok(b) if b.len() > 1500 => return Ok(b.to_vec()),
                    Ok(_) => last = "thumbnail too small".into(),
                    Err(e) => last = e.to_string(),
                },
                Err(e) => last = e.to_string(),
            },
            Err(e) => last = e.to_string(),
        }
        tokio::time::sleep(std::time::Duration::from_millis(400 * (attempt + 1))).await;
    }
    Err(last)
}

/// Area downsample matching PIL `Image.BOX`: each output pixel is the coverage-weighted
/// mean of the source rectangle it covers. Values are 0..1 RGB.
fn box_down(src: &RgbImage, dw: usize, dh: usize) -> Vec<[f32; 3]> {
    let sw = src.width() as usize;
    let sh = src.height() as usize;
    let mut out = vec![[0f32; 3]; dw * dh];
    for y in 0..dh {
        let y0 = y as f32 * sh as f32 / dh as f32;
        let y1 = (y + 1) as f32 * sh as f32 / dh as f32;
        let iy0 = y0.floor() as usize;
        let iy1 = (y1.ceil() as usize).min(sh);
        for x in 0..dw {
            let x0 = x as f32 * sw as f32 / dw as f32;
            let x1 = (x + 1) as f32 * sw as f32 / dw as f32;
            let ix0 = x0.floor() as usize;
            let ix1 = (x1.ceil() as usize).min(sw);
            let mut acc = [0f32; 3];
            let mut wsum = 0f32;
            for yy in iy0..iy1 {
                let yf = (yy as f32 + 1.0).min(y1) - (yy as f32).max(y0);
                if yf <= 0.0 {
                    continue;
                }
                for xx in ix0..ix1 {
                    let xf = (xx as f32 + 1.0).min(x1) - (xx as f32).max(x0);
                    if xf <= 0.0 {
                        continue;
                    }
                    let w = xf * yf;
                    let p = src.get_pixel(xx as u32, yy as u32);
                    for c in 0..3 {
                        acc[c] += p[c] as f32 * w;
                    }
                    wsum += w;
                }
            }
            if wsum > 0.0 {
                for c in 0..3 {
                    acc[c] /= wsum * 255.0;
                }
            }
            out[y * dw + x] = acc;
        }
    }
    out
}

/// Local std and Laplacian, same kernels as training (k=15 avg pool, 4-neighbor Laplace).
/// Padding is zeros and is included in the pool divisor.
fn blur_and_edge(luma: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let n = IN;
    let k = 15usize;
    let pad = k / 2;
    let kk = (k * k) as f32;
    let mut blur = vec![0f32; n * n];
    let mut edge = vec![0f32; n * n];
    for y in 0..n {
        for x in 0..n {
            let mut sum = 0f32;
            let mut sumsq = 0f32;
            for dy in 0..k {
                for dx in 0..k {
                    let yy = y as isize + dy as isize - pad as isize;
                    let xx = x as isize + dx as isize - pad as isize;
                    if yy >= 0 && (yy as usize) < n && xx >= 0 && (xx as usize) < n {
                        let v = luma[yy as usize * n + xx as usize];
                        sum += v;
                        sumsq += v * v;
                    }
                }
            }
            let mu = sum / kk;
            let var = (sumsq / kk - mu * mu).max(0.0).sqrt();
            blur[y * n + x] = 1.0 - (var / 0.06).clamp(0.0, 1.0);

            let at = |yy: isize, xx: isize| -> f32 {
                if yy >= 0 && (yy as usize) < n && xx >= 0 && (xx as usize) < n {
                    luma[yy as usize * n + xx as usize]
                } else {
                    0.0
                }
            };
            let c = luma[y * n + x];
            let lap = (at(y as isize - 1, x as isize)
                + at(y as isize + 1, x as isize)
                + at(y as isize, x as isize - 1)
                + at(y as isize, x as isize + 1)
                - 4.0 * c)
                .abs();
            edge[y * n + x] = (lap / 0.25).clamp(0.0, 1.0);
        }
    }
    (blur, edge)
}

fn featurize(bytes: &[u8]) -> Result<Vec<f32>, String> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| e.to_string())?
        .to_rgb8();
    let rgb = box_down(&img, IN, IN);
    let mut luma = vec![0f32; IN * IN];
    for (i, px) in rgb.iter().enumerate() {
        luma[i] = (px[0] + px[1] + px[2]) / 3.0;
    }
    let (blur, edge) = blur_and_edge(&luma);
    let plane = IN * IN;
    let mut data = vec![0f32; 5 * plane];
    for i in 0..plane {
        data[i] = rgb[i][0];
        data[plane + i] = rgb[i][1];
        data[2 * plane + i] = rgb[i][2];
        data[3 * plane + i] = blur[i];
        data[4 * plane + i] = edge[i];
    }
    Ok(data)
}

fn softmax_argmax(logits: &[f32]) -> (usize, f32) {
    let mx = logits.iter().copied().fold(f32::MIN, f32::max);
    let mut sum = 0f32;
    let mut best_i = 0usize;
    let mut best = f32::MIN;
    for (i, &v) in logits.iter().enumerate() {
        let e = (v - mx).exp();
        sum += e;
        if e > best {
            best = e;
            best_i = i;
        }
    }
    (best_i, best / sum)
}

fn classify(session: &mut Session, feat: &[f32]) -> Result<String, String> {
    let shape = [1i64, 5, IN as i64, IN as i64];
    let tensor = Tensor::from_array((shape.as_slice(), feat.to_vec().into_boxed_slice()))
        .map_err(|e| e.to_string())?;
    let out_name = session.outputs()[0].name().to_string();
    let mut outputs = session
        .run(ort::inputs!["image" => tensor])
        .map_err(|e| e.to_string())?;
    let output = outputs.remove(&out_name).ok_or("missing logits")?;
    let (_, raw) = output
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    if raw.len() < CLASSES.len() {
        return Err("short logits".into());
    }
    let (idx, _p) = softmax_argmax(&raw[..CLASSES.len()]);
    Ok(CLASSES[idx].to_string())
}

fn load_session(model_dir: &str) -> Session {
    let path = Path::new(model_dir).join("gen4cam.onnx");
    Session::builder()
        .expect("ort session builder")
        .commit_from_file(&path)
        .unwrap_or_else(|e| panic!("failed to load {} : {e}", path.display()))
}

pub fn run(input: &DetectInput, model_dir: &str, mut emit: impl FnMut(DetectResult)) {
    let mut session = load_session(model_dir);
    let sem = Arc::new(Semaphore::new(12));
    let rt = runtime();
    let items = input.items.clone();
    let fetched: Vec<(Item, Result<Vec<u8>, String>)> = rt.block_on(async {
        let mut joins = Vec::with_capacity(items.len());
        for item in items {
            let sem = sem.clone();
            joins.push(tokio::spawn(async move {
                let permit = sem.acquire_owned().await.ok();
                let url = thumb_url(&item.pano_id, item.heading);
                let bytes = fetch_jpeg(&url).await;
                drop(permit);
                (item, bytes)
            }));
        }
        let mut out = Vec::with_capacity(joins.len());
        for join in joins {
            if let Ok(pair) = join.await {
                out.push(pair);
            }
        }
        out
    });

    for (item, bytes) in fetched {
        let result = match bytes
            .and_then(|b| featurize(&b))
            .and_then(|feat| classify(&mut session, &feat))
        {
            Ok(camera) => DetectResult {
                pano_id: item.pano_id,
                heading: item.heading,
                camera: Some(camera),
                error: None,
            },
            Err(error) => DetectResult {
                pano_id: item.pano_id,
                heading: item.heading,
                camera: None,
                error: Some(error),
            },
        };
        emit(result);
    }
}
