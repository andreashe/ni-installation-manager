import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, SettingsState } from '../../shared/types/app-settings';
import { CLI_FLAG_DRY_RUN, DEFAULT_SETTINGS } from '../../config/default.config';
import type { LoggerService } from './LoggerService';
import type { SettingsStore } from '../stores/SettingsStore';

const LOG_SOURCE = 'SettingsService';

/**
 * Loads and persists user settings (PLAN.md §6, RULES.md §12).
 *
 * Owns the settings JSON file in the Electron `userData` folder and is the
 * only writer of `SettingsStore`. Called at startup (load) and from the
 * settings IPC handler whenever the renderer changes a preference (update →
 * persist immediately).
 */
export class SettingsService {
  constructor(
    private readonly store: SettingsStore,
    private readonly logger: LoggerService,
    private readonly settingsFilePath: string,
  ) {}

  /**
   * Load persisted settings into the store, filling missing keys with
   * defaults (forward migration for older files). Also applies the
   * `--dry-run` CLI override. Must run before the window is created so the
   * renderer never sees uninitialized settings.
   */
  load(cliArgs: readonly string[]): void {
    let fromDisk: Partial<AppSettings> = {};
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        fromDisk = JSON.parse(fs.readFileSync(this.settingsFilePath, 'utf8')) as Partial<AppSettings>;
      }
    } catch (error) {
      this.logger.warn(
        `Could not read settings file (${String(error)}); falling back to defaults`,
        LOG_SOURCE,
      );
    }

    this.store.replaceSettings({ ...DEFAULT_SETTINGS, ...fromDisk });
    this.store.setDryRunForcedByCli(cliArgs.includes(CLI_FLAG_DRY_RUN));

    if (this.store.dryRunForcedByCli) {
      this.logger.info(`Dry-run forced by CLI flag ${CLI_FLAG_DRY_RUN}`, LOG_SOURCE);
    }
    this.logger.debug(`Settings loaded from ${this.settingsFilePath}`, LOG_SOURCE);
  }

  /**
   * Apply a partial update coming from the Preferences page, persist it
   * immediately and return the resulting state (which the IPC handler sends
   * back to the renderer).
   */
  update(partial: Partial<AppSettings>): SettingsState {
    this.store.applyPartial(partial);
    this.persist();
    this.logger.info(`Settings updated: ${JSON.stringify(partial)}`, LOG_SOURCE);
    return this.store.toState();
  }

  /** Write the current store content to the settings JSON file. */
  private persist(): void {
    fs.mkdirSync(path.dirname(this.settingsFilePath), { recursive: true });
    fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.store.settings, null, 2), 'utf8');
  }
}
