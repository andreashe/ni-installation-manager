import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Product } from '../../../src/main/models/Product';
import { ProductDetailsService } from '../../../src/main/services/ProductDetailsService';
import { ProductStore } from '../../../src/main/stores/ProductStore';
import type { LoggerService } from '../../../src/main/services/LoggerService';

const FOLDER = 'D:\\Content\\Super 8';
const FILE = 'C:\\VST3\\Super 8.vst3';
const CREATED = 1700000000000;
const MODIFIED = 1720000000000;

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

function makeStats(isFile: boolean): fs.Stats {
  return {
    isFile: () => isFile,
    isDirectory: () => !isFile,
    isSymbolicLink: () => false,
    size: isFile ? 5000 : 0,
    birthtimeMs: CREATED,
    mtimeMs: MODIFIED,
  } as fs.Stats;
}

beforeEach(() => {
  // Fake fs: FOLDER is a directory containing one 100-byte file, FILE is a
  // 5000-byte plugin file, everything else is missing.
  vi.spyOn(fs.promises, 'stat').mockImplementation(async (target) => {
    const p = String(target);
    if (p === FOLDER) return makeStats(false);
    if (p === FILE) return makeStats(true);
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  vi.spyOn(fs.promises, 'lstat').mockImplementation(async (target) => {
    const p = String(target);
    if (p === FOLDER) return makeStats(false);
    if (p === FILE) return makeStats(true);
    if (p === path.join(FOLDER, 'sample.nki')) {
      return { ...makeStats(true), size: 100 } as fs.Stats;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  vi.spyOn(fs.promises, 'readdir').mockImplementation((async (target: fs.PathLike) => {
    if (String(target) === FOLDER) {
      return [{ name: 'sample.nki', isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false }];
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }) as unknown as typeof fs.promises.readdir);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeService(product: Product) {
  const store = new ProductStore();
  store.replaceAll([product]);
  return new ProductDetailsService(store, makeLogger() as unknown as LoggerService);
}

describe('ProductDetailsService', () => {
  const product = new Product({
    name: 'Super 8',
    version: '2.5.0',
    removable: true,
    registryEntries: {
      'SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8': [],
      'SOFTWARE\\Native Instruments\\Super 8': [],
    },
    diskPaths: [
      { kind: 'ContentDir', rawValue: FOLDER, resolvedPath: FOLDER, exists: true },
      { kind: 'InstallVST364File', rawValue: 'C:\\VST3', resolvedPath: FILE, exists: true },
      { kind: 'InstallDir', rawValue: 'D:\\Gone', resolvedPath: 'D:\\Gone', exists: false },
    ],
  });

  it('describes folders and files with type, size and dates', async () => {
    const details = await makeService(product).getDetails('Super 8');

    expect(details?.version).toBe('2.5.0');
    const folder = details?.locations.find((l) => l.kind === 'ContentDir');
    expect(folder).toMatchObject({
      isFile: false,
      exists: true,
      sizeBytes: 100, // recursive: the sample.nki inside
      createdAt: CREATED,
      modifiedAt: MODIFIED,
    });
    const file = details?.locations.find((l) => l.kind === 'InstallVST364File');
    expect(file).toMatchObject({ isFile: true, sizeBytes: 5000, path: FILE });
    const missing = details?.locations.find((l) => l.kind === 'InstallDir');
    expect(missing).toMatchObject({ exists: false, sizeBytes: 0, createdAt: null });
  });

  it('shared container folders are never walked — size 0 (TODO6)', async () => {
    const withContainer = new Product({
      name: 'Super 8',
      version: null,
      removable: true,
      registryEntries: {},
      diskPaths: [
        { kind: 'InstallVST364Dir', rawValue: FOLDER, resolvedPath: FOLDER, exists: true },
      ],
    });
    const details = await makeService(withContainer).getDetails('Super 8');
    const container = details?.locations.find((l) => l.kind === 'InstallVST364Dir');
    expect(container).toMatchObject({ exists: true, sizeBytes: 0 });
    expect(details?.totalDiskUsageBytes).toBe(0);
  });

  it('sums the total over unique existing locations', async () => {
    const details = await makeService(product).getDetails('Super 8');
    expect(details?.totalDiskUsageBytes).toBe(5100);
  });

  it('total includes plugin files even though they are nested in their shared container', async () => {
    // Regression: the container (C:\VST3, size 0) must not swallow the
    // Install*File inside it via the nested-path dedupe.
    const withContainer = new Product({
      name: 'Super 8',
      version: null,
      removable: true,
      registryEntries: {},
      diskPaths: [
        { kind: 'ContentDir', rawValue: FOLDER, resolvedPath: FOLDER, exists: true },
        { kind: 'InstallVST364Dir', rawValue: 'C:\\VST3', resolvedPath: 'C:\\VST3', exists: true },
        { kind: 'InstallVST364File', rawValue: 'C:\\VST3', resolvedPath: FILE, exists: true },
      ],
    });
    // The container folder itself also stats successfully:
    vi.mocked(fs.promises.stat).mockImplementation(async (target) => {
      const p = String(target);
      if (p === FOLDER || p === 'C:\\VST3') return makeStats(false);
      if (p === FILE) return makeStats(true);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const details = await makeService(withContainer).getDetails('Super 8');
    // 100 (ContentDir walk) + 5000 (vst3 file); container contributes 0.
    expect(details?.totalDiskUsageBytes).toBe(5100);
  });

  it('lists registry paths with hive prefix', async () => {
    const details = await makeService(product).getDetails('Super 8');
    expect(details?.registryPaths).toEqual([
      'HKLM\\SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8',
      'HKLM\\SOFTWARE\\Native Instruments\\Super 8',
    ]);
  });

  it('returns null for unknown products', async () => {
    expect(await makeService(product).getDetails('Nope')).toBeNull();
  });
});
