import fs from 'node:fs';
import { isBackupOnlyKind } from '../../shared/types/product';
import { errorMessage } from '../utils/error-message';
import { displayKeyPath } from '../utils/registry-path';
import type { BackupService } from '../services/BackupService';
import type { FsGuard } from '../utils/FsGuard';
import type { RegistryGuard } from '../utils/RegistryGuard';
import { deletableRegistryKeyPaths } from './uninstall-job';
import type {
  UninstallJobSpec,
  UninstallProductSpec,
  UninstallProgressReporter,
} from './uninstall-job';

/**
 * Executes an uninstall job step by step (PLAN.md §7). Used in TWO places
 * with different wiring:
 *
 * - in-process by `UninstallService` for dry-run jobs (and when the app
 *   already runs elevated) — guards enforce dry-run there;
 * - inside the elevated worker process for real removal, reporting progress
 *   through a JSONL file back to the main process.
 *
 * Step accounting must stay in sync with `computeTotalSteps()`.
 */
export class UninstallJobRunner {
  constructor(
    private readonly fsGuard: FsGuard,
    private readonly registryGuard: RegistryGuard,
    private readonly backupService: BackupService,
    private readonly reporter: UninstallProgressReporter,
  ) {}

  /**
   * Run the whole job; throws on fatal errors (missing backup folder,
   * insufficient backup space, I/O failure). Mode 'backup' performs the
   * backup phase only — nothing is deleted (TODO7).
   */
  async run(spec: UninstallJobSpec): Promise<void> {
    const backupActive = spec.mode === 'backup' || (spec.backupEnabled && spec.backupFolder !== '');

    if (spec.mode === 'backup' && spec.backupFolder === '') {
      throw new Error('No backup folder configured — set it in Preferences first');
    }
    if (backupActive) {
      // Surface the backup target and fail fast when it does not exist (TODO2).
      this.reporter.line(`Backup folder: ${spec.backupFolder}`);
      if (!(await isDir(spec.backupFolder))) {
        throw new Error(`Backup folder does not exist: ${spec.backupFolder}`);
      }
    }

    for (const product of spec.products) {
      this.reporter.line(`── ${product.name} ──`);

      if (backupActive) {
        await this.backupProduct(product, spec);
      } else if (spec.backupEnabled) {
        this.reporter.line('Backup enabled but no backup folder configured — skipping backup');
      }

      if (spec.mode === 'uninstall') {
        await this.removeDiskPaths(product);
        await this.removeRegistryKeys(product, spec);
      }

      this.reporter.productDone(product.name);
      this.reporter.line(`${product.name}: finished`);
    }
  }

  /**
   * Backup phase: free-space check (unless disabled in settings), one step
   * per disk path, then one step covering the registry dump + the
   * `niim-backup-desc.json` description file (TODO7).
   */
  private async backupProduct(product: UninstallProductSpec, spec: UninstallJobSpec): Promise<void> {
    if (spec.dryRun) {
      // Dry-run: report the would-be copies without touching the target.
      for (const diskPath of product.diskPaths) {
        this.reporter.line(`DRY-RUN: would back up ${diskPath.resolvedPath} (${diskPath.kind})`);
        this.reporter.stepDone();
      }
      this.reporter.line(
        `DRY-RUN: would back up registry entries and write niim-backup-desc.json for ${product.name}`,
      );
      this.reporter.stepDone();
      return;
    }

    if (spec.ignoreSpaceCheck) {
      this.reporter.line('Free-space check skipped (disabled in Preferences)');
    } else {
      await this.backupService.ensureFreeSpace(product, spec.backupFolder, this.reporter);
    }
    for (const diskPath of product.diskPaths) {
      this.reporter.line(`Backing up ${diskPath.resolvedPath} (${diskPath.kind})`);
      try {
        await this.backupService.backupDiskPath(
          product.name,
          diskPath.kind,
          diskPath.resolvedPath,
          spec.backupFolder,
        );
      } catch (error) {
        throw new Error(
          `${product.name}: backing up ${diskPath.resolvedPath} (${diskPath.kind}) failed — ${errorMessage(error)}`,
        );
      }
      this.reporter.stepDone();
    }
    this.reporter.line(`Backing up registry entries + description of ${product.name}`);
    try {
      await this.backupService.backupRegistry(product, spec.backupFolder);
      await this.backupService.writeBackupDescription(product, spec.backupFolder);
      await this.backupService.backupProductImage(product, spec.backupFolder);
    } catch (error) {
      throw new Error(
        `${product.name}: backing up registry entries/description failed — ${errorMessage(error)}`,
      );
    }
    this.reporter.stepDone();
  }

  /**
   * Deletion phase, file system: one step per existing disk path. The
   * resolved path already respects the shared-folder rules (only the
   * product's own file/bundle inside AAX/VST dirs), so deleting it is safe.
   */
  private async removeDiskPaths(product: UninstallProductSpec): Promise<void> {
    for (const diskPath of product.diskPaths) {
      // Backup-only locations (imagery inside another product's tree) are
      // preserved (TODO7) — no step accounted for them either.
      if (isBackupOnlyKind(diskPath.kind)) {
        this.reporter.line(`Keeping ${diskPath.resolvedPath} (${diskPath.kind} — backup only)`);
        continue;
      }
      const isDirectory = await isDir(diskPath.resolvedPath);
      this.reporter.line(`Removing ${diskPath.resolvedPath} (${diskPath.kind})`);
      try {
        if (isDirectory) {
          await this.fsGuard.deleteFolder(diskPath.resolvedPath);
        } else {
          await this.fsGuard.deleteFile(diskPath.resolvedPath);
        }
      } catch (error) {
        // Name the exact path that failed — the bare fs error often lacks it.
        throw new Error(
          `${product.name}: removing ${diskPath.resolvedPath} (${diskPath.kind}) failed — ${errorMessage(error)}`,
        );
      }
      this.reporter.stepDone();
    }
  }

  /**
   * Deletion phase, registry: one step per deletable product key. HKCU keys
   * (per-user data) are kept unless the opt-in setting allows deleting them
   * (TODO12) — step accounting in `deletableRegistryKeyPaths` matches.
   */
  private async removeRegistryKeys(
    product: UninstallProductSpec,
    spec: UninstallJobSpec,
  ): Promise<void> {
    const deletable = new Set(deletableRegistryKeyPaths(product, spec));
    for (const keyPath of product.registryKeyPaths) {
      if (!deletable.has(keyPath)) {
        this.reporter.line(
          `Keeping ${displayKeyPath(keyPath)} (user data — enable "Also delete user data" in Preferences to remove)`,
        );
        continue;
      }
      this.reporter.line(`Removing registry key ${displayKeyPath(keyPath)}`);
      try {
        await this.registryGuard.deleteKeyTree(keyPath);
      } catch (error) {
        throw new Error(
          `${product.name}: removing registry key ${displayKeyPath(keyPath)} failed — ${errorMessage(error)}`,
        );
      }
      this.reporter.stepDone();
    }
  }
}

async function isDir(target: string): Promise<boolean> {
  try {
    return (await fs.promises.lstat(target)).isDirectory();
  } catch {
    return false;
  }
}
