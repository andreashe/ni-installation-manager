/**
 * Central registry of ALL IPC channel names.
 *
 * Rule (RULES.md §4): no magic strings — every channel used with
 * `ipcMain.handle` / `ipcRenderer.invoke` / `webContents.send` /
 * `ipcRenderer.on` must be defined here and imported by both sides.
 *
 * Naming convention: `<domain>:<action>` for commands/queries
 * (renderer → main) and `<domain>:<event>` for pushes (main → renderer).
 */
export const IpcChannels = {
  settings: {
    /** Query (invoke): renderer requests the current settings state. */
    get: 'settings:get',
    /** Command (invoke): renderer submits a partial settings update. */
    update: 'settings:update',
    /** Push (send): main broadcasts the new settings state after any change. */
    changed: 'settings:changed',
  },
  products: {
    /** Query (invoke): renderer requests the current product list state. */
    get: 'products:get',
    /** Command (invoke): renderer requests a full rescan (reload button). */
    rescan: 'products:rescan',
    /** Query (invoke): detailed disk/registry facts for one product (details panel). */
    getDetails: 'products:get-details',
    /** Push (send): main broadcasts the product list state after any change. */
    changed: 'products:changed',
  },
  restore: {
    /** Query (invoke): renderer requests the current backup list state. */
    get: 'restore:get',
    /** Command (invoke): renderer requests a backup folder rescan (reload button). */
    rescan: 'restore:rescan',
    /** Query (invoke): backup/target facts for one backup (restore details panel). */
    getDetails: 'restore:get-details',
    /** Command (invoke): start a restore job for the given backup names. */
    start: 'restore:start',
    /** Command (invoke): start a restore job with rename patterns applied (TODO9). */
    startAs: 'restore:start-as',
    /** Query (invoke): restore targets of the given backups for the Restore As page (TODO9). */
    getAsTargets: 'restore:get-as-targets',
    /** Query (invoke): which of the given paths exist on disk (Restore As preview, TODO9). */
    pathsExist: 'restore:paths-exist',
    /** Query (invoke): load the persisted rename patterns (TODO9). */
    getPatterns: 'restore:get-patterns',
    /** Command (invoke): persist the rename patterns (TODO9). */
    savePatterns: 'restore:save-patterns',
    /** Push (send): main broadcasts the backup list state after any change. */
    changed: 'restore:changed',
  },
  move: {
    /** Query (invoke): current disk locations of the given products for the Move page (TODO10). */
    getTargets: 'move:get-targets',
    /** Command (invoke): start a move job with rename patterns applied (TODO10). */
    start: 'move:start',
  },
  uninstall: {
    /** Command (invoke): start an uninstall job for the given product names. */
    start: 'uninstall:start',
    /** Command (invoke): dismiss a finished job (progress page CLOSE button). */
    dismiss: 'uninstall:dismiss',
    /** Push (send): main broadcasts the job state on every progress update. */
    changed: 'uninstall:changed',
  },
  dialog: {
    /** Query (invoke): open a native folder picker; resolves with the path or null. */
    selectFolder: 'dialog:select-folder',
  },
  cache: {
    /** Command (invoke): clear the frontend assets cache (Preferences button). */
    clear: 'cache:clear',
  },
  log: {
    /** Command (send, fire-and-forget): renderer forwards a log message into the central logger. */
    fromRenderer: 'log:from-renderer',
    /** Command (invoke): truncate all log files (Preferences "Clear Log" button, TODO11). */
    clear: 'log:clear',
    /** Push (send): main streams every written log entry to the renderer log panel. */
    entry: 'log:entry',
    /** Command (invoke): list the log file names for the log panel's file tabs. */
    files: 'log:files',
    /** Command (invoke): read the tail of one log file (by name) for the log panel. */
    read: 'log:read',
  },
} as const;
