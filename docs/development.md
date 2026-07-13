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

## Releases (CI)

Pushing to the `publish` branch runs [`.github/workflows/publish.yml`](../.github/workflows/publish.yml): builds the Windows Squirrel installer only (`--targets=@electron-forge/maker-squirrel`) and publishes it to a GitHub release under the fixed tag `publish`. The installer filename is fixed in `forge.config.ts` (`setupExe: 'NI-Installation-Manager-Setup.exe'`, no version in the name) so the README can link a stable "latest" download URL that never needs updating.

## Architecture

See [`docs/README.md`](./README.md) for the full topic index (composition root, MobX sync, registry access, uninstall/restore/move flows, logging).
