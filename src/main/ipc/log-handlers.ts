import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import { LOG_LEVELS } from '../../shared/types/app-settings';
import type { LogLevel } from '../../shared/types/app-settings';
import type { AppContext } from '../app-context';

/**
 * IPC handlers for the log domain: forwarding renderer log messages into
 * the central `LoggerService` (RULES.md §9: one log sink for both
 * processes; fire-and-forget via `ipcMain.on`) and clearing the log files
 * (Preferences "Clear Log" button, TODO11).
 */
export function registerLogHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.log.clear, () => context.logger.clearLogFiles());

  ipcMain.on(
    IpcChannels.log.fromRenderer,
    (_event, level: unknown, message: unknown, source: unknown) => {
      const safeLevel: LogLevel =
        typeof level === 'string' && (LOG_LEVELS as readonly string[]).includes(level)
          ? (level as LogLevel)
          : 'info';
      const safeSource = typeof source === 'string' && source.length > 0 ? `renderer:${source}` : 'renderer';
      context.logger.write(safeLevel, String(message), safeSource);
    },
  );
}
