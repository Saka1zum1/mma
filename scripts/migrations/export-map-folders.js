/**
 * export-map-folders.js — browser console script
 *
 * Run this in the browser console while logged in to map-making.app.
 * It reads the server-rendered #data element to extract which map belongs
 * to which folder, then downloads a .mmafolders file for import into MMA.
 *
 * Usage:
 *   1. Go to https://map-making.app (main page, logged in)
 *   2. Open the browser console (F12 -> Console)
 *   3. Paste this entire script and press Enter
 *   4. A .mmafolders file will download automatically
 */
(() => {
  const dataEl = document.querySelector("#data");
  if (!dataEl) {
    alert("No #data element found. Make sure you're on the main page of map-making.app while logged in.");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(dataEl.textContent || "{}");
  } catch (e) {
    alert("Failed to parse #data: " + e.message);
    return;
  }

  const { folders, maps } = parsed;
  if (!folders || !maps) {
    alert("Unexpected #data format — missing folders or maps.");
    return;
  }

  // folders: { "FolderName": [mapObj, ...], ... }
  // maps: [mapObj, ...] (folder: null)
  // Each map has { name, folder, id, locationCount, ... }
  const result = {};
  let count = 0;

  for (const [folderName, folderMaps] of Object.entries(folders)) {
    for (const m of folderMaps) {
      if (m.name && folderName) {
        result[m.name] = folderName;
        count++;
      }
    }
  }

  if (count === 0) {
    alert("No folder assignments found. Are any maps in folders?");
    return;
  }

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "map-folders.mmafolders";
  a.click();
  URL.revokeObjectURL(url);

  alert(`Exported ${count} map-to-folder assignments. Import the .mmafolders file in MMA.`);
})();
