mod fetch;
mod embed;
mod project;
mod search;

use clap::{Parser, Subcommand};
use std::io::{self, Write};

#[derive(Parser)]
#[command(name = "mma-vision", about = "Vision analysis sidecar for MMA")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// List pano IDs already in the embedding cache
    ListCached {
        #[arg(long)]
        cache_dir: String,
    },
    /// Batch-compute CLIP image embeddings
    Embed {
        #[arg(long)]
        input: String,
        #[arg(long)]
        model_dir: String,
        #[arg(long)]
        cache_dir: String,
    },
    /// Text-to-image search over cached embeddings
    SearchText {
        #[arg(long)]
        input: String,
        #[arg(long)]
        model_dir: String,
        #[arg(long)]
        cache_dir: String,
    },
    /// Image-to-image similarity search
    SearchImage {
        #[arg(long)]
        input: String,
        #[arg(long)]
        cache_dir: String,
    },
    /// Debug: fetch, stitch, crop a single pano and save images
    DebugCrops {
        #[arg(long)]
        pano_id: String,
        #[arg(long)]
        world_width: u32,
        #[arg(long)]
        world_height: u32,
        #[arg(long)]
        output_dir: String,
    },
}

fn read_input(path: &str) -> String {
    std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("failed to read input file {path}: {e}"))
}

fn init_ort() {
    let mut ep_names: Vec<&str> = Vec::new();
    let mut eps: Vec<ort::execution_providers::ExecutionProviderDispatch> = Vec::new();

    #[cfg(feature = "directml")]
    { eps.push(ort::ep::DirectML::default().build()); ep_names.push("DirectML"); }

    #[cfg(feature = "coreml")]
    { eps.push(ort::ep::CoreML::default().build()); ep_names.push("CoreML"); }

    #[cfg(feature = "cuda")]
    { eps.push(ort::ep::CUDA::default().build()); ep_names.push("CUDA"); }

    if eps.is_empty() {
        eprintln!("[vision] GPU: none compiled, using CPU");
    } else {
        let ok = ort::init().with_execution_providers(eps).commit();
        if ok {
            eprintln!("[vision] GPU: registered {}", ep_names.join(", "));
        } else {
            eprintln!("[vision] GPU: init failed (env already set), falling back to CPU");
        }
    }
}

fn main() {
    init_ort();
    let cli = Cli::parse();
    let mut stdout = io::stdout();

    match cli.command {
        Command::ListCached { cache_dir } => {
            let cache = embed::EmbedCache::load(&cache_dir);
            let ids: Vec<&str> = cache.entries.keys().map(|s| s.as_str()).collect();
            let out = serde_json::to_string(&ids).unwrap();
            writeln!(stdout, "{out}").ok();
            stdout.flush().ok();
        }
        Command::Embed { input, model_dir, cache_dir } => {
            let input: embed::EmbedInput =
                serde_json::from_str(&read_input(&input)).expect("invalid input JSON");
            embed::run(&input, &model_dir, &cache_dir, |status| {
                let line = serde_json::to_string(&status).unwrap();
                writeln!(stdout, "{line}").ok();
                stdout.flush().ok();
            });
        }
        Command::SearchText { input, model_dir, cache_dir } => {
            let input: search::TextSearchInput =
                serde_json::from_str(&read_input(&input)).expect("invalid input JSON");
            let results = search::text_search(&input, &model_dir, &cache_dir);
            let out = serde_json::to_string(&results).unwrap();
            writeln!(stdout, "{out}").ok();
            stdout.flush().ok();
        }
        Command::SearchImage { input, cache_dir } => {
            let input: search::ImageSearchInput =
                serde_json::from_str(&read_input(&input)).expect("invalid input JSON");
            let results = search::image_search(&input, &cache_dir);
            let out = serde_json::to_string(&results).unwrap();
            writeln!(stdout, "{out}").ok();
            stdout.flush().ok();
        }
        Command::DebugCrops { pano_id, world_width, world_height, output_dir } => {
            let out = std::path::Path::new(&output_dir);
            std::fs::create_dir_all(out).ok();
            let fetched = fetch::fetch_panos_concurrent(&[(pano_id.as_str(), world_width, world_height)]);
            let pano = fetched.get(&pano_id).expect("fetch failed").as_ref().expect("fetch error");
            println!("Stitched pano: {}x{}", pano.width(), pano.height());
            pano.save(out.join("pano_stitched.png")).expect("save failed");
            let crops = embed::debug_extract_crops(pano);
            for (i, crop) in crops.iter().enumerate() {
                let name = format!("crop_{}_{}deg.png", i, i * 90);
                crop.save(out.join(&name)).expect("save failed");
                println!("Saved {name} ({}x{})", crop.width(), crop.height());
            }
        }
    }
}
