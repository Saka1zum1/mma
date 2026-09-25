mod detect;

use clap::{Parser, Subcommand};
use std::io::{self, Write};

#[derive(Parser)]
#[command(
    name = "mma-gen4cam",
    about = "Experimental Gen4 camera classifier for MMA"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
    /// Where gen4cam.onnx lives (inside the sidecar bundle).
    #[arg(long, global = true, default_value = "models")]
    model_dir: String,
    /// Working data owned by this sidecar. Accepted but unused.
    #[arg(long, global = true, default_value = "data")]
    data_dir: String,
}

#[derive(Subcommand)]
enum Command {
    /// Classify the Gen4 rig from a nadir thumbnail.
    Detect {
        #[arg(long)]
        input: String,
    },
}

fn main() {
    let Cli {
        command,
        model_dir,
        data_dir: _,
    } = Cli::parse();
    let mut stdout = io::stdout();
    match command {
        Command::Detect { input } => {
            let raw = std::fs::read_to_string(&input)
                .unwrap_or_else(|e| panic!("failed to read input file {input}: {e}"));
            let input: detect::DetectInput =
                serde_json::from_str(&raw).expect("invalid input JSON");
            detect::run(&input, &model_dir, |result| {
                let line = serde_json::to_string(&result).unwrap();
                writeln!(stdout, "{line}").ok();
                stdout.flush().ok();
            });
        }
    }
}
