import { makeAutoObservable } from 'mobx';
import type { AppSettings, SettingsState } from '../../shared/types/app-settings';
import { DEFAULT_SETTINGS } from '../../config/default.config';

/**
 * Main-process source of truth for user settings (MobX observable).
 *
 * Filled by `SettingsService` at startup and updated through it whenever the
 * renderer changes a preference. Observed by the store-sync layer
 * (`src/main/ipc/store-sync.ts`) which pushes every change to the renderer,
 * and by services that react to setting changes (e.g. `LoggerService`
 * adjusting its level, the guards reading the dry-run flag).
 */
export class SettingsStore {
  /** Persisted user settings (mirrors the settings JSON file). */
  settings: AppSettings = { ...DEFAULT_SETTINGS };

  /** True when the app was started with `--dry-run`; never persisted. */
  dryRunForcedByCli = false;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Effective dry-run flag consumed by `FsGuard`/`RegistryGuard`:
   * active when either the persisted setting or the CLI override says so.
   */
  get effectiveDryRun(): boolean {
    return this.settings.dryRun || this.dryRunForcedByCli;
  }

  /** Replace the whole settings object (used by `SettingsService.load`). */
  replaceSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  /** Merge a partial update into the settings (used by `SettingsService.update`). */
  applyPartial(partial: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...partial };
  }

  /** Mark dry-run as forced for this run (set once at startup from CLI args). */
  setDryRunForcedByCli(forced: boolean): void {
    this.dryRunForcedByCli = forced;
  }

  /** Serializable snapshot sent over IPC to the renderer mirror store. */
  toState(): SettingsState {
    return {
      settings: { ...this.settings },
      dryRunForcedByCli: this.dryRunForcedByCli,
      effectiveDryRun: this.effectiveDryRun,
    };
  }
}
