// weather/src/index.ts
var WEATHER_FIELDS = [
  { key: "weatherCode", param: "weather_code", label: "Weather code (WMO)" },
  { key: "cloudCover", param: "cloud_cover", label: "Cloud cover (%)" },
  { key: "precipitation", param: "precipitation", label: "Precipitation (mm)" },
  { key: "snowDepth", param: "snow_depth", label: "Snow depth (m)" },
  { key: "snowfall", param: "snowfall", label: "Snowfall (cm)" },
  { key: "temperature2m", param: "temperature_2m", label: "Temperature (\xB0C)" },
  { key: "sunshineDuration", param: "sunshine_duration", label: "Sunshine duration (s)" },
  { key: "windSpeed10m", param: "wind_speed_10m", label: "Wind speed (km/h)" }
];
var ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
var COORDS_PER_REQUEST = 100;
var MAX_CONCURRENT = 6;
var MAX_RETRIES = 3;
var CALLS_PER_MIN = 600;
var FIELD_DEFS = Object.fromEntries(
  WEATHER_FIELDS.map((f) => [f.key, { type: "number", label: f.label }])
);
var ENRICH_OPTIONS = WEATHER_FIELDS.map((f) => ({
  key: f.key,
  label: f.label,
  defaultOff: true
}));
function pad(n) {
  return String(n).padStart(2, "0");
}
function utcDateAndHour(unixSeconds) {
  const d = new Date(unixSeconds * 1e3);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hourKey = `${date}T${pad(d.getUTCHours())}:00`;
  return { date, hourKey };
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var RateLimiter = class {
  constructor(capacity, windowMs) {
    this.capacity = capacity;
    this.windowMs = windowMs;
    this.tokens = capacity;
    this.last = Date.now();
  }
  tokens;
  last;
  async acquire(cost) {
    const want = Math.min(cost, this.capacity);
    for (; ; ) {
      const now = Date.now();
      this.tokens = Math.min(
        this.capacity,
        this.tokens + (now - this.last) * this.capacity / this.windowMs
      );
      this.last = now;
      if (this.tokens >= want) {
        this.tokens -= want;
        return;
      }
      await sleep((want - this.tokens) * this.windowMs / this.capacity);
    }
  }
};
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url);
    if (resp.ok) return resp.json();
    if (resp.status !== 429) return null;
    await sleep(2e3 * (attempt + 1));
  }
  return null;
}
async function runTask(locs, vars, requested, limiter, patches) {
  const lat = locs.map((l) => l.lat).join(",");
  const lng = locs.map((l) => l.lng).join(",");
  const dates = locs.map((l) => utcDateAndHour(l.extra.datetime).date).join(",");
  const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}&start_date=${dates}&end_date=${dates}&hourly=${vars}&timezone=GMT`;
  await limiter.acquire(locs.length);
  const json = await fetchWithRetry(url);
  if (!json) return;
  const results = Array.isArray(json) ? json : [json];
  for (let i = 0; i < locs.length; i++) {
    const loc = locs[i];
    const hourly = results[i]?.hourly;
    if (!hourly?.time) continue;
    const { hourKey } = utcDateAndHour(loc.extra.datetime);
    const idx = hourly.time.indexOf(hourKey);
    if (idx < 0) continue;
    const patch = {};
    for (const f of requested) {
      const v = hourly[f.param]?.[idx];
      if (v != null) patch[f.key] = v;
    }
    if (Object.keys(patch).length > 0) patches.set(loc.id, patch);
  }
}
function requestedFields(enrichFields) {
  return WEATHER_FIELDS.filter((f) => !enrichFields || enrichFields.includes(f.key));
}
function usableLocations(locations, enrichFields) {
  const requested = requestedFields(enrichFields);
  if (requested.length === 0) return [];
  return locations.filter(
    (l) => typeof l.extra?.datetime === "number" && requested.some((f) => l.extra?.[f.key] == null)
  );
}
async function enrich(locations, enrichFields, ctx) {
  const patches = /* @__PURE__ */ new Map();
  const requested = requestedFields(enrichFields);
  const usable = usableLocations(locations, enrichFields);
  if (usable.length === 0) return patches;
  const chunks = [];
  for (let i = 0; i < usable.length; i += COORDS_PER_REQUEST) {
    chunks.push(usable.slice(i, i + COORDS_PER_REQUEST));
  }
  const vars = requested.map((f) => f.param).join(",");
  const limiter = new RateLimiter(CALLS_PER_MIN, 6e4);
  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length && !ctx?.signal?.aborted) {
      const chunk = chunks[cursor++];
      await runTask(chunk, vars, requested, limiter, patches);
      for (let i = 0; i < chunk.length; i++) ctx?.onUnit?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, chunks.length) }, worker));
  return patches;
}
MMA.registerPlugin({
  activate() {
    MMA.registerEnrichFields(ENRICH_OPTIONS);
    MMA.registerEnrichmentProvider({
      id: "weather",
      label: "Weather",
      enrich,
      fieldDefs: FIELD_DEFS,
      requires: ["datetime"],
      units: (locations, enrichFields) => usableLocations(locations, enrichFields).length
    });
  }
});
