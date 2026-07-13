# Developer Documentation

Documentation for developers working on NI Installation Manager — a Windows-only Electron + React app to manage (mainly uninstall) Native Instruments products. See [PLAN.md](../PLAN.md) for the full feature plan and [RULES.md](../RULES.md) for binding engineering rules.

## Topics

| Doc | Content |
|---|---|
| [development.md](./development.md) | Setup, dev mode, unit tests, packaging, CI release workflow |
| [project-structure.md](./project-structure.md) | Folder layout, process separation, how/where to add new features |
| [architecture.md](./architecture.md) | Composition root, MobX store sync (main ⇄ renderer), settings, logging, dry-run guards |
| [registry.md](./registry.md) | Registry paths/values used, product merge rules, removable rules, access layer |
| [file-paths.md](./file-paths.md) | All disk paths touched: install dirs, shared plugin dirs, artwork, assets cache, backups |
| [runtime-data-locations.md](./runtime-data-locations.md) | Where the running app stores its own files on Windows: settings, logs, caches, job files |
| [uninstall-flow.md](./uninstall-flow.md) | Scan & uninstall sequences, elevation strategy, backup format, elevated worker |
| [restore-flow.md](./restore-flow.md) | Backup folder scan, restore details, restore jobs, per-device space check, restore worker |
| [move-flow.md](./move-flow.md) | Move installed products via rename patterns: Move page, move jobs, registry update, move worker |
| [logging.md](./logging.md) | Logger configuration, levels, log files, log panel |

## Keeping docs current

Whenever classes are added or modified, update the related doc in the same change (see CLAUDE.md). Docs stay at abstract level: filenames, class names, data flow, registration points.
