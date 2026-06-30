use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::embed::{self, EmbedCache, EMBED_DIM};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextSearchInput {
    pub query: String,
    pub k: Option<usize>,
    pub threshold: Option<f32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSearchInput {
    pub pano_id: String,
    pub k: Option<usize>,
    pub threshold: Option<f32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub results: Vec<SearchHit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub pano_id: String,
    pub score: f32,
}

fn max_crop_score(query: &[f32; EMBED_DIM], crops: &[[f32; EMBED_DIM]]) -> f32 {
    crops.iter()
        .map(|emb| emb.iter().zip(query.iter()).map(|(a, b)| a * b).sum::<f32>())
        .fold(f32::NEG_INFINITY, f32::max)
}

fn search(cache: &EmbedCache, query: &[f32; EMBED_DIM], k: Option<usize>, threshold: Option<f32>, exclude: Option<&str>) -> Vec<SearchHit> {
    let mut results: Vec<SearchHit> = cache.entries.iter()
        .filter(|(pid, _)| exclude.is_none_or(|ex| pid.as_str() != ex))
        .map(|(pid, crops)| SearchHit {
            pano_id: pid.clone(),
            score: (max_crop_score(query, crops) * 10000.0).round() / 10000.0,
        })
        .collect();

    if let Some(t) = threshold {
        results.retain(|r| r.score >= t);
    }
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    if let Some(k) = k {
        results.truncate(k);
    }
    results
}

pub fn text_search(input: &TextSearchInput, model_dir: &str, cache_dir: &str) -> SearchResults {
    let cache = EmbedCache::load(cache_dir);
    if cache.entries.is_empty() {
        return SearchResults { results: vec![] };
    }

    let tokenizer_path = Path::new(model_dir).join("tokenizer.json");
    let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
        .unwrap_or_else(|e| panic!("failed to load tokenizer: {e}"));

    let mut session = embed::load_text_encoder(model_dir);
    match embed::embed_text(&mut session, &tokenizer, &input.query) {
        Ok(query_emb) => SearchResults {
            results: search(&cache, &query_emb, input.k, input.threshold, None),
        },
        Err(e) => {
            eprintln!("text encoding error: {e}");
            SearchResults { results: vec![] }
        }
    }
}

pub fn image_search(input: &ImageSearchInput, cache_dir: &str) -> SearchResults {
    let cache = EmbedCache::load(cache_dir);
    let Some(ref_crops) = cache.entries.get(&input.pano_id) else {
        eprintln!("pano {} not in cache", input.pano_id);
        return SearchResults { results: vec![] };
    };
    // Average crop embeddings as reference
    let mut ref_emb = [0f32; EMBED_DIM];
    for crop in ref_crops {
        for (i, &v) in crop.iter().enumerate() { ref_emb[i] += v; }
    }
    let n = ref_crops.len() as f32;
    for v in &mut ref_emb { *v /= n; }
    let norm: f32 = ref_emb.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 { for v in &mut ref_emb { *v /= norm; } }

    SearchResults {
        results: search(&cache, &ref_emb, input.k, input.threshold, Some(&input.pano_id)),
    }
}
