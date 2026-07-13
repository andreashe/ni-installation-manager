# Logging

Central logging per RULES.md §9. One sink, adjustable level, live UI panel.

## Components

| Piece | Location | Role |
|---|---|---|
| `LoggerService` | `src/main/services/LoggerService.ts` | The single sink: level filter → log file + console + `log:entry` push |
| level reaction | `src/main/ipc/store-sync.ts` | Follows the `logLevel` setting at runtime (Preferences → select) |
| renderer forwarding | `window.api.log.write()` → `log-handlers.ts` | Renderer messages join the same sink, source prefixed `renderer:` |
| `LogStore` | `src/renderer/stores/LogStore.ts` | Mirror of the entry stream, capped at 1000 entries |
| `LogPanel` | `src/renderer/components/LogPanel.tsx` | Slide-up live view: autoscroll (sticks to bottom unless scrolled up), close button; toggled from the sidebar |

## Files

- Main app log: `userData/logs/ni-installation-manager.log`
- Elevated worker log: `userData/logs/uninstall-worker.log` (worker also streams progress separately, see [uninstall-flow.md](./uninstall-flow.md))

## Levels & rules

- `debug` < `info` < `warn` < `error` (`LOG_LEVELS` in `src/shared/types/app-settings.ts`); the configured level is the minimum written.
- Services log via the injected `LoggerService` — no `console.log` in main feature code.
- Never log registry **values** (license keys/serials live there) — counts and key paths only.
- Dry-run actions are logged by the guards as `DRY-RUN: would …` at info level.
