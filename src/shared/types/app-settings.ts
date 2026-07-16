/**
 * Log severity levels accepted by the central logger.
 * Order matters: a configured level includes everything at or above it.
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * User-configurable application settings.
 *
 * Persisted as JSON in the Electron `userData` folder by the main-process
 * `SettingsService` and edited from the renderer Preferences page.
 * Currently boolean values render as toggles; other types may be added later.
 */
export interface AppSettings {
  /** When true, destructive file/registry operations are only logged, never executed. */
  dryRun: boolean;
  /** When true, product folders and registry entries are backed up before uninstalling. */
  backupEnabled: boolean;
  /** Target folder for uninstall backups. Empty string means "not configured". */
  backupFolder: string;
  /**
   * When true, uninstall also deletes the product's per-user registry key
   * (`HKCU\SOFTWARE\Native Instruments\<name>`). Off by default: the key is
   * always shown in details and included in backup/restore, but only
   * deleted with this opt-in (TODO12).
   */
  deleteUserRegistryData: boolean;
  /** When true, the free-space check before a backup is skipped (TODO7). */
  ignoreBackupSpaceCheck: boolean;
  /** When true, the per-device free-space check before a restore is skipped (TODO8). */
  ignoreRestoreSpaceCheck: boolean;
  /** When true, the per-device free-space check before a move is skipped (TODO10). */
  ignoreMoveSpaceCheck: boolean;
  /** Minimum severity written by the central logger. */
  logLevel: LogLevel;
  /**
   * Names of products the user bookmarked on the Installed page. Persisted
   * with the other settings so bookmarks survive restarts; toggled from the
   * product rows and used by the bookmark filter in the list toolbar.
   */
  bookmarkedProducts: string[];
}

/**
 * Full settings state as exposed to the renderer.
 *
 * Wraps the persisted settings and the volatile CLI override so the UI can
 * show why dry-run is active even when the stored setting is off.
 */
export interface SettingsState {
  /** The persisted user settings. */
  settings: AppSettings;
  /** True when the app was started with the `--dry-run` argument. */
  dryRunForcedByCli: boolean;
  /** Effective dry-run flag: persisted setting OR CLI override. */
  effectiveDryRun: boolean;
}
