import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NI_COMMON_FILES_BASE,
  NI_PUBLIC_RESOURCES_IMAGE_BASE,
} from '../../../src/config/ni.config';
import { ArtworkCacheService } from '../../../src/main/services/ArtworkCacheService';
import { Product } from '../../../src/main/models/Product';
import { ProductStore } from '../../../src/main/stores/ProductStore';
import { SettingsStore } from '../../../src/main/stores/SettingsStore';
import type { LoggerService } from '../../../src/main/services/LoggerService';

const CACHE = 'C:\\fake\\assets-cache';

/** Virtual filesystem: directory path → entries (dirs and files). */
let tree: Map<string, { name: string; dir: boolean }[]>;
/** Files that exist for fs.access (e.g. pre-existing cache entries). */
let existingFiles: Set<string>;
/** Recorded copyFile calls: [source, target]. */
let copies: [string, string][];
/** Recorded writeFile calls (CDN downloads): target paths. */
let writes: string[];
/** Content of the artwork scan cache file; null = file does not exist. */
let scanCacheContent: string | null;
/** Content written to the artwork scan cache file (last write wins). */
let scanCacheWritten: string | null;
/** URLs requested from the fake CDN fetcher. */
let fetchedUrls: string[];
/** Temp file paths handed to the fake wallpaper resizer. */
let resizedWallpapers: string[];

const SCAN_CACHE_FILE = path.join(CACHE, 'artwork-scan.json');

function addDir(dirPath: string, entries: { name: string; dir: boolean }[]): void {
  tree.set(path.normalize(dirPath), entries);
}

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

function makeProduct(name: string): Product {
  return new Product({ name, version: null, removable: true, registryEntries: {}, diskPaths: [] });
}

function makeService(
  store: ProductStore,
  cdnAssets: Record<string, string> = {},
  fetcherFails = false,
  alwaysFullArtworkScan = false,
) {
  const settingsStore = new SettingsStore();
  settingsStore.applyPartial({ alwaysFullArtworkScan });
  const fetcher = {
    fetchAndResize: vi.fn(async (url: string) => {
      fetchedUrls.push(url);
      if (fetcherFails) {
        throw new Error('network down');
      }
      return Buffer.from('png-data');
    }),
    resizeWallpaper: vi.fn(async (filePath: string) => {
      resizedWallpapers.push(filePath);
      return Buffer.from('wallpaper-png');
    }),
  };
  const service = new ArtworkCacheService(
    store,
    settingsStore,
    makeLogger() as unknown as LoggerService,
    CACHE,
    cdnAssets,
    fetcher,
  );
  return { service, fetcher };
}

beforeEach(() => {
  tree = new Map();
  existingFiles = new Set();
  copies = [];
  writes = [];
  scanCacheContent = null;
  scanCacheWritten = null;
  fetchedUrls = [];
  resizedWallpapers = [];

  vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (target, data) => {
    if (path.normalize(String(target)) === path.normalize(SCAN_CACHE_FILE)) {
      scanCacheWritten = String(data);
    } else {
      writes.push(String(target));
    }
  });
  vi.spyOn(fs.promises, 'readFile').mockImplementation((async (target: fs.PathLike) => {
    if (path.normalize(String(target)) === path.normalize(SCAN_CACHE_FILE) && scanCacheContent !== null) {
      return scanCacheContent;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as unknown as typeof fs.promises.readFile);
  vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  // Overload resolution picks the buffer variant — the loose cast keeps the
  // virtual-tree mock simple; the service only uses name + type predicates.
  vi.spyOn(fs.promises, 'readdir').mockImplementation((async (dirPath: fs.PathLike) => {
    const entries = tree.get(path.normalize(String(dirPath)));
    if (!entries) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: () => entry.dir,
      isFile: () => !entry.dir,
      isSymbolicLink: () => false,
    }));
  }) as unknown as typeof fs.promises.readdir);
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingFiles.has(path.normalize(String(target)))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  vi.spyOn(fs.promises, 'copyFile').mockImplementation(async (source, target) => {
    copies.push([String(source), String(target)]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ArtworkCacheService (recursive scan, TODO5)', () => {
  it('finds artwork in nested vendor folders and matches products case-insensitively', async () => {
    // c:\...\NI Resources\image\arturia\acid v\MST_artwork.png → product "Acid V"
    addDir(NI_PUBLIC_RESOURCES_IMAGE_BASE, [{ name: 'arturia', dir: true }]);
    addDir(path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'arturia'), [{ name: 'acid v', dir: true }]);
    addDir(path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'arturia', 'acid v'), [
      { name: 'MST_artwork.png', dir: false },
    ]);

    const store = new ProductStore();
    store.replaceAll([makeProduct('Acid V')]);
    await makeService(store).service.cacheAll();

    expect(copies).toEqual([
      [
        path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'arturia', 'acid v', 'MST_artwork.png'),
        path.join(CACHE, 'Acid V.png'),
      ],
    ]);
    expect(store.products[0].artworkCacheFileName).toBe('Acid V.png');
  });

  it('also matches "<Vendor>-<Product>" names via the parent folder (TODO5)', async () => {
    // image\arturia\acid v\MST_artwork.png must fit product "Arturia-Acid V" too.
    addDir(NI_PUBLIC_RESOURCES_IMAGE_BASE, [{ name: 'arturia', dir: true }]);
    addDir(path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'arturia'), [{ name: 'acid v', dir: true }]);
    addDir(path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'arturia', 'acid v'), [
      { name: 'MST_artwork.png', dir: false },
    ]);

    const store = new ProductStore();
    store.replaceAll([makeProduct('Arturia-Acid V')]);
    await makeService(store).service.cacheAll();

    expect(copies).toEqual([
      [
        path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'arturia', 'acid v', 'MST_artwork.png'),
        path.join(CACHE, 'Arturia-Acid V.png'),
      ],
    ]);
    expect(store.products[0].artworkCacheFileName).toBe('Arturia-Acid V.png');
  });

  it('scans the CommonFiles tree (PAResources pattern) via the same recursion', async () => {
    const productDir = path.join(NI_COMMON_FILES_BASE, 'Super 8');
    addDir(NI_COMMON_FILES_BASE, [{ name: 'Super 8', dir: true }]);
    addDir(productDir, [{ name: 'PAResources', dir: true }]);
    addDir(path.join(productDir, 'PAResources'), [{ name: 'image', dir: true }]);
    addDir(path.join(productDir, 'PAResources', 'image'), [{ name: 'Super 8', dir: true }]);
    addDir(path.join(productDir, 'PAResources', 'image', 'Super 8'), [
      { name: 'MST_artwork.png', dir: false },
    ]);

    const store = new ProductStore();
    store.replaceAll([makeProduct('Super 8')]);
    await makeService(store).service.cacheAll();

    expect(copies.length).toBe(1);
    expect(copies[0][0]).toContain('PAResources');
  });

  it('prefers MST_artwork.png over the logo fallback for the same product folder', async () => {
    const dir = path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'raum');
    addDir(NI_PUBLIC_RESOURCES_IMAGE_BASE, [{ name: 'raum', dir: true }]);
    addDir(dir, [
      { name: 'MST_logo.png', dir: false },
      { name: 'MST_artwork.png', dir: false },
    ]);

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    expect(copies[0][0]).toBe(path.join(dir, 'MST_artwork.png'));
  });

  it('leaves products without any artwork uncached (renderer shows the alt image)', async () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('Obscure Product')]);
    await makeService(store).service.cacheAll();

    expect(copies).toEqual([]);
    expect(store.products[0].artworkCacheFileName).toBeNull();
  });

  it('reuses an existing cache file without copying again', async () => {
    existingFiles.add(path.normalize(path.join(CACHE, 'Raum.png')));

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    expect(copies).toEqual([]);
    expect(store.products[0].artworkCacheFileName).toBe('Raum.png');
  });

  it('skips the disk scan entirely when every product is already cached', async () => {
    existingFiles.add(path.normalize(path.join(CACHE, 'Raum.png')));
    existingFiles.add(path.normalize(path.join(CACHE, 'Super 8.png')));

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum'), makeProduct('Super 8')]);
    await makeService(store).service.cacheAll();

    // No artwork missing → the recursive root walk must not run.
    expect(vi.mocked(fs.promises.readdir)).not.toHaveBeenCalled();
    expect(store.products.every((p) => p.artworkCacheFileName !== null)).toBe(true);
  });

  it('scans the disk roots only for the products still missing artwork', async () => {
    existingFiles.add(path.normalize(path.join(CACHE, 'Raum.png')));
    addDir(NI_PUBLIC_RESOURCES_IMAGE_BASE, [{ name: 'super 8', dir: true }]);
    addDir(path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'super 8'), [
      { name: 'MST_artwork.png', dir: false },
    ]);

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum'), makeProduct('Super 8')]);
    await makeService(store).service.cacheAll();

    // Cached product untouched, missing one resolved from the scan.
    expect(copies).toEqual([
      [
        path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'super 8', 'MST_artwork.png'),
        path.join(CACHE, 'Super 8.png'),
      ],
    ]);
    expect(store.products.every((p) => p.artworkCacheFileName !== null)).toBe(true);
  });
});

describe('ArtworkCacheService scan cache (artwork-scan.json)', () => {
  const RAUM_DIR = path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'raum');
  const RAUM_ARTWORK = path.join(RAUM_DIR, 'MST_artwork.png');
  const RAUM_DIR_KEY = path.normalize(RAUM_DIR).toLowerCase();

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const FRESH_SCAN = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const STALE_SCAN = new Date(Date.now() - 366 * ONE_DAY_MS).toISOString();

  function addRaumOnDisk(): void {
    addDir(NI_PUBLIC_RESOURCES_IMAGE_BASE, [{ name: 'raum', dir: true }]);
    addDir(RAUM_DIR, [{ name: 'MST_artwork.png', dir: false }]);
  }

  function readDirs(): string[] {
    return vi.mocked(fs.promises.readdir).mock.calls.map((call) => String(call[0]));
  }

  it('persists scan hits and scanned folders (with timestamp) after a scan', async () => {
    addRaumOnDisk();
    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    expect(scanCacheWritten).not.toBeNull();
    const parsed = JSON.parse(scanCacheWritten as string);
    expect(parsed.products.raum).toEqual({ filePath: RAUM_ARTWORK, priority: 0 });
    const scannedAt = Date.parse(parsed.scannedFolders[RAUM_DIR_KEY]);
    expect(Date.now() - scannedAt).toBeLessThan(60_000); // stamped with "now"
  });

  it('skips freshly scanned folders (and their subfolders) and reuses the remembered hits', async () => {
    addRaumOnDisk();
    existingFiles.add(path.normalize(RAUM_ARTWORK)); // remembered hit still valid
    scanCacheContent = JSON.stringify({
      version: 2,
      products: { raum: { filePath: RAUM_ARTWORK, priority: 0 } },
      scannedFolders: { [RAUM_DIR_KEY]: FRESH_SCAN },
    });

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    // Folder scanned recently → not read again…
    expect(readDirs()).not.toContain(RAUM_DIR);
    // …but its remembered artwork is still used, and its timestamp survives.
    expect(copies).toEqual([[RAUM_ARTWORK, path.join(CACHE, 'Raum.png')]]);
    const parsed = JSON.parse(scanCacheWritten as string);
    expect(parsed.scannedFolders[RAUM_DIR_KEY]).toBe(FRESH_SCAN);
  });

  it('rescans a folder whose scan is older than the max age (365 days)', async () => {
    addRaumOnDisk();
    scanCacheContent = JSON.stringify({
      version: 2,
      products: {},
      scannedFolders: { [RAUM_DIR_KEY]: STALE_SCAN },
    });

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    expect(readDirs()).toContain(RAUM_DIR); // walked again
    expect(copies).toEqual([[RAUM_ARTWORK, path.join(CACHE, 'Raum.png')]]);
    const parsed = JSON.parse(scanCacheWritten as string);
    expect(Date.parse(parsed.scannedFolders[RAUM_DIR_KEY])).toBeGreaterThan(
      Date.parse(STALE_SCAN),
    ); // stamped anew
  });

  it('"Do always full artwork scan" ignores the scanned-folders cache', async () => {
    addRaumOnDisk();
    scanCacheContent = JSON.stringify({
      version: 2,
      products: {},
      scannedFolders: { [RAUM_DIR_KEY]: FRESH_SCAN },
    });

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store, {}, false, true).service.cacheAll();

    expect(readDirs()).toContain(RAUM_DIR); // fresh entry ignored
    expect(copies).toEqual([[RAUM_ARTWORK, path.join(CACHE, 'Raum.png')]]);
  });

  it('host image dirs are own bases: scanned even when their host folder is marked scanned', async () => {
    const K8_DIR = path.join(NI_COMMON_FILES_BASE, 'Kontakt 8');
    const K8_IMAGE_BASE = path.join(K8_DIR, 'PAResources', 'image');
    addDir(NI_COMMON_FILES_BASE, [{ name: 'Kontakt 8', dir: true }]);
    addDir(K8_IMAGE_BASE, [{ name: 'raum', dir: true }]);
    addDir(path.join(K8_IMAGE_BASE, 'raum'), [{ name: 'MST_artwork.png', dir: false }]);
    // "Kontakt 8" itself is covered by a fresh scan…
    scanCacheContent = JSON.stringify({
      version: 2,
      products: {},
      scannedFolders: { [path.normalize(K8_DIR).toLowerCase()]: FRESH_SCAN },
    });

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    // …so its subtree is skipped, but the image dir is its own base and gets walked.
    expect(readDirs()).not.toContain(K8_DIR);
    expect(readDirs()).toContain(K8_IMAGE_BASE);
    expect(copies).toEqual([
      [path.join(K8_IMAGE_BASE, 'raum', 'MST_artwork.png'), path.join(CACHE, 'Raum.png')],
    ]);
    // The image dir's subfolder is tracked as its own scanned unit.
    const parsed = JSON.parse(scanCacheWritten as string);
    expect(parsed.scannedFolders[path.normalize(path.join(K8_IMAGE_BASE, 'raum')).toLowerCase()])
      .toBeDefined();
  });

  it('falls back to a full scan when the cache file is corrupt', async () => {
    addRaumOnDisk();
    scanCacheContent = '{not json';

    const store = new ProductStore();
    store.replaceAll([makeProduct('Raum')]);
    await makeService(store).service.cacheAll();

    expect(copies).toEqual([[RAUM_ARTWORK, path.join(CACHE, 'Raum.png')]]);
    expect(scanCacheWritten).not.toBeNull(); // rewritten with the fresh results
  });
});

describe('ArtworkCacheService CDN fallback (TODO6)', () => {
  const CDN = { India: 'https://assets-cdn.native-instruments.com/abc.png' };

  it('downloads from the CDN when nothing was found on disk (case-insensitive name)', async () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('INDIA')]);
    await makeService(store, CDN).service.cacheAll();

    expect(fetchedUrls).toEqual(['https://assets-cdn.native-instruments.com/abc.png']);
    expect(writes).toEqual([path.join(CACHE, 'INDIA.png')]);
    expect(store.products[0].artworkCacheFileName).toBe('INDIA.png');
  });

  it('prefers disk artwork — CDN is not contacted when a disk hit exists', async () => {
    addDir(NI_PUBLIC_RESOURCES_IMAGE_BASE, [{ name: 'india', dir: true }]);
    addDir(path.join(NI_PUBLIC_RESOURCES_IMAGE_BASE, 'india'), [
      { name: 'MST_artwork.png', dir: false },
    ]);

    const store = new ProductStore();
    store.replaceAll([makeProduct('India')]);
    await makeService(store, CDN).service.cacheAll();

    expect(fetchedUrls).toEqual([]);
    expect(copies.length).toBe(1);
  });

  it('a failed download leaves the product uncached instead of crashing the run', async () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('India')]);
    await makeService(store, CDN, true).service.cacheAll();

    expect(store.products[0].artworkCacheFileName).toBeNull();
    expect(writes).toEqual([]);
  });

  it('products without a CDN entry stay uncached silently', async () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('Unknown Product')]);
    await makeService(store, CDN).service.cacheAll();

    expect(fetchedUrls).toEqual([]);
    expect(store.products[0].artworkCacheFileName).toBeNull();
  });
});

describe('ArtworkCacheService wallpaper fallback (TODO6)', () => {
  const CONTENT_DIR = 'D:\\VSTs\\content\\India Library';

  function productWithContentDir(name: string): Product {
    return new Product({
      name,
      version: null,
      removable: true,
      registryEntries: {},
      diskPaths: [
        { kind: 'ContentDir', rawValue: CONTENT_DIR, resolvedPath: CONTENT_DIR, exists: true },
      ],
    });
  }

  it('uses ContentDir wallpaper.png when disk scan and CDN found nothing', async () => {
    existingFiles.add(path.normalize(path.join(CONTENT_DIR, 'wallpaper.png')));
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);

    const store = new ProductStore();
    store.replaceAll([productWithContentDir('India')]);
    const { service, fetcher } = makeService(store); // no CDN entry
    await service.cacheAll();

    // wallpaper copied to a temp file, temp file handed to the resizer.
    expect(copies.length).toBe(1);
    expect(copies[0][0]).toBe(path.join(CONTENT_DIR, 'wallpaper.png'));
    expect(resizedWallpapers).toEqual([copies[0][1]]);
    expect(fetcher.resizeWallpaper).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([path.join(CACHE, 'India.png')]);
    expect(store.products[0].artworkCacheFileName).toBe('India.png');
  });

  it('wallpaper is tried AFTER a failed CDN download', async () => {
    existingFiles.add(path.normalize(path.join(CONTENT_DIR, 'wallpaper.png')));
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);

    const store = new ProductStore();
    store.replaceAll([productWithContentDir('India')]);
    const { service } = makeService(
      store,
      { India: 'https://assets-cdn.native-instruments.com/abc.png' },
      true, // CDN download fails
    );
    await service.cacheAll();

    expect(fetchedUrls.length).toBe(1); // CDN was attempted first
    expect(store.products[0].artworkCacheFileName).toBe('India.png'); // wallpaper saved it
  });

  it('no wallpaper file → product stays uncached', async () => {
    const store = new ProductStore();
    store.replaceAll([productWithContentDir('India')]);
    const { service, fetcher } = makeService(store);
    await service.cacheAll();

    expect(fetcher.resizeWallpaper).not.toHaveBeenCalled();
    expect(store.products[0].artworkCacheFileName).toBeNull();
  });
});

describe('ArtworkCacheService.clearCache (TODO6)', () => {
  it('wipes the cache folder and resets all product artwork references', async () => {
    const rmSpy = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
    const store = new ProductStore();
    const product = makeProduct('Raum');
    product.setArtworkCacheFileName('Raum.png');
    store.replaceAll([product]);

    await makeService(store).service.clearCache();

    expect(rmSpy).toHaveBeenCalledWith(CACHE, { recursive: true, force: true });
    expect(store.products[0].artworkCacheFileName).toBeNull();
  });
});
