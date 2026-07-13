import { makeAutoObservable, toJS } from 'mobx';
import { buildAssetsUrl } from '../../config/assets.config';
import type { ProductDto } from '../../shared/types/product';
import type { BackupProductDto } from '../../shared/types/restore';

/**
 * Domain model of one product backup found in the backup folder (TODO8,
 * main-process source of truth, MobX observable).
 *
 * Built by `RestoreScanService` from a `niim-backup-desc.json`. The
 * `descriptor` is the `ProductDto` serialized at backup time — the existing
 * `Product` model is NOT reused here because its fields describe the live
 * registry state, while a backup carries a frozen snapshot plus
 * backup-specific facts (date, backup subfolder). Mutable fields
 * (`diskUsageBytes`, `artworkCacheFileName`) are filled in asynchronously
 * by the scan's enrichment phases, driving live UI updates.
 */
export class BackupProduct {
  /** Product name from the backup description; unique key of the backup list. */
  readonly name: string;
  /** Product version from the backup description; null when unknown. */
  readonly version: string | null;
  /** ISO timestamp of when the backup was created. */
  readonly backupDate: string;
  /** Absolute path of the product's backup subfolder. */
  readonly backupFolderPath: string;
  /** Full product descriptor serialized at backup time (restore source of truth). */
  readonly descriptor: ProductDto;

  /** Size of the backup subfolder; null until scanned (when the descriptor has none). */
  diskUsageBytes: number | null = null;
  /** File NAME of the artwork inside the frontend assets cache; null when none found. */
  artworkCacheFileName: string | null = null;

  constructor(init: {
    name: string;
    version: string | null;
    backupDate: string;
    backupFolderPath: string;
    descriptor: ProductDto;
  }) {
    this.name = init.name;
    this.version = init.version;
    this.backupDate = init.backupDate;
    this.backupFolderPath = init.backupFolderPath;
    this.descriptor = init.descriptor;
    this.diskUsageBytes = init.descriptor.diskUsageBytes;
    makeAutoObservable(this);
  }

  /** Set by the scan's size phase when the backup folder size is known. */
  setDiskUsage(bytes: number): void {
    this.diskUsageBytes = bytes;
  }

  /** Set by the scan's artwork phase after resolving/importing artwork. */
  setArtworkCacheFileName(fileName: string | null): void {
    this.artworkCacheFileName = fileName;
  }

  /**
   * JSON-serializable snapshot sent to the renderer mirror store.
   * `toJS` strips the MobX proxies (see `Product.toDto`).
   */
  toDto(): BackupProductDto {
    return {
      name: this.name,
      version: this.version,
      backupDate: this.backupDate,
      backupFolderPath: this.backupFolderPath,
      product: toJS(this.descriptor),
      diskUsageBytes: this.diskUsageBytes,
      artworkUrl: this.artworkCacheFileName ? buildAssetsUrl(this.artworkCacheFileName) : null,
    };
  }
}
