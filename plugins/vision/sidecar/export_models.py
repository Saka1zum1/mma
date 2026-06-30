"""Download pre-exported CLIP ViT-B/32 ONNX models from HuggingFace.
Run once: python export_models.py --output-dir ./models

Downloads from Xenova/clip-vit-base-patch32 (ONNX exports for transformers.js).
"""
import argparse, urllib.request, os, json
from pathlib import Path

HF_BASE = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main"

FILES = {
    "clip_image.onnx": f"{HF_BASE}/onnx/vision_model.onnx",
    "clip_text.onnx": f"{HF_BASE}/onnx/text_model.onnx",
    "tokenizer.json": f"{HF_BASE}/tokenizer.json",
}

def download(url: str, dest: Path):
    print(f"  Downloading {dest.name}...")
    urllib.request.urlretrieve(url, str(dest))
    size_mb = dest.stat().st_size / 1024 / 1024
    print(f"  -> {size_mb:.1f} MB")

def main(output_dir: str):
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    for name, url in FILES.items():
        dest = out / name
        if dest.exists():
            print(f"  {name} already exists, skipping")
        else:
            download(url, dest)

    print(f"\nDone. Models in {out}/")
    for f in sorted(out.iterdir()):
        print(f"  {f.name}: {f.stat().st_size / 1024 / 1024:.1f} MB")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="./models")
    args = parser.parse_args()
    main(args.output_dir)
