import fs from 'node:fs';
import path from 'node:path';
import type { UninstallProgressReporter } from '../uninstall/uninstall-job';
import { errorMessage } from '../utils/error-message';
import { displayKeyPath } from '../utils/registry-path';
import { deviceRoot } from '../utils/fs-size';
import type { RegistryGuard } from '../utils/RegistryGuard';
import type { RestoreJobSpec, RestoreProductSpec } from './restore-job';

/**
 * Executes a restore job step by step (TODO8). Used in TWO places with
 * different wiring (mirroring `UninstallJobRunner`):
 *
 * - in-process by `RestoreService` for dry-run jobs (and when the app
 *   already runs elevated);
 * - inside the elevated restore worker process for real restores, reporting
 *   progress through a JSONL file back to the main process.
 *
 * Restoring copies FROM the backup INTO the recorded targets and writes the
 * backed-up registry keys/values back to HKLM (through `RegistryGuard`);
 * the backup itself is never modified. Existing target files and registry
 * values are overwritten (that is the point of a restore), folders merged.
 *
 * Step accounting must stay in sync with `computeRestoreTotalSteps()`.
 */
export class RestoreJobRunner {
  constructor(
    private readonly registryGuard: RegistryGuard,
    private readonly reporter: UninstallProgressReporter,
  ) {}

  /**
   * Run the whole job; throws on fatal errors (insufficient target space,
   * I/O or registry failure). "Restore As…" follows later.
   */
  async run(spec: RestoreJobSpec): Promise<void> {
    for (const product of spec.products) {
      this.reporter.line(`── ${product.name} ──`);
      await this.restoreProduct(product, spec);
      this.reporter.productDone(product.name);
      this.reporter.line(`${product.name}: finished`);
    }
  }

  private async restoreProduct(product: RestoreProductSpec, spec: RestoreJobSpec): Promise<void> {
    const registryKeyPaths = Object.keys(product.registryEntries);
    if (product.entries.length === 0 && registryKeyPaths.length === 0) {
      this.reporter.line(`Nothing to restore for ${product.name} — backup contains no data`);
      return;
    }

    if (spec.dryRun) {
      for (const entry of product.entries) {
        this.reporter.line(
          `DRY-RUN: would restore ${entry.backupPath} → ${entry.targetPath} (${entry.kind})`,
        );
        this.reporter.stepDone();
      }
      for (const keyPath of registryKeyPaths) {
        this.reporter.line(
          `DRY-RUN: would restore registry key ${displayKeyPath(keyPath)} (${product.registryEntries[keyPath].length} value(s))`,
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
      this.reporter.line(`Restoring ${entry.backupPath} → ${entry.targetPath} (${entry.kind})`);
      try {
        await fs.promises.mkdir(path.dirname(entry.targetPath), { recursive: true });
        await fs.promises.cp(entry.backupPath, entry.targetPath, { recursive: true, force: true });
      } catch (error) {
        // Name the exact copy that failed — the bare fs error often lacks it.
        throw new Error(
          `${product.name}: restoring ${entry.backupPath} → ${entry.targetPath} failed — ${errorMessage(error)}`,
        );
      }
      this.reporter.stepDone();
    }

    for (const keyPath of registryKeyPaths) {
      const values = product.registryEntries[keyPath];
      this.reporter.line(
        `Restoring registry key ${displayKeyPath(keyPath)} (${values.length} value(s))`,
      );
      try {
        await this.registryGuard.restoreKeyValues(keyPath, values);
      } catch (error) {
        throw new Error(
          `${product.name}: restoring registry key ${displayKeyPath(keyPath)} failed — ${errorMessage(error)}`,
        );
      }
      this.reporter.stepDone();
    }
  }

  /**
   * Verify every TARGET DEVICE has enough free space for the entries that
   * restore onto it (TODO8): required bytes are summed per device root
   * (`C:\`, `D:\`, …), because one job may restore to several drives.
   * Throws naming every device that falls short. Devices whose free space
   * cannot be determined are skipped with a warning (like the backup check).
   */
  private async ensureFreeSpacePerDevice(product: RestoreProductSpec): Promise<void> {
    const requiredByDevice = new Map<string, number>();
    for (const entry of product.entries) {
      const device = deviceRoot(entry.targetPath);
      requiredByDevice.set(device, (requiredByDevice.get(device) ?? 0) + entry.sizeBytes);
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
