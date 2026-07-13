import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppContext } from '../app-context';

/**
 * IPC handler for the cache domain: the Preferences "Clear cache" button
 * (TODO6) removes the cached product images AND the product disk usage
 * cache files (TODO11). The resulting artwork resets reach the renderer
 * through the regular products push.
 */
export function registerCacheHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.cache.clear, async () => {
    await context.artworkCacheService.clearCache();
    await context.productDiskUsageCache.clear();
  });
}
