import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppSettings } from '../../shared/types/app-settings';
import { LOG_LEVELS } from '../../shared/types/app-settings';
import type { AppContext } from '../app-context';

/**
 * IPC handlers for the settings domain (thin adapters, RULES.md §3/§4):
 * validate renderer input, delegate to `SettingsService`/`SettingsStore`,
 * return serializable DTOs. Registered once by `registerAllIpcHandlers`.
 */
export function registerSettingsHandlers(context: AppContext): void {
  ipcMain.handle(IpcChannels.settings.get, () => context.settingsStore.toState());

  ipcMain.handle(IpcChannels.settings.update, (_event, partial: unknown) => {
    return context.settingsService.update(sanitizeSettingsPartial(partial));
  });
}

/**
 * Validate an untrusted partial-settings payload from the renderer: only
 * known keys with correct types survive; everything else is dropped.
 */
function sanitizeSettingsPartial(raw: unknown): Partial<AppSettings> {
  const result: Partial<AppSettings> = {};
  if (typeof raw !== 'object' || raw === null) {
    return result;
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.dryRun === 'boolean') {
    result.dryRun = candidate.dryRun;
  }
  if (typeof candidate.backupEnabled === 'boolean') {
    result.backupEnabled = candidate.backupEnabled;
  }
  if (typeof candidate.backupFolder === 'string') {
    result.backupFolder = candidate.backupFolder;
  }
  if (typeof candidate.ignoreBackupSpaceCheck === 'boolean') {
    result.ignoreBackupSpaceCheck = candidate.ignoreBackupSpaceCheck;
  }
  if (
    typeof candidate.logLevel === 'string' &&
    (LOG_LEVELS as readonly string[]).includes(candidate.logLevel)
  ) {
    result.logLevel = candidate.logLevel as AppSettings['logLevel'];
  }
  return result;
}
