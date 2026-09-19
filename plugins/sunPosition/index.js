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

// mma-ext:@deck.gl/layers
var require_layers = __commonJS({
  "mma-ext:@deck.gl/layers"(exports, module) {
    module.exports = globalThis.__mma_require("@deck.gl/layers");
  }
});

// sunPosition/node_modules/suncalc/suncalc.js
var require_suncalc = __commonJS({
  "sunPosition/node_modules/suncalc/suncalc.js"(exports, module) {
    (function() {
      "use strict";
      var PI = Math.PI, sin = Math.sin, cos = Math.cos, tan = Math.tan, asin = Math.asin, atan = Math.atan2, acos = Math.acos, rad = PI / 180;
      var dayMs = 1e3 * 60 * 60 * 24, J1970 = 2440588, J2000 = 2451545;
      function toJulian(date) {
        return date.valueOf() / dayMs - 0.5 + J1970;
      }
      function fromJulian(j) {
        return new Date((j + 0.5 - J1970) * dayMs);
      }
      function toDays(date) {
        return toJulian(date) - J2000;
      }
      var e = rad * 23.4397;
      function rightAscension(l, b) {
        return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
      }
      function declination(l, b) {
        return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
      }
      function azimuth(H, phi, dec) {
        return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
      }
      function altitude(H, phi, dec) {
        return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
      }
      function siderealTime(d, lw) {
        return rad * (280.16 + 360.9856235 * d) - lw;
      }
      function astroRefraction(h) {
        if (h < 0)
          h = 0;
        return 2967e-7 / Math.tan(h + 312536e-8 / (h + 0.08901179));
      }
      function solarMeanAnomaly(d) {
        return rad * (357.5291 + 0.98560028 * d);
      }
      function eclipticLongitude(M) {
        var C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 3e-4 * sin(3 * M)), P = rad * 102.9372;
        return M + C + P + PI;
      }
      function sunCoords(d) {
        var M = solarMeanAnomaly(d), L = eclipticLongitude(M);
        return {
          dec: declination(L, 0),
          ra: rightAscension(L, 0)
        };
      }
      var SunCalc2 = {};
      SunCalc2.getPosition = function(date, lat, lng) {
        var lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = siderealTime(d, lw) - c.ra;
        return {
          azimuth: azimuth(H, phi, c.dec),
          altitude: altitude(H, phi, c.dec)
        };
      };
      var times = SunCalc2.times = [
        [-0.833, "sunrise", "sunset"],
        [-0.3, "sunriseEnd", "sunsetStart"],
        [-6, "dawn", "dusk"],
        [-12, "nauticalDawn", "nauticalDusk"],
        [-18, "nightEnd", "night"],
        [6, "goldenHourEnd", "goldenHour"]
      ];
      SunCalc2.addTime = function(angle, riseName, setName) {
        times.push([angle, riseName, setName]);
      };
      var J0 = 9e-4;
      function julianCycle(d, lw) {
        return Math.round(d - J0 - lw / (2 * PI));
      }
      function approxTransit(Ht, lw, n) {
        return J0 + (Ht + lw) / (2 * PI) + n;
      }
      function solarTransitJ(ds, M, L) {
        return J2000 + ds + 53e-4 * sin(M) - 69e-4 * sin(2 * L);
      }
      function hourAngle(h, phi, d) {
        return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)));
      }
      function observerAngle(height) {
        return -2.076 * Math.sqrt(height) / 60;
      }
      function getSetJ(h, lw, phi, dec, n, M, L) {
        var w = hourAngle(h, phi, dec), a = approxTransit(w, lw, n);
        return solarTransitJ(a, M, L);
      }
      SunCalc2.getTimes = function(date, lat, lng, height) {
        height = height || 0;
        var lw = rad * -lng, phi = rad * lat, dh = observerAngle(height), d = toDays(date), n = julianCycle(d, lw), ds = approxTransit(0, lw, n), M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0), Jnoon = solarTransitJ(ds, M, L), i, len, time, h0, Jset, Jrise;
        var result = {
          solarNoon: fromJulian(Jnoon),
          nadir: fromJulian(Jnoon - 0.5)
        };
        for (i = 0, len = times.length; i < len; i += 1) {
          time = times[i];
          h0 = (time[0] + dh) * rad;
          Jset = getSetJ(h0, lw, phi, dec, n, M, L);
          Jrise = Jnoon - (Jset - Jnoon);
          result[time[1]] = fromJulian(Jrise);
          result[time[2]] = fromJulian(Jset);
        }
        return result;
      };
      function moonCoords(d) {
        var L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d), l = L + rad * 6.289 * sin(M), b = rad * 5.128 * sin(F), dt = 385001 - 20905 * cos(M);
        return {
          ra: rightAscension(l, b),
          dec: declination(l, b),
          dist: dt
        };
      }
      SunCalc2.getMoonPosition = function(date, lat, lng) {
        var lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = siderealTime(d, lw) - c.ra, h = altitude(H, phi, c.dec), pa = atan(sin(H), tan(phi) * cos(c.dec) - sin(c.dec) * cos(H));
        h = h + astroRefraction(h);
        return {
          azimuth: azimuth(H, phi, c.dec),
          altitude: h,
          distance: c.dist,
          parallacticAngle: pa
        };
      };
      SunCalc2.getMoonIllumination = function(date) {
        var d = toDays(date || /* @__PURE__ */ new Date()), s = sunCoords(d), m = moonCoords(d), sdist = 149598e3, phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)), inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)), angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
        return {
          fraction: (1 + cos(inc)) / 2,
          phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
          angle
        };
      };
      function hoursLater(date, h) {
        return new Date(date.valueOf() + h * dayMs / 24);
      }
      SunCalc2.getMoonTimes = function(date, lat, lng, inUTC) {
        var t = new Date(date);
        if (inUTC) t.setUTCHours(0, 0, 0, 0);
        else t.setHours(0, 0, 0, 0);
        var hc = 0.133 * rad, h0 = SunCalc2.getMoonPosition(t, lat, lng).altitude - hc, h1, h2, rise, set, a, b, xe, ye, d, roots, x1, x2, dx;
        for (var i = 1; i <= 24; i += 2) {
          h1 = SunCalc2.getMoonPosition(hoursLater(t, i), lat, lng).altitude - hc;
          h2 = SunCalc2.getMoonPosition(hoursLater(t, i + 1), lat, lng).altitude - hc;
          a = (h0 + h2) / 2 - h1;
          b = (h2 - h0) / 2;
          xe = -b / (2 * a);
          ye = (a * xe + b) * xe + h1;
          d = b * b - 4 * a * h1;
          roots = 0;
          if (d >= 0) {
            dx = Math.sqrt(d) / (Math.abs(a) * 2);
            x1 = xe - dx;
            x2 = xe + dx;
            if (Math.abs(x1) <= 1) roots++;
            if (Math.abs(x2) <= 1) roots++;
            if (x1 < -1) x1 = x2;
          }
          if (roots === 1) {
            if (h0 < 0) rise = i + x1;
            else set = i + x1;
          } else if (roots === 2) {
            rise = i + (ye < 0 ? x2 : x1);
            set = i + (ye < 0 ? x1 : x2);
          }
          if (rise && set) break;
          h0 = h2;
        }
        var result = {};
        if (rise) result.rise = hoursLater(t, rise);
        if (set) result.set = hoursLater(t, set);
        if (!rise && !set) result[ye > 0 ? "alwaysUp" : "alwaysDown"] = true;
        return result;
      };
      if (typeof exports === "object" && typeof module !== "undefined") module.exports = SunCalc2;
      else if (typeof define === "function" && define.amd) define(SunCalc2);
      else window.SunCalc = SunCalc2;
    })();
  }
});

// mma-ext:react/jsx-runtime
var require_jsx_runtime = __commonJS({
  "mma-ext:react/jsx-runtime"(exports, module) {
    module.exports = globalThis.__mma_require("react/jsx-runtime");
  }
});

// sunPosition/src/index.tsx
var import_react = __toESM(require_react());
var import_layers = __toESM(require_layers());
var import_suncalc = __toESM(require_suncalc());
var import_jsx_runtime = __toESM(require_jsx_runtime());
var DEG = 180 / Math.PI;
var RAY_LIMIT = 8e3;
var EARTH_RADIUS_KM = 6371;
var FIELDS = {
  sunAzimuth: {
    type: "number",
    label: MMA.t("Sun azimuth"),
    comparison: { type: "circular", period: 360 }
  },
  sunAltitude: { type: "number", label: MMA.t("Sun altitude") }
};
function computeSun(lat, lng, unixSeconds) {
  const pos = import_suncalc.default.getPosition(new Date(unixSeconds * 1e3), lat, lng);
  const azimuth = ((pos.azimuth * DEG + 180) % 360 + 360) % 360;
  const altitude = pos.altitude * DEG;
  return {
    azimuth: Math.round(azimuth * 100) / 100,
    altitude: Math.round(altitude * 100) / 100
  };
}
async function enrich(locations, enrichFields) {
  const patches = /* @__PURE__ */ new Map();
  for (const loc of locations) {
    const dt = loc.extra?.datetime;
    if (typeof dt !== "number") continue;
    if (enrichFields && !enrichFields.some((k) => k === "sunAzimuth" || k === "sunAltitude")) continue;
    const sun = computeSun(loc.lat, loc.lng, dt);
    const patch = {};
    if (!enrichFields || enrichFields.includes("sunAzimuth")) patch.sunAzimuth = sun.azimuth;
    if (!enrichFields || enrichFields.includes("sunAltitude")) patch.sunAltitude = sun.altitude;
    patches.set(loc.id, patch);
  }
  return patches;
}
var DEFAULT_OVERLAY = {
  visible: true,
  lengthKm: 2,
  width: 2,
  color: { r: 255, g: 196, b: 64 }
};
var overlayStore = MMA.storage("sunPosition");
function loadOverlay() {
  const stored = overlayStore.get("overlay") ?? {};
  const color = stored.color;
  return {
    ...DEFAULT_OVERLAY,
    ...stored,
    color: color && Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b) ? color : DEFAULT_OVERLAY.color,
    lengthKm: typeof stored.lengthKm === "number" && stored.lengthKm > 0 ? stored.lengthKm : DEFAULT_OVERLAY.lengthKm,
    width: typeof stored.width === "number" && stored.width > 0 ? stored.width : DEFAULT_OVERLAY.width,
    visible: stored.visible !== false
  };
}
var overlaySettings = loadOverlay();
var overlayHandle = null;
var rebuildToken = 0;
var settingsListeners = /* @__PURE__ */ new Set();
function getOverlaySettings() {
  return overlaySettings;
}
function setOverlaySettings(patch) {
  overlaySettings = { ...overlaySettings, ...patch };
  overlayStore.set("overlay", overlaySettings);
  for (const fn of settingsListeners) fn();
  void rebuildRays();
}
function destination(lat, lng, bearingDeg, km) {
  const \u03B4 = km / EARTH_RADIUS_KM;
  const \u03B8 = bearingDeg * Math.PI / 180;
  const \u03C61 = lat * Math.PI / 180;
  const \u03BB1 = lng * Math.PI / 180;
  const sin\u03C61 = Math.sin(\u03C61);
  const cos\u03C61 = Math.cos(\u03C61);
  const sin\u03B4 = Math.sin(\u03B4);
  const cos\u03B4 = Math.cos(\u03B4);
  const \u03C62 = Math.asin(sin\u03C61 * cos\u03B4 + cos\u03C61 * sin\u03B4 * Math.cos(\u03B8));
  const \u03BB2 = \u03BB1 + Math.atan2(Math.sin(\u03B8) * sin\u03B4 * cos\u03C61, cos\u03B4 - sin\u03C61 * Math.sin(\u03C62));
  return [\u03BB2 * 180 / Math.PI, \u03C62 * 180 / Math.PI];
}
async function rebuildRays() {
  if (!overlayHandle) return;
  const token = ++rebuildToken;
  if (!overlaySettings.visible) {
    overlayHandle.setProps({ layers: [] });
    return;
  }
  let locs = [];
  try {
    locs = await MMA.fetchLocations({
      type: "Filter",
      field: "sunAzimuth",
      op: "has",
      value: true
    });
  } catch {
    if (token === rebuildToken && overlayHandle) overlayHandle.setProps({ layers: [] });
    return;
  }
  if (token !== rebuildToken || !overlayHandle) return;
  const { lengthKm, width, color } = overlaySettings;
  const rgba = [color.r, color.g, color.b, 220];
  const data = [];
  for (const loc of locs) {
    if (data.length >= RAY_LIMIT) break;
    const azimuth = loc.extra?.sunAzimuth;
    const altitude = loc.extra?.sunAltitude;
    if (typeof azimuth !== "number" || !Number.isFinite(azimuth)) continue;
    if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
    const altRad = typeof altitude === "number" && Number.isFinite(altitude) ? altitude * Math.PI / 180 : 0;
    const km = lengthKm * Math.max(0.15, Math.cos(altRad));
    const dest = destination(loc.lat, loc.lng, azimuth, km);
    if (!Number.isFinite(dest[0]) || !Number.isFinite(dest[1])) continue;
    data.push({ path: [[loc.lng, loc.lat], dest] });
  }
  overlayHandle.setProps({
    layers: [
      new import_layers.LineLayer({
        id: "mma-sun-rays",
        data,
        getSourcePosition: (d) => d.path[0],
        getTargetPosition: (d) => d.path[1],
        getColor: rgba,
        getWidth: width,
        widthMinPixels: 1,
        widthUnits: "pixels",
        pickable: false
      })
    ]
  });
}
function attachOverlay(host) {
  overlayHandle = host.createDeckOverlay();
  void rebuildRays();
  const onChange = () => {
    void rebuildRays();
  };
  const events = [
    "location:add",
    "location:remove",
    "location:update",
    "location:invalidate",
    "scene:changed"
  ];
  const unsubs = events.map((e) => MMA.on(e, onChange));
  return () => {
    unsubs.forEach((u) => u());
    overlayHandle?.finalize();
    overlayHandle = null;
  };
}
var { Sidebar, Section, Field, SwitchRow, ColorPicker, Slider } = MMA.ui;
function OverlaySidebar({ onClose }) {
  const [settings, setSettings] = (0, import_react.useState)(getOverlaySettings);
  (0, import_react.useEffect)(() => {
    const sync = () => setSettings(getOverlaySettings());
    settingsListeners.add(sync);
    return () => {
      settingsListeners.delete(sync);
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sidebar, { title: MMA.t("Sun Position"), onBack: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Section, { title: MMA.t("Sun rays"), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      SwitchRow,
      {
        label: MMA.t("Show rays"),
        checked: settings.visible,
        onChange: (visible) => setOverlaySettings({ visible })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: MMA.t("Ray length"), row: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Slider,
      {
        type: "range",
        min: 0.2,
        max: 20,
        step: 0.2,
        value: settings.lengthKm,
        onChange: (e) => setOverlaySettings({ lengthKm: Number(e.currentTarget.value) })
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: MMA.t("Ray width"), row: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Slider,
      {
        type: "range",
        min: 1,
        max: 8,
        step: 0.5,
        value: settings.width,
        onChange: (e) => setOverlaySettings({ width: Number(e.currentTarget.value) })
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: MMA.t("Ray color"), row: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      ColorPicker,
      {
        color: settings.color,
        onChange: (color) => setOverlaySettings({ color }),
        ariaLabel: MMA.t("Ray color")
      }
    ) })
  ] }) });
}
MMA.registerPlugin({
  activate() {
    MMA.registerEnrichFields([
      { key: "sunAzimuth", label: MMA.t("Sun azimuth") },
      { key: "sunAltitude", label: MMA.t("Sun altitude") }
    ]);
    MMA.registerEnrichmentProvider({
      id: "sunPosition",
      enrich,
      fieldDefs: FIELDS,
      requires: ["datetime"]
    });
    let cancelled = false;
    let overlayTeardown = null;
    const stopOverlay = () => {
      overlayTeardown?.();
      overlayTeardown = null;
    };
    const startOverlay = () => {
      if (cancelled) return;
      const host = MMA.getMapHost();
      if (!host) return;
      stopOverlay();
      overlayTeardown = attachOverlay(host);
    };
    const unsubs = [MMA.on("map:open", startOverlay), MMA.on("map:close", stopOverlay)];
    startOverlay();
    if (!MMA.getMapHost()) {
      void MMA.waitForMapHost().then(() => {
        if (!cancelled) startOverlay();
      });
    }
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
      stopOverlay();
    };
  },
  sidebar: OverlaySidebar
});
