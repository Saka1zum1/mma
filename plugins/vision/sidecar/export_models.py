"""Download quantized SigLIP base patch16-224 ONNX models from HuggingFace.
Run once: python export_models.py --output-dir ./models

Vision encoder (bulk image embeds) is the expensive path, so it ships two
quantizations: int8 (vision_model.onnx) for the CPU build, fp16
(vision_model_fp16.onnx) for GPU builds. DirectML segfaults on the int8
dynamic-quant graph, and fp16 is ~12x faster there. Text encoding is one-off,
so it ships full fp32 (text_model.onnx) for CPU and fp16 (text_model_fp16.onnx)
for GPU. int8 text is avoided: it degrades sigmoid calibration ~1.6x and also
crashes DirectML. The CPU loader picks the plain names, GPU builds pick *_fp16.
Downloads are pinned to a specific commit and SHA256-verified. Also extracts
logit_scale / logit_bias from the original google checkpoint and writes
models/scoring.json for the sigmoid scoring on the Rust side.
"""
import argparse, urllib.request, os, json, hashlib, struct, math
from pathlib import Path

XENOVA_REV = "4649052661e53c7000355844105f8a1792088239"
XENOVA_BASE = f"https://huggingface.co/Xenova/siglip-base-patch16-224/resolve/{XENOVA_REV}"

GOOGLE_REV = "7fd15f0689c79d79e38b1c2e2e2370a7bf2761ed"
GOOGLE_SAFETENSORS = f"https://huggingface.co/google/siglip-base-patch16-224/resolve/{GOOGLE_REV}/model.safetensors"

# dest name -> (url, expected sha256)
FILES = {
    "vision_model.onnx": (
        f"{XENOVA_BASE}/onnx/vision_model_quantized.onnx",
        "ef14a954f3d57e1806666432bd9785004c1dc27100aa260eee0cb0f10a5de058",
    ),
    "text_model.onnx": (
        f"{XENOVA_BASE}/onnx/text_model.onnx",
        "3aa7fdbd20eaa8740cce17bf82913de641fcb632a768fed59f661cdcd0c32553",
    ),
    "vision_model_fp16.onnx": (
        f"{XENOVA_BASE}/onnx/vision_model_fp16.onnx",
        "7287a8e9cbf4f2eedd66e8dc5cf584be03108f4e4a24331879ac6ef7ac7c878f",
    ),
    "text_model_fp16.onnx": (
        f"{XENOVA_BASE}/onnx/text_model_fp16.onnx",
        "ebffbfd71ae11b3f9df5233095815953f44b02ca241c317722edd8c49a9de0f6",
    ),
    "tokenizer.json": (
        f"{XENOVA_BASE}/tokenizer.json",
        "4a17c975210be5ab4c36b47d8dae4eefb866dbfb1e676e394aad85dc30a3ae08",
    ),
}

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def download(url: str, dest: Path, expected_sha: str):
    print(f"  Downloading {dest.name}...")
    urllib.request.urlretrieve(url, str(dest))
    got = sha256_file(dest)
    if got != expected_sha:
        dest.unlink(missing_ok=True)
        raise SystemExit(f"SHA256 mismatch for {dest.name}: expected {expected_sha}, got {got}")
    size_mb = dest.stat().st_size / 1024 / 1024
    print(f"  -> {size_mb:.1f} MB (sha256 ok)")

def read_range(url: str, start: int, end: int) -> bytes:
    req = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}"})
    return urllib.request.urlopen(req).read()

def extract_scoring() -> dict:
    """Read logit_scale (log space) and logit_bias from the original google
    safetensors via ranged requests, without downloading the whole file."""
    header_len = struct.unpack("<Q", read_range(GOOGLE_SAFETENSORS, 0, 7))[0]
    header = json.loads(read_range(GOOGLE_SAFETENSORS, 8, 8 + header_len - 1))
    data_start = 8 + header_len
    vals = {}
    for key in ("logit_scale", "logit_bias"):
        meta = header[key]
        if meta["dtype"] != "F32" or meta["shape"] != [1]:
            raise SystemExit(f"unexpected {key} dtype/shape: {meta['dtype']} {meta['shape']}")
        a = data_start + meta["data_offsets"][0]
        b = data_start + meta["data_offsets"][1] - 1
        vals[key] = struct.unpack("<f", read_range(GOOGLE_SAFETENSORS, a, b))[0]
    return {
        "model": "siglip-base-patch16-224",
        "embed_dim": 768,
        # logit_scale is stored in log space; SigLIP applies exp() before scoring.
        "logit_scale_raw": vals["logit_scale"],
        "logit_scale": math.exp(vals["logit_scale"]),
        "logit_bias": vals["logit_bias"],
    }

def main(output_dir: str):
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    for name, (url, sha) in FILES.items():
        dest = out / name
        if dest.exists() and sha256_file(dest) == sha:
            print(f"  {name} already present (sha256 ok), skipping")
        else:
            download(url, dest, sha)

    print("  Extracting logit_scale / logit_bias from google checkpoint...")
    scoring = extract_scoring()
    (out / "scoring.json").write_text(json.dumps(scoring, indent=2))
    print(f"  -> scoring.json: logit_scale={scoring['logit_scale']:.4f} "
          f"logit_bias={scoring['logit_bias']:.4f}")

    print(f"\nDone. Models in {out}/")
    for f in sorted(out.iterdir()):
        print(f"  {f.name}: {f.stat().st_size / 1024 / 1024:.2f} MB")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="./models")
    args = parser.parse_args()
    main(args.output_dir)
