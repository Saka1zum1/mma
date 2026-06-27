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

// mma-ext:@deck.gl/google-maps
var require_google_maps = __commonJS({
  "mma-ext:@deck.gl/google-maps"(exports, module) {
    module.exports = globalThis.__mma_require("@deck.gl/google-maps");
  }
});

// mma-ext:@deck.gl/layers
var require_layers = __commonJS({
  "mma-ext:@deck.gl/layers"(exports, module) {
    module.exports = globalThis.__mma_require("@deck.gl/layers");
  }
});

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

// inaturalist/src/inat.ts
var import_google_maps = __toESM(require_google_maps());
var import_layers = __toESM(require_layers());
var TILE_TTL = 5 * 60 * 1e3;
var MAX_TILES = 300;
var MAX_RENDER = 5e4;
var tileCache = /* @__PURE__ */ new Map();
var observationsById = /* @__PURE__ */ new Map();
var overlay = null;
var currentTaxonId = null;
var currentTaxonName = null;
var visible = true;
var listeners = [];
var onUpdate = null;
function setOnUpdate(cb) {
  onUpdate = cb;
}
function getObservations() {
  return Array.from(observationsById.values());
}
function getCurrentTaxon() {
  if (!currentTaxonId) return null;
  return { id: currentTaxonId, name: currentTaxonName ?? "Unknown" };
}
function isVisible() {
  return visible;
}
function toggleVisibility() {
  visible = !visible;
  if (visible) render();
  else overlay?.setProps({ layers: [] });
  onUpdate?.();
}
function clearData() {
  observationsById.clear();
  tileCache.clear();
  currentTaxonId = null;
  currentTaxonName = null;
  overlay?.setProps({ layers: [] });
  onUpdate?.();
}
async function searchTaxa(query) {
  const res = await fetch(
    `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(query)}&per_page=20`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    commonName: t.preferred_common_name ?? null,
    rank: t.rank ?? "",
    count: t.observations_count ?? 0,
    photoUrl: t.default_photo?.square_url ?? null
  }));
}
function selectTaxon(taxon) {
  observationsById.clear();
  tileCache.clear();
  currentTaxonId = taxon.id;
  currentTaxonName = taxon.commonName ?? taxon.name;
  loadViewport();
  onUpdate?.();
}
function importToMap() {
  const obs = getObservations();
  if (obs.length === 0) return 0;
  const locs = obs.map(
    (o) => MMA.createLocation({ lat: o.lat, lng: o.lng, extra: { tags: [o.name] } })
  );
  MMA.addLocations(locs);
  return locs.length;
}
async function init() {
  const map = MMA.getGoogleMap();
  if (!map) throw new Error("No map instance");
  overlay = new import_google_maps.GoogleMapsOverlay({ layers: [] });
  overlay.setMap(map);
  const throttled = throttle(() => loadViewport(), 400);
  listeners = [
    map.addListener("bounds_changed", throttled),
    map.addListener("zoom_changed", throttled)
  ];
  return () => {
    for (const l of listeners) l.remove();
    listeners = [];
    if (overlay) {
      overlay.setMap(null);
      overlay.finalize();
      overlay = null;
    }
    observationsById.clear();
    tileCache.clear();
    currentTaxonId = null;
    currentTaxonName = null;
    onUpdate = null;
  };
}
function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  return () => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn();
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn();
      }, ms - (now - last));
    }
  };
}
function tileKey(z, x, y) {
  return `${z}/${x}/${y}`;
}
function lngToTileX(lng, z) {
  return Math.floor((lng + 180) / 360 * (1 << z));
}
function latToTileY(lat, z) {
  const r = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z));
}
function tileToBbox(x, y, z) {
  const n = 1 << z;
  return {
    west: x / n * 360 - 180,
    east: (x + 1) / n * 360 - 180,
    north: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI,
    south: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI
  };
}
function computeTileZoom(mapZoom) {
  return Math.max(1, Math.min(10, Math.floor(mapZoom) - 2));
}
async function fetchTile(taxonId, bbox) {
  const url = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&nelat=${bbox.north}&nelng=${bbox.east}&swlat=${bbox.south}&swlng=${bbox.west}&per_page=200&page=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((d) => {
    const geo = d.geojson;
    return {
      id: d.id,
      lat: geo?.coordinates?.[1],
      lng: geo?.coordinates?.[0],
      name: d.species_guess ?? "Unknown",
      photo: (d.observation_photos?.[0]?.photo?.url ?? "").replace("square", "medium") || null,
      observed_at: d.time_observed_at ?? d.observed_on ?? null
    };
  }).filter((o) => o.lat != null && o.lng != null);
}
async function loadViewport() {
  if (!currentTaxonId || !visible) return;
  const map = MMA.getGoogleMap();
  if (!map) return;
  const bounds = map.getBounds();
  if (!bounds) return;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const tz = computeTileZoom(map.getZoom());
  const xMin = lngToTileX(sw.lng(), tz);
  const xMax = lngToTileX(ne.lng(), tz);
  const yMin = latToTileY(ne.lat(), tz);
  const yMax = latToTileY(sw.lat(), tz);
  const now = Date.now();
  const fetches = [];
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const key = tileKey(tz, x, y);
      const cached = tileCache.get(key);
      if (cached && cached.expiresAt > now) {
        for (const o of cached.data) observationsById.set(o.id, o);
        continue;
      }
      fetches.push(
        fetchTile(currentTaxonId, tileToBbox(x, y, tz)).then((obs) => {
          tileCache.set(key, { data: obs, expiresAt: Date.now() + TILE_TTL });
          if (tileCache.size > MAX_TILES) {
            const oldest = tileCache.keys().next().value;
            tileCache.delete(oldest);
          }
          for (const o of obs) observationsById.set(o.id, o);
        })
      );
    }
  }
  if (fetches.length > 0) await Promise.all(fetches);
  render();
  onUpdate?.();
}
function render() {
  if (!overlay || !visible) return;
  let data = Array.from(observationsById.values());
  if (data.length > MAX_RENDER) {
    const step = Math.ceil(data.length / MAX_RENDER);
    data = data.filter((_, i) => i % step === 0);
  }
  if (data.length === 0) {
    overlay.setProps({ layers: [] });
    return;
  }
  overlay.setProps({
    layers: [
      new import_layers.ScatterplotLayer({
        id: "inat-observations",
        data,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 5,
        radiusUnits: "pixels",
        getFillColor: [255, 120, 0, 180],
        pickable: true
      })
    ]
  });
}

// inaturalist/src/INatSidebar.tsx
var import_react = __toESM(require_react());
var import_jsx_runtime = __toESM(require_jsx_runtime());
var ARROW_LEFT = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
var CSS = `
.inat-sidebar__search { display: flex; gap: 6px; }
.inat-sidebar__results {
  max-height: 300px; overflow-y: auto;
  border: 1px solid var(--color-divider, #333); border-radius: 4px;
  margin-top: 8px;
}
.inat-sidebar__taxon {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  cursor: pointer; border-bottom: 1px solid var(--color-divider, #333);
  font-size: 13px;
}
.inat-sidebar__taxon:last-child { border-bottom: none; }
.inat-sidebar__taxon:hover { background: rgba(255,255,255,0.05); }
.inat-sidebar__taxon-photo {
  width: 32px; height: 32px; border-radius: 4px; object-fit: cover;
  background: #333; flex-shrink: 0;
}
.inat-sidebar__taxon-info { flex: 1; min-width: 0; }
.inat-sidebar__taxon-name {
  font-weight: 600; font-style: italic; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.inat-sidebar__taxon-meta { font-size: 11px; color: var(--text-secondary, #999); }
.inat-sidebar__active {
  margin-top: 8px; padding: 8px; border-radius: 4px;
  background: rgba(255, 120, 0, 0.1); border: 1px solid rgba(255, 120, 0, 0.3);
}
.inat-sidebar__active-name { font-weight: 600; font-size: 13px; color: #ff7800; }
.inat-sidebar__active-count { font-size: 12px; color: var(--text-secondary, #999); margin-top: 2px; }
.inat-sidebar__actions { display: flex; gap: 6px; margin-top: 8px; }
.inat-sidebar__hint { font-size: 12px; color: var(--text-secondary, #999); margin-top: 4px; }
`;
var styleEl = null;
function injectCSS() {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}
function removeCSS() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}
var { Sidebar, Section } = MMA.ui;
function INatSidebar({ onClose }) {
  const [query, setQuery] = (0, import_react.useState)("");
  const [results, setResults] = (0, import_react.useState)([]);
  const [searching, setSearching] = (0, import_react.useState)(false);
  const [, bump] = (0, import_react.useState)(0);
  const refresh = (0, import_react.useCallback)(() => bump((n) => n + 1), []);
  (0, import_react.useEffect)(() => {
    injectCSS();
    setOnUpdate(refresh);
    return () => {
      setOnUpdate(null);
      removeCSS();
    };
  }, [refresh]);
  const doSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      setResults(await searchTaxa(q));
    } catch {
      MMA.toast("Failed to search iNaturalist");
    }
    setSearching(false);
  };
  const handleSelect = (taxon2) => {
    selectTaxon(taxon2);
    setResults([]);
    setQuery("");
  };
  const handleImport = () => {
    const n = importToMap();
    if (n > 0) MMA.toast(`Imported ${n} observations as locations`);
    else MMA.toast("No observations to import");
  };
  const taxon = getCurrentTaxon();
  const count = getObservations().length;
  const vis = isVisible();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Sidebar, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { style: { display: "flex", alignItems: "center", gap: 8, padding: 8, borderBottom: "1px solid var(--color-divider, #333)" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", width: 20, height: 20, fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: ARROW_LEFT }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: { margin: 0, fontSize: 14, fontWeight: 600 }, children: "iNaturalist" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__search", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "input",
            placeholder: "Search species...",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") doSearch();
              e.stopPropagation();
            },
            style: { flex: 1 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "button", onClick: doSearch, disabled: searching || !query.trim(), children: searching ? "..." : "Search" })
      ] }),
      results.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "inat-sidebar__results", children: results.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__taxon", onClick: () => handleSelect(t), children: [
        t.photoUrl && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { className: "inat-sidebar__taxon-photo", src: t.photoUrl }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__taxon-info", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "inat-sidebar__taxon-name", children: t.name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__taxon-meta", children: [
            t.commonName && `${t.commonName} \xB7 `,
            t.rank,
            " \xB7 ",
            t.count.toLocaleString(),
            " obs"
          ] })
        ] })
      ] }, t.id)) }),
      taxon && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__active", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "inat-sidebar__active-name", children: taxon.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__active-count", children: [
          count.toLocaleString(),
          " observations loaded"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "inat-sidebar__actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "button", onClick: toggleVisibility, disabled: !taxon, children: vis ? "Hide" : "Show" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "button button--primary", onClick: handleImport, disabled: count === 0, children: [
          "Import",
          count > 0 ? ` (${count})` : ""
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "button button--danger", onClick: clearData, disabled: !taxon, children: "Clear" })
      ] }),
      !taxon && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "inat-sidebar__hint", children: "Search for a species to visualize observations on the map." })
    ] })
  ] });
}

// inaturalist/src/index.tsx
MMA.registerPlugin({
  activate() {
    let cancelled = false;
    let teardown = null;
    (async () => {
      if (cancelled) return;
      teardown = await init();
    })();
    return () => {
      cancelled = true;
      teardown?.();
    };
  },
  sidebar: INatSidebar
});
