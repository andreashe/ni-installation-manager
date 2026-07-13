import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NI_COMMON_FILES_BASE,
  NI_HOST_IMAGE_DIR_RULES,
  NI_INSTALLED_PRODUCTS_BASE,
} from '../../../src/config/ni.config';
import type { RegistryValueDto } from '../../../src/shared/types/product';
import { ProductFactory } from '../../../src/main/models/ProductFactory';

/** Paths that "exist" on the fake filesystem for the current test. */
let existingPaths: Set<string>;
/** Folder listings for the plugin-file resolver (folder → file names). */
let folderListings: Map<string, string[]>;

beforeEach(() => {
  existingPaths = new Set();
  folderListings = new Map();
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(path.normalize(String(target)))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  vi.spyOn(fs.promises, 'readdir').mockImplementation((async (target: fs.PathLike) => {
    const listing = folderListings.get(path.normalize(String(target)));
    if (!listing) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return listing;
  }) as unknown as typeof fs.promises.readdir);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function value(name: string, val: string): RegistryValueDto {
  return { name, type: 'SZ', value: val };
}

const KEY_64 = 'SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8';
const KEY_32 = 'SOFTWARE\\Native Instruments\\Super 8';

describe('ProductFactory', () => {
  const factory = new ProductFactory();

  it('extracts the version from ContentVersion (case-insensitive) and merges hives', async () => {
    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('contentversion', '2.5.0')] },
      { keyPath: KEY_32, values: [value('KEY', 'secret')] },
    ]);
    expect(product.version).toBe('2.5.0');
    expect(Object.keys(product.registryEntries)).toEqual([KEY_64, KEY_32]);
  });

  it('version is null when ContentVersion is missing everywhere', async () => {
    const product = await factory.create('Super 8', [{ keyPath: KEY_64, values: [value('KEY', 'x')] }]);
    expect(product.version).toBeNull();
  });

  it('removable requires at least one removal-relevant value', async () => {
    const onlyLicense = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('KEY', 'x'), value('SNO', 'y')] },
    ]);
    expect(onlyLicense.removable).toBe(false);

    const withVersion = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('ContentVersion', '1.0')] },
    ]);
    expect(withVersion.removable).toBe(true);

    const withDir = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('InstallDir', 'C:\\NI\\Super 8')] },
    ]);
    expect(withDir.removable).toBe(true);
  });

  it('takes owned folders (ContentDir/InstallDir) as-is', async () => {
    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('ContentDir', 'D:\\Content\\Super 8\\')] },
    ]);
    const entry = product.diskPaths.find((p) => p.kind === 'ContentDir');
    expect(entry?.resolvedPath).toBe(path.normalize('D:\\Content\\Super 8\\'));
    expect(entry?.exists).toBe(false);
  });

  it('keeps shared plugin folders as container entries and resolves the plugin file inside (TODO6)', async () => {
    existingPaths.add(path.normalize('C:\\Common\\VST3'));
    folderListings.set(path.normalize('C:\\Common\\VST3'), ['Other.vst3', 'Super_8.vst3']);

    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('InstallVST364Dir', 'C:\\Common\\VST3')] },
    ]);

    const container = product.diskPaths.find((p) => p.kind === 'InstallVST364Dir');
    expect(container).toMatchObject({ resolvedPath: 'C:\\Common\\VST3', exists: true });

    // Fuzzy match: "Super_8.vst3" fits product "Super 8".
    const file = product.diskPaths.find((p) => p.kind === 'InstallVST364File');
    expect(file).toMatchObject({
      resolvedPath: path.join('C:\\Common\\VST3', 'Super_8.vst3'),
      exists: true,
      rawValue: 'C:\\Common\\VST3',
    });
  });

  it('emits no plugin-file entry when nothing in the container matches', async () => {
    existingPaths.add(path.normalize('C:\\Common\\VST3'));
    folderListings.set(path.normalize('C:\\Common\\VST3'), ['Totally Different.vst3']);

    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('InstallVST364Dir', 'C:\\Common\\VST3')] },
    ]);
    expect(product.diskPaths.find((p) => p.kind === 'InstallVST364File')).toBeUndefined();
    // Container itself is still listed (informational).
    expect(product.diskPaths.find((p) => p.kind === 'InstallVST364Dir')).toBeDefined();
  });

  it('marks a missing shared container as not existing and skips file resolution', async () => {
    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('InstallVST364Dir', 'C:\\Common\\VST3')] },
    ]);
    expect(product.diskPaths.find((p) => p.kind === 'InstallVST364Dir')?.exists).toBe(false);
    expect(product.diskPaths.find((p) => p.kind === 'InstallVST364File')).toBeUndefined();
  });

  it('deduplicates identical kind+path pairs from both hives', async () => {
    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('ContentDir', 'D:\\Content\\Super 8')] },
      { keyPath: KEY_32, values: [value('ContentDir', 'd:\\content\\super 8')] },
    ]);
    expect(product.diskPaths.filter((p) => p.kind === 'ContentDir').length).toBe(1);
  });

  it('ignores empty path values', async () => {
    const product = await factory.create('Super 8', [
      { keyPath: KEY_64, values: [value('ContentDir', '  ')] },
    ]);
    expect(product.diskPaths.length).toBe(0);
  });

  it('attaches the installed_products JSON as property and disk path when it exists (TODO4)', async () => {
    const jsonPath = path.join(NI_INSTALLED_PRODUCTS_BASE, 'Super 8.json');
    existingPaths.add(path.normalize(jsonPath));

    const product = await factory.create('Super 8', [{ keyPath: KEY_64, values: [] }]);
    expect(product.installedJsonPath).toBe(jsonPath);
    const entry = product.diskPaths.find((p) => p.kind === 'InstalledProductsJson');
    expect(entry?.resolvedPath).toBe(jsonPath);
    expect(entry?.exists).toBe(true);
  });

  it('installedJsonPath is null and no disk path added when the JSON is missing', async () => {
    const product = await factory.create('Super 8', [{ keyPath: KEY_64, values: [] }]);
    expect(product.installedJsonPath).toBeNull();
    expect(product.diskPaths.find((p) => p.kind === 'InstalledProductsJson')).toBeUndefined();
  });

  it('attaches the CommonFiles folder only when it exists on disk', async () => {
    const commonFiles = path.join(NI_COMMON_FILES_BASE, 'Super 8');

    const without = await factory.create('Super 8', [{ keyPath: KEY_64, values: [] }]);
    expect(without.diskPaths.find((p) => p.kind === 'CommonFilesDetected')).toBeUndefined();

    existingPaths.add(path.normalize(commonFiles));
    const withCommon = await factory.create('Super 8', [{ keyPath: KEY_64, values: [] }]);
    const entry = withCommon.diskPaths.find((p) => p.kind === 'CommonFilesDetected');
    expect(entry?.resolvedPath).toBe(commonFiles);
    expect(entry?.exists).toBe(true);
  });

  it('attaches every existing NI host image folder under its kind (TODO7)', async () => {
    // Nothing exists → no host-image entries at all.
    const without = await factory.create('Super 8', [{ keyPath: KEY_64, values: [] }]);
    for (const rule of NI_HOST_IMAGE_DIR_RULES) {
      expect(without.diskPaths.find((p) => p.kind === rule.kind)).toBeUndefined();
    }

    // All four host folders exist → all four entries present with the right path.
    for (const rule of NI_HOST_IMAGE_DIR_RULES) {
      existingPaths.add(path.normalize(path.join(rule.base, 'Super 8')));
    }
    const withImages = await factory.create('Super 8', [{ keyPath: KEY_64, values: [] }]);
    for (const rule of NI_HOST_IMAGE_DIR_RULES) {
      const entry = withImages.diskPaths.find((p) => p.kind === rule.kind);
      expect(entry?.resolvedPath).toBe(path.join(rule.base, 'Super 8'));
      expect(entry?.exists).toBe(true);
    }
    expect(NI_HOST_IMAGE_DIR_RULES.map((rule) => rule.kind)).toEqual([
      'Kontakt8ImageDir',
      'Kontakt7ImageDir',
      'KompleteKontrolImageDir',
      'Machine2ImageDir',
    ]);
  });
});
