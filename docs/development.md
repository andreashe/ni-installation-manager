# Development

Setup, testing, and packaging for contributors. For end-user download/install, see the [README](../README.md).

## Requirements

- Windows 10 or later
- Node.js 18+
- npm

## Setup & Dev Mode

```bash
npm install
npm start          # Run dev mode with hot reload
npm run lint        # Check code style
```

## Unit Tests

Unit tests use [vitest](https://vitest.dev/) and live in the `tests/` folder, mirroring the `src/` structure.

```bash
npm test           # Run the whole suite once
npm run test:watch # Watch mode: re-runs affected tests on save
```

To run a single file: `npx vitest run tests/main/models/ProductFactory.test.ts`

## Packaging

```bash
npm run make       # Build installer for distribution
```

Output: `out/make/` folder with platform-specific installers.

### Native modules (native-reg)

Native addons cannot be bundled by Vite, so they follow a special path through packaging, configured in `forge.config.ts`, `vite.main.config.ts`, and `package.json`:

- `vite.main.config.ts` marks them `external`, keeping the `require()` call in the built main bundle.
- Only unbundled native modules belong in `package.json` `"dependencies"`; everything Vite bundles (React, MobX, etc.) belongs in `"devDependencies"`. The packager's pruner copies exactly the production dependency tree into the app.
- `forge.config.ts` sets a custom `packagerConfig.ignore` because the Vite plugin's default ignore drops `node_modules` entirely — that was the cause of the packaged-app crash `Cannot find module 'native-reg'`.
- `AutoUnpackNativesPlugin` extracts `*.node` binaries to `app.asar.unpacked/` since native addons cannot load from inside an asar archive.

When adding another native module: add it to `"dependencies"`, to `external` in `vite.main.config.ts`, and to `externalNativeModules` in `forge.config.ts`. Verify with `npm run package` followed by launching `out/NI Installation Manager-win32-x64/NI Installation Manager.exe`.

## Releases (CI)

Pushing to the `publish` branch runs [`.github/workflows/publish.yml`](../.github/workflows/publish.yml): builds the installers via plain `npm run make` (on the Windows runner only the Squirrel maker applies — zip is darwin-only, deb/rpm are linux-only) and publishes the setup exe to a GitHub release under the fixed tag `latest` (the tag must not share a name with an existing branch — a tag named like the `publish` branch makes the GitHub release API fail with an HTML 500). Do **not** pass `--targets=<package name>` to `electron-forge make`: Forge matches targets against the maker's short name, not the npm package name, so it silently instantiates a fresh maker without the config from `forge.config.ts` (dropping `setupExe`/`setupIcon`). The installer filename is fixed in `forge.config.ts` (`setupExe: 'NI-Installation-Manager-Setup.exe'`, no version in the name) so the README can link a stable "latest" download URL that never needs updating.

## Architecture

See [`docs/README.md`](./README.md) for the full topic index (composition root, MobX sync, registry access, uninstall/restore/move flows, logging).
