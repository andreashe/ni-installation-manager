import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UninstallJobRunner } from '../../../src/main/uninstall/UninstallJobRunner';
import { computeTotalSteps } from '../../../src/main/uninstall/uninstall-job';
import type { UninstallJobSpec, UninstallProgressReporter } from '../../../src/main/uninstall/uninstall-job';
import type { BackupService } from '../../../src/main/services/BackupService';
import type { FsGuard } from '../../../src/main/utils/FsGuard';
import type { RegistryGuard } from '../../../src/main/utils/RegistryGuard';

/** Directories on the fake filesystem; everything else counts as a file. */
let directories: Set<string>;

function makeFsGuard() {
  return { deleteFile: vi.fn().mockResolvedValue(undefined), deleteFolder: vi.fn().mockResolvedValue(undefined) };
}

function makeRegistryGuard() {
  return { deleteKeyTree: vi.fn().mockResolvedValue(undefined), deleteValue: vi.fn().mockResolvedValue(undefined) };
}

function makeBackupService() {
  return {
    ensureFreeSpace: vi.fn().mockResolvedValue(undefined),
    backupDiskPath: vi.fn().mockResolvedValue(undefined),
    backupRegistry: vi.fn().mockResolvedValue(undefined),
    writeBackupDescription: vi.fn().mockResolvedValue(undefined),
    backupProductImage: vi.fn().mockResolvedValue(undefined),
  };
}

function makeReporter() {
  const lines: string[] = [];
  const reporter: UninstallProgressReporter & { lines: string[]; steps: () => number; done: string[] } = {
    lines,
    done: [],
    steps: () => steps,
    line: (text) => lines.push(text),
    stepDone: () => {
      steps += 1;
    },
    productDone: (name) => reporter.done.push(name),
  };
  let steps = 0;
  return reporter;
}

function spec(overrides: Partial<UninstallJobSpec>): UninstallJobSpec {
  return {
    mode: 'uninstall',
    dryRun: false,
    backupEnabled: false,
    backupFolder: '',
    ignoreSpaceCheck: false,
    products: [
      {
        name: 'Super 8',
        version: '1.0.0',
        diskPaths: [
          { kind: 'ContentDir', rawValue: 'D:\\Content\\Super 8', resolvedPath: 'D:\\Content\\Super 8', exists: true },
          { kind: 'InstallVST364File', rawValue: 'C:\\VST3', resolvedPath: 'C:\\VST3\\Super 8.vst3', exists: true },
        ],
        registryKeyPaths: ['SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8'],
        registryEntries: {},
        artworkCachePath: null,
        descriptor: {
          name: 'Super 8',
          version: '1.0.0',
          removable: true,
          registryEntries: {},
          diskPaths: [],
          installedJsonPath: null,
          diskUsageBytes: null,
          artworkUrl: null,
        },
      },
    ],
    ...overrides,
  };
}

function makeRunner() {
  const fsGuard = makeFsGuard();
  const registryGuard = makeRegistryGuard();
  const backupService = makeBackupService();
  const reporter = makeReporter();
  const runner = new UninstallJobRunner(
    fsGuard as unknown as FsGuard,
    registryGuard as unknown as RegistryGuard,
    backupService as unknown as BackupService,
    reporter,
  );
  return { runner, fsGuard, registryGuard, backupService, reporter };
}

beforeEach(() => {
  directories = new Set(['D:\\Content\\Super 8', 'D:\\Backup']);
  vi.spyOn(fs.promises, 'lstat').mockImplementation(async (target) => {
    const isDirectory = directories.has(String(target));
    return { isDirectory: () => isDirectory } as fs.Stats;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UninstallJobRunner', () => {
  it('deletes folders recursively and single files via the matching guard method', async () => {
    const { runner, fsGuard, registryGuard, reporter } = makeRunner();
    await runner.run(spec({}));

    expect(fsGuard.deleteFolder).toHaveBeenCalledWith('D:\\Content\\Super 8');
    expect(fsGuard.deleteFile).toHaveBeenCalledWith('C:\\VST3\\Super 8.vst3');
    expect(registryGuard.deleteKeyTree).toHaveBeenCalledWith(
      'SOFTWARE\\WOW6432Node\\Native Instruments\\Super 8',
    );
    expect(reporter.done).toEqual(['Super 8']);
  });

  it('reported steps exactly match computeTotalSteps (no backup)', async () => {
    const { runner, reporter } = makeRunner();
    const jobSpec = spec({});
    await runner.run(jobSpec);
    expect(reporter.steps()).toBe(computeTotalSteps(jobSpec));
  });

  it('reported steps exactly match computeTotalSteps (with backup)', async () => {
    const { runner, reporter } = makeRunner();
    const jobSpec = spec({ backupEnabled: true, backupFolder: 'D:\\Backup' });
    await runner.run(jobSpec);
    expect(reporter.steps()).toBe(computeTotalSteps(jobSpec));
  });

  it('backup: announces the backup folder, checks space, copies paths and registry', async () => {
    const { runner, backupService, reporter } = makeRunner();
    await runner.run(spec({ backupEnabled: true, backupFolder: 'D:\\Backup' }));

    expect(reporter.lines.some((l) => l.includes('Backup folder: D:\\Backup'))).toBe(true);
    expect(backupService.ensureFreeSpace).toHaveBeenCalled();
    expect(backupService.backupDiskPath).toHaveBeenCalledTimes(2);
    expect(backupService.backupRegistry).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the configured backup folder does not exist', async () => {
    const { runner, fsGuard, backupService } = makeRunner();
    await expect(
      runner.run(spec({ backupEnabled: true, backupFolder: 'D:\\Missing' })),
    ).rejects.toThrow(/Backup folder does not exist/);
    expect(backupService.backupDiskPath).not.toHaveBeenCalled();
    expect(fsGuard.deleteFolder).not.toHaveBeenCalled();
  });

  it('dry-run with backup: reports would-be copies, never calls the backup service', async () => {
    const { runner, backupService, reporter } = makeRunner();
    const jobSpec = spec({ dryRun: true, backupEnabled: true, backupFolder: 'D:\\Backup' });
    await runner.run(jobSpec);

    expect(backupService.backupDiskPath).not.toHaveBeenCalled();
    expect(backupService.backupRegistry).not.toHaveBeenCalled();
    expect(reporter.lines.some((l) => l.startsWith('DRY-RUN: would back up'))).toBe(true);
    // Steps still counted so the progress bar reaches 100% in dry-run.
    expect(reporter.steps()).toBe(computeTotalSteps(jobSpec));
  });

  it('backup enabled without folder: skips backup with a notice', async () => {
    const { runner, backupService, reporter } = makeRunner();
    await runner.run(spec({ backupEnabled: true, backupFolder: '' }));
    expect(backupService.backupDiskPath).not.toHaveBeenCalled();
    expect(reporter.lines.some((l) => l.includes('no backup folder configured'))).toBe(true);
  });

  it('writes the backup description file together with the registry dump', async () => {
    const { runner, backupService } = makeRunner();
    await runner.run(spec({ backupEnabled: true, backupFolder: 'D:\\Backup' }));
    expect(backupService.writeBackupDescription).toHaveBeenCalledTimes(1);
  });

  it('backup mode: backs up only, deletes nothing, works without the backup setting (TODO7)', async () => {
    const { runner, fsGuard, registryGuard, backupService, reporter } = makeRunner();
    const jobSpec = spec({ mode: 'backup', backupEnabled: false, backupFolder: 'D:\\Backup' });
    await runner.run(jobSpec);

    expect(backupService.backupDiskPath).toHaveBeenCalledTimes(2);
    expect(backupService.writeBackupDescription).toHaveBeenCalledTimes(1);
    expect(fsGuard.deleteFolder).not.toHaveBeenCalled();
    expect(fsGuard.deleteFile).not.toHaveBeenCalled();
    expect(registryGuard.deleteKeyTree).not.toHaveBeenCalled();
    expect(reporter.steps()).toBe(computeTotalSteps(jobSpec));
    expect(reporter.done).toEqual(['Super 8']);
  });

  it('backup mode without a configured folder fails fast', async () => {
    const { runner } = makeRunner();
    await expect(runner.run(spec({ mode: 'backup', backupFolder: '' }))).rejects.toThrow(
      /No backup folder configured/,
    );
  });

  it('ignoreSpaceCheck skips the free-space check with a notice', async () => {
    const { runner, backupService, reporter } = makeRunner();
    await runner.run(
      spec({ mode: 'backup', backupFolder: 'D:\\Backup', ignoreSpaceCheck: true }),
    );
    expect(backupService.ensureFreeSpace).not.toHaveBeenCalled();
    expect(reporter.lines.some((l) => l.includes('Free-space check skipped'))).toBe(true);
  });

  it('backup-only kinds (Kontakt8ImageDir) are backed up but never deleted (TODO7)', async () => {
    const { runner, fsGuard, backupService, reporter } = makeRunner();
    const jobSpec = spec({ backupEnabled: true, backupFolder: 'D:\\Backup' });
    jobSpec.products[0].diskPaths.push({
      kind: 'Kontakt8ImageDir',
      rawValue: 'C:\\NI\\Kontakt 8\\PAResources\\image\\Super 8',
      resolvedPath: 'C:\\NI\\Kontakt 8\\PAResources\\image\\Super 8',
      exists: true,
    });
    await runner.run(jobSpec);

    // Backed up like any other path…
    expect(backupService.backupDiskPath).toHaveBeenCalledWith(
      'Super 8',
      'Kontakt8ImageDir',
      'C:\\NI\\Kontakt 8\\PAResources\\image\\Super 8',
      'D:\\Backup',
    );
    // …but never deleted, and step accounting still matches.
    expect(fsGuard.deleteFolder).not.toHaveBeenCalledWith(
      'C:\\NI\\Kontakt 8\\PAResources\\image\\Super 8',
    );
    expect(fsGuard.deleteFile).not.toHaveBeenCalledWith(
      'C:\\NI\\Kontakt 8\\PAResources\\image\\Super 8',
    );
    expect(reporter.steps()).toBe(computeTotalSteps(jobSpec));
    expect(reporter.lines.some((l) => l.includes('backup only'))).toBe(true);
  });

  it('copies the cached artwork as product.png during backup (TODO7)', async () => {
    const { runner, backupService } = makeRunner();
    const jobSpec = spec({ backupEnabled: true, backupFolder: 'D:\\Backup' });
    jobSpec.products[0].artworkCachePath = 'C:\\cache\\Super 8.png';
    await runner.run(jobSpec);
    expect(backupService.backupProductImage).toHaveBeenCalledTimes(1);
  });
});
