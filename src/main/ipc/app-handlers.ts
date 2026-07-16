import { app, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';

/**
 * IPC handlers for the app domain: application metadata for the renderer.
 * `app.getVersion()` reads the version from `package.json` in dev and from
 * the packaged app metadata in production — the About page shows it without
 * duplicating the version anywhere in source.
 */
export function registerAppHandlers(): void {
  ipcMain.handle(IpcChannels.app.getVersion, () => app.getVersion());
}
