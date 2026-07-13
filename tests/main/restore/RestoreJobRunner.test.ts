import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestoreJobRunner } from '../../../src/main/restore/RestoreJobRunner';
import type { RestoreEntrySpec, RestoreJobSpec } from '../../../src/main/restore/restore-job';
import type { UninstallProgressReporter } from '../../../src/main/uninstall/uninstall-job';
import type { RegistryGuard } from '../../../src/main/utils/RegistryGuard';
import type { ProductDto, RegistryValueDto } from '../../../src/shared/types/product';

let mkdirSpy: ReturnType<typeof vi.spyOn>;
let cpSpy: ReturnType<typeof vi.spyOn>;
let statfsSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  cpSpy = vi.spyOn(fs.promises, 'cp').mockResolvedValue(undefined);
  statfsSpy = vi
    .spyOn(fs.promises, 'statfs')
    .mockResolvedValue({ bavail: 1_000_000, bsize: 4096 } as fs.StatsFs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function reporter() {
  const capture: UninstallProgressReporter & { lines: string[]; steps: number; done: string[] } = {
    lines: [],
    steps: 0,
    done: [],
    line: (text) => capture.lines.push(text),
    stepDone: () => {
      capture.steps += 1;
    },
    productDone: (name) => capture.done.push(name),
  };
  return capture;
}

function makeRegistryGuard() {
  return { restoreKeyValues: vi.fn().mockResolvedValue(undefined) };
}

function makeRunner(report: UninstallProgressReporter) {
  const guard = makeRegistryGuard();
  return { runner: new RestoreJobRunner(guard as unknown as RegistryGuard, report), guard };
}

function entry(targetPath: string, sizeBytes = 100): RestoreEntrySpec {
  return { kind: 'ContentDir', backupPath: `D:\\Backup\\X\\files\\ContentDir\\x`, targetPath, sizeBytes };
}

function spec(
  entries: RestoreEntrySpec[],
  overrides: Partial<RestoreJobSpec> = {},
  registryEntries: Record<string, RegistryValueDto[]> = {},
): RestoreJobSpec {
  return {
    dryRun: false,
    ignoreSpaceCheck: false,
    products: [
      { name: 'Vari Comp', version: '1.0', descriptor: {} as ProductDto, registryEntries, entries },
    ],
    ...overrides,
  };
}

const REGISTRY_ENTRIES: Record<string, RegistryValueDto[]> = {
  'SOFTWARE\\Native Instruments\\Vari Comp': [{ name: 'ContentVersion', type: 'SZ', value: '1.0' }],
  'SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp': [
    { name: 'Visibility', type: 'DWORD_LITTLE_ENDIAN', value: 3 },
  ],
};

describe('RestoreJobRunner (TODO8)', () => {
  it('copies every entry to its target and reports one step each', async () => {
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('C:\\NI\\Vari Comp'), entry('C:\\VST3\\x.vst3')]));

    expect(cpSpy).toHaveBeenCalledTimes(2);
    expect(cpSpy).toHaveBeenCalledWith('D:\\Backup\\X\\files\\ContentDir\\x', 'C:\\NI\\Vari Comp', {
      recursive: true,
      force: true,
    });
    expect(mkdirSpy).toHaveBeenCalledWith(path.dirname('C:\\NI\\Vari Comp'), { recursive: true });
    expect(report.steps).toBe(2);
    expect(report.done).toEqual(['Vari Comp']);
  });

  it('restores every backed-up registry key through the guard, one step each', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([entry('C:\\NI\\Vari Comp')], {}, REGISTRY_ENTRIES));

    expect(guard.restoreKeyValues).toHaveBeenCalledTimes(2);
    expect(guard.restoreKeyValues).toHaveBeenCalledWith(
      'SOFTWARE\\Native Instruments\\Vari Comp',
      REGISTRY_ENTRIES['SOFTWARE\\Native Instruments\\Vari Comp'],
    );
    expect(guard.restoreKeyValues).toHaveBeenCalledWith(
      'SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp',
      REGISTRY_ENTRIES['SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp'],
    );
    // 1 file entry + 2 registry keys.
    expect(report.steps).toBe(3);
  });

  it('dry-run only logs the would-be copies and registry writes, nothing is executed', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([entry('C:\\NI\\Vari Comp')], { dryRun: true }, REGISTRY_ENTRIES));

    expect(cpSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(statfsSpy).not.toHaveBeenCalled();
    expect(guard.restoreKeyValues).not.toHaveBeenCalled();
    expect(report.steps).toBe(3);
    expect(report.lines.some((line) => line.startsWith('DRY-RUN: would restore D:'))).toBe(true);
    expect(report.lines.some((line) => line.includes('would restore registry key HKLM\\'))).toBe(
      true,
    );
  });

  it('sums required space PER DEVICE and names every device that falls short', async () => {
    statfsSpy.mockImplementation(async (device: fs.PathLike) =>
      String(device).toUpperCase().startsWith('D:')
        ? ({ bavail: 0, bsize: 512 } as fs.StatsFs) // D: full
        : ({ bavail: 1_000_000, bsize: 4096 } as fs.StatsFs),
    );
    const report = reporter();
    const { runner } = makeRunner(report);
    await expect(
      runner.run(spec([entry('C:\\NI\\Vari Comp', 100), entry('D:\\Samples\\Vari Comp', 200)])),
    ).rejects.toThrow(/Not enough free space on target device\(s\): D:\\/);
    expect(cpSpy).not.toHaveBeenCalled();
  });

  it('skips the space check when ignoreSpaceCheck is set', async () => {
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('C:\\NI\\Vari Comp')], { ignoreSpaceCheck: true }));

    expect(statfsSpy).not.toHaveBeenCalled();
    expect(cpSpy).toHaveBeenCalledTimes(1);
    expect(report.lines.some((line) => line.includes('Free-space check skipped'))).toBe(true);
  });

  it('continues with a warning when free space cannot be determined', async () => {
    statfsSpy.mockRejectedValue(new Error('unsupported'));
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('C:\\NI\\Vari Comp')]));

    expect(cpSpy).toHaveBeenCalledTimes(1);
    expect(report.lines.some((line) => line.includes('could not determine free space'))).toBe(true);
  });

  it('reports products whose backup holds no data at all without failing', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([]));

    expect(cpSpy).not.toHaveBeenCalled();
    expect(guard.restoreKeyValues).not.toHaveBeenCalled();
    expect(report.steps).toBe(0);
    expect(report.done).toEqual(['Vari Comp']);
    expect(report.lines.some((line) => line.includes('Nothing to restore'))).toBe(true);
  });

  it('restores registry keys even when the backup has no file entries', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([], {}, REGISTRY_ENTRIES));

    expect(guard.restoreKeyValues).toHaveBeenCalledTimes(2);
    expect(report.steps).toBe(2);
  });
});
