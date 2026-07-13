import type { AppSettings } from '../shared/types/app-settings';

/**
 * Default values for all user settings.
 *
 * Used by `SettingsService` when no settings file exists yet and to fill
 * missing keys when loading an older settings file (forward migration).
 */
export const DEFAULT_SETTINGS: AppSettings = {
  dryRun: false,
  backupEnabled: false,
  backupFolder: '',
  ignoreBackupSpaceCheck: false,
  ignoreRestoreSpaceCheck: false,
  ignoreMoveSpaceCheck: false,
  logLevel: 'info',
};

/**
 * CLI argument that forces dry-run mode for the current run without
 * touching the persisted setting. Checked by `SettingsService` at startup.
 */
export const CLI_FLAG_DRY_RUN = '--dry-run';

/**
 * CLI flag that starts the app as headless elevated uninstall worker
 * instead of opening a window (see `src/main/uninstall/uninstall-worker.ts`).
 */
export const CLI_FLAG_UNINSTALL_WORKER = '--uninstall-worker';

/**
 * CLI flag that starts the app as headless elevated restore worker
 * instead of opening a window (see `src/main/restore/restore-worker.ts`).
 */
export const CLI_FLAG_RESTORE_WORKER = '--restore-worker';

/**
 * CLI flag that starts the app as headless elevated move worker
 * instead of opening a window (see `src/main/move/move-worker.ts`).
 */
export const CLI_FLAG_MOVE_WORKER = '--move-worker';

/** CLI argument prefix carrying the job file path for the uninstall/restore/move workers. */
export const CLI_ARG_JOB_FILE_PREFIX = '--job-file=';
