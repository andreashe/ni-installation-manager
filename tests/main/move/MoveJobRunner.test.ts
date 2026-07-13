import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoveJobRunner } from '../../../src/main/move/MoveJobRunner';
import type { MoveEntrySpec, MoveJobSpec } from '../../../src/main/move/move-job';
import type { UninstallProgressReporter } from '../../../src/main/uninstall/uninstall-job';
import type { RegistryGuard } from '../../../src/main/utils/RegistryGuard';
import type { RegistryValueDto } from '../../../src/shared/types/product';

let mkdirSpy: ReturnType<typeof vi.spyOn>;
let renameSpy: ReturnType<typeof vi.spyOn>;
let cpSpy: ReturnType<typeof vi.spyOn>;
let rmSpy: ReturnType<typeof vi.spyOn>;
let statfsSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mkdirSpy = vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  renameSpy = vi.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
  cpSpy = vi.spyOn(fs.promises, 'cp').mockResolvedValue(undefined);
  rmSpy = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
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

function makeRunner(report: UninstallProgressReporter) {
  const guard = { restoreKeyValues: vi.fn().mockResolvedValue(undefined) };
  return { runner: new MoveJobRunner(guard as unknown as RegistryGuard, report), guard };
}

function entry(sourcePath: string, targetPath: string, sizeBytes = 100): MoveEntrySpec {
  return { kind: 'ContentDir', sourcePath, targetPath, sizeBytes };
}

function spec(
  entries: MoveEntrySpec[],
  overrides: Partial<MoveJobSpec> = {},
  registryUpdates: Record<string, RegistryValueDto[]> = {},
): MoveJobSpec {
  return {
    dryRun: false,
    ignoreSpaceCheck: false,
    products: [{ name: 'Vari Comp', version: '1.0', registryUpdates, entries }],
    ...overrides,
  };
}

const REGISTRY_UPDATES: Record<string, RegistryValueDto[]> = {
  'SOFTWARE\\Native Instruments\\Vari Comp': [
    { name: 'ContentDir', type: 'SZ', value: 'E:\\Moved\\Vari Comp' },
  ],
  'SOFTWARE\\WOW6432Node\\Native Instruments\\Vari Comp': [
    { name: 'ContentDir', type: 'SZ', value: 'E:\\Moved\\Vari Comp' },
  ],
};

describe('MoveJobRunner (TODO10)', () => {
  it('renames every entry to its target and reports one step each', async () => {
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(
      spec([entry('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp'), entry('D:\\VST3\\x.vst3', 'E:\\VST3\\x.vst3')]),
    );

    expect(renameSpy).toHaveBeenCalledTimes(2);
    expect(renameSpy).toHaveBeenCalledWith('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp');
    expect(mkdirSpy).toHaveBeenCalledWith(path.dirname('E:\\Moved\\Vari Comp'), { recursive: true });
    expect(cpSpy).not.toHaveBeenCalled();
    expect(rmSpy).not.toHaveBeenCalled();
    expect(report.steps).toBe(2);
    expect(report.done).toEqual(['Vari Comp']);
  });

  it('falls back to copy + delete-source when rename fails (cross-device / target exists)', async () => {
    renameSpy.mockRejectedValue(Object.assign(new Error('EXDEV'), { code: 'EXDEV' }));
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp')]));

    expect(cpSpy).toHaveBeenCalledWith('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp', {
      recursive: true,
      force: true,
    });
    expect(rmSpy).toHaveBeenCalledWith('D:\\NI\\Vari Comp', { recursive: true, force: true });
    expect(report.steps).toBe(1);
  });

  it('updates the changed registry keys through the guard AFTER the file moves, one step each', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([entry('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp')], {}, REGISTRY_UPDATES));

    expect(guard.restoreKeyValues).toHaveBeenCalledTimes(2);
    expect(guard.restoreKeyValues).toHaveBeenCalledWith(
      'SOFTWARE\\Native Instruments\\Vari Comp',
      REGISTRY_UPDATES['SOFTWARE\\Native Instruments\\Vari Comp'],
    );
    // 1 file entry + 2 registry keys.
    expect(report.steps).toBe(3);
  });

  it('does not touch the registry when a file move fails', async () => {
    renameSpy.mockRejectedValue(new Error('EXDEV'));
    cpSpy.mockRejectedValue(new Error('disk error'));
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await expect(
      runner.run(spec([entry('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp')], {}, REGISTRY_UPDATES)),
    ).rejects.toThrow('disk error');
    expect(guard.restoreKeyValues).not.toHaveBeenCalled();
  });

  it('dry-run only logs the would-be moves and registry updates, nothing is executed', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(
      spec([entry('D:\\NI\\Vari Comp', 'E:\\Moved\\Vari Comp')], { dryRun: true }, REGISTRY_UPDATES),
    );

    expect(renameSpy).not.toHaveBeenCalled();
    expect(cpSpy).not.toHaveBeenCalled();
    expect(rmSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(statfsSpy).not.toHaveBeenCalled();
    expect(guard.restoreKeyValues).not.toHaveBeenCalled();
    expect(report.steps).toBe(3);
    expect(report.lines.some((line) => line.startsWith('DRY-RUN: would move D:'))).toBe(true);
    expect(report.lines.some((line) => line.includes('would update registry key HKLM\\'))).toBe(true);
  });

  it('sums required space per TARGET device for CROSS-device entries only', async () => {
    statfsSpy.mockImplementation(async (device: fs.PathLike) =>
      String(device).toUpperCase().startsWith('E:')
        ? ({ bavail: 0, bsize: 512 } as fs.StatsFs) // E: full
        : ({ bavail: 1_000_000, bsize: 4096 } as fs.StatsFs),
    );
    const report = reporter();
    const { runner } = makeRunner(report);
    await expect(
      runner.run(
        spec([
          entry('D:\\NI\\A', 'D:\\Moved\\A', 100), // same device — rename, no space needed
          entry('D:\\NI\\B', 'E:\\Moved\\B', 200), // cross-device onto full E:
        ]),
      ),
    ).rejects.toThrow(/Not enough free space on target device\(s\): E:\\/);
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it('passes the space check when only same-device entries exist (rename needs no space)', async () => {
    statfsSpy.mockResolvedValue({ bavail: 0, bsize: 512 } as fs.StatsFs); // everything full
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('D:\\NI\\A', 'D:\\Moved\\A', 100)]));

    expect(statfsSpy).not.toHaveBeenCalled();
    expect(renameSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the space check when ignoreSpaceCheck is set', async () => {
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('D:\\NI\\A', 'E:\\Moved\\A')], { ignoreSpaceCheck: true }));

    expect(statfsSpy).not.toHaveBeenCalled();
    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(report.lines.some((line) => line.includes('Free-space check skipped'))).toBe(true);
  });

  it('continues with a warning when free space cannot be determined', async () => {
    statfsSpy.mockRejectedValue(new Error('unsupported'));
    const report = reporter();
    const { runner } = makeRunner(report);
    await runner.run(spec([entry('D:\\NI\\A', 'E:\\Moved\\A')]));

    expect(renameSpy).toHaveBeenCalledTimes(1);
    expect(report.lines.some((line) => line.includes('could not determine free space'))).toBe(true);
  });

  it('reports products where no path changed without failing', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([]));

    expect(renameSpy).not.toHaveBeenCalled();
    expect(guard.restoreKeyValues).not.toHaveBeenCalled();
    expect(report.steps).toBe(0);
    expect(report.done).toEqual(['Vari Comp']);
    expect(report.lines.some((line) => line.includes('Nothing to move'))).toBe(true);
  });

  it('updates registry keys even when no file entry exists (registry-only change)', async () => {
    const report = reporter();
    const { runner, guard } = makeRunner(report);
    await runner.run(spec([], {}, REGISTRY_UPDATES));

    expect(guard.restoreKeyValues).toHaveBeenCalledTimes(2);
    expect(report.steps).toBe(2);
  });
});
