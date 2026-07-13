import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppContext } from '../app-context';

/**
 * IPC handlers for the products domain: list snapshot for store
 * initialization and the rescan command (reload button). Live updates flow
 * through the push channel set up in `store-sync.ts`, not through these.
 */
export function registerProductHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.products.get, () => context.productStore.toState());

  ipcMain.handle(IpcChannels.products.rescan, () => {
    // Fire-and-forget: progress/result arrives via the products:changed push.
    // The reload button forces FRESH sizes: drop the whole disk usage cache
    // before scanning (TODO11) — the startup scan keeps it.
    void context.productDiskUsageCache.clear().then(() => context.productScanService.scan());
  });

  ipcMain.handle(IpcChannels.products.getDetails, (_event, productName: unknown) => {
    if (typeof productName !== 'string' || productName === '') {
      return null;
    }
    return context.productDetailsService.getDetails(productName);
  });
}
