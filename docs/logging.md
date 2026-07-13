# Logging

Central logging per RULES.md §9. One sink, adjustable level, live UI panel.

## Components

| Piece | Location | Role |
|---|---|---|
| `LoggerService` | `src/main/services/LoggerService.ts` | The single sink: level filter → log file + console + `log:entry` push |
| level reaction | `src/main/ipc/store-sync.ts` | Follows the `logLevel` setting at runtime (Preferences → select) |
| renderer forwarding | `window.api.log.write()` → `log-handlers.ts` | Renderer messages join the same sink, source prefixed `renderer:` |
| `LogStore` | `src/renderer/stores/LogStore.ts` | Mirror of the entry stream (capped at 1000 entries) + file-tab state (tab list, selected tab, file content) |
| `LogPanel` | `src/renderer/components/LogPanel.tsx` | Slide-up view with tabs: **Live** (autoscroll stream) + one tab per log file (snapshot + Reload button); toggled from the sidebar |

## Files

- Main app log: `userData/logs/ni-installation-manager.log`
- Elevated worker logs: `userData/logs/uninstall-worker.log`, `restore-worker.log`, `move-worker.log` (paths in `src/config/paths.ts`; the workers also stream progress separately, see [uninstall-flow.md](./uninstall-flow.md))

Worker logs are separate files by design: the workers run as a different (elevated) process, so they cannot push into the live `log:entry` stream, and concurrent appends to the shared main log would interleave with the main process (which mirrors the workers' progress lines into the main log anyway via `WorkerProgressTracker`). The log panel's file tabs make them readable in-app: `log:files` lists the `.log` files, `log:read` returns one file's tail (max 256 KB) — both served by `LoggerService` (`listLogFiles`/`readLogFile`, names validated against the folder listing, never paths from the renderer).

## Levels & rules

- `debug` < `info` < `warn` < `error` (`LOG_LEVELS` in `src/shared/types/app-settings.ts`); the configured level is the minimum written.
- Services log via the injected `LoggerService` — no `console.log` in main feature code.
- Never log registry **values** (license keys/serials live there) — counts and key paths only.
- Dry-run actions are logged by the guards as `DRY-RUN: would …` at info level.
