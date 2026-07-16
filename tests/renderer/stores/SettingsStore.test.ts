import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../../src/renderer/stores/SettingsStore';
import { DEFAULT_SETTINGS } from '../../../src/config/default.config';
import type { AppSettings, SettingsState } from '../../../src/shared/types/app-settings';

const update = vi.fn();

/** Main-process behavior stub: merge the partial and echo the new state back. */
function stateFor(settings: AppSettings): SettingsState {
  return { settings, dryRunForcedByCli: false, effectiveDryRun: settings.dryRun };
}

let current: AppSettings;

beforeEach(() => {
  current = { ...DEFAULT_SETTINGS, bookmarkedProducts: ['Kontakt 7'] };
  update.mockReset().mockImplementation((partial: Partial<AppSettings>) => {
    current = { ...current, ...partial };
    return Promise.resolve(stateFor(current));
  });
  vi.stubGlobal('window', { api: { settings: { update, get: vi.fn(), onChanged: vi.fn() } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Store seeded like after the first pushed state from main. */
function makeStore(): SettingsStore {
  const store = new SettingsStore();
  store.settings = { ...current };
  return store;
}

describe('SettingsStore bookmarks', () => {
  it('isBookmarked reflects the persisted list', () => {
    const store = makeStore();
    expect(store.isBookmarked('Kontakt 7')).toBe(true);
    expect(store.isBookmarked('Massive X')).toBe(false);
  });

  it('toggleBookmark adds a missing product and persists via IPC', async () => {
    const store = makeStore();
    await store.toggleBookmark('Massive X');
    expect(update).toHaveBeenCalledWith({ bookmarkedProducts: ['Kontakt 7', 'Massive X'] });
    expect(store.isBookmarked('Massive X')).toBe(true);
  });

  it('toggleBookmark removes an existing product (un-bookmark)', async () => {
    const store = makeStore();
    await store.toggleBookmark('Kontakt 7');
    expect(update).toHaveBeenCalledWith({ bookmarkedProducts: [] });
    expect(store.isBookmarked('Kontakt 7')).toBe(false);
  });
});
