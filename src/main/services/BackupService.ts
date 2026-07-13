import fs from 'node:fs';
import path from 'node:path';
import type { RegistryValueDto } from '../../shared/types/product';
import type { UninstallProductSpec, UninstallProgressReporter } from '../uninstall/uninstall-job';
import {
  BACKUP_DESCRIPTION_FILE,
  BACKUP_PRODUCT_IMAGE_FILE,
  BACKUP_REGISTRY_SUBFOLDER,
  getBackupEntryPath,
  getProductBackupFolder,
} from '../utils/backup-layout';
import { sizeOfPath } from '../utils/fs-size';

/**
 * Pre-uninstall backup (PLAN.md §7 step 2). Copies every existing disk path
 * of a product into the backup folder — preserving where each piece came
 * from — and dumps the product's registry entries (incl. value types) as
 * JSON, so a manual restore is possible later:
 *
 *   <backupFolder>/<product>/files/<Kind>/<basename>   (Kind = ContentDir, …)
 *   <backupFolder>/<product>/registry/64-bit.json
 *   <backupFolder>/<product>/registry/32-bit.json
 *
 * Backup only copies (non-destructive), so it does not go through the
 * guards. In dry-run mode the runner skips it entirely and only reports
 * what it would copy.
 */
export class BackupService {
  /**
   * Verify the backup target has enough free space for the product.
   * Throws with a clear message when space is insufficient; skips the check
   * (with a reported warning) when the platform cannot report free space.
   */
  async ensureFreeSpace(
    product: UninstallProductSpec,
    backupFolder: string,
    reporter: UninstallProgressReporter,
  ): Promise<void> {
    let required = 0;
    for (const diskPath of product.diskPaths) {
      required += await sizeOfPath(diskPath.resolvedPath);
    }
    try {
      const stats = await fs.promises.statfs(backupFolder);
      const free = stats.bavail * stats.bsize;
      if (free < required) {
        throw new Error(
          `Not enough free space on backup target: need ${required} bytes, only ${free} available`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Not enough free space')) {
        throw error;
      }
      reporter.line(`WARNING: could not determine free space (${String(error)}) — continuing`);
    }
  }

  /**
   * Copy one disk path of the product into the backup structure.
   * An existing target from a previous backup run is REPLACED (removed
   * first, then copied) so re-running a backup never accumulates
   * timestamp-suffixed duplicates.
   * One call = one progress step (reported by the runner, not here).
   */
  async backupDiskPath(
    productName: string,
    kind: string,
    sourcePath: string,
    backupFolder: string,
  ): Promise<void> {
    const target = getBackupEntryPath(
      getProductBackupFolder(backupFolder, productName),
      kind,
      sourcePath,
    );
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    if (await exists(target)) {
      await fs.promises.rm(target, { recursive: true, force: true });
    }
    await fs.promises.cp(sourcePath, target, { recursive: true });
  }

  /**
   * Write `niim-backup-desc.json` next to the backed-up files (TODO7):
   * product name, version, backup date and the full serialized product
   * object (all disk-path kinds included) — enough to identify and restore
   * the backup later.
   */
  async writeBackupDescription(product: UninstallProductSpec, backupFolder: string): Promise<void> {
    const productFolder = getProductBackupFolder(backupFolder, product.name);
    await fs.promises.mkdir(productFolder, { recursive: true });
    const description = {
      name: product.name,
      version: product.version,
      backupDate: new Date().toISOString(),
      product: product.descriptor,
    };
    await fs.promises.writeFile(
      path.join(productFolder, BACKUP_DESCRIPTION_FILE),
      JSON.stringify(description, null, 2),
      'utf8',
    );
  }

  /**
   * Copy the product's cached artwork into the backup as `product.png`
   * (TODO7). Silently skipped when no artwork is cached.
   */
  async backupProductImage(product: UninstallProductSpec, backupFolder: string): Promise<void> {
    if (!product.artworkCachePath || !(await exists(product.artworkCachePath))) {
      return;
    }
    const productFolder = getProductBackupFolder(backupFolder, product.name);
    await fs.promises.mkdir(productFolder, { recursive: true });
    await fs.promises.copyFile(
      product.artworkCachePath,
      path.join(productFolder, BACKUP_PRODUCT_IMAGE_FILE),
    );
  }

  /**
   * Dump the product's registry entries as restorable JSON, split by hive
   * view (WOW6432Node = 64-bit Windows view of 32-bit software registry).
   */
  async backupRegistry(product: UninstallProductSpec, backupFolder: string): Promise<void> {
    const registryDir = path.join(
      getProductBackupFolder(backupFolder, product.name),
      BACKUP_REGISTRY_SUBFOLDER,
    );
    await fs.promises.mkdir(registryDir, { recursive: true });

    const wow: Record<string, RegistryValueDto[]> = {};
    const plain: Record<string, RegistryValueDto[]> = {};
    for (const [keyPath, values] of Object.entries(product.registryEntries)) {
      if (keyPath.toUpperCase().includes('WOW6432NODE')) {
        wow[keyPath] = values;
      } else {
        plain[keyPath] = values;
      }
    }
    await fs.promises.writeFile(
      path.join(registryDir, '64-bit.json'),
      JSON.stringify(wow, null, 2),
      'utf8',
    );
    await fs.promises.writeFile(
      path.join(registryDir, '32-bit.json'),
      JSON.stringify(plain, null, 2),
      'utf8',
    );
  }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
