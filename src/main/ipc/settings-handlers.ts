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

/** All boolean settings keys — accepted 1:1 when the payload type matches. */
const BOOLEAN_SETTING_KEYS = [
  'dryRun',
  'backupEnabled',
  'deleteUserRegistryData',
  'ignoreBackupSpaceCheck',
  'ignoreRestoreSpaceCheck',
  'ignoreMoveSpaceCheck',
  'alwaysFullArtworkScan',
] as const;

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
  for (const key of BOOLEAN_SETTING_KEYS) {
    if (typeof candidate[key] === 'boolean') {
      result[key] = candidate[key] as boolean;
    }
  }
  if (typeof candidate.backupFolder === 'string') {
    result.backupFolder = candidate.backupFolder;
  }
  if (
    typeof candidate.logLevel === 'string' &&
    (LOG_LEVELS as readonly string[]).includes(candidate.logLevel)
  ) {
    result.logLevel = candidate.logLevel as AppSettings['logLevel'];
  }
  if (
    Array.isArray(candidate.bookmarkedProducts) &&
    candidate.bookmarkedProducts.every((entry) => typeof entry === 'string')
  ) {
    result.bookmarkedProducts = [...new Set(candidate.bookmarkedProducts as string[])];
  }
  return result;
}
