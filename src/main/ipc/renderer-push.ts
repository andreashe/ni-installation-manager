import { BrowserWindow } from 'electron';

/**
 * Broadcast a push message (main → renderer) to every open window.
 *
 * Single helper so push semantics stay in one place; used by the store-sync
 * layer and by `LoggerService` for the live log stream. `payload` must be
 * JSON-serializable (structured-clone compatible).
 */
export function broadcastToRenderers(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}
