import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectMoveSources,
  computeMoveTotalSteps,
  toMoveProductSpec,
} from '../../../src/main/move/move-job';
import type { MoveJobSpec } from '../../../src/main/move/move-job';
import type { ProductDiskPath, ProductDto } from '../../../src/shared/types/product';

/** Paths that "exist" on the fake filesystem for the current test. */
let existingPaths: Set<string>;

beforeEach(() => {
  existingPaths = new Set();
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  // Every existing source reports 100 bytes (sizeOfPath → lstat).
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

function diskPath(kind: ProductDiskPath['kind'], resolvedPath: string): ProductDiskPath {
  return { kind, rawValue: resolvedPath, resolvedPath, exists: true };
}

function makeDescriptor(diskPaths: ProductDiskPath[]): ProductDto {
  return {
    name: 'Vari Comp',
    version: '1.0',
    removable: true,
    registryEntries: {
      'SOFTWARE\\Native Instruments\\Vari Comp': [
        // Lower-cased name: kind matching must be case-insensitive.
        { name: 'contentdir', type: 'SZ', value: 'D:\\VSTs\\Komplete\\content\\Vari Comp' },
        { name: 'ContentVersion', type: 'SZ', value: '1.0' },
        { name: 'Visibility', type: 'DWORD_LITTLE_ENDIAN', value: 3 },
        { name: 'KEY', type: 'SZ', value: 'D:\\VSTs\\KomKEYS' }, // not a path kind — untouched
      ],
      'SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp': [
        { name: 'InstallDir', type: 'SZ', value: 'C:\\Program Files\\NI\\Vari Comp' },
      ],
    },
    diskPaths,
    installedJsonPath: null,
    diskUsageBytes: null,
    artworkUrl: null,
  };
}

const PATTERNS = [{ from: 'D:\\VSTs\\Komplete', to: 'E:\\Moved' }];

describe('collectMoveSources (TODO10)', () => {
  it('lists every non-container disk path once with fresh existence and size', async () => {
    existingPaths.add('D:\\VSTs\\Komplete\\content\\Vari Comp');
    const sources = await collectMoveSources(
      makeDescriptor([
        diskPath('ContentDir', 'D:\\VSTs\\Komplete\\content\\Vari Comp'),
        diskPath('InstallDir', 'C:\\Program Files\\NI\\Vari Comp'), // not on disk
      ]),
    );
    expect(sources).toEqual([
      {
        kind: 'ContentDir',
        sourcePath: 'D:\\VSTs\\Komplete\\content\\Vari Comp',
        exists: true,
        sizeBytes: 100,
      },
      {
        kind: 'InstallDir',
        sourcePath: 'C:\\Program Files\\NI\\Vari Comp',
        exists: false,
        sizeBytes: 0,
      },
    ]);
  });

  it('skips shared plugin container folders (never moved, TODO6)', async () => {
    existingPaths.add('D:\\VSTs\\Komplete\\64');
    const sources = await collectMoveSources(
      makeDescriptor([diskPath('InstallVST64Dir', 'D:\\VSTs\\Komplete\\64')]),
    );
    expect(sources).toEqual([]);
  });

  it('deduplicates disk paths resolving to the same location (case-insensitive)', async () => {
    existingPaths.add('C:\\NI\\Vari Comp');
    const sources = await collectMoveSources(
      makeDescriptor([
        diskPath('ContentDir', 'C:\\NI\\Vari Comp'),
        diskPath('InstallDir', 'C:\\NI\\VARI COMP'),
      ]),
    );
    expect(sources).toHaveLength(1);
  });
});

describe('toMoveProductSpec (TODO10)', () => {
  it('creates entries only for EXISTING sources whose target differs from the source', async () => {
    existingPaths.add('D:\\VSTs\\Komplete\\content\\Vari Comp');
    existingPaths.add('C:\\Program Files\\NI\\Vari Comp');
    const spec = await toMoveProductSpec(
      makeDescriptor([
        diskPath('ContentDir', 'D:\\VSTs\\Komplete\\content\\Vari Comp'), // moves
        diskPath('InstallDir', 'C:\\Program Files\\NI\\Vari Comp'), // pattern misses → source = target, dropped
      ]),
      PATTERNS,
    );
    expect(spec.name).toBe('Vari Comp');
    expect(spec.entries).toEqual([
      {
        kind: 'ContentDir',
        sourcePath: 'D:\\VSTs\\Komplete\\content\\Vari Comp',
        targetPath: 'E:\\Moved\\content\\Vari Comp',
        sizeBytes: 100,
      },
    ]);
  });

  it('never creates entries for sources missing on disk', async () => {
    const spec = await toMoveProductSpec(
      makeDescriptor([diskPath('ContentDir', 'D:\\VSTs\\Komplete\\content\\Vari Comp')]),
      PATTERNS,
    );
    expect(spec.entries).toEqual([]);
  });

  it('collects only the CHANGED path-carrying registry values per key (case-insensitive names)', async () => {
    const spec = await toMoveProductSpec(makeDescriptor([]), PATTERNS);
    // 64-bit key: only `contentdir` changed; version/number/non-path values dropped.
    // 32-bit key: InstallDir not matched by the pattern → whole key dropped.
    expect(spec.registryUpdates).toEqual({
      'SOFTWARE\\Native Instruments\\Vari Comp': [
        { name: 'contentdir', type: 'SZ', value: 'E:\\Moved\\content\\Vari Comp' },
      ],
    });
  });

  it('leaves the descriptor untouched (works on the DTO copy only)', async () => {
    const descriptor = makeDescriptor([]);
    await toMoveProductSpec(descriptor, PATTERNS);
    expect(descriptor.registryEntries['SOFTWARE\\Native Instruments\\Vari Comp'][0].value).toBe(
      'D:\\VSTs\\Komplete\\content\\Vari Comp',
    );
  });
});

describe('computeMoveTotalSteps', () => {
  it('counts one step per move entry plus one per registry key over all products', () => {
    const spec: MoveJobSpec = {
      dryRun: false,
      ignoreSpaceCheck: false,
      products: [
        {
          name: 'A',
          version: null,
          registryUpdates: { 'SOFTWARE\\NI\\A64': [], 'SOFTWARE\\NI\\A32': [] },
          entries: [
            { kind: 'ContentDir', sourcePath: 's1', targetPath: 't1', sizeBytes: 1 },
            { kind: 'InstallDir', sourcePath: 's2', targetPath: 't2', sizeBytes: 1 },
          ],
        },
        {
          name: 'B',
          version: null,
          registryUpdates: {},
          entries: [{ kind: 'ContentDir', sourcePath: 's3', targetPath: 't3', sizeBytes: 1 }],
        },
      ],
    };
    // A: 2 entries + 2 registry keys, B: 1 entry.
    expect(computeMoveTotalSteps(spec)).toBe(5);
  });
});
