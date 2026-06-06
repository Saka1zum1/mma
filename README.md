# MMA

Local-first desktop clone of [map-making.app](https://map-making.app).

![preview](img/preview.png)

## Features

- Offline/local-first
- Handles millions of locations
- Plugin system
- Configurable hotkeys
- Extra fields on locations - non-boolean arbitrary metadata
- Composable selections
- Map generator built-in
- Version history with commits

## Installation
### User
Open [the releases menu](https://github.com/ccmdi/mma/releases) and download the respective installation for your system.

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

## Plugins

See [plugins/README.md](plugins/README.md).
