# Project Structure

NI Installation Manager follows a strict process-separation architecture to maintain security boundaries between the Electron main process and the renderer (React UI).

## Directory Layout

```
src/
├── main/                    # Main process (Node.js environment)
│   ├── main.ts              # Bootstrap only: builds AppContext, registers IPC, creates window
│   ├── preload.ts           # Security bridge: exposes `window.api` via contextBridge
│   ├── app-context.ts       # Composition root: creates & wires all singletons
│   ├── ipc/                 # IPC layer
│   │   ├── ipc-registrar.ts     # Central registration of all IPC handlers
│   │   ├── settings-handlers.ts # settings:get / settings:update (validates input)
│   │   ├── product-handlers.ts  # products:get / products:rescan
│   │   ├── uninstall-handlers.ts# uninstall:start / uninstall:dismiss
│   │   ├── restore-handlers.ts  # restore:get / rescan / get-details / start
│   │   ├── move-handlers.ts     # move:get-targets / move:start
│   │   ├── payload-sanitizers.ts# Shared IPC payload sanitizers (names, rename patterns)
│   │   ├── dialog-handlers.ts   # dialog:select-folder (backup folder picker)
│   │   ├── log-handlers.ts      # log:from-renderer → central logger
│   │   ├── store-sync.ts        # MobX reactions: main stores → renderer pushes
│   │   └── renderer-push.ts     # broadcastToRenderers() helper
│   ├── services/            # Business services (one class per file)
│   │   ├── LoggerService.ts     # Central log sink (file, console, renderer stream)
│   │   ├── SettingsService.ts   # Loads/persists settings JSON, writes SettingsStore
│   │   ├── RegistryService.ts   # native-reg wrapper (read + guarded delete backend)
│   │   ├── ProductScanService.ts# Scans NI registry roots, fills ProductStore
│   │   ├── ArtworkCacheService.ts # Copies product artwork into the assets cache
│   │   ├── ProductDiskUsageService.ts # Async per-product size sums (live updates, cache-aware)
│   │   ├── ProductDiskUsageCache.ts   # Per-product size cache (md5(name).json, version-checked)
│   │   ├── BackupService.ts     # Pre-uninstall file + registry backup
│   │   ├── ElevationService.ts  # isElevated() + elevated worker launch (UAC)
│   │   ├── UninstallService.ts  # Job orchestration (in-process vs elevated worker)
│   │   ├── RestoreScanService.ts# Scans the backup folder for restorable backups
│   │   ├── RestoreDetailsService.ts # On-demand facts for the restore details panel
│   │   ├── RestoreService.ts    # Restore job orchestration (in-process vs elevated worker)
│   │   ├── RestoreAsService.ts  # Restore As: rename-pattern persistence + target preview
│   │   └── MoveService.ts       # Move: targets for the Move page + job orchestration
│   ├── stores/              # Main-process MobX stores (source of truth)
│   │   ├── SettingsStore.ts
│   │   ├── ProductStore.ts
│   │   ├── RestoreStore.ts      # Scanned backup list (Restore page)
│   │   └── UninstallJobStore.ts # Shared by uninstall, backup, restore AND move jobs
│   ├── models/              # Domain model classes
│   │   ├── Product.ts           # Observable product model (serializable via toDto)
│   │   ├── ProductFactory.ts    # Builds Products from raw registry data + fs checks
│   │   └── BackupProduct.ts     # Observable backup model (from niim-backup-desc.json)
│   ├── uninstall/           # Uninstall job machinery
│   │   ├── uninstall-job.ts     # Job spec types, step accounting, progress protocol
│   │   ├── UninstallJobRunner.ts# Executes a job (shared by in-process + worker)
│   │   └── uninstall-worker.ts  # Headless elevated worker entry
│   ├── restore/             # Restore job machinery (mirrors uninstall/)
│   │   ├── restore-job.ts       # Job spec types, step accounting, cloning, pattern rewrite
│   │   ├── RestoreJobRunner.ts  # Executes a restore job (shared by in-process + worker)
│   │   └── restore-worker.ts    # Headless elevated restore worker entry
│   ├── move/                # Move job machinery (mirrors restore/)
│   │   ├── move-job.ts          # Job spec types, source collection, pattern-derived targets
│   │   ├── MoveJobRunner.ts     # Executes a move job (shared by in-process + worker)
│   │   └── move-worker.ts       # Headless elevated move worker entry
│   └── utils/               # Guards and helpers
│       ├── FsGuard.ts           # Choke point for destructive fs ops (dry-run aware)
│       ├── RegistryGuard.ts     # Choke point for destructive registry ops (dry-run aware)
│       ├── fs-size.ts           # Recursive size helper (disk usage + backup check)
│       ├── backup-layout.ts     # On-disk backup structure (written by backup, read by restore)
│       ├── jsonl-tail.ts        # Progress-file tailing shared by uninstall + restore services
│       └── assets-protocol.ts   # ni-assets:// protocol for cached artwork
│
├── renderer/                # Renderer process (Browser/React environment)
│   ├── App.tsx              # Root React component
│   ├── index.tsx            # React entry point: mounts App to DOM
│   ├── index.css            # Global styles
│   ├── stores/              # Renderer MobX mirror stores (fed via IPC pushes)
│   │   ├── RootStore.ts         # Container creating all mirror stores
│   │   ├── SettingsStore.ts     # Mirror of main SettingsStore
│   │   ├── ProductStore.ts      # Mirror of main ProductStore (+ rescan command)
│   │   ├── RestoreStore.ts      # Mirror of main RestoreStore (+ rescan/start commands)
│   │   ├── UninstallStore.ts    # Mirror of the shared job store (+ start/dismiss)
│   │   ├── LogStore.ts          # Live log entries (capped)
│   │   ├── UiStore.ts           # Renderer-only: current page, log panel open
│   │   └── stores.ts            # Module-level RootStore singleton
│   ├── hooks/
│   │   └── useStores.ts         # Access to the RootStore from components
│   ├── components/          # Reusable UI components (Sidebar, StatusBar, ProductRow,
│   │                        #   BackupProductRow, RestoreDetailsPanel, RenameTargetsPage,
│   │                        #   Checkbox, Toggle, Icon, Spinner, LogPanel)
│   ├── pages/               # InstalledPage, RestorePage, RestoreAsPage, MovePage,
│   │                        #   PreferencesPage, AboutPage, UninstallProgressPage
│   └── utils/
│       └── format.ts            # formatBytes(), formatBackupDate()
│
├── shared/                  # Code used by both main and renderer (no Node/DOM APIs)
│   ├── ipc-channels.ts      # ALL IPC channel name constants
│   ├── restore-as.ts        # Pure rename-pattern logic (Restore As + Move): apply + path validation
│   └── types/
│       ├── app-settings.ts      # AppSettings, SettingsState, LogLevel
│       ├── log-entry.ts         # LogEntry
│       ├── restore.ts           # BackupProductDto, RestoreListState, RestoreDetailsDto
│       └── window-api.ts        # WindowApi (`window.api`) contract + global declaration
│
└── config/                  # Centralized configuration
    ├── default.config.ts    # DEFAULT_SETTINGS, CLI flags (importable from both processes)
    ├── ni.config.ts         # NI registry roots, path-value rules, CommonFiles base
    ├── na_cdn-assets.json   # Product name → NI CDN artwork URL (extracted from _sources/na-list.html)
    └── paths.ts             # userData path constants (MAIN-PROCESS ONLY, imports electron)

tests/                       # Unit tests (vitest), mirroring src/
├── config/                  #   e.g. tests/main/models/ProductFactory.test.ts
├── main/                    #   tests src/main/models/ProductFactory.ts
└── renderer/
```

## Process Separation

**Main process (`src/main/`)** — Node.js environment
- File system access, Windows registry, OS-level APIs
- App lifecycle (window management, quit logic)
- All sensitive operations (uninstall, backup, elevation)

**Renderer process (`src/renderer/`)** — Browser environment
- React UI components, user interactions
- **No direct** `fs`, `path`, or Node.js module imports
- All data access goes through `window.api` (see below)

**IPC Bridge** (`src/main/preload.ts`)
- Exposes exactly one typed API object: `window.api` (contract: `src/shared/types/window-api.ts`)
- Raw `ipcRenderer` is never exposed
- Channel names only from `src/shared/ipc-channels.ts`

## Adding Features

**New UI screen or component:**
1. Create in `src/renderer/components/` or `src/renderer/pages/`
2. Read state from mirror stores via `useStores()` + wrap the component in `observer`
3. Custom state/effects? Extract to `src/renderer/hooks/use*.ts`

**Need to access files, registry or OS:**
1. Implement logic in a service in `src/main/services/` (one class, single responsibility)
2. Wire the service in `src/main/app-context.ts` (composition root)
3. Create a handler file in `src/main/ipc/<domain>-handlers.ts`; validate all input
4. Register it in `src/main/ipc/ipc-registrar.ts`
5. Define channel names in `src/shared/ipc-channels.ts`, payload types in `src/shared/types/`
6. Expose the call in `preload.ts` and extend the `WindowApi` interface

**Live data flowing main → renderer (lists, progress, logs):**
1. Keep the state in a main-process MobX store (`src/main/stores/`)
2. Add a reaction in `src/main/ipc/store-sync.ts` that broadcasts snapshots
3. Mirror it in a renderer store (`src/renderer/stores/`), registered in `RootStore`

**Destructive operations (delete files/folders/registry):**
- Never call `fs.rm`/registry-delete directly — go through `FsGuard`/`RegistryGuard`
  (`src/main/utils/`), which enforce dry-run mode and centralized logging.

## TypeScript

- `noImplicitAny: true` — all types explicit, no `any`
- Main and preload: `commonjs` modules; renderer: ESM via Vite + React
- Vite injects `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` globals (see `forge.env.d.ts`)
