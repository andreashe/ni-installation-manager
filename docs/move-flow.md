# Move Flow

Where the "Move…" feature lives and how it runs (TODO10). Move relocates INSTALLED products to different disk locations — unlike restore, the data source is the registry scan (`ProductStore`, the same models the Installed page shows), not a backup. It shares the rename-pattern machinery of "Restore As…" ([restore-flow.md](./restore-flow.md)) and the job/progress infrastructure of uninstall/restore.

## Entry points

"Move…" per-row button and "Move selected…" toolbar button on the Installed page (`InstalledPage`, `ProductRow`) → `UiStore.openMove(names)` → `MovePage`.

## Move page

`MovePage` (`src/renderer/pages/MovePage.tsx`) is a thin wrapper around the shared **`RenameTargetsPage`** component (`src/renderer/components/RenameTargetsPage.tsx`) — the pattern editor + per-product target tables extracted from the former Restore As page body; `RestoreAsPage` is the second wrapper. Both pages share:

- the SAME persisted rename patterns (`userData/rename-patterns.json`, via the restore IPC channels `restore:get-patterns`/`restore:save-patterns`),
- the pure pattern logic in `src/shared/restore-as.ts` (`applyRenamePatterns`, `isValidWindowsPath`) for the live new-path preview,
- the debounced existence check `restore:paths-exist` (orange = new path already exists, red = invalid path, blocks the start button).

Only the data source and the start action differ (injected as props). Move targets come from `move:get-targets` → `MoveService.getTargets(names)`: for every selected product, its current non-shared-container disk locations (deduplicated, existence checked fresh, sizes walked once — `collectMoveSources` in `src/main/move/move-job.ts`).

## Move jobs

Entry: "Start move" → `move:start` → `MoveService.start(names, patterns)`. Move jobs share the `UninstallJobStore` (mode `'move'`) — one job of any kind at a time, same progress page, same `uninstall:dismiss` to close.

Spec building (`src/main/move/move-job.ts`): `toMoveProductSpec` works on `Product.toDto()` (a deep copy — the scanned model stays untouched) and produces:

- one `MoveEntrySpec` (source → pattern-derived target) per EXISTING disk location whose target differs from the source — **source = target is never moved**; shared plugin containers are never candidates;
- `registryUpdates`: the path-carrying registry values (`RESTORE_AS_REGISTRY_PATH_VALUE_NAMES`: ContentDir, InstallAAX64Dir, InstallDir, InstallVST364Dir, InstallVST64Dir — matched case-insensitively) whose value CHANGED under the patterns, per HKLM-relative key.

**Execution strategies** (decided per job, mirroring restore):

| Condition | Strategy |
|---|---|
| dry-run active | `MoveJobRunner` in-process; only logs `DRY-RUN: would move …` |
| app already elevated | runner in-process, real moves |
| not elevated | job spec written to `userData/uninstall-jobs/move-<ts>/job.json`; `ElevationService` relaunches the app as elevated **move worker** (`--move-worker --job-file=…`); worker streams JSONL into `progress.jsonl`, tailed via `utils/jsonl-tail.ts` |

**Steps per product** (accounting in `computeMoveTotalSteps`): one step per move entry — fast `fs.rename` where possible, copy + delete-source as fallback (cross-device, existing target; targets overwritten/merged) — then, ONLY after all file moves of the product succeeded, one step per changed registry key (`RegistryGuard.restoreKeyValues`, dry-run aware), so a failed move never leaves the registry pointing at unmoved locations. Before the first move a **per-device free-space check** runs; only CROSS-device entries count (a same-device move is a rename and needs no space). Skippable via the "Ignore space check for move" setting (`ignoreMoveSpaceCheck`).

After a successful real move `MoveService` triggers a product rescan — disk paths and registry values changed.

## Elevated move worker

`src/main/move/move-worker.ts` — same pattern as the restore worker (`CLI_FLAG_MOVE_WORKER` checked at the top of `main.ts`; headless, own log `logs/move-worker.log`, exit code 0 = success), running the same `MoveJobRunner` as the in-process path.
