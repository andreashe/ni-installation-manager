import fs from 'node:fs';
import { toJS } from 'mobx';
import {
  applyRenamePatterns,
  RESTORE_AS_REGISTRY_PATH_VALUE_NAMES,
} from '../../shared/restore-as';
import { isSharedContainerKind } from '../../shared/types/product';
import type { ProductDiskPathKind, ProductDto, RegistryValueDto } from '../../shared/types/product';
import type { RenamePattern } from '../../shared/types/restore';
import type { BackupProduct } from '../models/BackupProduct';
import { getBackupEntryPath } from '../utils/backup-layout';
import { sizeOfPath } from '../utils/fs-size';

/**
 * One disk location to restore: copy `backupPath` (inside the product's
 * backup subfolder) back to `targetPath` (the location recorded at backup
 * time). `sizeBytes` feeds the per-device free-space check.
 */
export interface RestoreEntrySpec {
  kind: ProductDiskPathKind;
  backupPath: string;
  targetPath: string;
  sizeBytes: number;
}

/**
 * Serializable description of everything a restore job must do for one
 * backup. Derived from the `BackupProduct` model by `toRestoreProductSpec`
 * and — for elevated execution — written to a job file consumed by the
 * restore worker process.
 */
export interface RestoreProductSpec {
  name: string;
  version: string | null;
  entries: RestoreEntrySpec[];
  /** All backed-up registry values per key path (optionally hive-prefixed; bare = HKLM) — restored 1:1. */
  registryEntries: Record<string, RegistryValueDto[]>;
  /**
   * CLONE of the backup descriptor this spec was calculated from. The
   * upcoming "Restore As…" feature (TODO8) modifies target locations on
   * this copy — the original model in the store must stay untouched.
   */
  descriptor: ProductDto;
}

/** Complete restore job description; JSON-serializable for the elevated worker. */
export interface RestoreJobSpec {
  dryRun: boolean;
  /** Skip the per-device free-space check (settings toggle, TODO8). */
  ignoreSpaceCheck: boolean;
  products: RestoreProductSpec[];
}

/**
 * Total number of partial steps of a restore job — the progress bar
 * denominator. Must match exactly what `RestoreJobRunner` reports:
 * one step per restore entry plus one per registry key to restore.
 */
export function computeRestoreTotalSteps(spec: RestoreJobSpec): number {
  return spec.products.reduce(
    (total, product) => total + product.entries.length + Object.keys(product.registryEntries).length,
    0,
  );
}

/**
 * Reduce a `BackupProduct` model to the serializable job spec. The
 * descriptor is deep-CLONED first (TODO8): all restore calculations work on
 * the copy, so the later "Restore As…" feature can rewrite target paths
 * without mutating the scanned model.
 *
 * Entries cover every descriptor disk path that actually has data in the
 * backup subfolder; shared plugin containers were never backed up (TODO6)
 * and are skipped. Entry sizes are measured now (backup side) for the
 * free-space check.
 */
export async function toRestoreProductSpec(backup: BackupProduct): Promise<RestoreProductSpec> {
  const descriptor = structuredClone(toJS(backup.descriptor));

  const entries: RestoreEntrySpec[] = [];
  const seenBackupPaths = new Set<string>();
  for (const diskPath of descriptor.diskPaths) {
    if (isSharedContainerKind(diskPath.kind)) {
      continue;
    }
    const backupPath = getBackupEntryPath(backup.backupFolderPath, diskPath.kind, diskPath.resolvedPath);
    if (seenBackupPaths.has(backupPath.toLowerCase()) || !(await pathExists(backupPath))) {
      continue;
    }
    seenBackupPaths.add(backupPath.toLowerCase());
    entries.push({
      kind: diskPath.kind,
      backupPath,
      targetPath: diskPath.resolvedPath,
      sizeBytes: await sizeOfPath(backupPath),
    });
  }

  return {
    name: backup.name,
    version: backup.version,
    entries,
    registryEntries: descriptor.registryEntries,
    descriptor,
  };
}

/**
 * "Restore As…" (TODO9): rewrite the CLONED product spec in place with the
 * rename patterns — this is exactly why `toRestoreProductSpec` clones the
 * descriptor. Rewritten are:
 *
 * - every restore entry's `targetPath` (files/folders land at the new
 *   location; the per-device space check then measures the new devices);
 * - every path-carrying registry value (`RESTORE_AS_REGISTRY_PATH_VALUE_NAMES`,
 *   matched case-insensitively) so the restored registry names the new
 *   target paths;
 * - the descriptor's disk paths (kept consistent for transparency).
 *
 * The normal restore never calls this — patterns only apply when the user
 * comes from the "Restore As…" page.
 */
export function applyRenamePatternsToProductSpec(
  product: RestoreProductSpec,
  patterns: readonly RenamePattern[],
): void {
  for (const entry of product.entries) {
    entry.targetPath = applyRenamePatterns(entry.targetPath, patterns);
  }
  for (const values of Object.values(product.registryEntries)) {
    for (const value of values) {
      const isPathValue = RESTORE_AS_REGISTRY_PATH_VALUE_NAMES.some(
        (name) => name.toLowerCase() === value.name.toLowerCase(),
      );
      if (isPathValue && typeof value.value === 'string') {
        value.value = applyRenamePatterns(value.value, patterns);
      }
    }
  }
  for (const diskPath of product.descriptor.diskPaths) {
    diskPath.resolvedPath = applyRenamePatterns(diskPath.resolvedPath, patterns);
    diskPath.rawValue = applyRenamePatterns(diskPath.rawValue, patterns);
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
