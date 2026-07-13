import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../../src/main/stores/SettingsStore';

describe('SettingsStore', () => {
  it('starts with defaults and dry-run not forced', () => {
    const store = new SettingsStore();
    expect(store.settings.dryRun).toBe(false);
    expect(store.dryRunForcedByCli).toBe(false);
    expect(store.effectiveDryRun).toBe(false);
  });

  it('effectiveDryRun is true when the persisted setting is on', () => {
    const store = new SettingsStore();
    store.applyPartial({ dryRun: true });
    expect(store.effectiveDryRun).toBe(true);
  });

  it('effectiveDryRun is true when forced by CLI even if the setting is off', () => {
    const store = new SettingsStore();
    store.setDryRunForcedByCli(true);
    expect(store.settings.dryRun).toBe(false);
    expect(store.effectiveDryRun).toBe(true);
  });

  it('applyPartial merges without dropping other settings', () => {
    const store = new SettingsStore();
    store.applyPartial({ backupFolder: 'D:\\backup' });
    store.applyPartial({ backupEnabled: true });
    expect(store.settings.backupFolder).toBe('D:\\backup');
    expect(store.settings.backupEnabled).toBe(true);
    expect(store.settings.logLevel).toBe('info');
  });

  it('toState reports the effective flag and CLI origin', () => {
    const store = new SettingsStore();
    store.setDryRunForcedByCli(true);
    const state = store.toState();
    expect(state.effectiveDryRun).toBe(true);
    expect(state.dryRunForcedByCli).toBe(true);
    expect(state.settings).not.toBe(store.settings); // copy, not the live object
  });
});
