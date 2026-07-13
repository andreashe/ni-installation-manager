import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../../src/main/stores/SettingsStore';
import { FsGuard } from '../../../src/main/utils/FsGuard';
import type { LoggerService } from '../../../src/main/services/LoggerService';

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

let rmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rmSpy = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FsGuard', () => {
  it('dry-run: deletes nothing, logs the would-be operation', async () => {
    const settings = new SettingsStore();
    settings.applyPartial({ dryRun: true });
    const logger = makeLogger();
    const guard = new FsGuard(settings, logger as unknown as LoggerService);

    await guard.deleteFile('C:\\x\\file.dll');
    await guard.deleteFolder('C:\\x\\folder');

    expect(rmSpy).not.toHaveBeenCalled();
    const messages = logger.info.mock.calls.map((call) => call[0] as string);
    expect(messages.some((m) => m.startsWith('DRY-RUN: would delete file'))).toBe(true);
    expect(messages.some((m) => m.startsWith('DRY-RUN: would delete folder'))).toBe(true);
  });

  it('CLI-forced dry-run blocks deletion even with the setting off', async () => {
    const settings = new SettingsStore();
    settings.setDryRunForcedByCli(true);
    const guard = new FsGuard(settings, makeLogger() as unknown as LoggerService);

    await guard.deleteFolder('C:\\x');
    expect(rmSpy).not.toHaveBeenCalled();
  });

  it('real mode: deletes file non-recursively and folder recursively', async () => {
    const settings = new SettingsStore();
    const guard = new FsGuard(settings, makeLogger() as unknown as LoggerService);

    await guard.deleteFile('C:\\x\\file.dll');
    expect(rmSpy).toHaveBeenCalledWith('C:\\x\\file.dll', { force: true });

    await guard.deleteFolder('C:\\x\\folder');
    expect(rmSpy).toHaveBeenCalledWith('C:\\x\\folder', { recursive: true, force: true });
  });
});
