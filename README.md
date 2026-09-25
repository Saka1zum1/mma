# Map Making App

A local-first desktop alternative to [map-making.app](https://map-making.app).

This repository ([Saka1zum1/mma](https://github.com/Saka1zum1/mma)) tracks upstream [ccmdi/mma](https://github.com/ccmdi/mma) and publishes **separate installers and auto-updates**. Builds from the two projects are not interchangeable, and **local map libraries are not either** (see [map data](#notes-and-caveats) below).

![preview](img/preview.png)

## Features

- Offline/local-first
- Much faster for large maps; handles millions of locations
- Configurable hotkeys
- Composable & saveable selections
- Map generator/vali/autotag built-in
- Version history with commits
- Editor state saves automatically - pick up where you left off
- Extra fields on locations - arbitrary metadata
- "Seen locations" history - find locations you've looked at before
- Concurrent and manageable reviews
- Plugin system

...and much more!

## About this fork

Most behavior matches upstream MMA. The items below are **maintained here** and may differ from a stock [ccmdi/mma](https://github.com/ccmdi/mma) release.

### Differences from upstream

- **Alternative Street View providers** — Baidu, Tencent, Yandex, and Apple Look Around work alongside Google for coverage, enrichment, and (where supported) in-pano viewing. **Alternate basemaps** (Petal for Baidu/Tencent, Yandex) stay linked to those provider settings.
- **LocalGuessr (bundled core plugin)** — Play GeoGuessr-style rounds on the map you already have open: movement modes (including NMPZ), streaks, analytics, ongoing games, and tagging from the result screen. Optional **[Learnable Meta](https://learnablemeta.com/)** hints after each round when enabled with a map ID; the host proxies the public clue API so the webview does not call Learnable Meta directly.
- **Plugin marketplace** — The in-app catalog uses this repo’s [`plugins/registry.json`](plugins/registry.json), not the upstream registry. Plugin scaffolds in [Plugins](plugins/README.md) point at `Saka1zum1/mma`.
- **Release channel** — Download and update from [releases on this repo](https://github.com/Saka1zum1/mma/releases/latest) only. Updater endpoints and signing keys in `app/src-tauri/tauri.conf.json` are fork-specific; do not swap in upstream release metadata.

Upstream fixes and features are merged regularly. Fork-only logic is kept in dedicated areas (for example `app/src/lib/sv/` for alt providers) so syncs stay tractable. Maintainers should read [scripts/UPSTREAM_SYNC.md](scripts/UPSTREAM_SYNC.md) before and after large merges.

### Notes and caveats

- **Map data** — Do not copy the app data folder between this fork and upstream MMA, and do not assume map exports will round-trip. **Location metadata differs** (built-in fields and per-map extra field definitions diverge over time, including fork-only provider fields). A map opened in the wrong app line can show missing values, wrong types, or ignored columns. Pick one desktop build for a given library; if you must move maps, import explicitly and check fields afterward. [Migrations from map-making.app](scripts/migrations/README.md) target this fork’s field set, not upstream’s.
- **Issues** — Report fork-specific bugs (alt providers, LocalGuessr, Learnable Meta, updater) on [Saka1zum1/mma issues](https://github.com/Saka1zum1/mma/issues). Use upstream’s tracker when the same problem appears on a current ccmdi/mma build without fork-only features.
- **External services** — map-making.app sync, GeoGuessr integrations, Learnable Meta, and non-Google Street View providers depend on third-party sites, keys, and regional coverage. Behavior and terms differ from a Google-only workflow.
- **Learnable Meta** — Clues are optional study aids for maps published on Learnable Meta. They require a valid map ID, network access, and match the current round’s panorama. Clue HTML is reduced to plain text in the UI; linked images still load from the network when shown.
- **Building from source** — After changing Rust IPC commands, run `npm run gen:bindings` in `app/` so TypeScript stays in sync. Run the checks listed in [scripts/UPSTREAM_SYNC.md](scripts/UPSTREAM_SYNC.md) after merging upstream.

## Installation

Open [the latest release](https://github.com/Saka1zum1/mma/releases/latest) and download the installer for your platform.

### macOS / Linux

On macOS, you will likely need to run:
```zsh
xattr -dr com.apple.quarantine "/Applications/Map Making App.app"
```

On both Mac & Linux, framerate and rendering stability can be an issue. If you encounter these problems, you can [run the app in a browser](#run-in-a-browser). The web version will eventually be a first-class launch option, but is only available from source for now.

### From source

```bash
cd app && npm install && cargo tauri build
```

Requires: Rust toolchain, Node.js, npm.

### Run in a browser

Serve the app locally and open it in any browser:

```bash
cd app && npm install && npm run build
cargo run --manifest-path src-tauri/Cargo.toml --features web-serve -- --serve
```

Then open the printed `http://127.0.0.1:1430`.

## More

- [Migrations](scripts/migrations/README.md) - bring your data over from map-making.app
- [Plugins](plugins/README.md) - extend the editor
- [Upstream sync notes](scripts/UPSTREAM_SYNC.md) - for maintainers merging ccmdi/mma
