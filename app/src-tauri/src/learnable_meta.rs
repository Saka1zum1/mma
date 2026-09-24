//! Proxy for the public Learnable Meta userscript clue endpoint.
//! The webview cannot call learnablemeta.com directly (CORS), and the API key is not
//! required for a clue lookup — only a map id and a panorama id.

use crate::types::{AppError, AppResult};
use serde_json::Value;

const CLUE_URL: &str = "https://learnablemeta.com/api/userscript/location";
const MAX_BYTES: usize = 2 << 20;
const MAX_TEXT: usize = 8_000;
const MAX_IMAGES: usize = 24;

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LearnableMetaClue {
    pub country: String,
    pub meta_name: String,
    pub note: String,
    pub footer: String,
    pub images: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub fn learnable_meta_clue(
    map_id: String,
    pano_id: String,
) -> AppResult<Option<LearnableMetaClue>> {
    let map_id = clean_id(&map_id, "map id")?;
    let pano_id = clean_id(&pano_id, "panorama id")?;
    let url = format!(
        "{CLUE_URL}?mapId={}&panoId={}",
        urlencoding_query(&map_id),
        urlencoding_query(&pano_id),
    );
    let response = crate::proxy_client()
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", "MapMakingApp/LearnableMeta")
        .send()
        .map_err(|e| AppError(format!("Could not reach Learnable Meta: {e}")))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(AppError(format!(
            "Learnable Meta request failed (HTTP {})",
            response.status().as_u16()
        )));
    }
    let bytes = response
        .bytes()
        .map_err(|e| AppError(format!("Could not read Learnable Meta: {e}")))?;
    if bytes.len() > MAX_BYTES {
        return Err(AppError("Learnable Meta response is too large".into()));
    }
    let raw: Value = serde_json::from_slice(&bytes)
        .map_err(|_| AppError("Learnable Meta returned invalid JSON".into()))?;
    Ok(Some(normalize(&raw)))
}

fn clean_id(value: &str, label: &str) -> AppResult<String> {
    let id = value.trim();
    if id.is_empty() || id.len() > 512 || id.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(AppError(format!("Invalid Learnable Meta {label}")));
    }
    Ok(id.to_string())
}

fn urlencoding_query(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn normalize(raw: &Value) -> LearnableMetaClue {
    let obj = raw.as_object();
    let text = |key: &str| {
        obj.and_then(|o| o.get(key))
            .and_then(Value::as_str)
            .map(|s| truncate(s, MAX_TEXT))
            .unwrap_or_default()
    };
    let mut images = Vec::new();
    if let Some(list) = obj.and_then(|o| o.get("images")).and_then(Value::as_array) {
        for value in list {
            let Some(url) = value.as_str() else { continue };
            let url = url.trim();
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                continue;
            }
            if url.len() > 2048 || url.chars().any(|c| c.is_control() || c.is_whitespace()) {
                continue;
            }
            images.push(url.to_string());
            if images.len() == MAX_IMAGES {
                break;
            }
        }
    }
    LearnableMetaClue {
        country: text("country"),
        meta_name: text("metaName"),
        note: text("note"),
        footer: text("footer"),
        images,
    }
}

fn truncate(value: &str, maximum: usize) -> String {
    let mut end = value.len();
    if end > maximum {
        end = maximum;
        while !value.is_char_boundary(end) {
            end -= 1;
        }
    }
    value[..end].to_string()
}
