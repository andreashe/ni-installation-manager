import { app } from 'electron';
import path from 'node:path';

/**
 * Centralized path constants for the main process (RULES.md §13).
 *
 * All functions resolve lazily because `app.getPath('userData')` is only
 * reliable after the Electron `app` module is initialized. Never hardcode
 * these locations in feature code — always import from here.
 *
 * NOTE: main-process only (imports `electron`); do not import from renderer.
 */

/** JSON file holding the persisted user settings (see `SettingsService`). */
export function getSettingsFilePath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** Folder where log files are written by `LoggerService`. */
export function getLogFolderPath(): string {
  return path.join(app.getPath('userData'), 'logs');
}

/** Current log file inside the log folder. */
export function getLogFilePath(): string {
  return path.join(getLogFolderPath(), 'ni-installation-manager.log');
}

/** Log file of the elevated uninstall worker. */
export function getUninstallWorkerLogFilePath(): string {
  return path.join(getLogFolderPath(), 'uninstall-worker.log');
}

/** Log file of the elevated restore worker. */
export function getRestoreWorkerLogFilePath(): string {
  return path.join(getLogFolderPath(), 'restore-worker.log');
}

/** Log file of the elevated move worker. */
export function getMoveWorkerLogFilePath(): string {
  return path.join(getLogFolderPath(), 'move-worker.log');
}

/**
 * Frontend assets cache: product artwork found on disk is copied here so
 * the renderer can display it (see `ArtworkCacheService`, PLAN.md §2.3).
 */
export function getFrontendAssetsCachePath(): string {
  return path.join(app.getPath('userData'), 'assets-cache');
}

/**
 * Working folder for uninstall jobs: job description + progress file
 * exchanged between the main process and the elevated worker.
 */
export function getUninstallJobsPath(): string {
  return path.join(app.getPath('userData'), 'uninstall-jobs');
}

/**
 * JSON file persisting the "Restore As…" rename patterns (TODO9) — its own
 * file alongside the settings, reloaded whenever the page opens.
 */
export function getRenamePatternsFilePath(): string {
  return path.join(app.getPath('userData'), 'rename-patterns.json');
}

/**
 * Cache folder for resolved per-product disk usage (TODO11): one JSON file
 * per product, named by the MD5 of the product name (see
 * `ProductDiskUsageCache`).
 */
export function getProductDiskUsageCachePath(): string {
  return path.join(app.getPath('userData'), 'ProductDiskUsageCache');
}
