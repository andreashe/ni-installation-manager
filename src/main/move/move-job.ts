import fs from 'node:fs';
import {
  applyRenamePatterns,
  RESTORE_AS_REGISTRY_PATH_VALUE_NAMES,
} from '../../shared/restore-as';
import { isSharedContainerKind } from '../../shared/types/product';
import type { ProductDiskPathKind, ProductDto, RegistryValueDto } from '../../shared/types/product';
import type { RenamePattern } from '../../shared/types/restore';
import { sizeOfPath } from '../utils/fs-size';

/**
 * Job description of the "Move…" feature (TODO10): relocate the disk
 * locations of INSTALLED products (source of truth: the registry scan, not a
 * backup) to new paths derived via the shared rename patterns, then update
 * the path-carrying registry values to the new locations.
 *
 * Mirrors `restore-job.ts`: specs are built from a CLONED `ProductDto`
 * (`Product.toDto()` already deep-copies via `toJS`), are JSON-serializable
 * for the elevated move worker and share the rename-pattern logic of
 * "Restore As…" (`shared/restore-as.ts`).
 */

/** One existing disk location of an installed product that a move could relocate. */
export interface MoveSource {
  kind: ProductDiskPathKind;
  /** Current path on disk (descriptor `resolvedPath`). */
  sourcePath: string;
  /** True when the source currently exists on disk (only existing sources are movable). */
  exists: boolean;
  /** Recursive size of the source in bytes; 0 when it does not exist. */
  sizeBytes: number;
}

/**
 * One disk location to move: relocate `sourcePath` to `targetPath`.
 * Specs only ever contain entries whose target DIFFERS from the source —
 * a move with source = target is never executed (TODO10).
 */
export interface MoveEntrySpec {
  kind: ProductDiskPathKind;
  sourcePath: string;
  targetPath: string;
  /** Size of the source; feeds the per-device free-space check for cross-device moves. */
  sizeBytes: number;
}

/**
 * Serializable description of everything a move job must do for one
 * product. Built by `toMoveProductSpec` from the scanned product's DTO;
 * for elevated execution written to a job file consumed by the move worker.
 */
export interface MoveProductSpec {
  name: string;
  version: string | null;
  entries: MoveEntrySpec[];
  /**
   * Path-carrying registry values (see `RESTORE_AS_REGISTRY_PATH_VALUE_NAMES`)
   * whose value CHANGED under the rename patterns, per HKLM-relative key
   * path — written after the file moves of the product succeeded (TODO10).
   */
  registryUpdates: Record<string, RegistryValueDto[]>;
}

/** Complete move job description; JSON-serializable for the elevated worker. */
export interface MoveJobSpec {
  dryRun: boolean;
  /** Skip the per-device free-space check (settings toggle, TODO10). */
  ignoreSpaceCheck: boolean;
  products: MoveProductSpec[];
}

/**
 * Total number of partial steps of a move job — the progress bar
 * denominator. Must match exactly what `MoveJobRunner` reports:
 * one step per move entry plus one per registry key to update.
 */
export function computeMoveTotalSteps(spec: MoveJobSpec): number {
  return spec.products.reduce(
    (total, product) => total + product.entries.length + Object.keys(product.registryUpdates).length,
    0,
  );
}

/**
 * Enumerate the movable disk locations of one product: every descriptor
 * disk path except the shared plugin CONTAINERS (they hold plugins of many
 * products and must never be relocated as a whole, TODO6 — the resolved
 * `Install*File` entries cover the product's own plugin files). Duplicate
 * resolved paths (e.g. ContentDir = InstallDir) are listed once. Existence
 * is checked fresh; sizes are measured now (source side) for the free-space
 * check and the Move page.
 */
export async function collectMoveSources(descriptor: ProductDto): Promise<MoveSource[]> {
  const sources: MoveSource[] = [];
  const seenPaths = new Set<string>();
  for (const diskPath of descriptor.diskPaths) {
    if (isSharedContainerKind(diskPath.kind)) {
      continue;
    }
    const key = diskPath.resolvedPath.toLowerCase();
    if (seenPaths.has(key)) {
      continue;
    }
    seenPaths.add(key);
    const exists = await pathExists(diskPath.resolvedPath);
    sources.push({
      kind: diskPath.kind,
      sourcePath: diskPath.resolvedPath,
      exists,
      sizeBytes: exists ? await sizeOfPath(diskPath.resolvedPath) : 0,
    });
  }
  return sources;
}

/**
 * Build the move spec for one product from its DTO (a fresh deep copy — the
 * scanned model stays untouched) and the rename patterns:
 *
 * - one entry per EXISTING move source whose pattern-derived target differs
 *   from the source (source = target moves are dropped here, TODO10);
 * - registry updates for every path-carrying value the patterns changed, so
 *   the registry names the new locations after the files moved.
 */
export async function toMoveProductSpec(
  descriptor: ProductDto,
  patterns: readonly RenamePattern[],
): Promise<MoveProductSpec> {
  const sources = await collectMoveSources(descriptor);
  const entries: MoveEntrySpec[] = [];
  for (const source of sources) {
    if (!source.exists) {
      continue;
    }
    const targetPath = applyRenamePatterns(source.sourcePath, patterns);
    if (targetPath === source.sourcePath) {
      continue;
    }
    entries.push({
      kind: source.kind,
      sourcePath: source.sourcePath,
      targetPath,
      sizeBytes: source.sizeBytes,
    });
  }

  const registryUpdates: Record<string, RegistryValueDto[]> = {};
  for (const [keyPath, values] of Object.entries(descriptor.registryEntries)) {
    const changed: RegistryValueDto[] = [];
    for (const value of values) {
      const isPathValue = RESTORE_AS_REGISTRY_PATH_VALUE_NAMES.some(
        (name) => name.toLowerCase() === value.name.toLowerCase(),
      );
      if (!isPathValue || typeof value.value !== 'string') {
        continue;
      }
      const newValue = applyRenamePatterns(value.value, patterns);
      if (newValue !== value.value) {
        changed.push({ ...value, value: newValue });
      }
    }
    if (changed.length > 0) {
      registryUpdates[keyPath] = changed;
    }
  }

  return {
    name: descriptor.name,
    version: descriptor.version,
    entries,
    registryUpdates,
  };
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
