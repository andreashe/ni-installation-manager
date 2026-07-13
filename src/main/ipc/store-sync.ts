import { reaction } from 'mobx';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AppContext } from '../app-context';
import { broadcastToRenderers } from './renderer-push';

/**
 * Store-synchronization layer (RULES.md §5): observes the main-process MobX
 * stores and pushes serialized snapshots to the renderer mirror stores, so
 * the UI updates live without polling.
 *
 * Also hosts main-internal reactions to store changes (e.g. logger level
 * follows the `logLevel` setting). Called once at startup from `main.ts`.
 */
export function startStoreSync(context: AppContext): void {
  // Settings → renderer mirror store.
  reaction(
    () => context.settingsStore.toState(),
    (state) => broadcastToRenderers(IpcChannels.settings.changed, state),
  );

  // Products → renderer mirror store. `toState()` touches every nested
  // observable (incl. per-product disk usage), so this fires on any change;
  // the delay batches bursts (e.g. many size updates) into one push.
  reaction(
    () => context.productStore.toState(),
    (state) => broadcastToRenderers(IpcChannels.products.changed, state),
    { delay: 150 },
  );

  // Backups → renderer mirror store (TODO8). Same batching as products
  // (size enrichment updates arrive one backup at a time).
  reaction(
    () => context.restoreStore.toState(),
    (state) => broadcastToRenderers(IpcChannels.restore.changed, state),
    { delay: 150 },
  );

  // Backup folder setting → backup rescan (TODO8): the Restore page always
  // reflects the currently configured folder without a manual reload.
  reaction(
    () => context.settingsStore.settings.backupFolder,
    () => void context.restoreScanService.scan(),
  );

  // Uninstall job → renderer progress page. Small delay batches rapid
  // console lines without making the progress bar feel laggy.
  reaction(
    () => context.uninstallJobStore.toState(),
    (state) => broadcastToRenderers(IpcChannels.uninstall.changed, state),
    { delay: 80 },
  );

  // Settings.logLevel → central logger level (runtime adjustable, RULES.md §9).
  reaction(
    () => context.settingsStore.settings.logLevel,
    (level) => context.logger.setLevel(level),
    { fireImmediately: true },
  );
}
