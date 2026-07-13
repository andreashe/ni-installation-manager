# Restore Flow

Where the backup scan and the restore pipeline live and how they run (TODO8). The backup structure they read is written by the backup phase described in [uninstall-flow.md](./uninstall-flow.md); the on-disk layout constants live in `src/main/utils/backup-layout.ts` (single source of truth for both sides).

## Backup scan (startup, reload button, backup-folder change)

`RestoreScanService.scan()` — triggered from `main.ts` at startup, by `restore:rescan` (reload button on the Restore page) and by a store-sync reaction whenever the `backupFolder` setting changes:

1. No backup folder configured → store cleared, done (the Restore page shows a hint linking to Preferences instead of the list).
2. One directory dive: every DIRECT subfolder of the backup folder containing a **`niim-backup-desc.json`** becomes a `BackupProduct` model in `RestoreStore` (malformed descriptions are skipped with a log warning). Status bar + log show each scanned folder.
3. Artwork phase: reuse an existing assets-cache entry (`ArtworkCacheService.getCachedArtworkFileName`), else import the backup's `product.png` (`ArtworkCacheService.importArtwork`); otherwise the renderer falls back to the bundled alt image.
4. Size phase: backups whose descriptor carries no `diskUsageBytes` get the recursive size of their backup subfolder (`sizeOfPath`), filling in live per backup.

`RestoreStore` snapshots are pushed via `restore:changed` to the renderer mirror (`src/renderer/stores/RestoreStore.ts`), consumed by `RestorePage`.

## Models

The registry-scan `Product` model is NOT reused for backups: a backup carries a frozen `ProductDto` snapshot (the `product` object inside `niim-backup-desc.json`) plus backup-specific facts. `BackupProduct` (`src/main/models/BackupProduct.ts`) wraps exactly that: name, version, backupDate, backup subfolder path, the descriptor, and the mutable enrichment fields (`diskUsageBytes`, `artworkCacheFileName`).

## Restore details panel

`restore:get-details` → `RestoreDetailsService.getDetails(name)`: for every non-shared-container disk path of the descriptor it reports the restore TARGET (`resolvedPath` — may point to a future location that does not exist yet; **yellow** in the UI when it already exists, i.e. would be overwritten), the matching source inside the backup (`files/<Kind>/<basename>`; **red** when the descriptor mentions a kind the backup holds no data for), the backup-side size, a deduplicated potential total restore size and the registry key paths that would be restored. Rendered by `RestoreDetailsPanel` (slide-up, like the product details panel).

## Restore jobs

Entry: `restore:start` IPC → `RestoreService.start(names)`. Restore jobs share the `UninstallJobStore` (mode `'restore'`) — one job of any kind at a time, same progress page, same `uninstall:dismiss` to close. After a successful real (non-dry-run) restore — plain or "Restore As…" — the product disk usage cache is cleared (`ProductDiskUsageCache`, TODO11), since restored files change sizes on disk.

Spec building (`src/main/restore/restore-job.ts`): `toRestoreProductSpec` first deep-CLONES the descriptor — all restore calculations work on the copy so the upcoming "Restore As…" feature can rewrite target paths without mutating the scanned model. One `RestoreEntrySpec` per disk path that actually has data in the backup (shared plugin containers were never backed up and are skipped); entry sizes are measured on the backup side for the space check.

**Execution strategies** (decided per job, mirroring uninstall):

| Condition | Strategy |
|---|---|
| dry-run active | `RestoreJobRunner` in-process; only logs `DRY-RUN: would restore …` |
| app already elevated | runner in-process, real copies |
| not elevated | job spec written to `userData/uninstall-jobs/restore-<ts>/job.json`; `ElevationService` relaunches the app as elevated **restore worker** (`--restore-worker --job-file=…`); worker streams JSONL into `progress.jsonl`, tailed via the shared `utils/jsonl-tail.ts` helper (also used by `UninstallService`) |

**Steps per product** (accounting in `computeRestoreTotalSteps`): one step per restore entry (copy `files/<Kind>/<basename>` → target, parent folders created, existing targets overwritten/merged), then one step per backed-up registry key — every key from the descriptor's `registryEntries` is recreated under HKLM with all values written back in their original types (`RegistryGuard.restoreKeyValues` → `RegistryService`, dry-run aware). Before the first copy a **per-device free-space check** runs (required bytes summed per target drive root, `fs.statfs` per device); insufficient devices abort the job with an error naming each one. Skippable via the "Ignore space check for restore" setting (`ignoreRestoreSpaceCheck`).

## Restore As… (TODO9)

Restore to DIFFERENT locations via rename patterns (`RenamePattern { from, to }`: case-insensitive, segment-aligned path-prefix replacement; first matching pattern wins). The pure logic lives in `src/shared/restore-as.ts` (`applyRenamePatterns`, `isValidWindowsPath`) and is shared by the renderer preview and the main-process job rewrite, so both always agree.

- **Page** (`RestoreAsPage`, entered only through the "Restore As…" buttons on the Restore page rows/toolbar/details panel; `UiStore.openRestoreAs(names)`): a thin wrapper around the shared `RenameTargetsPage` component (`src/renderer/components/RenameTargetsPage.tsx`, also used by the Move page — see [move-flow.md](./move-flow.md)): pattern editor on top (add/remove/edit; persisted on every change), below one section per selected backup listing each restore target with kind, old target (exists/not found), old path, new target (new/exists/invalid), new path (orange when it already exists, red when syntactically invalid — invalid paths block the start button), backup-side size and an "As pattern" shortcut pre-filling from/to with the old path.
- **Data**: `restore:get-as-targets` → `RestoreAsService.getTargets` (reuses `toRestoreProductSpec`; sizes walked once). New paths are computed in the renderer; only existence goes through the debounced `restore:paths-exist` query.
- **Patterns persistence**: own JSON file `userData/rename-patterns.json` (`RestoreAsService.loadPatterns`/`savePatterns`, `restore:get-patterns`/`restore:save-patterns`) — reloaded whenever the page opens.
- **Job**: "Start Restore As" → `restore:start-as` → `RestoreService.start(names, patterns)`. `applyRenamePatternsToProductSpec` rewrites the CLONED specs in place (this is why `toRestoreProductSpec` clones): entry target paths (missing folders are created on copy; the per-device space check then measures the NEW devices), the path-carrying registry values (`RESTORE_AS_REGISTRY_PATH_VALUE_NAMES`: ContentDir, InstallAAX64Dir, InstallDir, InstallVST364Dir, InstallVST64Dir — matched case-insensitively) and the descriptor disk paths. The normal restore passes no patterns and is untouched.

## Elevated restore worker

`src/main/restore/restore-worker.ts` — same pattern as the uninstall worker (`CLI_FLAG_RESTORE_WORKER` checked at the top of `main.ts`; headless, own log `logs/restore-worker.log`, exit code 0 = success), running the same `RestoreJobRunner` as the in-process path.
