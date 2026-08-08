#!/usr/bin/env bash
# Retry git submodule init for flaky runner DNS ("Could not resolve host: github.com").
set -euo pipefail

max="${CI_SUBMODULE_ATTEMPTS:-5}"
attempt=1

cleanup_partial() {
	git submodule deinit -f --all 2>/dev/null || true
	# Drop partial clones so the next attempt does a clean fetch.
	rm -rf .git/modules/app/src-tauri/crates/specta \
		.git/modules/app/src-tauri/crates/tauri-specta \
		app/src-tauri/crates/specta \
		app/src-tauri/crates/tauri-specta \
		2>/dev/null || true
	mkdir -p app/src-tauri/crates/specta app/src-tauri/crates/tauri-specta
}

while true; do
	echo "Initializing submodules (attempt ${attempt}/${max})..."
	if git submodule sync --recursive \
		&& git submodule update --init --force --recursive --depth=1; then
		git submodule status --recursive
		exit 0
	fi

	if [[ "$attempt" -ge "$max" ]]; then
		echo "::error::Submodule checkout failed after ${max} attempts (often transient DNS)."
		exit 1
	fi

	delay=$((attempt * 5))
	echo "Submodule fetch failed; cleaning partial clone and retrying in ${delay}s..."
	cleanup_partial
	sleep "$delay"
	attempt=$((attempt + 1))
done
