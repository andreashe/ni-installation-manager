import { defineConfig } from 'vitest/config';

/**
 * Unit test runner configuration. Tests live in `tests/`, mirroring the
 * `src/` structure (`tests/main/models/ProductFactory.test.ts` tests
 * `src/main/models/ProductFactory.ts`). Node environment — Electron APIs
 * are mocked in the tests themselves; modules importing `electron` or
 * native addons directly (main.ts, RegistryService, …) are integration
 * surface and not unit-tested here.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
