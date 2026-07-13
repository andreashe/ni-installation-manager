import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupProduct } from '../../../src/main/models/BackupProduct';
import { RestoreAsService } from '../../../src/main/services/RestoreAsService';
import { RestoreStore } from '../../../src/main/stores/RestoreStore';
import type { LoggerService } from '../../../src/main/services/LoggerService';
import type { ProductDto } from '../../../src/shared/types/product';

const PATTERNS_FILE = 'C:\\fake\\userData\\rename-patterns.json';
const BACKUP_FOLDER = 'D:\\Backup\\Vari Comp';
const CONTENT_TARGET = 'C:\\NI\\Vari Comp';
const CONTENT_BACKUP = path.join(BACKUP_FOLDER, 'files', 'ContentDir', 'Vari Comp');

/** Content of the fake patterns file; null = file does not exist. */
let patternsFileContent: string | null;
let written: string | null;
/** Paths that "exist" on the fake filesystem. */
let existingPaths: Set<string>;

beforeEach(() => {
  patternsFileContent = null;
  written = null;
  existingPaths = new Set();
  vi.spyOn(fs.promises, 'readFile').mockImplementation(async (file) => {
    if (String(file) === PATTERNS_FILE && patternsFileContent !== null) {
      return patternsFileContent;
    }
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (_file, data) => {
    written = String(data);
  });
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  vi.spyOn(fs.promises, 'lstat').mockResolvedValue({
    isSymbolicLink: () => false,
    isFile: () => true,
    isDirectory: () => false,
    size: 250,
  } as fs.Stats);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeService(withBackup = true) {
  const store = new RestoreStore();
  if (withBackup) {
    const descriptor: ProductDto = {
      name: 'Vari Comp',
      version: '1.0',
      removable: true,
      registryEntries: {},
      diskPaths: [
        { kind: 'ContentDir', rawValue: CONTENT_TARGET, resolvedPath: CONTENT_TARGET, exists: true },
      ],
      installedJsonPath: null,
      diskUsageBytes: null,
      artworkUrl: null,
    };
    store.replaceAll([
      new BackupProduct({
        name: 'Vari Comp',
        version: '1.0',
        backupDate: '2026-07-05T19:04:51.334Z',
        backupFolderPath: BACKUP_FOLDER,
        descriptor,
      }),
    ]);
  }
  return new RestoreAsService(store, makeLogger() as unknown as LoggerService, PATTERNS_FILE);
}

describe('RestoreAsService patterns persistence (TODO9)', () => {
  it('returns an empty list when no patterns file exists yet', async () => {
    expect(await makeService().loadPatterns()).toEqual([]);
  });

  it('round-trips saved patterns', async () => {
    const service = makeService();
    await service.savePatterns([{ from: 'D:\\Old', to: 'E:\\New' }]);
    expect(written).not.toBeNull();
    patternsFileContent = written;
    expect(await service.loadPatterns()).toEqual([{ from: 'D:\\Old', to: 'E:\\New' }]);
  });

  it('drops malformed entries and survives a corrupt file', async () => {
    patternsFileContent = JSON.stringify([
      { from: 'D:\\Ok', to: 'E:\\Ok' },
      { from: 42 },
      'nonsense',
    ]);
    expect(await makeService().loadPatterns()).toEqual([{ from: 'D:\\Ok', to: 'E:\\Ok' }]);

    patternsFileContent = '{not json';
    expect(await makeService().loadPatterns()).toEqual([]);
  });
});

describe('RestoreAsService.getTargets (TODO9)', () => {
  it('lists kind, old target path/existence and backup size per backup', async () => {
    existingPaths.add(CONTENT_BACKUP); // data present in the backup
    existingPaths.add(CONTENT_TARGET); // old target still on disk
    const targets = await makeService().getTargets(['Vari Comp']);

    expect(targets).toEqual([
      {
        name: 'Vari Comp',
        version: '1.0',
        targets: [
          {
            kind: 'ContentDir',
            oldTargetPath: CONTENT_TARGET,
            oldTargetExists: true,
            sizeBytes: 250,
          },
        ],
      },
    ]);
  });

  it('skips unknown backups instead of failing', async () => {
    expect(await makeService(false).getTargets(['Ghost'])).toEqual([]);
  });
});

describe('RestoreAsService.pathsExist', () => {
  it('answers existence flags in input order', async () => {
    existingPaths.add('C:\\there');
    expect(await makeService().pathsExist(['C:\\there', 'C:\\missing'])).toEqual([true, false]);
  });
});
