import fs from 'node:fs';
import path from 'node:path';
import type { UninstallProgressReporter } from '../uninstall/uninstall-job';
import { deviceRoot } from '../utils/fs-size';
import type { RegistryGuard } from '../utils/RegistryGuard';
import type { MoveJobSpec, MoveProductSpec } from './move-job';

/**
 * Executes a move job step by step (TODO10). Used in TWO places with
 * different wiring (mirroring `RestoreJobRunner`):
 *
 * - in-process by `MoveService` for dry-run jobs (and when the app already
 *   runs elevated);
 * - inside the elevated move worker process for real moves, reporting
 *   progress through a JSONL file back to the main process.
 *
 * Per product: first every entry is moved on disk (fast `rename` where
 * possible, copy + delete across devices or onto existing targets), THEN —
 * only after all file moves succeeded — the changed path-carrying registry
 * values are written (through `RegistryGuard`), so a failed move never
 * leaves the registry pointing at locations that were not relocated.
 *
 * Step accounting must stay in sync with `computeMoveTotalSteps()`.
 */
export class MoveJobRunner {
  constructor(
    private readonly registryGuard: RegistryGuard,
    private readonly reporter: UninstallProgressReporter,
  ) {}

  /** Run the whole job; throws on fatal errors (insufficient space, I/O or registry failure). */
  async run(spec: MoveJobSpec): Promise<void> {
    for (const product of spec.products) {
      this.reporter.line(`── ${product.name} ──`);
      await this.moveProduct(product, spec);
      this.reporter.productDone(product.name);
      this.reporter.line(`${product.name}: finished`);
    }
  }

  private async moveProduct(product: MoveProductSpec, spec: MoveJobSpec): Promise<void> {
    const registryKeyPaths = Object.keys(product.registryUpdates);
    if (product.entries.length === 0 && registryKeyPaths.length === 0) {
      this.reporter.line(`Nothing to move for ${product.name} — no path changed by the patterns`);
      return;
    }

    if (spec.dryRun) {
      for (const entry of product.entries) {
        this.reporter.line(
          `DRY-RUN: would move ${entry.sourcePath} → ${entry.targetPath} (${entry.kind})`,
        );
        this.reporter.stepDone();
      }
      for (const keyPath of registryKeyPaths) {
        this.reporter.line(
          `DRY-RUN: would update registry key HKLM\\${keyPath} (${product.registryUpdates[keyPath].length} value(s))`,
        );
        this.reporter.stepDone();
      }
      return;
    }

    if (spec.ignoreSpaceCheck) {
      this.reporter.line('Free-space check skipped (disabled in Preferences)');
    } else {
      await this.ensureFreeSpacePerDevice(product);
    }

    for (const entry of product.entries) {
      this.reporter.line(`Moving ${entry.sourcePath} → ${entry.targetPath} (${entry.kind})`);
      await this.moveEntry(entry.sourcePath, entry.targetPath);
      this.reporter.stepDone();
    }

    // Registry only after ALL file moves of the product succeeded (TODO10).
    for (const keyPath of registryKeyPaths) {
      const values = product.registryUpdates[keyPath];
      this.reporter.line(`Updating registry key HKLM\\${keyPath} (${values.length} value(s))`);
      await this.registryGuard.restoreKeyValues(keyPath, values);
      this.reporter.stepDone();
    }
  }

  /**
   * Move one file/folder: try an atomic `rename` first (instant on the same
   * device); when that fails (cross-device EXDEV, or the target already
   * exists) fall back to copy + delete-source. Existing target files are
   * overwritten, folders merged — same contract as restore.
   */
  private async moveEntry(sourcePath: string, targetPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.promises.rename(sourcePath, targetPath);
      return;
    } catch {
      // Fall through to copy + delete.
    }
    await fs.promises.cp(sourcePath, targetPath, { recursive: true, force: true });
    await fs.promises.rm(sourcePath, { recursive: true, force: true });
  }

  /**
   * Verify every TARGET DEVICE has enough free space (TODO10). Only
   * CROSS-device entries count: a same-device move is a rename and consumes
   * no additional space. Same per-device summing and skip-with-warning
   * behavior as the restore check.
   */
  private async ensureFreeSpacePerDevice(product: MoveProductSpec): Promise<void> {
    const requiredByDevice = new Map<string, number>();
    for (const entry of product.entries) {
      const targetDevice = deviceRoot(entry.targetPath);
      if (deviceRoot(entry.sourcePath).toLowerCase() === targetDevice.toLowerCase()) {
        continue;
      }
      requiredByDevice.set(targetDevice, (requiredByDevice.get(targetDevice) ?? 0) + entry.sizeBytes);
    }

    const insufficient: string[] = [];
    for (const [device, required] of requiredByDevice) {
      let free: number;
      try {
        const stats = await fs.promises.statfs(device);
        free = stats.bavail * stats.bsize;
      } catch (error) {
        this.reporter.line(
          `WARNING: could not determine free space on ${device} (${String(error)}) — continuing`,
        );
        continue;
      }
      if (free < required) {
        insufficient.push(`${device} (need ${required} bytes, only ${free} available)`);
      }
    }
    if (insufficient.length > 0) {
      throw new Error(`Not enough free space on target device(s): ${insufficient.join('; ')}`);
    }
  }
}
