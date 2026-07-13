import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppContext } from '../app-context';

/**
 * IPC handlers for the uninstall domain: start a job (validated product
 * names) and dismiss a finished one. Progress flows through the
 * `uninstall:changed` push set up in `store-sync.ts`.
 */
export function registerUninstallHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.uninstall.start, (_event, productNames: unknown, mode: unknown) => {
    const names = Array.isArray(productNames)
      ? productNames.filter((name): name is string => typeof name === 'string')
      : [];
    const safeMode = mode === 'backup' ? 'backup' : 'uninstall';
    // Fire-and-forget: state updates arrive via push while the job runs.
    void context.uninstallService.start(names, safeMode);
  });

  ipcMain.handle(IpcChannels.uninstall.dismiss, () => {
    context.uninstallService.dismiss();
  });
}
