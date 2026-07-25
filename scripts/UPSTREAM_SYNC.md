# Upstream sync (ccmdi/mma → this fork)

This fork tracks [ccmdi/mma](https://github.com/ccmdi/mma) while keeping **altproviders** and an **independent release** channel (`Saka1zum1/mma` updater endpoints).

## Why conflicts happen

Both sides edit the same “host” files (`LocationPreview`, `MapEditor`, `buildSceneLayers`, `mapClick`, `bindings.gen.ts`, `tauri.conf.json`). Rare megamerges make those overlaps explode.

## Policy

1. **Sync often** — when upstream moves ~5–15 commits: `pwsh scripts/sync-upstream.ps1`.
2. **Isolate fork logic** — keep providers under `app/src/lib/sv/{baidu,tencent,yandex,lookaround,providers}/`; use thin hooks in shared UI.
3. **Never take upstream updater identity** — keep this fork’s `plugins.updater.endpoints` / `pubkey` in `app/src-tauri/tauri.conf.json`.
4. **Prefer merge** (not rebase) onto `upstream/master` so conflict resolutions stay in history.
5. **Optional locally:** `git config rerere.enabled true` to replay repeated conflict hunks.

## Hot files

| File | Keep from fork | Take from upstream |
|------|----------------|--------------------|
| `tauri.conf.json` | updater endpoints/pubkey | intentional version bumps |
| `buildSceneLayers.ts` | Look Around / provider coverage | marker color / store API |
| `LocationPreview.tsx` | alt PSV session + mount | chipMode / fullscreen chrome |
| `FullscreenMiniLocationPreview.tsx` | children + ChipHost portal shape | hover-expand / scale UX |
| `mapClick.ts` / providers | inject race + radius | Google lookup prefs |
| `plugins/types/mma.d.ts` | regenerate after settings merge | new DEFAULTS fields |

## Verify after sync

```bash
cd app && npx tsc --noEmit -p tsconfig.app.json
cd app/src-tauri && cargo test --offline
```
