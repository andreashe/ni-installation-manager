import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupService } from '../../../src/main/services/BackupService';
import type {
  UninstallProductSpec,
  UninstallProgressReporter,
} from '../../../src/main/uninstall/uninstall-job';

/** Paths that "exist" on the fake filesystem for the current test. */
let existingPaths: Set<string>;
let rmSpy: ReturnType<typeof vi.spyOn>;
let cpSpy: ReturnType<typeof vi.spyOn>;
let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  existingPaths = new Set();
  vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs.promises, 'access').mockImplementation(async (target) => {
    if (!existingPaths.has(String(target))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
  });
  rmSpy = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
  cpSpy = vi.spyOn(fs.promises, 'cp').mockResolvedValue(undefined);
  writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
  vi.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const BACKUP = 'D:\\Backup';
const SOURCE = 'D:\\VSTs\\content\\80s New Wave Library';
const TARGET = path.join(BACKUP, '80s New Wave', 'files', 'ContentDir', '80s New Wave Library');

describe('BackupService.backupDiskPath', () => {
  it('copies the source under <product>/files/<kind>/<basename>', async () => {
    const service = new BackupService();
    await service.backupDiskPath('80s New Wave', 'ContentDir', SOURCE, BACKUP);

    expect(rmSpy).not.toHaveBeenCalled();
    expect(cpSpy).toHaveBeenCalledWith(SOURCE, TARGET, { recursive: true });
  });

  it('OVERWRITES an existing target instead of creating a timestamp-suffixed sibling', async () => {
    existingPaths.add(TARGET);
    const service = new BackupService();
    await service.backupDiskPath('80s New Wave', 'ContentDir', SOURCE, BACKUP);

    // Old backup removed first, then copied to the SAME name — no suffix.
    expect(rmSpy).toHaveBeenCalledWith(TARGET, { recursive: true, force: true });
    expect(cpSpy).toHaveBeenCalledWith(SOURCE, TARGET, { recursive: true });
    expect(rmSpy.mock.invocationCallOrder[0]).toBeLessThan(cpSpy.mock.invocationCallOrder[0]);
  });
});

/** Minimal serialized product for spec fixtures. */
function descriptor(name: string): UninstallProductSpec['descriptor'] {
  return {
    name,
    version: '1.0.0',
    removable: true,
    registryEntries: {},
    diskPaths: [],
    installedJsonPath: null,
    diskUsageBytes: null,
    artworkUrl: null,
  };
}

describe('BackupService.backupRegistry', () => {
  it('splits entries into 64-bit (WOW6432Node) and 32-bit JSON files', async () => {
    const product: UninstallProductSpec = {
      name: 'Super 8',
      version: '1.0.0',
      descriptor: descriptor('Super 8'),
      diskPaths: [],
      registryKeyPaths: [],
      artworkCachePath: null,
      registryEntries: {
        'SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8': [
          { name: 'ContentVersion', type: 'SZ', value: '1.0' },
        ],
        'SOFTWARE\\Native Instruments\\Super 8': [{ name: 'KEY', type: 'SZ', value: 'x' }],
      },
    };
    await new BackupService().backupRegistry(product, BACKUP);

    const writes = writeSpy.mock.calls.map((call: unknown[]) => ({
      file: String(call[0]),
      json: JSON.parse(String(call[1])) as Record<string, unknown>,
    }));
    const file64 = writes.find((w: { file: string }) => w.file.endsWith('64-bit.json'));
    const file32 = writes.find((w: { file: string }) => w.file.endsWith('32-bit.json'));
    expect(Object.keys(file64?.json ?? {})).toEqual([
      'SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8',
    ]);
    expect(Object.keys(file32?.json ?? {})).toEqual(['SOFTWARE\\Native Instruments\\Super 8']);
  });
});

describe('BackupService.writeBackupDescription (TODO7)', () => {
  it('writes niim-backup-desc.json with name, version, date and full product object', async () => {
    const product: UninstallProductSpec = {
      name: 'Super 8',
      version: '2.5.0',
      descriptor: descriptor('Super 8'),
      diskPaths: [],
      registryKeyPaths: [],
      registryEntries: {},
      artworkCachePath: null,
    };
    await new BackupService().writeBackupDescription(product, BACKUP);

    const call = writeSpy.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('niim-backup-desc.json'),
    );
    expect(String(call?.[0])).toBe(path.join(BACKUP, 'Super 8', 'niim-backup-desc.json'));
    const json = JSON.parse(String(call?.[1])) as Record<string, unknown>;
    expect(json.name).toBe('Super 8');
    expect(json.version).toBe('2.5.0');
    expect(typeof json.backupDate).toBe('string');
    expect((json.product as Record<string, unknown>).name).toBe('Super 8');
  });
});

describe('BackupService.backupProductImage (TODO7)', () => {
  function productWithArtwork(artworkCachePath: string | null): UninstallProductSpec {
    return {
      name: 'Super 8',
      version: null,
      descriptor: descriptor('Super 8'),
      diskPaths: [],
      registryKeyPaths: [],
      registryEntries: {},
      artworkCachePath,
    };
  }

  it('copies the cached artwork as product.png when it exists', async () => {
    existingPaths.add('C:\\cache\\Super 8.png');
    await new BackupService().backupProductImage(productWithArtwork('C:\\cache\\Super 8.png'), BACKUP);

    expect(vi.mocked(fs.promises.copyFile)).toHaveBeenCalledWith(
      'C:\\cache\\Super 8.png',
      path.join(BACKUP, 'Super 8', 'product.png'),
    );
  });

  it('does nothing when no artwork is cached', async () => {
    await new BackupService().backupProductImage(productWithArtwork(null), BACKUP);
    expect(vi.mocked(fs.promises.copyFile)).not.toHaveBeenCalled();
  });
});

describe('BackupService.ensureFreeSpace', () => {
  function reporter(): UninstallProgressReporter & { lines: string[] } {
    const lines: string[] = [];
    return { lines, line: (t) => lines.push(t), stepDone: () => undefined, productDone: () => undefined };
  }

  function productWithFile(size: number): UninstallProductSpec {
    vi.spyOn(fs.promises, 'lstat').mockResolvedValue({
      isSymbolicLink: () => false,
      isFile: () => true,
      isDirectory: () => false,
      size,
    } as fs.Stats);
    return {
      name: 'X',
      version: null,
      descriptor: descriptor('X'),
      diskPaths: [{ kind: 'ContentDir', rawValue: 'C:\\x', resolvedPath: 'C:\\x', exists: true }],
      registryKeyPaths: [],
      registryEntries: {},
      artworkCachePath: null,
    };
  }

  it('throws when the backup target has less free space than the product size', async () => {
    vi.spyOn(fs.promises, 'statfs').mockResolvedValue({ bavail: 1, bsize: 512 } as fs.StatsFs);
    await expect(
      new BackupService().ensureFreeSpace(productWithFile(10_000), BACKUP, reporter()),
    ).rejects.toThrow(/Not enough free space/);
  });

  it('passes when enough space is available', async () => {
    vi.spyOn(fs.promises, 'statfs').mockResolvedValue({ bavail: 1_000_000, bsize: 4096 } as fs.StatsFs);
    await expect(
      new BackupService().ensureFreeSpace(productWithFile(10_000), BACKUP, reporter()),
    ).resolves.toBeUndefined();
  });
});
