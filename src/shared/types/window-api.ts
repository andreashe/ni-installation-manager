import type { AppSettings, LogLevel, SettingsState } from './app-settings';
import type { LogEntry } from './log-entry';
import type { ProductListState } from './product';
import type { ProductDetailsDto } from './product-details';
import type {
  RenamePattern,
  RestoreAsProductDto,
  RestoreDetailsDto,
  RestoreListState,
} from './restore';
import type { UninstallJobState } from './uninstall';

/**
 * Unsubscribe function returned by every `on*` subscription of the bridge.
 * Calling it removes the underlying `ipcRenderer` listener.
 */
export type Unsubscribe = () => void;

/**
 * The typed API surface exposed to the renderer via `contextBridge`
 * (see `src/main/preload.ts`). This is the ONLY way the renderer talks
 * to the main process — never expose raw `ipcRenderer`.
 */
export interface WindowApi {
  settings: {
    /** Fetch the current settings state (used once at store initialization). */
    get(): Promise<SettingsState>;
    /** Apply a partial settings update; resolves with the resulting state. */
    update(partial: Partial<AppSettings>): Promise<SettingsState>;
    /** Subscribe to settings changes pushed from main. */
    onChanged(listener: (state: SettingsState) => void): Unsubscribe;
  };
  products: {
    /** Fetch the current product list state (used once at store initialization). */
    get(): Promise<ProductListState>;
    /** Trigger a full registry/product rescan (reload button). */
    rescan(): Promise<void>;
    /** Detailed disk/registry facts for one product (details panel); null when unknown. */
    getDetails(productName: string): Promise<ProductDetailsDto | null>;
    /** Subscribe to product list changes pushed from main. */
    onChanged(listener: (state: ProductListState) => void): Unsubscribe;
  };
  restore: {
    /** Fetch the current backup list state (used once at store initialization). */
    get(): Promise<RestoreListState>;
    /** Trigger a backup folder rescan (reload button). */
    rescan(): Promise<void>;
    /** Backup/target facts for one backup (restore details panel); null when unknown. */
    getDetails(backupName: string): Promise<RestoreDetailsDto | null>;
    /** Start a restore job for the given backups (opens the progress page). */
    start(backupNames: string[]): Promise<void>;
    /** Start a restore job with rename patterns applied ("Restore As…", TODO9). */
    startAs(backupNames: string[], patterns: RenamePattern[]): Promise<void>;
    /** Restore targets of the given backups for the Restore As page (TODO9). */
    getAsTargets(backupNames: string[]): Promise<RestoreAsProductDto[]>;
    /** Existence flags (same order) for the given paths — Restore As preview (TODO9). */
    pathsExist(paths: string[]): Promise<boolean[]>;
    /** Load the persisted rename patterns (TODO9). */
    getPatterns(): Promise<RenamePattern[]>;
    /** Persist the rename patterns (TODO9). */
    savePatterns(patterns: RenamePattern[]): Promise<void>;
    /** Subscribe to backup list changes pushed from main. */
    onChanged(listener: (state: RestoreListState) => void): Unsubscribe;
  };
  move: {
    /** Current disk locations of the given installed products — Move page sections (TODO10). */
    getTargets(productNames: string[]): Promise<RestoreAsProductDto[]>;
    /** Start a move job with rename patterns applied (opens the progress page, TODO10). */
    start(productNames: string[], patterns: RenamePattern[]): Promise<void>;
  };
  uninstall: {
    /** Start an uninstall job for the given products (opens the progress page). */
    start(productNames: string[]): Promise<void>;
    /** Start a backup-only job — same progress page, nothing deleted (TODO7). */
    backup(productNames: string[]): Promise<void>;
    /** Dismiss a finished job — resets state to 'idle' and closes the progress page. */
    dismiss(): Promise<void>;
    /** Subscribe to job state pushes from main. */
    onChanged(listener: (state: UninstallJobState) => void): Unsubscribe;
  };
  dialog: {
    /** Native folder picker (Preferences → backup folder); null when cancelled. */
    selectFolder(): Promise<string | null>;
  };
  cache: {
    /** Clear the frontend assets cache; product images fall back to the alt image. */
    clear(): Promise<void>;
  };
  log: {
    /** Forward a renderer-side log message into the central main-process logger. */
    write(level: LogLevel, message: string, source?: string): void;
    /** Truncate all log files (Preferences "Clear Log" button, TODO11). */
    clear(): Promise<void>;
    /** Subscribe to the live stream of log entries written by the central logger. */
    onEntry(listener: (entry: LogEntry) => void): Unsubscribe;
  };
}

declare global {
  interface Window {
    /** Bridge installed by `src/main/preload.ts`. */
    api: WindowApi;
  }
}
