import { makeAutoObservable, runInAction } from 'mobx';
import type { RenamePattern, RestoreListState } from '../../shared/types/restore';

/**
 * Renderer mirror of the main-process restore store (RULES.md §5, TODO8).
 *
 * Receives `RestoreListState` snapshots pushed from main (backup folder
 * scan results, async size/artwork updates). The Restore page reads it via
 * `useStores()` + `observer`; `rescan()` backs the reload button and
 * `start()` the restore buttons.
 */
export class RestoreStore {
  backups: RestoreListState['backups'] = [];
  /** True while main scans the backup folder; drives the reload spinner. */
  scanning = false;
  /** Current background activity for the status bar; null when idle. */
  statusText: string | null = null;
  /** False until the first snapshot arrived from main. */
  initialized = false;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Fetch the initial state and subscribe to pushes from main.
   * Called once by the RootStore; returns the unsubscribe function.
   */
  connect(): () => void {
    const unsubscribe = window.api.restore.onChanged((state) => this.applyState(state));
    void window.api.restore.get().then((state) => this.applyState(state));
    return unsubscribe;
  }

  /** Trigger a backup folder rescan in main (reload button). Result arrives via push. */
  rescan(): void {
    void window.api.restore.rescan();
  }

  /** Start a restore job (per-row button or "Restore selected"). */
  start(backupNames: string[]): void {
    void window.api.restore.start(backupNames);
  }

  /** Start a restore job with rename patterns ("Restore As…" page, TODO9). */
  startAs(backupNames: string[], patterns: RenamePattern[]): void {
    void window.api.restore.startAs(backupNames, patterns);
  }

  /** Apply an authoritative snapshot received from the main process. */
  private applyState(state: RestoreListState): void {
    runInAction(() => {
      this.backups = state.backups;
      this.scanning = state.scanning;
      this.statusText = state.statusText;
      this.initialized = true;
    });
  }
}
