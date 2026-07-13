# Scan & Uninstall Flow

Where the product scan and the uninstall pipeline live and how they run. Domain rules (registry paths, folder rules) are in [registry.md](./registry.md) and [file-paths.md](./file-paths.md).

## Scan (startup + reload button)

`ProductScanService.scan()` — triggered from `main.ts` at startup and by `products:rescan`:

1. Status bar → "Scanning registry…"; enumerate both NI registry roots, merge same-named subkeys, build `Product` models via `ProductFactory` (path resolution + existence checks), `ProductStore.replaceAll()` — the list is visible now.
2. `ArtworkCacheService.cacheAll()` — artwork copied into the assets cache, images pop in.
3. `ProductDiskUsageService.scanAll()` — sizes trickle in per product (MobX push per update, batched 150 ms). Superseded runs cancel between products. Resolved sizes are cached per product (`ProductDiskUsageCache`, TODO11: `userData/ProductDiskUsageCache/<md5(name)>.json` with bytes + scan time + product version); a valid entry for the same version skips the size scan. The cache is cleared by the Installed page reload button (before rescanning), by Preferences → "Clear cache" and after every real restore job.

## Uninstall & backup jobs

Entry: `uninstall:start` IPC → `UninstallService.start(names, mode)`; `mode` is `'uninstall'` or `'backup'` (TODO7). One job at a time; state lives in `UninstallJobStore` (main) and is pushed via `uninstall:changed` to the progress page.

**Backup-only jobs** run the backup phase and stop: nothing deleted, no elevation (copying needs no admin), products stay in the list. Triggered from the "Backup" buttons (row / toolbar / details panel), which are disabled until a backup folder is configured.

**Execution strategies** (decided per job):

| Condition | Strategy |
|---|---|
| dry-run active | `UninstallJobRunner` in-process; `FsGuard`/`RegistryGuard` log `DRY-RUN: would …` and delete nothing; no elevation, product list unchanged |
| app already elevated | runner in-process with real deletion through the guards |
| not elevated | job spec written to `userData/uninstall-jobs/job-<ts>/job.json`; `ElevationService` relaunches the app as **elevated worker** (`--uninstall-worker --job-file=…`, one UAC prompt via PowerShell `Start-Process -Verb RunAs`); worker streams JSONL events into `progress.jsonl`, which `UninstallService` tails (250 ms) and translates into job store updates. Between UAC confirmation and the first worker event several seconds pass (PowerShell spawn + elevated Electron instance boot) — the worker emits a started-line as early as possible and the tail loop adds heartbeat lines every ~3 s while silent, so the progress page never looks hung |

**Steps per product** (accounting in `computeTotalSteps`, `src/main/uninstall/uninstall-job.ts`):

1. *(backup enabled + folder set, or mode 'backup')* free-space check (`BackupService.ensureFreeSpace`, `fs.statfs`; skippable via the "Ignore space check for backup" setting), then one step per existing disk path (copy into `<backup>/<product>/files/<Kind>/`) plus one step for the registry dump (`registry/64-bit.json` + `32-bit.json`, values incl. types) and the **`niim-backup-desc.json`** description file (name, version, backup date, serialized product whose disk paths list **existing locations only** — registry keys may name folders without content; those are neither copied nor listed as restorable). Targets left over from a previous backup run are **overwritten** (removed, then copied fresh), never duplicated with suffixes.
2. One step per existing disk path deletion — resolved paths already respect the shared-folder rules; directories via `FsGuard.deleteFolder`, single files via `FsGuard.deleteFile`.
3. One step per registry key deletion (`RegistryGuard.deleteKeyTree`) for every hive path the product was found under.
4. `product-done` → main removes the product from `ProductStore` (skipped in dry-run) → row disappears live.

Failure anywhere (e.g. insufficient backup space) aborts the job; status `failed` with the error on the progress page. The page stays open until the user presses CLOSE (`uninstall:dismiss` → store reset to `idle`).

## Elevated worker

`src/main/uninstall/uninstall-worker.ts` — the same Electron binary started headless (`CLI_FLAG_UNINSTALL_WORKER` checked at the top of `main.ts`; no window, no IPC handlers). Builds its own minimal wiring (logger → `logs/uninstall-worker.log`, fresh `SettingsStore` with dry-run off, guards + `RegistryService` backend) and runs the same `UninstallJobRunner`. Exit code 0 = success.
