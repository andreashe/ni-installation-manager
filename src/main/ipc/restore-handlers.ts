import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppContext } from '../app-context';
import { sanitizeNames, sanitizePatterns } from './payload-sanitizers';

/**
 * IPC handlers for the restore domain (TODO8): backup list snapshot for
 * store initialization, rescan command (reload button), on-demand details
 * for the restore details panel and starting a restore job. Live updates
 * flow through the `restore:changed` push set up in `store-sync.ts`;
 * job progress through the shared `uninstall:changed` push.
 */
export function registerRestoreHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.restore.get, () => context.restoreStore.toState());

  ipcMain.handle(IpcChannels.restore.rescan, () => {
    // Fire-and-forget: progress/result arrives via the restore:changed push.
    void context.restoreScanService.scan();
  });

  ipcMain.handle(IpcChannels.restore.getDetails, (_event, backupName: unknown) => {
    if (typeof backupName !== 'string' || backupName === '') {
      return null;
    }
    return context.restoreDetailsService.getDetails(backupName);
  });

  ipcMain.handle(IpcChannels.restore.start, (_event, backupNames: unknown) => {
    // Fire-and-forget: state updates arrive via push while the job runs.
    void context.restoreService.start(sanitizeNames(backupNames));
  });

  // "Restore As…" (TODO9): same job, but with rename patterns applied.
  ipcMain.handle(IpcChannels.restore.startAs, (_event, backupNames: unknown, patterns: unknown) => {
    void context.restoreService.start(sanitizeNames(backupNames), sanitizePatterns(patterns));
  });

  ipcMain.handle(IpcChannels.restore.getAsTargets, (_event, backupNames: unknown) =>
    context.restoreAsService.getTargets(sanitizeNames(backupNames)),
  );

  ipcMain.handle(IpcChannels.restore.pathsExist, (_event, paths: unknown) =>
    context.restoreAsService.pathsExist(sanitizeNames(paths)),
  );

  ipcMain.handle(IpcChannels.restore.getPatterns, () => context.restoreAsService.loadPatterns());

  ipcMain.handle(IpcChannels.restore.savePatterns, (_event, patterns: unknown) =>
    context.restoreAsService.savePatterns(sanitizePatterns(patterns)),
  );
}
