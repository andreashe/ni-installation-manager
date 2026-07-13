import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';

/**
 * Native dialog IPC (Preferences → backup folder picker). Kept separate
 * from the settings domain: the picker only returns a path, persisting it
 * is the renderer's explicit follow-up call.
 */
export function registerDialogHandlers(): void {
  ipcMain.handle(IpcChannels.dialog.selectFolder, async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(owner as BrowserWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select backup folder',
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
}
