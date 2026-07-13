import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { IpcChannels } from '../shared/ipc-channels';
import type { AppSettings, LogLevel, SettingsState } from '../shared/types/app-settings';
import type { LogEntry } from '../shared/types/log-entry';
import type { ProductListState } from '../shared/types/product';
import type { ProductDetailsDto } from '../shared/types/product-details';
import type {
  RenamePattern,
  RestoreAsProductDto,
  RestoreDetailsDto,
  RestoreListState,
} from '../shared/types/restore';
import type { UninstallJobState } from '../shared/types/uninstall';
import type { Unsubscribe, WindowApi } from '../shared/types/window-api';

/**
 * Security boundary between main and renderer (RULES.md §1/§4).
 *
 * Exposes exactly one namespaced, typed API object (`window.api`) via
 * `contextBridge`. Raw `ipcRenderer` is never exposed; every channel name
 * comes from `shared/ipc-channels.ts` and every payload type from
 * `shared/types/`. Renderer code consumes this through the `WindowApi` type.
 */

/** Subscribe to a push channel and return an unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const api: WindowApi = {
  settings: {
    get: (): Promise<SettingsState> => ipcRenderer.invoke(IpcChannels.settings.get),
    update: (partial: Partial<AppSettings>): Promise<SettingsState> =>
      ipcRenderer.invoke(IpcChannels.settings.update, partial),
    onChanged: (listener: (state: SettingsState) => void): Unsubscribe =>
      subscribe(IpcChannels.settings.changed, listener),
  },
  products: {
    get: (): Promise<ProductListState> => ipcRenderer.invoke(IpcChannels.products.get),
    rescan: (): Promise<void> => ipcRenderer.invoke(IpcChannels.products.rescan),
    getDetails: (productName: string): Promise<ProductDetailsDto | null> =>
      ipcRenderer.invoke(IpcChannels.products.getDetails, productName),
    onChanged: (listener: (state: ProductListState) => void): Unsubscribe =>
      subscribe(IpcChannels.products.changed, listener),
  },
  restore: {
    get: (): Promise<RestoreListState> => ipcRenderer.invoke(IpcChannels.restore.get),
    rescan: (): Promise<void> => ipcRenderer.invoke(IpcChannels.restore.rescan),
    getDetails: (backupName: string): Promise<RestoreDetailsDto | null> =>
      ipcRenderer.invoke(IpcChannels.restore.getDetails, backupName),
    start: (backupNames: string[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.restore.start, backupNames),
    startAs: (backupNames: string[], patterns: RenamePattern[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.restore.startAs, backupNames, patterns),
    getAsTargets: (backupNames: string[]): Promise<RestoreAsProductDto[]> =>
      ipcRenderer.invoke(IpcChannels.restore.getAsTargets, backupNames),
    pathsExist: (paths: string[]): Promise<boolean[]> =>
      ipcRenderer.invoke(IpcChannels.restore.pathsExist, paths),
    getPatterns: (): Promise<RenamePattern[]> =>
      ipcRenderer.invoke(IpcChannels.restore.getPatterns),
    savePatterns: (patterns: RenamePattern[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.restore.savePatterns, patterns),
    onChanged: (listener: (state: RestoreListState) => void): Unsubscribe =>
      subscribe(IpcChannels.restore.changed, listener),
  },
  move: {
    getTargets: (productNames: string[]): Promise<RestoreAsProductDto[]> =>
      ipcRenderer.invoke(IpcChannels.move.getTargets, productNames),
    start: (productNames: string[], patterns: RenamePattern[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.move.start, productNames, patterns),
  },
  uninstall: {
    start: (productNames: string[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.uninstall.start, productNames, 'uninstall'),
    backup: (productNames: string[]): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.uninstall.start, productNames, 'backup'),
    dismiss: (): Promise<void> => ipcRenderer.invoke(IpcChannels.uninstall.dismiss),
    onChanged: (listener: (state: UninstallJobState) => void): Unsubscribe =>
      subscribe(IpcChannels.uninstall.changed, listener),
  },
  dialog: {
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.dialog.selectFolder),
  },
  cache: {
    clear: (): Promise<void> => ipcRenderer.invoke(IpcChannels.cache.clear),
  },
  log: {
    write: (level: LogLevel, message: string, source?: string): void => {
      ipcRenderer.send(IpcChannels.log.fromRenderer, level, message, source);
    },
    clear: (): Promise<void> => ipcRenderer.invoke(IpcChannels.log.clear),
    onEntry: (listener: (entry: LogEntry) => void): Unsubscribe =>
      subscribe(IpcChannels.log.entry, listener),
    getFiles: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.log.files),
    readFile: (fileName: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannels.log.read, fileName),
  },
};

contextBridge.exposeInMainWorld('api', api);
