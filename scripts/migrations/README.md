# Migrating

This folder contains instructions and scripts for bringing your data over from [map-making.app](https://map-making.app) and its userscripts.

Each script is standalone Node. Run from the repo root. To install Node, download the LTS installer from [nodejs.org](https://nodejs.org) and run it.

**All steps below require you to import maps into the desktop app**. This is done two ways:
1. In bulk (recommended): at the bottom right inside the desktop app, there is an import icon. Clicking it prompts importing one or many files (.json or .zip are accepted).
2. Individually: open an empty map and either drag-and-drop or click "Import file", select a single JSON to import for that map.

## Migrating normally

If you don't use any data-affecting userscripts, you can simply export using "Download data" from the main page of https://map-making.app, at the bottom. Your data is ready to import as described above. No scripts required!

> [!WARNING]
> For the time being, map-level `extra` fields like tag order and color are not carried by the webapp's bulk export method. You may re-import maps from a manual export on individual maps, on the webapp, if that's important to you.

## Migrating map folders

If your maps are organized into folders on map-making.app, you can bring that folder structure into MMA:

1. Go to https://map-making.app (main page, logged in)
2. Open the browser console (F12 -> Console)
3. Paste the contents of `scripts/migrations/export-map-folders.js` and press Enter
4. A `map-folders.mmafolders` file will download
5. In MMA's map list, click the import button and select the `.mmafolders` file

Maps are matched by name. Any maps not found locally are skipped (the count is shown in a toast).

## Migrating from [tag folders](https://greasyfork.org/en/scripts/571049-map-making-folders)

Download your locations, then run:

```bash
node scripts/migrations/migrate-folders.mjs <input.json...> [-o outdir]
```

- **Input:** the JSON from the userscript's "Export" button
- **Output:** `<name>-mma.json` next to each input (or into `-o <outdir>`), ready to import into MMA

Accepts multiple files / globs:

```bash
node scripts/migrations/migrate-folders.mjs maps/*.json -o converted/
```
