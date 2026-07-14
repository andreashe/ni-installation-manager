import { describe, expect, it } from 'vitest';
import { Product } from '../../../src/main/models/Product';
import {
  computeTotalSteps,
  deletableRegistryKeyPaths,
  toProductSpec,
} from '../../../src/main/uninstall/uninstall-job';
import type { UninstallJobSpec, UninstallProductSpec } from '../../../src/main/uninstall/uninstall-job';

function product(name: string, diskPathCount: number, registryKeyCount: number): UninstallProductSpec {
  return {
    name,
    version: '1.0.0',
    diskPaths: Array.from({ length: diskPathCount }, (_, i) => ({
      kind: 'ContentDir' as const,
      rawValue: `C:\\p${i}`,
      resolvedPath: `C:\\p${i}`,
      exists: true,
    })),
    registryKeyPaths: Array.from({ length: registryKeyCount }, (_, i) => `SOFTWARE\\NI\\${name}${i}`),
    registryEntries: {},
    artworkCachePath: null,
    descriptor: {
      name,
      version: '1.0.0',
      removable: true,
      registryEntries: {},
      diskPaths: [],
      installedJsonPath: null,
      diskUsageBytes: null,
      artworkUrl: null,
    },
  };
}

function spec(overrides: Partial<UninstallJobSpec>): UninstallJobSpec {
  return {
    mode: 'uninstall',
    dryRun: false,
    backupEnabled: false,
    backupFolder: '',
    ignoreSpaceCheck: false,
    deleteUserRegistryData: false,
    products: [],
    ...overrides,
  };
}

describe('computeTotalSteps', () => {
  it('counts deletion steps only when backup is off', () => {
    const s = spec({ products: [product('A', 2, 2)] });
    // 2 disk deletions + 2 registry deletions
    expect(computeTotalSteps(s)).toBe(4);
  });

  it('adds one step per disk path plus one registry-dump step when backup is active', () => {
    const s = spec({ backupEnabled: true, backupFolder: 'D:\\backup', products: [product('A', 2, 2)] });
    // backup: 2 + 1, deletion: 2 + 2
    expect(computeTotalSteps(s)).toBe(7);
  });

  it('ignores backup steps when backup is enabled but no folder configured', () => {
    const s = spec({ backupEnabled: true, backupFolder: '', products: [product('A', 2, 2)] });
    expect(computeTotalSteps(s)).toBe(4);
  });

  it('sums across products', () => {
    const s = spec({
      backupEnabled: true,
      backupFolder: 'D:\\backup',
      products: [product('A', 1, 2), product('B', 3, 1)],
    });
    // A: (1+1) + (1+2) = 5, B: (3+1) + (3+1) = 8
    expect(computeTotalSteps(s)).toBe(13);
  });

  it('is zero for an empty product list', () => {
    expect(computeTotalSteps(spec({}))).toBe(0);
  });

  it('backup-only jobs count backup steps regardless of the backup setting (TODO7)', () => {
    const s = spec({ mode: 'backup', backupFolder: 'D:\\backup', products: [product('A', 2, 2)] });
    // 2 disk-path backups + 1 registry/description step; NO deletion steps.
    expect(computeTotalSteps(s)).toBe(3);
  });

  it('excludes HKCU keys from the deletion steps unless deleteUserRegistryData is set (TODO12)', () => {
    const withHkcu = product('A', 1, 1);
    withHkcu.registryKeyPaths.push('HKCU\\SOFTWARE\\Native Instruments\\A');

    // 1 disk deletion + 1 HKLM registry deletion; HKCU key kept.
    expect(computeTotalSteps(spec({ products: [withHkcu] }))).toBe(2);
    // Opt-in: HKCU key counts too.
    expect(
      computeTotalSteps(spec({ deleteUserRegistryData: true, products: [withHkcu] })),
    ).toBe(3);
  });
});

describe('deletableRegistryKeyPaths (TODO12)', () => {
  const withHkcu = product('A', 0, 1);
  withHkcu.registryKeyPaths.push('HKCU\\SOFTWARE\\Native Instruments\\A');

  it('filters HKCU keys by default', () => {
    expect(deletableRegistryKeyPaths(withHkcu, spec({}))).toEqual(['SOFTWARE\\NI\\A0']);
  });

  it('keeps HKCU keys with the opt-in setting', () => {
    expect(deletableRegistryKeyPaths(withHkcu, spec({ deleteUserRegistryData: true }))).toEqual([
      'SOFTWARE\\NI\\A0',
      'HKCU\\SOFTWARE\\Native Instruments\\A',
    ]);
  });

  it('never filters HKCR installer keys (machine-wide, always deleted)', () => {
    const withInstaller = product('B', 0, 1);
    withInstaller.registryKeyPaths.push('HKCR\\Installer\\Products\\AB469C61D2E7CE94697DA34179576106');
    expect(deletableRegistryKeyPaths(withInstaller, spec({}))).toEqual([
      'SOFTWARE\\NI\\B0',
      'HKCR\\Installer\\Products\\AB469C61D2E7CE94697DA34179576106',
    ]);
  });
});

describe('toProductSpec (TODO6)', () => {
  it('excludes shared container folders and non-existing paths from the job', () => {
    const model = new Product({
      name: 'Super 8',
      version: null,
      removable: true,
      registryEntries: { 'SOFTWARE\\NI\\Super 8': [] },
      diskPaths: [
        { kind: 'ContentDir', rawValue: 'D:\\C', resolvedPath: 'D:\\C', exists: true },
        { kind: 'InstallVST364Dir', rawValue: 'C:\\VST3', resolvedPath: 'C:\\VST3', exists: true },
        {
          kind: 'InstallVST364File',
          rawValue: 'C:\\VST3',
          resolvedPath: 'C:\\VST3\\Super_8.vst3',
          exists: true,
        },
        { kind: 'InstallDir', rawValue: 'D:\\Gone', resolvedPath: 'D:\\Gone', exists: false },
      ],
    });

    const spec = toProductSpec(model, null);

    // Shared container and missing path filtered; the plugin FILE is kept.
    expect(spec.diskPaths.map((p) => p.kind)).toEqual(['ContentDir', 'InstallVST364File']);
    expect(spec.registryKeyPaths).toEqual(['SOFTWARE\\NI\\Super 8']);
  });

  it('drops non-existing disk paths from the descriptor (niim-backup-desc.json)', () => {
    const model = new Product({
      name: 'Super 8',
      version: null,
      removable: true,
      registryEntries: {},
      diskPaths: [
        { kind: 'ContentDir', rawValue: 'D:\\C', resolvedPath: 'D:\\C', exists: true },
        // Same kind under another registry key, but the folder holds no content.
        { kind: 'InstallVST64Dir', rawValue: 'D:\\Old\\64', resolvedPath: 'D:\\Old\\64', exists: false },
        { kind: 'InstallVST64Dir', rawValue: 'D:\\New\\64', resolvedPath: 'D:\\New\\64', exists: true },
        { kind: 'InstallDir', rawValue: 'D:\\Gone', resolvedPath: 'D:\\Gone', exists: false },
      ],
    });

    const spec = toProductSpec(model, null);

    // Existing paths stay (incl. informational shared containers); missing ones vanish.
    expect(spec.descriptor.diskPaths.map((p) => p.resolvedPath)).toEqual(['D:\\C', 'D:\\New\\64']);
  });
});
