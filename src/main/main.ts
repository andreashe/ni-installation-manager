import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { createAppContext } from './app-context';
import { registerAllIpcHandlers } from './ipc/ipc-registrar';
import { startStoreSync } from './ipc/store-sync';
import { runMoveWorker } from './move/move-worker';
import { runRestoreWorker } from './restore/restore-worker';
import { runUninstallWorker } from './uninstall/uninstall-worker';
import { installAssetsProtocolHandler, registerAssetsScheme } from './utils/assets-protocol';
import {
  CLI_FLAG_MOVE_WORKER,
  CLI_FLAG_RESTORE_WORKER,
  CLI_FLAG_UNINSTALL_WORKER,
} from '../config/default.config';
import { getFrontendAssetsCachePath } from '../config/paths';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Elevated worker modes: headless job execution, no window, no IPC
// (see src/main/uninstall/uninstall-worker.ts,
// src/main/restore/restore-worker.ts and src/main/move/move-worker.ts).
// Exit when the job is done.
const isUninstallWorker = process.argv.includes(CLI_FLAG_UNINSTALL_WORKER);
const isRestoreWorker = process.argv.includes(CLI_FLAG_RESTORE_WORKER);
const isMoveWorker = process.argv.includes(CLI_FLAG_MOVE_WORKER);
const isWorker = isUninstallWorker || isRestoreWorker || isMoveWorker;
if (isWorker) {
  void app
    .whenReady()
    .then(async () => {
      const exitCode = isUninstallWorker
        ? await runUninstallWorker(process.argv)
        : isRestoreWorker
          ? await runRestoreWorker(process.argv)
          : await runMoveWorker(process.argv);
      app.exit(exitCode);
    })
    // Safety net: a worker must never hang the elevated process — the main
    // app waits on its exit code (3 = crashed outside the worker's own guard).
    .catch(() => app.exit(3));
}

// Privileged scheme registration must happen before 'ready'.
registerAssetsScheme();

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0e0e0f',
    // Stay hidden until the renderer has painted its first frame, so the
    // user never sees an empty window while the bundle loads.
    show: false,
    autoHideMenuBar: true,
    // Window/taskbar icon. Mainly relevant in dev mode — the packaged app
    // inherits the exe icon (packagerConfig.icon in forge.config.ts).
    icon: path.join(app.getAppPath(), 'assets', 'icons', 'niim.ico'),
    webPreferences: {
      preload: path.join(__dirname, './preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Bootstrap order matters: settings must be loaded and IPC handlers
// registered BEFORE the window exists, so the renderer never talks
// to an uninitialized main process.
app.on('ready', () => {
  if (isWorker) {
    return; // worker bootstrap handled above — no window, no IPC
  }
  const context = createAppContext(process.argv);
  registerAllIpcHandlers(context);
  startStoreSync(context);
  installAssetsProtocolHandler(getFrontendAssetsCachePath());
  createWindow();
  // Initial product scan (PLAN.md §5); result reaches the renderer via the
  // products:changed push once the window is up.
  void context.productScanService.scan();
  // Initial backup folder scan for the Restore page (TODO8).
  void context.restoreScanService.scan();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
