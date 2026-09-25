// gen4cam/src/procedure.ts
var PLUGIN_ID = "gen4cam";
var COMMAND = "detect";
function parseLine(line) {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function keyOf(panoId, heading) {
  return `${panoId}
${heading}`;
}
function run(rows) {
  if (mma.aborted()) return [];
  const byKey = /* @__PURE__ */ new Map();
  const items = [];
  for (const row of rows) {
    if (!row.panoId) continue;
    const key = keyOf(row.panoId, row.heading);
    const group = byKey.get(key);
    if (group) group.push(row);
    else {
      byKey.set(key, [row]);
      items.push({ panoId: row.panoId, heading: row.heading });
    }
  }
  if (items.length === 0) return [];
  const out = [];
  mma.sidecar(PLUGIN_ID, COMMAND, JSON.stringify({ items }), (line) => {
    const parsed = parseLine(line);
    if (!parsed?.panoId || typeof parsed.heading !== "number") return;
    const group = byKey.get(keyOf(parsed.panoId, parsed.heading));
    if (!group) return;
    for (const row of group) {
      if (parsed.error) mma.fail(row.id);
      else if (typeof parsed.camera === "string" && parsed.camera.length > 0)
        out.push({ id: row.id, patch: { extra: { gen4Camera: parsed.camera } } });
      mma.progress(1);
    }
  });
  return out;
}
export {
  run
};
