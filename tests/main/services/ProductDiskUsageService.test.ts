import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Product } from '../../../src/main/models/Product';
import { ProductDiskUsageService } from '../../../src/main/services/ProductDiskUsageService';
import { ProductStore } from '../../../src/main/stores/ProductStore';
import type { LoggerService } from '../../../src/main/services/LoggerService';
import type { ProductDiskUsageCache } from '../../../src/main/services/ProductDiskUsageCache';

const FOLDER = 'D:\\Content\\Deep Matter';

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

/** Fake cache: empty by default — every scan is a cache miss. */
function makeCache() {
  return { read: vi.fn().mockResolvedValue(null), write: vi.fn().mockResolvedValue(undefined) };
}

function makeProduct(diskPaths: Product['diskPaths'], version: string | null = '1.0') {
  return new Product({
    name: 'Deep Matter',
    version,
    removable: true,
    registryEntries: {},
    diskPaths,
  });
}

function makeService(store: ProductStore, cache = makeCache()) {
  return {
    service: new ProductDiskUsageService(
      store,
      makeLogger() as unknown as LoggerService,
      cache as unknown as ProductDiskUsageCache,
    ),
    cache,
  };
}

beforeEach(() => {
  // Fake fs: FOLDER (any spelling) contains one 100-byte file.
  vi.spyOn(fs.promises, 'lstat').mockImplementation(async (target) => {
    const p = String(target).toLowerCase().replace(/\\$/, '');
    if (p === FOLDER.toLowerCase()) {
      return { isSymbolicLink: () => false, isFile: () => false, isDirectory: () => true } as fs.Stats;
    }
    if (p === `${FOLDER.toLowerCase()}\\sample.nki`) {
      return { isSymbolicLink: () => false, isFile: () => true, isDirectory: () => false, size: 100 } as fs.Stats;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  vi.spyOn(fs.promises, 'readdir').mockImplementation((async () => {
    return [{ name: 'sample.nki', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }];
  }) as unknown as typeof fs.promises.readdir);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductDiskUsageService dedupe (TODO6)', () => {
  it('counts the same folder only once despite backslash/casing variants across registry entries', async () => {
    // Two registry values pointing at the same directory: one with trailing
    // backslash, one with different casing.
    const product = makeProduct([
      { kind: 'ContentDir', rawValue: `${FOLDER}\\`, resolvedPath: `${FOLDER}\\`, exists: true },
      {
        kind: 'InstallDir',
        rawValue: FOLDER.toUpperCase(),
        resolvedPath: FOLDER.toUpperCase(),
        exists: true,
      },
    ]);
    const store = new ProductStore();
    store.replaceAll([product]);

    await makeService(store).service.scanAll();

    // 100 bytes once — NOT 200.
    expect(store.products[0].diskUsageBytes).toBe(100);
  });
});

describe('ProductDiskUsageService cache (TODO11)', () => {
  const DISK_PATHS: Product['diskPaths'] = [
    { kind: 'ContentDir', rawValue: FOLDER, resolvedPath: FOLDER, exists: true },
  ];

  it('serves a valid cache entry and skips the filesystem scan', async () => {
    const product = makeProduct(DISK_PATHS);
    const store = new ProductStore();
    store.replaceAll([product]);
    const cache = makeCache();
    cache.read.mockResolvedValue(4242);

    await makeService(store, cache).service.scanAll();

    expect(store.products[0].diskUsageBytes).toBe(4242);
    expect(cache.read).toHaveBeenCalledWith('Deep Matter', '1.0');
    expect(fs.promises.lstat).not.toHaveBeenCalled(); // no scan
    expect(cache.write).not.toHaveBeenCalled();
  });

  it('scans on a cache miss and writes the result back to the cache', async () => {
    const product = makeProduct(DISK_PATHS);
    const store = new ProductStore();
    store.replaceAll([product]);
    const { service, cache } = makeService(store);

    await service.scanAll();

    expect(store.products[0].diskUsageBytes).toBe(100);
    expect(cache.write).toHaveBeenCalledWith('Deep Matter', '1.0', 100);
  });
});
