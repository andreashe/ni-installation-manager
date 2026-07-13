import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupProduct } from '../../../src/main/models/BackupProduct';
import {
  applyRenamePatternsToProductSpec,
  computeRestoreTotalSteps,
  toRestoreProductSpec,
} from '../../../src/main/restore/restore-job';
import type { RestoreJobSpec, RestoreProductSpec } from '../../../src/main/restore/restore-job';
import type { ProductDiskPath, ProductDto } from '../../../src/shared/types/product';

const BACKUP_FOLDER = 'D:\\Backup\\Vari Comp';

/** Paths that "exist" on the fake filesystem for the current test. */
let existingPaths: Set<string>;

beforeEach(() => {
  existingPaths = new Set();
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  // Every existing backup entry reports 100 bytes (sizeOfPath → lstat).
  vi.spyOn(fs.promises, 'lstat').mockResolvedValue({
    isSymbolicLink: () => false,
    isFile: () => true,
    isDirectory: () => false,
    size: 100,
  } as fs.Stats);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeBackup(diskPaths: ProductDiskPath[]): BackupProduct {
  const descriptor: ProductDto = {
    name: 'Vari Comp',
    version: '1.0',
    removable: true,
    registryEntries: {
      'SOFTWARE\\Native Instruments\\Vari Comp': [
        { name: 'ContentVersion', type: 'SZ', value: '1.0' },
      ],
    },
    diskPaths,
    installedJsonPath: null,
    diskUsageBytes: null,
    artworkUrl: null,
  };
  return new BackupProduct({
    name: 'Vari Comp',
    version: '1.0',
    backupDate: '2026-07-05T19:04:51.334Z',
    backupFolderPath: BACKUP_FOLDER,
    descriptor,
  });
}

function diskPath(kind: ProductDiskPath['kind'], resolvedPath: string): ProductDiskPath {
  return { kind, rawValue: resolvedPath, resolvedPath, exists: true };
}

const CONTENT_BACKUP = path.join(BACKUP_FOLDER, 'files', 'ContentDir', 'Vari Comp');
const VST3_BACKUP = path.join(BACKUP_FOLDER, 'files', 'InstallVST364File', 'Vari Comp.vst3');

describe('toRestoreProductSpec (TODO8)', () => {
  it('creates one entry per disk path that has data in the backup', async () => {
    existingPaths.add(CONTENT_BACKUP);
    existingPaths.add(VST3_BACKUP);
    const backup = makeBackup([
      diskPath('ContentDir', 'C:\\NI\\Vari Comp'),
      diskPath('InstallVST364File', 'C:\\VST3\\Vari Comp.vst3'),
      diskPath('InstallDir', 'C:\\Program Files\\NI\\Vari Comp\\'), // not in backup
    ]);

    const spec = await toRestoreProductSpec(backup);
    expect(spec.name).toBe('Vari Comp');
    expect(spec.entries).toEqual([
      {
        kind: 'ContentDir',
        backupPath: CONTENT_BACKUP,
        targetPath: 'C:\\NI\\Vari Comp',
        sizeBytes: 100,
      },
      {
        kind: 'InstallVST364File',
        backupPath: VST3_BACKUP,
        targetPath: 'C:\\VST3\\Vari Comp.vst3',
        sizeBytes: 100,
      },
    ]);
  });

  it('skips shared plugin container folders (never backed up, TODO6)', async () => {
    // Even if a folder of that name existed in the backup, containers are skipped.
    existingPaths.add(path.join(BACKUP_FOLDER, 'files', 'InstallVST64Dir', '64'));
    const backup = makeBackup([diskPath('InstallVST64Dir', 'D:\\VSTs\\Komplete\\64\\')]);

    const spec = await toRestoreProductSpec(backup);
    expect(spec.entries).toEqual([]);
  });

  it('deduplicates disk paths that map to the same backup entry', async () => {
    existingPaths.add(CONTENT_BACKUP);
    const backup = makeBackup([
      diskPath('ContentDir', 'C:\\NI\\Vari Comp'),
      diskPath('ContentDir', 'C:\\NI\\VARI COMP'), // same backup source
    ]);

    const spec = await toRestoreProductSpec(backup);
    expect(spec.entries).toHaveLength(1);
  });

  it('CLONES the descriptor — mutating the spec never touches the model (restore-as safety)', async () => {
    existingPaths.add(CONTENT_BACKUP);
    const backup = makeBackup([diskPath('ContentDir', 'C:\\NI\\Vari Comp')]);

    const spec = await toRestoreProductSpec(backup);
    spec.descriptor.diskPaths[0].resolvedPath = 'X:\\somewhere else';
    expect(backup.descriptor.diskPaths[0].resolvedPath).toBe('C:\\NI\\Vari Comp');
  });

  it('carries the backed-up registry entries into the spec', async () => {
    const backup = makeBackup([]);
    const spec = await toRestoreProductSpec(backup);
    expect(spec.registryEntries).toEqual({
      'SOFTWARE\\Native Instruments\\Vari Comp': [
        { name: 'ContentVersion', type: 'SZ', value: '1.0' },
      ],
    });
  });
});

describe('applyRenamePatternsToProductSpec (TODO9)', () => {
  function makeSpec(): RestoreProductSpec {
    return {
      name: 'The Gentleman',
      version: '1.2.0',
      entries: [
        {
          kind: 'ContentDir',
          backupPath: 'D:\\Backup\\The Gentleman\\files\\ContentDir\\The Gentleman',
          targetPath: 'D:\\VSTs\\Komplete\\content\\The Gentleman',
          sizeBytes: 100,
        },
      ],
      registryEntries: {
        'SOFTWARE\\Native Instruments\\The Gentleman': [
          // Lower-cased name: kind matching must be case-insensitive.
          { name: 'contentdir', type: 'SZ', value: 'D:\\VSTs\\Komplete\\content\\The Gentleman' },
          { name: 'ContentVersion', type: 'SZ', value: '1.2.0' },
          { name: 'Visibility', type: 'DWORD_LITTLE_ENDIAN', value: 3 },
          { name: 'KEY', type: 'SZ', value: 'D:\\VSTs\\KomKEYS' }, // not a path kind — untouched
        ],
      },
      descriptor: {
        name: 'The Gentleman',
        version: '1.2.0',
        removable: true,
        registryEntries: {},
        diskPaths: [
          {
            kind: 'ContentDir',
            rawValue: 'D:\\VSTs\\Komplete\\content\\The Gentleman',
            resolvedPath: 'D:\\VSTs\\Komplete\\content\\The Gentleman',
            exists: true,
          },
        ],
        installedJsonPath: null,
        diskUsageBytes: null,
        artworkUrl: null,
      },
    };
  }
  const PATTERNS = [{ from: 'D:\\VSTs\\Komplete', to: 'E:\\Moved' }];

  it('rewrites the restore entry target paths in place', () => {
    const spec = makeSpec();
    applyRenamePatternsToProductSpec(spec, PATTERNS);
    expect(spec.entries[0].targetPath).toBe('E:\\Moved\\content\\The Gentleman');
    // Backup source stays untouched — only targets move.
    expect(spec.entries[0].backupPath).toBe(
      'D:\\Backup\\The Gentleman\\files\\ContentDir\\The Gentleman',
    );
  });

  it('rewrites path-carrying registry values (case-insensitive name match) and nothing else', () => {
    const spec = makeSpec();
    applyRenamePatternsToProductSpec(spec, PATTERNS);
    const values = spec.registryEntries['SOFTWARE\\Native Instruments\\The Gentleman'];
    expect(values[0].value).toBe('E:\\Moved\\content\\The Gentleman'); // contentdir
    expect(values[1].value).toBe('1.2.0'); // ContentVersion untouched
    expect(values[2].value).toBe(3); // number untouched
    expect(values[3].value).toBe('D:\\VSTs\\KomKEYS'); // KEY untouched (not a path kind; no boundary match)
  });

  it('rewrites the descriptor disk paths for consistency', () => {
    const spec = makeSpec();
    applyRenamePatternsToProductSpec(spec, PATTERNS);
    expect(spec.descriptor.diskPaths[0].resolvedPath).toBe('E:\\Moved\\content\\The Gentleman');
    expect(spec.descriptor.diskPaths[0].rawValue).toBe('E:\\Moved\\content\\The Gentleman');
  });
});

describe('computeRestoreTotalSteps', () => {
  it('counts one step per restore entry plus one per registry key over all products', () => {
    const spec: RestoreJobSpec = {
      dryRun: false,
      ignoreSpaceCheck: false,
      products: [
        {
          name: 'A',
          version: null,
          descriptor: {} as ProductDto,
          registryEntries: { 'SOFTWARE\\NI\\A64': [], 'SOFTWARE\\NI\\A32': [] },
          entries: [
            { kind: 'ContentDir', backupPath: 'b1', targetPath: 't1', sizeBytes: 1 },
            { kind: 'InstallDir', backupPath: 'b2', targetPath: 't2', sizeBytes: 1 },
          ],
        },
        {
          name: 'B',
          version: null,
          descriptor: {} as ProductDto,
          registryEntries: {},
          entries: [{ kind: 'ContentDir', backupPath: 'b3', targetPath: 't3', sizeBytes: 1 }],
        },
      ],
    };
    // A: 2 entries + 2 registry keys, B: 1 entry.
    expect(computeRestoreTotalSteps(spec)).toBe(5);
  });
});
