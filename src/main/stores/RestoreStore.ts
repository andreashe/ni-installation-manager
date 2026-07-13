import { makeAutoObservable } from 'mobx';
import type { RestoreListState } from '../../shared/types/restore';
import type { BackupProduct } from '../models/BackupProduct';

/**
 * Main-process source of truth for the scanned backup list (MobX, TODO8).
 *
 * Filled by `RestoreScanService` (backup folder scan + size/artwork
 * enrichment). The store-sync layer observes it and pushes
 * `RestoreListState` snapshots to the renderer mirror store.
 */
export class RestoreStore {
  backups: BackupProduct[] = [];
  /** True while a backup folder scan runs; drives the reload spinner. */
  scanning = false;
  /** Human-readable current background activity for the status bar; null = idle. */
  statusText: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setScanning(scanning: boolean): void {
    this.scanning = scanning;
  }

  setStatusText(text: string | null): void {
    this.statusText = text;
  }

  /** Replace the whole list at the end of a scan (sorted by name for stable UI order). */
  replaceAll(backups: BackupProduct[]): void {
    this.backups = [...backups].sort((a, b) => a.name.localeCompare(b.name));
  }

  findByName(name: string): BackupProduct | undefined {
    return this.backups.find((backup) => backup.name === name);
  }

  /**
   * Serializable snapshot for the renderer. Touches every observable field,
   * so a MobX reaction over this method re-fires on any nested change.
   */
  toState(): RestoreListState {
    return {
      scanning: this.scanning,
      statusText: this.statusText,
      backups: this.backups.map((backup) => backup.toDto()),
    };
  }
}
