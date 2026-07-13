import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestoreScanService } from '../../../src/main/services/RestoreScanService';
import { RestoreStore } from '../../../src/main/stores/RestoreStore';
import { SettingsStore } from '../../../src/main/stores/SettingsStore';
import type { ArtworkCacheService } from '../../../src/main/services/ArtworkCacheService';
import type { LoggerService } from '../../../src/main/services/LoggerService';
import type { ProductDto } from '../../../src/shared/types/product';

const BACKUP_FOLDER = 'D:\\Backup';

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeArtworkCache() {
  return {
    getCachedArtworkFileName: vi.fn().mockResolvedValue(null),
    importArtwork: vi.fn().mockResolvedValue(null),
  };
}

function descriptor(name: string, diskUsageBytes: number | null = null): ProductDto {
  return {
    name,
    version: '1.0',
    removable: true,
    registryEntries: {},
    diskPaths: [],
    installedJsonPath: null,
    diskUsageBytes,
    artworkUrl: null,
  };
}

function descriptionJson(name: string, diskUsageBytes: number | null = null): string {
  return JSON.stringify({
    name,
    version: '1.0',
    backupDate: '2026-07-05T19:04:51.334Z',
    product: descriptor(name, diskUsageBytes),
  });
}

/** Fake filesystem: subfolder name → description file content (null = no desc file). */
let subfolders: Map<string, string | null>;
/** Extra paths that "exist" for fs.access (e.g. product.png). */
let existingPaths: Set<string>;

beforeEach(() => {
  subfolders = new Map();
  existingPaths = new Set();

  vi.spyOn(fs.promises, 'readdir').mockImplementation(async (dir) => {
    if (String(dir) !== BACKUP_FOLDER) {
      return [] as never; // sizeOfPath walks report empty folders
    }
    return [...subfolders.keys()].map(
      (name) => ({ name, isDirectory: () => true, isFile: () => false }) as fs.Dirent,
    ) as never;
  });
  vi.spyOn(fs.promises, 'readFile').mockImplementation(async (file) => {
    for (const [name, content] of subfolders) {
      if (String(file) === path.join(BACKUP_FOLDER, name, 'niim-backup-desc.json') && content !== null) {
        return content;
      }
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  // Backup subfolder size scan: every folder reports 4242 bytes.
  vi.spyOn(fs.promises, 'lstat').mockResolvedValue({
    isSymbolicLink: () => false,
    isFile: () => true,
    isDirectory: () => false,
    size: 4242,
  } as fs.Stats);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeService(backupFolder = BACKUP_FOLDER) {
  const settingsStore = new SettingsStore();
  settingsStore.applyPartial({ backupFolder });
  const restoreStore = new RestoreStore();
  const artworkCache = makeArtworkCache();
  const logger = makeLogger();
  const service = new RestoreScanService(
    settingsStore,
    restoreStore,
    artworkCache as unknown as ArtworkCacheService,
    logger as unknown as LoggerService,
  );
  return { service, restoreStore, artworkCache, logger };
}

describe('RestoreScanService.scan (TODO8)', () => {
  it('finds every direct subfolder with a niim-backup-desc.json', async () => {
    subfolders.set('Vari Comp', descriptionJson('Vari Comp'));
    subfolders.set('Super 8', descriptionJson('Super 8'));
    subfolders.set('random-folder', null); // no description → not a backup

    const { service, restoreStore } = makeService();
    await service.scan();

    expect(restoreStore.backups.map((b) => b.name)).toEqual(['Super 8', 'Vari Comp']);
    expect(restoreStore.scanning).toBe(false);
    expect(restoreStore.statusText).toBeNull();
  });

  it('skips malformed description files with a warning', async () => {
    subfolders.set('Broken', '{not json');
    subfolders.set('NoName', JSON.stringify({ product: {} }));
    subfolders.set('Good', descriptionJson('Good'));

    const { service, restoreStore, logger } = makeService();
    await service.scan();

    expect(restoreStore.backups.map((b) => b.name)).toEqual(['Good']);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it('clears the list and skips scanning when no backup folder is configured', async () => {
    const { service, restoreStore } = makeService('');
    await service.scan();

    expect(restoreStore.backups).toEqual([]);
    expect(vi.mocked(fs.promises.readdir)).not.toHaveBeenCalled();
  });

  it('reuses already-cached artwork before importing from the backup', async () => {
    subfolders.set('Vari Comp', descriptionJson('Vari Comp'));
    const { service, restoreStore, artworkCache } = makeService();
    artworkCache.getCachedArtworkFileName.mockResolvedValue('Vari Comp.png');

    await service.scan();

    expect(restoreStore.backups[0].artworkCacheFileName).toBe('Vari Comp.png');
    expect(artworkCache.importArtwork).not.toHaveBeenCalled();
  });

  it("imports the backup's product.png when nothing is cached", async () => {
    subfolders.set('Vari Comp', descriptionJson('Vari Comp'));
    existingPaths.add(path.join(BACKUP_FOLDER, 'Vari Comp', 'product.png'));
    const { service, restoreStore, artworkCache } = makeService();
    artworkCache.importArtwork.mockResolvedValue('Vari Comp.png');

    await service.scan();

    expect(artworkCache.importArtwork).toHaveBeenCalledWith(
      'Vari Comp',
      path.join(BACKUP_FOLDER, 'Vari Comp', 'product.png'),
    );
    expect(restoreStore.backups[0].artworkCacheFileName).toBe('Vari Comp.png');
  });

  it('scans the backup subfolder size when the descriptor has no diskUsageBytes', async () => {
    subfolders.set('Vari Comp', descriptionJson('Vari Comp', null));
    const { service, restoreStore } = makeService();
    await service.scan();

    expect(restoreStore.backups[0].diskUsageBytes).toBe(4242);
  });

  it('keeps the descriptor diskUsageBytes when present (no size scan)', async () => {
    subfolders.set('Vari Comp', descriptionJson('Vari Comp', 123456));
    const { service, restoreStore } = makeService();
    await service.scan();

    expect(restoreStore.backups[0].diskUsageBytes).toBe(123456);
  });
});
