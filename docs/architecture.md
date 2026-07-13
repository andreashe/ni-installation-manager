# Architecture

How the foundation of NI Installation Manager is organized: composition, state flow, settings, logging, dry-run. For the folder layout see [project-structure.md](./project-structure.md).

## Composition root

`src/main/app-context.ts` builds the `AppContext`: all main-process singletons (stores, services, guards) created and wired in dependency order. `src/main/main.ts` stays bootstrap-only:

```
app.on('ready') → createAppContext(process.argv) → registerAllIpcHandlers() → startStoreSync() → createWindow()
```

Order matters: settings are loaded and IPC handlers registered **before** the window exists, so the renderer never talks to an uninitialized main process.

The window is created with `show: false` and only shown on Electron's `ready-to-show` event, so the user never sees an empty window before the renderer has painted. While the initial product scan is still running, `InstalledPage` shows a `Spinner` (`src/renderer/components/Spinner.tsx`) until the first product snapshot arrives (`ProductStore.initialized`).

## State flow (MobX sync)

Main-process stores are the **source of truth**; the renderer holds read-mostly mirror stores.

```
main store (MobX)  ──reaction (ipc/store-sync.ts)──▶  broadcastToRenderers(channel, snapshot)
        ▲                                                        │
        │                                              preload (window.api.*.onChanged)
   service writes                                                ▼
        ▲                                             renderer mirror store (MobX)
        │                                                        ▼
renderer command (invoke via window.api)              React components (observer)
```

- Renderer → main: commands/queries via `ipcRenderer.invoke` (wrapped in `window.api`), input validated in the handler.
- Main → renderer: state pushes via `webContents.send`, set up centrally in `src/main/ipc/store-sync.ts`.
- Snapshots are plain JSON DTOs (`toState()` on the main store), never live objects.

Currently synchronized: settings (`settings:changed`), products (`products:changed`, batched with a 150 ms delay to absorb bursts of async size updates), backups (`restore:changed`, same batching), job progress (`uninstall:changed` — one shared `UninstallJobStore` for uninstall, backup AND restore jobs), log entries (`log:entry`). `store-sync.ts` also triggers a backup rescan whenever the `backupFolder` setting changes.

## Settings

- Persisted as JSON at `userData/settings.json` (path from `src/config/paths.ts`).
- `SettingsService` (main) is the only reader/writer of the file and the only writer of the main `SettingsStore`.
- Loaded at startup **before** window creation; missing keys are filled from `DEFAULT_SETTINGS` (`src/config/default.config.ts`).
- Renderer changes a preference → `window.api.settings.update(partial)` → validated → store updated → persisted → new state pushed back to all windows.
- `--dry-run` CLI flag forces dry-run for the current run without touching the stored setting (`SettingsState.dryRunForcedByCli`).

## Logging

- `LoggerService` (main) is the single log sink: level filter → log file (`userData/logs/ni-installation-manager.log`) + console + live push to renderer (`log:entry`).
- Log level is runtime-adjustable: a reaction in `store-sync.ts` follows the `logLevel` setting.
- Renderer code logs via `window.api.log.write(level, message, source)` — forwarded into the same sink (source prefixed with `renderer:`).
- No `console.log` in main-process feature code; services log through the injected `LoggerService`.

## Dry-run & destructive operations

- All destructive operations go through two guards (`src/main/utils/`):
  - `FsGuard.deleteFile / deleteFolder`
  - `RegistryGuard.deleteKeyTree / deleteValue`
- When `SettingsStore.effectiveDryRun` is true (persisted setting **or** CLI flag), the guards only log `DRY-RUN: would …` and perform nothing.
- `RegistryGuard` delegates real mutations (deletions AND restore writes) to a `RegistryMutationBackend` implemented by `RegistryService`; until wired, non-dry-run calls fail loudly.
- Feature code must never call `fs.rm` or registry deletion APIs directly.
