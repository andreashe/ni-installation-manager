import { isBackupOnlyKind, isSharedContainerKind } from '../../shared/types/product';
import type { ProductDiskPath, ProductDto, RegistryValueDto } from '../../shared/types/product';
import type { JobMode } from '../../shared/types/uninstall';
import { splitHiveKeyPath } from '../utils/registry-path';
import type { Product } from '../models/Product';

/**
 * Serializable description of everything an uninstall job must do for one
 * product. Derived from the `Product` model by `UninstallService` and — for
 * elevated execution — written to a job file consumed by the worker process.
 */
export interface UninstallProductSpec {
  name: string;
  /** Product version for the backup description file (TODO7). */
  version: string | null;
  /** Only EXISTING disk paths (resolved per the folder rules, PLAN.md §2.2). */
  diskPaths: ProductDiskPath[];
  /** Key paths to delete recursively (optionally hive-prefixed; bare = HKLM, TODO12). */
  registryKeyPaths: string[];
  /** All registry values per key path (for the registry backup JSON). */
  registryEntries: Record<string, RegistryValueDto[]>;
  /** Full serialized product for `niim-backup-desc.json` (TODO7). */
  descriptor: ProductDto;
  /** Absolute path of the cached artwork; copied as `product.png` into the backup (TODO7). */
  artworkCachePath: string | null;
}

/** Complete job description; JSON-serializable for the elevated worker. */
export interface UninstallJobSpec {
  /** 'uninstall' = backup (optional) + delete; 'backup' = backup only (TODO7). */
  mode: JobMode;
  dryRun: boolean;
  backupEnabled: boolean;
  backupFolder: string;
  /** Skip the free-space check before backups (settings toggle, TODO7). */
  ignoreSpaceCheck: boolean;
  /**
   * Also delete the per-user HKCU product keys (settings toggle, TODO12).
   * When false (default) those keys are kept — still backed up, though.
   */
  deleteUserRegistryData: boolean;
  products: UninstallProductSpec[];
}

/**
 * The registry keys of one product that the deletion phase actually
 * removes: HKCU keys (per-user data) only with the opt-in setting (TODO12).
 * Used by the runner AND the step accounting — must stay in sync.
 */
export function deletableRegistryKeyPaths(
  product: UninstallProductSpec,
  spec: UninstallJobSpec,
): string[] {
  if (spec.deleteUserRegistryData) {
    return product.registryKeyPaths;
  }
  return product.registryKeyPaths.filter((keyPath) => splitHiveKeyPath(keyPath).hive !== 'HKCU');
}

/**
 * Progress sink used by the job runner. In-process jobs feed the
 * `UninstallJobStore` directly; the elevated worker appends JSONL lines to
 * a progress file which the main process tails.
 */
export interface UninstallProgressReporter {
  /** One console-style detail line for the progress page. */
  line(text: string): void;
  /** One partial step finished (advances the progress bar). */
  stepDone(): void;
  /** All work for one product finished (main removes it from the list). */
  productDone(name: string): void;
}

/**
 * Total number of partial steps of a job — the progress bar denominator.
 * Must match exactly what `UninstallJobRunner` reports: per product one
 * step per existing disk path for backup (when enabled) plus one for the
 * registry backup + description file; uninstall jobs add one per disk path
 * deletion and one per registry key. Backup-only jobs stop after backing up.
 */
export function computeTotalSteps(spec: UninstallJobSpec): number {
  const backupActive = spec.mode === 'backup' || (spec.backupEnabled && spec.backupFolder !== '');
  let total = 0;
  for (const product of spec.products) {
    if (backupActive) {
      total += product.diskPaths.length + 1;
    }
    if (spec.mode === 'uninstall') {
      // Backup-only locations (Kontakt8ImageDir) are never deleted (TODO7);
      // HKCU keys only with the opt-in setting (TODO12).
      const deletable = product.diskPaths.filter((diskPath) => !isBackupOnlyKind(diskPath.kind));
      total += deletable.length + deletableRegistryKeyPaths(product, spec).length;
    }
  }
  return total;
}

/**
 * Reduce a Product model to the serializable job spec: existing paths only,
 * and NEVER the shared plugin container folders (TODO6) — they hold other
 * products' plugins; only the resolved `Install*File` entries inside them
 * are backed up/deleted.
 *
 * The descriptor (written as `niim-backup-desc.json`) also drops
 * non-existing disk paths: the registry may name the same folder kind under
 * several key paths with only some pointing at real content — locations
 * without content are not part of the backup, so they must not be listed
 * as restorable either.
 */
export function toProductSpec(product: Product, artworkCachePath: string | null): UninstallProductSpec {
  const dto = product.toDto();
  return {
    name: product.name,
    version: product.version,
    diskPaths: product.diskPaths.filter(
      (diskPath) => diskPath.exists && !isSharedContainerKind(diskPath.kind),
    ),
    registryKeyPaths: Object.keys(product.registryEntries),
    registryEntries: product.registryEntries,
    descriptor: { ...dto, diskPaths: dto.diskPaths.filter((diskPath) => diskPath.exists) },
    artworkCachePath,
  };
}

/** One line of the worker → main progress protocol (JSONL file). */
export type UninstallProgressEvent =
  | { type: 'line'; text: string }
  | { type: 'step' }
  | { type: 'product-done'; name: string }
  | { type: 'done'; success: boolean; error?: string };
