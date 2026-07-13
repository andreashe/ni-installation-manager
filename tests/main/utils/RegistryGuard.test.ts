import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../../src/main/stores/SettingsStore';
import { RegistryGuard } from '../../../src/main/utils/RegistryGuard';
import type { LoggerService } from '../../../src/main/services/LoggerService';

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

function makeBackend() {
  return {
    deleteKeyTree: vi.fn().mockResolvedValue(undefined),
    deleteValue: vi.fn().mockResolvedValue(undefined),
    restoreKeyValues: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RegistryGuard', () => {
  it('dry-run: never touches the backend', async () => {
    const settings = new SettingsStore();
    settings.applyPartial({ dryRun: true });
    const backend = makeBackend();
    const guard = new RegistryGuard(settings, makeLogger() as unknown as LoggerService);
    guard.setBackend(backend);

    await guard.deleteKeyTree('SOFTWARE\\NI\\X');
    await guard.deleteValue('SOFTWARE\\NI\\X', 'ContentDir');
    await guard.restoreKeyValues('SOFTWARE\\NI\\X', []);

    expect(backend.deleteKeyTree).not.toHaveBeenCalled();
    expect(backend.deleteValue).not.toHaveBeenCalled();
    expect(backend.restoreKeyValues).not.toHaveBeenCalled();
  });

  it('real mode: delegates to the backend', async () => {
    const settings = new SettingsStore();
    const backend = makeBackend();
    const guard = new RegistryGuard(settings, makeLogger() as unknown as LoggerService);
    guard.setBackend(backend);

    await guard.deleteKeyTree('SOFTWARE\\NI\\X');
    expect(backend.deleteKeyTree).toHaveBeenCalledWith('SOFTWARE\\NI\\X');

    await guard.deleteValue('SOFTWARE\\NI\\X', 'ContentDir');
    expect(backend.deleteValue).toHaveBeenCalledWith('SOFTWARE\\NI\\X', 'ContentDir');

    const values = [{ name: 'ContentVersion', type: 'SZ', value: '1.0' }];
    await guard.restoreKeyValues('SOFTWARE\\NI\\X', values);
    expect(backend.restoreKeyValues).toHaveBeenCalledWith('SOFTWARE\\NI\\X', values);
  });

  it('real mode without a wired backend fails loudly instead of silently skipping', async () => {
    const guard = new RegistryGuard(new SettingsStore(), makeLogger() as unknown as LoggerService);
    await expect(guard.deleteKeyTree('SOFTWARE\\NI\\X')).rejects.toThrow(/no registry backend/);
  });

  it('dry-run works even without a backend (nothing to execute)', async () => {
    const settings = new SettingsStore();
    settings.applyPartial({ dryRun: true });
    const guard = new RegistryGuard(settings, makeLogger() as unknown as LoggerService);
    await expect(guard.deleteKeyTree('SOFTWARE\\NI\\X')).resolves.toBeUndefined();
  });
});
