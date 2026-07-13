# RULES.md — General Engineering Rules

These rules are technology- and architecture-level rules for this repository. They apply to **every** change, regardless of feature. Business-specific requirements live in [PLAN.md](./PLAN.md).

---

## 1. Process Separation (Electron)

- **Strict separation between main and renderer.**
  - `src/main/` — Node.js context only: filesystem, registry, OS integration, elevation, logging backend.
  - `src/renderer/` — Browser/React context only: UI, presentation state. **Never** import `fs`, `path`, `child_process`, or any Node.js built-in here.
  - `src/shared/` — Code both sides may import: types, IPC channel constants, pure helpers. No Node.js APIs, no DOM APIs.
- `src/main/preload.ts` is the **security boundary**. Only expose narrow, typed APIs via `contextBridge.exposeInMainWorld`. Never enable `nodeIntegration`, never disable `contextIsolation`.
- `src/main/main.ts` and `src/renderer/index.tsx` are **bootstrap only** — window creation, lifecycle, mounting. No business logic.

## 2. Folder Structure

```
src/
├── main/
│   ├── main.ts                  # Bootstrap: window, lifecycle, squirrel events
│   ├── preload.ts               # contextBridge API (security boundary)
│   ├── ipc/                     # IPC handlers, one file per domain, registered centrally
│   ├── services/                # Business services (one class per file, single responsibility)
│   ├── stores/                  # Main-process MobX domain stores (source of truth)
│   ├── models/                  # Domain model classes (serializable)
│   └── utils/                   # Main-process helpers (guards, path helpers)
├── renderer/
│   ├── index.tsx                # Bootstrap: mount App
│   ├── App.tsx                  # Root component: layout shell + page routing
│   ├── components/              # Reusable UI components (one component per file)
│   ├── pages/                   # Full views (Uninstall, Preferences, About, ...)
│   ├── stores/                  # Renderer MobX mirror stores (fed via IPC push)
│   ├── hooks/                   # Custom hooks (use*.ts)
│   ├── styles/                  # Component/global CSS
│   └── types/                   # Renderer-only types
├── shared/
│   ├── ipc-channels.ts          # ALL IPC channel names as constants
│   └── types/                   # DTOs and types used by both processes
└── config/
    ├── default.config.ts        # App defaults
    └── paths.ts                 # Centralized path constants (userData, cache, ...)
```

- **One class/component per file**; filename matches the export (`ProductRow.tsx` exports `ProductRow`).
- Only use `renderer/pages/` because this is a multi-view app; page-local components may live next to their page in a subfolder.

## 3. Separation of Concerns (Roles)

Every class has exactly one role. Name files and classes after their role:

| Role | Location | Responsibility |
|---|---|---|
| **Model** | `main/models/`, `shared/types/` | Data shape + serialization. One model per file. No I/O. |
| **Service** | `main/services/` | Business logic and OS access (registry, fs, backup, ...). |
| **Store** | `main/stores/`, `renderer/stores/` | Observable state (MobX). Main stores are the source of truth; renderer stores mirror them. |
| **IPC handler** | `main/ipc/` | Thin adapters: validate input, call services/stores, return DTOs. No business logic. |
| **Factory** | next to what it builds | Constructs complex objects (e.g. Product from raw registry data). |
| **Component** | `renderer/components/`, `renderer/pages/` | Presentation only. Reads renderer stores, sends commands via the preload bridge. |
| **Hook** | `renderer/hooks/` | Non-trivial React state/effects. Never inline complex effects in components. |

## 4. IPC Rules (the Bridge)

- **No magic strings.** Every channel name is a constant in `src/shared/ipc-channels.ts`.
- Every channel has a **typed contract** (request + response / push payload) in `src/shared/types/`. Main and renderer share the exact same type — never duplicate.
- Two channel kinds, kept distinct:
  - **Commands / queries** (renderer → main): `ipcRenderer.invoke` / `ipcMain.handle`. Return DTOs, never live objects.
  - **State pushes** (main → renderer): `webContents.send` / `ipcRenderer.on`. Used for store synchronization and log streaming.
- IPC handlers **validate all input** coming from the renderer before acting on it (the renderer is untrusted).
- The preload script exposes a single namespaced API object (e.g. `window.api.products.*`, `window.api.settings.*`) — no raw `ipcRenderer` exposure.

## 5. State Synchronization (MobX)

- Domain state lives in **main-process stores** (source of truth). Changes there are observed (MobX `reaction`/`autorun`) and **pushed** to the renderer as serialized DTOs over push channels.
- The renderer keeps **mirror MobX stores** that apply incoming snapshots/patches. React components use `observer` (mobx-react-lite) and re-render automatically.
- Async background work (e.g. long scans) updates the main store incrementally; the observation mechanism forwards each update — the renderer must never poll.
- Nested/observable model trees are allowed; keep push payloads JSON-serializable.

## 6. Models

- Clear, explicit models. One model per file.
- Every domain model must be **serializable to JSON** (provide `toJSON()` / a plain-DTO conversion) so it can cross IPC and be persisted.
- Shared DTO types live in `src/shared/types/` — the single definition used by both processes.

## 7. TypeScript

- `noImplicitAny` stays on. **No `any`**, no `@ts-ignore`, no disabling type checks.
- Prefer composition over inheritance.
- Functions/methods focused and concise; single responsibility.

## 8. Comments & Readability

- Every non-trivial **method gets a doc comment**: what it does, why it exists, and what typically calls it.
- Code that is hard to read for a human (bit-twiddling, regex, registry quirks, path math) gets an inline comment explaining what it does.
- Clear, descriptive names for files, classes, functions — no abbreviations that need decoding.

## 9. Logging

- One **centralized logging service** in main (`LoggerService`), centrally configured.
- Log level is **adjustable at runtime** (from settings) — levels: `debug`, `info`, `warn`, `error`.
- All services log through this service; no stray `console.log` in main-process code.
- Renderer log output is forwarded over IPC into the same central log.
- Log entries are also streamed to the renderer (observable log store) so the UI can show a live log panel.

## 10. Destructive Operations & Dry-Run

- **All** destructive operations (file/folder delete, registry delete/modify) go through central guard utilities — never call `fs.rm` or registry-delete APIs directly from feature code.
- The guards check the **dry-run mode**: when active, no real deletion happens; instead the guard logs exactly what *would* have been done.
- Dry-run can be enabled via settings (GUI) and via a start parameter (`--dry-run`).
- Operations requiring administrator rights must trigger a **UAC prompt** and run elevated as a **bulk operation** (one elevation for the whole job, not one prompt per file).

## 11. Platform

- **Windows-only application.** Windows-specific paths and registry access are expected and allowed (in main only). No cross-platform abstractions needed, but keep Windows specifics in dedicated services/config so they are findable.
- Registry access uses a **library** (native bindings), never by shelling out to `regedit`/`reg.exe`.

## 12. Settings

- User settings are stored in the **standard Electron location** (`app.getPath('userData')`), in a JSON file managed by a single settings service.
- Settings are loaded **on startup** into dedicated models/stores before the UI needs them.
- Any settings change from the GUI is persisted immediately through the settings service.

## 13. Configuration

- Config is centralized in `src/config/` (defaults, path constants). No inline magic paths/values in logic code.

## 14. Documentation

- `docs/` contains developer-facing markdown documentation with a `README.md` overview.
- Docs are written at **abstract level**: where features live, class names, data flow, registration points — not line-by-line API docs.
- **Whenever classes are added or modified, update the related docs in the same change.** (This rule is also enforced via CLAUDE.md.)
- Registry paths and file paths the application touches must be documented explicitly.

## 15. Git

- Do not use `git add` or `git commit` (repository owner commits manually).
- When moving files, use `git mv`.
