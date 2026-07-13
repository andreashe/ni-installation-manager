# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # dev mode (electron-forge start, hot-reloads renderer)
npm run lint       # ESLint over .ts/.tsx
npm test           # unit tests (vitest, single run)
npm run test:watch # unit tests in watch mode
npm run package    # package app (no installer)
npm run make       # build installer (Squirrel on Windows, deb/rpm on Linux)
```

## Architecture

Electron app built with **electron-forge** + **Vite** + **TypeScript** + **React**.

Three distinct process contexts, each bundled separately by Vite:

| File | Vite config | Context |
|---|---|---|
| `src/main/main.ts` | `vite.main.config.ts` | Electron main process (Node.js) — bootstrap & window mgmt |
| `src/main/preload.ts` | `vite.preload.config.ts` | Preload script (security bridge between main and renderer) |
| `src/renderer/index.tsx` | `vite.renderer.config.ts` | Renderer process (browser, React) — mounts App to DOM |

Build output lands in `.vite/`. In dev, the renderer is served via Vite dev server; `MAIN_WINDOW_VITE_DEV_SERVER_URL` is injected by electron-forge.

**IPC pattern**: expose APIs from main to renderer only through `contextBridge` in `src/main/preload.ts`. Do not enable `nodeIntegration` in the renderer — the Electron Fuses in `forge.config.ts` lock down `RunAsNode` and related flags at package time.

**Packaging**: ASAR with `OnlyLoadAppFromAsar` and `EnableEmbeddedAsarIntegrityValidation` fuses enabled. Windows installer uses Squirrel (`electron-squirrel-startup` handles install/uninstall shortcut events at app startup in `src/main/main.ts`).

## Folder Structure

**Process separation is strict.** Filesystem/OS APIs live only in `main/`. Never import `fs`, `path`, or Node.js built-ins in `renderer/` — use IPC to `main/ipc/` handlers instead.

```
src/
├── main/                      # Main Process (Node.js) — OS/filesystem ONLY
│   ├── main.ts                # Entry point, creates BrowserWindow, handles lifecycle
│   ├── preload.ts             # IPC security bridge via contextBridge
│   ├── ipc/                   # (TODO) IPC handlers, grouped by domain
│   │   ├── file-handlers.ts
│   │   └── settings-handlers.ts
│   └── utils/                 # (TODO) Main-process helpers
│
├── renderer/                  # Renderer Process (React) — UI only
│   ├── App.tsx                # Root React component
│   ├── index.tsx              # React entry point: mounts App to #root
│   ├── index.css              # Global styles
│   ├── components/            # (TODO) Reusable UI components (one file per component)
│   ├── pages/                 # (TODO) Full views/screens (only if multi-view app)
│   ├── hooks/                 # (TODO) Custom React hooks (state/side-effects)
│   ├── styles/                # (TODO) Component-specific CSS
│   └── types/                 # (TODO) Renderer-only TS types
│
├── shared/                    # Both main & renderer use this
│   ├── ipc-channels.ts        # (TODO) IPC channel names as constants (never hardcode)
│   └── types/                 # (TODO) Shared TS interfaces
│
└── config/                    # (TODO) App configuration (centralized, not scattered)
    ├── default.config.ts      # (TODO) Defaults
    ├── config.schema.ts       # (TODO) Type/validation schema
    └── paths.ts               # (TODO) Path constants (userData, cache, etc.)
```

**Key rules:**

1. **No magic IPC strings.** All channel names are constants in `src/shared/ipc-channels.ts`.
2. **Config is centralized.** Path/setting values live in `src/config/`, not inline in logic.
3. **One component = one file** (name matches export: `ItemCheckbox.tsx` exports `ItemCheckbox`).
4. **Extract hooks.** Non-trivial state/effects go to `src/renderer/hooks/use*.ts`, not inline components.
5. **Shared types in `src/shared/types/`.** Never duplicate types between main and renderer.
6. **`src/main/preload.ts` is security boundary.** Only expose safe APIs via `contextBridge`.
7. **No business logic in `src/main/main.ts` or `src/renderer/index.tsx`.** Bootstrap only; logic in `ipc/`, `hooks/`, `components/`.
8. **Only use `src/renderer/pages/` if multi-view.** Single-view apps put everything in `src/renderer/components/`.

## TypeScript

`noImplicitAny: true`. Module system is `commonjs` (main/preload) while renderer uses ESM via Vite. Type globals for Vite-injected constants (`MAIN_WINDOW_VITE_DEV_SERVER_URL`, `MAIN_WINDOW_VITE_NAME`) come from `forge.env.d.ts`.

## Stack

**Electron + React** desktop application. Renderer uses React 19 for UI; main process handles app lifecycle, file I/O, and OS integration. Keep business logic in main when sensitive (file access, system calls); UI logic in React components.

## Unit Tests

Runner: **vitest** (`vitest.config.ts`); tests live in `tests/`, mirroring the `src/` structure (e.g. `tests/main/models/ProductFactory.test.ts` tests `src/main/models/ProductFactory.ts`). Node environment — Electron APIs and `fs` are mocked in the tests (`vi.mock`/`vi.spyOn`); modules importing `electron` or native addons directly (`main.ts`, `RegistryService`, preload) are not unit-tested.

**Mandatory workflow:**
- When adding new code, also add unit tests for it (services, stores, models, utils — anything with testable logic).
- When changing existing code, adapt the affected unit tests in the same change.
- After any code change, run `npm test` (plus `npm run lint`) and fix failures before finishing.

## Code Style

All new code must follow good programming practices:
- Clear, descriptive naming for files, classes, functions
- Single responsibility principle
- Type-safe TypeScript (no `any`, no disabling type checking)
- Prefer composition over inheritance
- Keep functions/methods focused and concise

## Documentation

When adding features or changing architecture, **update or create markdown docs** in the `docs/` folder. Docs are for developers to understand **where** things go and **how** the system is organized.

Target docs at **abstract level** (filenames, class names, module structure, architectural patterns). Only mention specific methods/functions if essential to understanding placement or design. Focus on:
- Where new features belong (which process, which file structure)
- Config or registration points
- Data flow between main and renderer
- File organization for new domains

Example: "Feature X lives in `src/renderer/features/X/` with a React component, a hook for state, and an IPC handler in main that validates and persists."

See [`docs/project-structure.md`](./docs/project-structure.md) for current folder layout and adding new features.

**Mandatory:** whenever classes are added or modified, update the related markdown docs in `docs/` in the same change (start at [`docs/README.md`](./docs/README.md) for the topic index). Project-wide rules live in [`RULES.md`](./RULES.md); the feature plan in [`PLAN.md`](./PLAN.md).


## Git rules
- Do not use
  - git add
  - git commit
- if moving files, use git mv

- Claude code was already started in project folder, not cd into it required.