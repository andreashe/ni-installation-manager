import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppContext } from '../app-context';
import { sanitizeNames, sanitizePatterns } from './payload-sanitizers';

/**
 * IPC handlers for the move domain (TODO10): current disk locations of the
 * selected installed products for the Move page and starting a move job.
 * Rename patterns and path-existence checks reuse the restore channels —
 * both pages share the same persisted pattern file. Job progress flows
 * through the shared `uninstall:changed` push.
 */
export function registerMoveHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.move.getTargets, (_event, productNames: unknown) =>
    context.moveService.getTargets(sanitizeNames(productNames)),
  );

  ipcMain.handle(IpcChannels.move.start, (_event, productNames: unknown, patterns: unknown) => {
    // Fire-and-forget: state updates arrive via push while the job runs.
    void context.moveService.start(sanitizeNames(productNames), sanitizePatterns(patterns));
  });
}
