#!/usr/bin/env bash
# One-time setup for fork release CI secrets.
# Requires: gh auth login (as repo admin) with repo + admin:repo scope.
set -euo pipefail

REPO="${1:-Saka1zum1/mma}"
KEY_DIR="${KEY_DIR:-$(dirname "$0")/../.tauri-keys}"

if [[ ! -f "$KEY_DIR/mma.key" ]]; then
  echo "Missing $KEY_DIR/mma.key — generate with:"
  echo "  mkdir -p .tauri-keys && cd app && npx tauri signer generate -w ../.tauri-keys/mma.key"
  exit 1
fi

gh secret set TAURI_SIGNING_PRIVATE_KEY --repo "$REPO" < "$KEY_DIR/mma.key"
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo "$REPO" < "$KEY_DIR/password.txt"

# Optional: only needed if publishing to a different repo than where the workflow runs.
if [[ -n "${RELEASE_TOKEN:-}" ]]; then
  gh secret set RELEASE_TOKEN --repo "$REPO" --body "$RELEASE_TOKEN"
fi

echo "Done. Configured TAURI_SIGNING_* secrets on $REPO"
gh secret list --repo "$REPO"
