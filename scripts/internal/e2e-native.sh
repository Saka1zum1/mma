#!/bin/sh
set -e

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99
sleep 1

# Start tauri-driver (WebDriver bridge on :4444)
tauri-driver &
sleep 3

# Verify tauri-driver is listening
if ! curl -s http://localhost:4444/status > /dev/null 2>&1; then
    echo "ERROR: tauri-driver not responding on :4444"
    exit 1
fi

echo "tauri-driver ready on :4444"

# Run tests. Extra args (e.g. --spec <file>, --shard <i>/<n>) pass straight to wdio;
# no args runs the full suite.
cd /repo/app
npx wdio run wdio.conf.ts "$@"
