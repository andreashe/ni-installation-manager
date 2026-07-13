import type { ProductDiskPathKind, ProductDto } from './product';

/**
 * One product backup found in the configured backup folder (TODO8).
 *
 * Built by `RestoreScanService` from a `niim-backup-desc.json` inside a
 * direct subfolder of the backup folder. The embedded `product` descriptor
 * is the full `ProductDto` serialized at backup time — its disk paths
 * describe the FUTURE restore targets, which may or may not exist anymore.
 */
export interface BackupProductDto {
  /** Product name from the backup description. */
  name: string;
  /** Product version from the backup description; null when unknown. */
  version: string | null;
  /** ISO timestamp of when the backup was created. */
  backupDate: string;
  /** Absolute path of the product's backup subfolder. */
  backupFolderPath: string;
  /** Full product descriptor serialized at backup time (restore source of truth). */
  product: ProductDto;
  /**
   * Size of the product's backup subfolder in bytes. Taken from the
   * descriptor when present, otherwise scanned in the background;
   * null until known.
   */
  diskUsageBytes: number | null;
  /** `ni-assets://` URL of the cached artwork; null when none is available. */
  artworkUrl: string | null;
}

/** Backup list state pushed from main to the renderer mirror store (TODO8). */
export interface RestoreListState {
  /** True while the backup folder scan is running. */
  scanning: boolean;
  /** Current background activity for the status bar; null when idle. */
  statusText: string | null;
  backups: BackupProductDto[];
}

/**
 * One restorable disk location of a backup, enriched for the restore
 * details panel (TODO8): the restore TARGET from the descriptor plus the
 * matching source inside the backup folder.
 */
export interface RestoreLocationDetails {
  kind: ProductDiskPathKind;
  /** Restore target path (descriptor `resolvedPath`) — may not exist yet. */
  targetPath: string;
  /** True when the target already exists on disk (shown yellow — would be overwritten). */
  targetExists: boolean;
  /** Source path inside the product's backup subfolder. */
  backupPath: string;
  /** False when the descriptor mentions this kind but the backup folder has no data (shown red). */
  backupExists: boolean;
  /** Recursive size of the backup source in bytes; 0 when it does not exist. */
  backupSizeBytes: number;
}

/**
 * One rename rule of the "Restore As…" feature (TODO9): every restore
 * target path starting with `from` (case-insensitive, segment-aligned) gets
 * that prefix replaced by `to`. Persisted as own JSON file alongside the
 * settings.
 */
export interface RenamePattern {
  /** Windows path prefix to replace (start of the old target path). */
  from: string;
  /** Replacement prefix (start of the new target path). */
  to: string;
}

/**
 * One restore target on the "Restore As…" page (TODO9): the old target
 * from the backup descriptor plus the backup-side size. New paths are
 * computed live in the renderer via `applyRenamePatterns`.
 */
export interface RestoreAsTargetDto {
  kind: ProductDiskPathKind;
  /** Old target path as recorded at backup time. */
  oldTargetPath: string;
  /** True when the old target currently exists on disk. */
  oldTargetExists: boolean;
  /** Recursive size of the backup source feeding this target. */
  sizeBytes: number;
}

/** One product section on the "Restore As…" page (TODO9). */
export interface RestoreAsProductDto {
  name: string;
  version: string | null;
  targets: RestoreAsTargetDto[];
}

/** Payload of `restore:get-details` for the restore details panel (TODO8). */
export interface RestoreDetailsDto {
  name: string;
  version: string | null;
  backupDate: string;
  locations: RestoreLocationDetails[];
  /** Sum over all existing backup sources — potential total restore size. */
  totalRestoreBytes: number;
  /** Full registry key paths (with hive prefix) that would be restored. */
  registryPaths: string[];
}
