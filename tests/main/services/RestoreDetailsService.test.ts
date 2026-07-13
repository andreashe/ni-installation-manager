import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupProduct } from '../../../src/main/models/BackupProduct';
import { RestoreDetailsService } from '../../../src/main/services/RestoreDetailsService';
import { RestoreStore } from '../../../src/main/stores/RestoreStore';
import type { LoggerService } from '../../../src/main/services/LoggerService';
import type { ProductDiskPath, ProductDto } from '../../../src/shared/types/product';

const BACKUP_FOLDER = 'D:\\Backup\\Vari Comp';
const CONTENT_TARGET = 'C:\\NI\\Vari Comp';
const CONTENT_BACKUP = path.join(BACKUP_FOLDER, 'files', 'ContentDir', 'Vari Comp');

let existingPaths: Set<string>;

beforeEach(() => {
  existingPaths = new Set();
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  // Existing backup sources report 500 bytes; missing ones 0 (lstat throws).
  vi.spyOn(fs.promises, 'lstat').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return {
      isSymbolicLink: () => false,
      isFile: () => true,
      isDirectory: () => false,
      size: 500,
    } as fs.Stats;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeService(diskPaths: ProductDiskPath[]) {
  const descriptor: ProductDto = {
    name: 'Vari Comp',
    version: '1.0',
    removable: true,
    registryEntries: {
      'SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp': [],
      'SOFTWARE\\Native Instruments\\Vari Comp': [],
    },
    diskPaths,
    installedJsonPath: null,
    diskUsageBytes: null,
    artworkUrl: null,
  };
  const store = new RestoreStore();
  store.replaceAll([
    new BackupProduct({
      name: 'Vari Comp',
      version: '1.0',
      backupDate: '2026-07-05T19:04:51.334Z',
      backupFolderPath: BACKUP_FOLDER,
      descriptor,
    }),
  ]);
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return new RestoreDetailsService(store, logger as unknown as LoggerService);
}

function diskPath(kind: ProductDiskPath['kind'], resolvedPath: string): ProductDiskPath {
  return { kind, rawValue: resolvedPath, resolvedPath, exists: true };
}

describe('RestoreDetailsService (TODO8)', () => {
  it('returns null for an unknown backup', async () => {
    const service = makeService([]);
    expect(await service.getDetails('Unknown')).toBeNull();
  });

  it('describes each location with target existence and backup existence/size', async () => {
    existingPaths.add(CONTENT_BACKUP); // in backup
    existingPaths.add(CONTENT_TARGET); // target already on disk → yellow
    const service = makeService([
      diskPath('ContentDir', CONTENT_TARGET),
      diskPath('InstalledProductsJson', 'C:\\Users\\Public\\NI\\Vari Comp.json'), // not in backup → red
    ]);

    const details = await service.getDetails('Vari Comp');
    expect(details?.locations).toEqual([
      {
        kind: 'ContentDir',
        targetPath: CONTENT_TARGET,
        targetExists: true,
        backupPath: CONTENT_BACKUP,
        backupExists: true,
        backupSizeBytes: 500,
      },
      {
        kind: 'InstalledProductsJson',
        targetPath: 'C:\\Users\\Public\\NI\\Vari Comp.json',
        targetExists: false,
        backupPath: path.join(BACKUP_FOLDER, 'files', 'InstalledProductsJson', 'Vari Comp.json'),
        backupExists: false,
        backupSizeBytes: 0,
      },
    ]);
  });

  it('excludes shared plugin container folders (never backed up)', async () => {
    const service = makeService([diskPath('InstallVST64Dir', 'D:\\VSTs\\Komplete\\64\\')]);
    const details = await service.getDetails('Vari Comp');
    expect(details?.locations).toEqual([]);
  });

  it('sums only existing backup sources into the potential total, duplicates once', async () => {
    existingPaths.add(CONTENT_BACKUP);
    // Casing variant of the same backup source also "exists" on the fake fs.
    existingPaths.add(path.join(BACKUP_FOLDER, 'files', 'ContentDir', 'VARI COMP'));
    const service = makeService([
      diskPath('ContentDir', CONTENT_TARGET),
      diskPath('ContentDir', CONTENT_TARGET.toUpperCase()), // same backup source
      diskPath('InstalledProductsJson', 'C:\\x.json'), // no backup data → 0
    ]);

    const details = await service.getDetails('Vari Comp');
    expect(details?.totalRestoreBytes).toBe(500);
  });

  it('lists the registry paths that would be restored with the HKLM prefix', async () => {
    const service = makeService([]);
    const details = await service.getDetails('Vari Comp');
    expect(details?.registryPaths).toEqual([
      'HKLM\\SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp',
      'HKLM\\SOFTWARE\\Native Instruments\\Vari Comp',
    ]);
  });
});
