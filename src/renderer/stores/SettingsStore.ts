import { makeAutoObservable, runInAction } from 'mobx';
import type { AppSettings, SettingsState } from '../../shared/types/app-settings';
import { DEFAULT_SETTINGS } from '../../config/default.config';

/**
 * Renderer mirror of the main-process settings store (RULES.md §5).
 *
 * Read-only from the UI's perspective except through `update()`, which sends
 * the change to main; main persists it and pushes the authoritative state
 * back (applied in `applyState`). Components read it via `observer` and the
 * `useStores` hook; the Preferences page (phase 5) is its main consumer.
 */
export class SettingsStore {
  settings: AppSettings = { ...DEFAULT_SETTINGS };
  dryRunForcedByCli = false;
  effectiveDryRun = false;
  /** False until the first state arrived from main (UI can show a loading state). */
  initialized = false;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Fetch the initial state and subscribe to pushes from main.
   * Called once when the root store is created. Returns the unsubscribe
   * function (kept for completeness; the store lives as long as the window).
   */
  connect(): () => void {
    const unsubscribe = window.api.settings.onChanged((state) => this.applyState(state));
    void window.api.settings.get().then((state) => this.applyState(state));
    return unsubscribe;
  }

  /** Send a partial settings change to main (which persists and pushes back). */
  async update(partial: Partial<AppSettings>): Promise<void> {
    const state = await window.api.settings.update(partial);
    this.applyState(state);
  }

  /** Apply an authoritative state snapshot received from the main process. */
  private applyState(state: SettingsState): void {
    runInAction(() => {
      this.settings = state.settings;
      this.dryRunForcedByCli = state.dryRunForcedByCli;
      this.effectiveDryRun = state.effectiveDryRun;
      this.initialized = true;
    });
  }
}
