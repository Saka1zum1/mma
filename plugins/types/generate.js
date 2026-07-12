const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const out = path.resolve(__dirname, "mma.d.ts");

// Invoke the copy installed in app/node_modules so it resolves app's pinned
// typescript; bare npx from repo root installs typescript@latest (TS 7, no JS API).
execSync(
  `node app/node_modules/dts-bundle-generator/dist/bin/dts-bundle-generator.js --project app/tsconfig.app.json --no-check --external-inlines @tauri-apps/api @tauri-apps/plugin-shell @tauri-apps/plugin-dialog --external-imports react -o "${out}" plugins/types/entrypoint.ts`,
  { cwd: path.resolve(__dirname, "../.."), stdio: "inherit" }
);

let content = fs.readFileSync(out, "utf-8");
// dts-bundle-generator appends $1 to types that collide with DOM globals.
// Undo it - plugin authors need the clean names.
for (const name of ["Location", "Selection", "Plugin", "MMA", "open"]) {
  content = content.replace(new RegExp(`\\b${name}\\$1\\b`, "g"), name);
}
content += `\ndeclare global {\n\tconst MMA: typeof mma;\n}\n`;
fs.writeFileSync(out, content);

console.log("Generated plugins/types/mma.d.ts");
