import path from 'node:path';

/**
 * Single source of truth for the on-disk layout of a product backup
 * (TODO7/TODO8). `BackupService` writes this structure, the restore domain
 * reads it back:
 *
 *   <backupFolder>/<product>/files/<Kind>/<basename>   (Kind = ContentDir, …)
 *   <backupFolder>/<product>/registry/64-bit.json
 *   <backupFolder>/<product>/registry/32-bit.json
 *   <backupFolder>/<product>/niim-backup-desc.json
 *   <backupFolder>/<product>/product.png
 */

/** Backup description file identifying a restorable product backup. */
export const BACKUP_DESCRIPTION_FILE = 'niim-backup-desc.json';

/** Cached product artwork copied into the backup. */
export const BACKUP_PRODUCT_IMAGE_FILE = 'product.png';

/** Subfolder holding the backed-up disk paths, grouped by kind. */
export const BACKUP_FILES_SUBFOLDER = 'files';

/** Subfolder holding the registry dumps. */
export const BACKUP_REGISTRY_SUBFOLDER = 'registry';

/** Replace characters Windows forbids in folder names. */
export function sanitizeBackupName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

/** The product's own subfolder inside the backup folder. */
export function getProductBackupFolder(backupFolder: string, productName: string): string {
  return path.join(backupFolder, sanitizeBackupName(productName));
}

/**
 * Where one disk path of a product lives inside its backup subfolder:
 * `files/<Kind>/<basename of the original path>`. Trailing separators on
 * the original path are ignored by `path.basename`.
 */
export function getBackupEntryPath(
  productBackupFolder: string,
  kind: string,
  originalPath: string,
): string {
  return path.join(productBackupFolder, BACKUP_FILES_SUBFOLDER, kind, path.basename(originalPath));
}
