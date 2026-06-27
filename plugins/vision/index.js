var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// mma-ext:react
var require_react = __commonJS({
  "mma-ext:react"(exports, module) {
    module.exports = globalThis.__mma_require("react");
  }
});

// mma-ext:react/jsx-runtime
var require_jsx_runtime = __commonJS({
  "mma-ext:react/jsx-runtime"(exports, module) {
    module.exports = globalThis.__mma_require("react/jsx-runtime");
  }
});

// vision/src/VisionSidebar.tsx
var import_react = __toESM(require_react());

// vision/src/sidecar.ts
var BINARY_NAME = "mma-vision";
var IS_WIN = navigator.userAgent.includes("Windows");
var SEP = IS_WIN ? "\\" : "/";
var _pluginDir = null;
async function pluginDir() {
  if (!_pluginDir) {
    const appData = await MMA.cmd.getAppDataDir();
    _pluginDir = `${appData}${SEP}plugins${SEP}vision`;
  }
  return _pluginDir;
}
async function modelDir() {
  return `${await pluginDir()}${SEP}models`;
}
async function clipCacheDir() {
  return `${await pluginDir()}${SEP}clip-cache`;
}
var tempCounter = 0;
async function writeInputFile(data) {
  const name = `mma_vision_${Date.now()}_${tempCounter++}.json`;
  return MMA.cmd.writeTempFile(name, JSON.stringify(data));
}
function spawnCommand(args) {
  const lineCallbacks = [];
  const stderrCallbacks = [];
  const closeCallbacks = [];
  let child = null;
  const proc = {
    kill() {
      child?.kill();
    },
    onLine(cb) {
      lineCallbacks.push(cb);
    },
    onStderr(cb) {
      stderrCallbacks.push(cb);
    },
    onClose(cb) {
      closeCallbacks.push(cb);
    }
  };
  const done = (async () => {
    const cmd = MMA.shell.Command.create(BINARY_NAME, args);
    cmd.stdout.on("data", (line) => {
      const trimmed = line.trim();
      if (trimmed) lineCallbacks.forEach((cb) => cb(trimmed));
    });
    cmd.stderr.on("data", (line) => {
      console.error("[vision]", line);
      const trimmed = line.trim();
      if (trimmed) stderrCallbacks.forEach((cb) => cb(trimmed));
    });
    child = await cmd.spawn();
    await new Promise((resolve) => {
      cmd.on("close", (ev) => {
        closeCallbacks.forEach((cb) => cb(ev.code));
        resolve();
      });
    });
  })();
  return { process: proc, done };
}
async function resolveWorldSizes(panoIds, onProgress) {
  const BATCH = 200;
  const entries = [];
  for (let i = 0; i < panoIds.length; i += BATCH) {
    const batch = panoIds.slice(i, i + BATCH);
    const metas = await MMA.fetchSvMetadata(batch);
    for (let j = 0; j < batch.length; j++) {
      const m = metas[j];
      const ws = m?.tiles?.worldSize;
      entries.push({
        panoId: batch[j],
        worldWidth: ws?.width ?? 6656,
        worldHeight: ws?.height ?? 3328
      });
    }
    onProgress?.(Math.min(i + BATCH, panoIds.length), panoIds.length);
  }
  return entries;
}
async function listCached() {
  const cd = await clipCacheDir();
  const cmd = MMA.shell.Command.create(BINARY_NAME, ["list-cached", "--cache-dir", cd]);
  const out = await cmd.execute();
  if (out.code !== 0) return /* @__PURE__ */ new Set();
  try {
    return new Set(JSON.parse(out.stdout.trim()));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function spawnEmbed(panoIds, onMetaProgress) {
  onMetaProgress?.(`Checking cache...`);
  const cached = await listCached();
  const uncached = panoIds.filter((id) => !cached.has(id));
  if (uncached.length === 0) {
    onMetaProgress?.(`All ${panoIds.length} panos cached`);
    const proc = {
      kill() {
      },
      onLine() {
      },
      onStderr() {
      },
      onClose() {
      }
    };
    return { process: proc, done: Promise.resolve() };
  }
  onMetaProgress?.(`Fetching metadata for ${uncached.length} uncached panos...`);
  const panos = await resolveWorldSizes(uncached, (done, total) => {
    onMetaProgress?.(`Metadata: ${done}/${total}`);
  });
  const inputPath = await writeInputFile({ panos });
  const md = await modelDir();
  const cd = await clipCacheDir();
  return spawnCommand(["embed", "--input", inputPath, "--model-dir", md, "--cache-dir", cd]);
}
async function spawnTextSearch(query, k, threshold) {
  const inputPath = await writeInputFile({ query, k, threshold });
  const md = await modelDir();
  const cd = await clipCacheDir();
  return spawnCommand(["search-text", "--input", inputPath, "--model-dir", md, "--cache-dir", cd]);
}
async function spawnImageSearch(panoId, k, threshold) {
  const inputPath = await writeInputFile({ panoId, k, threshold });
  const cd = await clipCacheDir();
  return spawnCommand(["search-image", "--input", inputPath, "--cache-dir", cd]);
}

// vision/src/VisionSidebar.tsx
var import_jsx_runtime = __toESM(require_jsx_runtime());
var { Sidebar, Field } = MMA.ui;
var CSS = `
.vision-sidebar__body { padding: 8px 12px; display: flex; flex-direction: column; gap: 10px; }
.vision-sidebar__progress { font-size: 12px; color: var(--text-secondary, #999); padding: 4px 0; }
.vision-sidebar__results { font-size: 12px; padding: 4px 0; }
.vision-sidebar__error { font-size: 12px; color: #e55; padding: 4px 0; }
.vision-sidebar__actions { display: flex; gap: 6px; margin-top: 4px; }
`;
function panoIdToLocId(locs, panoId) {
  const loc = locs.find((l) => l.panoId === panoId);
  return loc?.id ?? null;
}
function VisionSidebar({ onClose }) {
  const [query, setQuery] = (0, import_react.useState)("");
  const [threshold, setThreshold] = (0, import_react.useState)(0.28);
  const [running, setRunning] = (0, import_react.useState)(false);
  const [progress, setProgress] = (0, import_react.useState)("");
  const [error, setError] = (0, import_react.useState)("");
  const [resultCount, setResultCount] = (0, import_react.useState)(null);
  const cancelledRef = (0, import_react.useRef)(false);
  const killRef = (0, import_react.useRef)(null);
  const run = (0, import_react.useCallback)(async () => {
    const q = query.trim();
    if (!q) return;
    setRunning(true);
    setError("");
    setResultCount(null);
    cancelledRef.current = false;
    try {
      const locs = await MMA.fetchAllLocations();
      if (cancelledRef.current) return;
      const panoIds = locs.filter((l) => l.panoId).map((l) => l.panoId);
      if (panoIds.length === 0) {
        setError("No locations with pano IDs");
        return;
      }
      setProgress(`Embedding ${panoIds.length} panos (cached skip)...`);
      let embedDone = 0;
      const embedStart = Date.now();
      const { process: embedProc, done: embedWhen } = await spawnEmbed(panoIds, setProgress);
      killRef.current = () => embedProc.kill();
      embedProc.onStderr((line) => {
        if (line.startsWith("[vision]")) setProgress(line);
      });
      embedProc.onLine((line) => {
        try {
          const r = JSON.parse(line);
          if (r.status === "cache_hit") {
            embedDone += r.count ?? 1;
          } else {
            embedDone++;
          }
          const elapsed = (Date.now() - embedStart) / 1e3;
          const rate = elapsed > 0.5 ? (embedDone / elapsed).toFixed(1) : "--";
          setProgress(`Embedding: ${embedDone}/${panoIds.length} (${rate} panos/s)`);
        } catch {
        }
      });
      await embedWhen;
      if (cancelledRef.current) return;
      setProgress(`Searching for "${q}"...`);
      const { process: searchProc, done: searchDone } = await spawnTextSearch(q, null, threshold);
      killRef.current = () => searchProc.kill();
      let results = [];
      searchProc.onLine((line) => {
        try {
          const r = JSON.parse(line);
          if (r.results) results = r.results;
        } catch {
        }
      });
      await searchDone;
      if (cancelledRef.current) return;
      killRef.current = null;
      const matchedIds = results.map((r) => panoIdToLocId(locs, r.panoId)).filter((id) => id != null);
      if (matchedIds.length > 0) {
        await MMA.addSelections([{ type: "Locations", locations: matchedIds, name: `Vision: "${q}"` }]);
      }
      setResultCount(matchedIds.length);
      setProgress("");
    } catch (e) {
      if (!cancelledRef.current) setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [query, threshold]);
  const cancel = (0, import_react.useCallback)(() => {
    cancelledRef.current = true;
    killRef.current?.();
    killRef.current = null;
    setRunning(false);
    setProgress("");
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sidebar, { title: "Vision", onBack: onClose, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vision-sidebar__body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Search for", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "input",
          placeholder: "cars, snow, indoor...",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter" && !running) run();
          }
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: `Min confidence: ${threshold.toFixed(2)}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "range",
          min: 0.18,
          max: 0.45,
          step: 0.01,
          value: threshold,
          onChange: (e) => setThreshold(Number(e.target.value)),
          style: { width: "100%" }
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vision-sidebar__actions", children: !running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "button button--primary", disabled: !query.trim(), onClick: run, children: "Search" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "button", onClick: cancel, children: "Cancel" }) }),
      progress && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vision-sidebar__progress", children: progress }),
      error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "vision-sidebar__error", children: error }),
      resultCount !== null && !running && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "vision-sidebar__results", children: [
        resultCount,
        " locations selected"
      ] })
    ] })
  ] });
}

// vision/src/FindSimilarButton.tsx
var import_react2 = __toESM(require_react());
var import_jsx_runtime2 = __toESM(require_jsx_runtime());
var SIMILARITY_THRESHOLD = 0.9;
function FindSimilarButton() {
  const [running, setRunning] = (0, import_react2.useState)(false);
  const [result, setResult] = (0, import_react2.useState)(null);
  const active = MMA.getActiveLocation();
  if (!active?.panoId) return null;
  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const locs = await MMA.fetchAllLocations();
      const panoIds = locs.filter((l) => l.panoId).map((l) => l.panoId);
      const { done: embedDone } = await spawnEmbed(panoIds);
      await embedDone;
      const { process: proc, done: searchDone } = await spawnImageSearch(active.panoId, null, SIMILARITY_THRESHOLD);
      let results = [];
      proc.onLine((line) => {
        try {
          const r = JSON.parse(line);
          if (r.results) results = r.results;
        } catch {
        }
      });
      await searchDone;
      const matchedIds = results.map((r) => locs.find((l) => l.panoId === r.panoId)?.id).filter((id) => id != null);
      if (matchedIds.length > 0) {
        await MMA.addSelections([{
          type: "Locations",
          locations: matchedIds,
          name: `Similar to ${active.panoId.slice(0, 8)}...`
        }]);
        setResult(`${matchedIds.length} similar`);
      } else {
        setResult("No similar panos found");
      }
    } catch (e) {
      setResult(`Error: ${e}`);
    } finally {
      setRunning(false);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      className: "button button--small",
      style: { width: "100%" },
      disabled: running,
      onClick: run,
      children: running ? "Searching..." : "Find similar panos"
    }
  );
}

// vision/src/index.tsx
MMA.registerPlugin({
  activate() {
  },
  sidebar: VisionSidebar,
  locationPanel: FindSimilarButton,
  comingSoon: true
});
