import type { AppContext } from '../app-context';
import { registerCacheHandlers } from './cache-handlers';
import { registerDialogHandlers } from './dialog-handlers';
import { registerLogHandlers } from './log-handlers';
import { registerMoveHandlers } from './move-handlers';
import { registerProductHandlers } from './product-handlers';
import { registerRestoreHandlers } from './restore-handlers';
import { registerSettingsHandlers } from './settings-handlers';
import { registerUninstallHandlers } from './uninstall-handlers';

/**
 * Central registration point for all IPC handlers. New IPC domains
 * (products, uninstall, …) add their `register*Handlers` call here so
 * `main.ts` stays bootstrap-only.
 */
export function registerAllIpcHandlers(context: AppContext): void {
  registerSettingsHandlers(context);
  registerProductHandlers(context);
  registerUninstallHandlers(context);
  registerRestoreHandlers(context);
  registerMoveHandlers(context);
  registerCacheHandlers(context);
  registerDialogHandlers();
  registerLogHandlers(context);
}
