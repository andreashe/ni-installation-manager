import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../../src/main/services/SettingsService';
import { SettingsStore } from '../../../src/main/stores/SettingsStore';
import type { LoggerService } from '../../../src/main/services/LoggerService';

vi.mock('../../../src/main/ipc/renderer-push', () => ({ broadcastToRenderers: vi.fn() }));

const SETTINGS_FILE = 'C:\\fake\\userData\\settings.json';

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

/** Content of the fake settings file; null = file does not exist. */
let fileContent: string | null;
let written: string | null;

beforeEach(() => {
  fileContent = null;
  written = null;
  vi.spyOn(fs, 'existsSync').mockImplementation(() => fileContent !== null);
  vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
    if (fileContent === null) throw new Error('ENOENT');
    return fileContent;
  });
  vi.spyOn(fs, 'writeFileSync').mockImplementation((_path, data) => {
    written = String(data);
  });
  vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeService(store = new SettingsStore()) {
  return { store, service: new SettingsService(store, makeLogger() as unknown as LoggerService, SETTINGS_FILE) };
}

describe('SettingsService.load', () => {
  it('uses defaults when no settings file exists', () => {
    const { store, service } = makeService();
    service.load([]);
    expect(store.settings).toEqual({
      dryRun: false,
      backupEnabled: false,
      backupFolder: '',
      deleteUserRegistryData: false,
      ignoreBackupSpaceCheck: false,
      ignoreRestoreSpaceCheck: false,
      ignoreMoveSpaceCheck: false,
      alwaysFullArtworkScan: false,
      logLevel: 'info',
      bookmarkedProducts: [],
    });
  });

  it('merges the file over defaults (forward migration for old files)', () => {
    fileContent = JSON.stringify({ dryRun: true }); // older file without newer keys
    const { store, service } = makeService();
    service.load([]);
    expect(store.settings.dryRun).toBe(true);
    expect(store.settings.logLevel).toBe('info'); // filled from defaults
  });

  it('falls back to defaults on a corrupt file instead of crashing', () => {
    fileContent = '{not json';
    const { store, service } = makeService();
    service.load([]);
    expect(store.settings.dryRun).toBe(false);
  });

  it('applies the --dry-run CLI flag as volatile override', () => {
    const { store, service } = makeService();
    service.load(['electron.exe', '--dry-run']);
    expect(store.dryRunForcedByCli).toBe(true);
    expect(store.settings.dryRun).toBe(false); // persisted value untouched
  });
});

describe('SettingsService.update', () => {
  it('applies the partial, persists immediately and returns the new state', () => {
    const { store, service } = makeService();
    service.load([]);
    const state = service.update({ backupEnabled: true, backupFolder: 'D:\\Backup' });

    expect(state.settings.backupEnabled).toBe(true);
    expect(store.settings.backupFolder).toBe('D:\\Backup');
    expect(written).not.toBeNull();
    expect(JSON.parse(written as string).backupFolder).toBe('D:\\Backup');
  });

  it('persists bookmarked products and loads them back', () => {
    const { service } = makeService();
    service.load([]);
    service.update({ bookmarkedProducts: ['Kontakt 7', 'Massive X'] });
    expect(JSON.parse(written as string).bookmarkedProducts).toEqual(['Kontakt 7', 'Massive X']);

    fileContent = written;
    const { store: reloaded, service: second } = makeService();
    second.load([]);
    expect(reloaded.settings.bookmarkedProducts).toEqual(['Kontakt 7', 'Massive X']);
  });
});
