# Runtime Data Locations (Windows)

Where the running app stores its own files. Everything lives in the Electron **`userData`** folder; all paths are defined centrally in `src/config/paths.ts` (RULES.md §13) — never hardcoded in feature code.

## Base folder

```
%APPDATA%\ni-installation-manager
```

resolved: `C:\Users\<user>\AppData\Roaming\ni-installation-manager`

This is `app.getPath('userData')`; the folder name comes from `productName` in `package.json`. Same location in dev mode (`npm start`) and in the packaged app. Paste `%APPDATA%\ni-installation-manager` into the Explorer address bar to open it.

## Files and folders

| What | Path (inside the base folder) | Source (`src/config/paths.ts`) | Written by |
|---|---|---|---|
| **Settings** | `settings.json` | `getSettingsFilePath()` | `SettingsService` — persisted immediately on every Preferences change |
| Rename patterns (Restore As… / Move…) | `rename-patterns.json` | `getRenamePatternsFilePath()` | `RestoreAsService` — persisted on every pattern edit |
| **Log file** (main app) | `logs\ni-installation-manager.log` | `getLogFilePath()` | `LoggerService` (level per the "Log level" setting). All `.log` files are emptied by Preferences → "Clear Log" |
| Log file, elevated uninstall worker | `logs\uninstall-worker.log` | `getLogFolderPath()` + fixed name | `uninstall-worker.ts` |
| Log file, elevated restore worker | `logs\restore-worker.log` | `getLogFolderPath()` + fixed name | `restore-worker.ts` |
| Log file, elevated move worker | `logs\move-worker.log` | `getLogFolderPath()` + fixed name | `move-worker.ts` |
| **Assets cache** (product artwork) | `assets-cache\` | `getFrontendAssetsCachePath()` | `ArtworkCacheService`; served to the renderer via the `ni-assets://` protocol. Cleared by Preferences → "Clear cache", rebuilt on next scan |
| **Disk usage cache** (per-product sizes) | `ProductDiskUsageCache\<md5(product name)>.json` | `getProductDiskUsageCachePath()` | `ProductDiskUsageCache` (bytes + scan time + product version). Cleared by the Installed reload button, Preferences → "Clear cache" and after real restores |
| Elevated job files | `uninstall-jobs\<mode>-<timestamp>\job.json` + `progress.jsonl` | `getUninstallJobsPath()` | `UninstallService` / `RestoreService` / `MoveService` write `job.json`; the elevated worker streams `progress.jsonl` |

## Not ours: Chromium internals

The base folder also contains folders Electron/Chromium creates itself (`Cache`, `Code Cache`, `GPUCache`, `Local Storage`, `Session Storage`, `Network`, `blob_storage`, `Preferences`, `Local State`, …). The app never reads or writes these directly; they are safe to ignore when debugging app behavior.

## Quick debugging recipes

- Inspect current settings: open `%APPDATA%\ni-installation-manager\settings.json`.
- Follow the log live: `Get-Content "$env:APPDATA\ni-installation-manager\logs\ni-installation-manager.log" -Tail 50 -Wait` (PowerShell).
- Elevated job failed? Check the matching `uninstall-jobs\<mode>-<timestamp>\` folder: `job.json` shows what was requested, `progress.jsonl` what the worker did, plus the worker's own log in `logs\`.
- Full reset: quit the app and delete the whole base folder — settings, patterns, logs and caches are recreated with defaults on next start.
