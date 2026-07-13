import fs from 'node:fs';
import type { LoggerService } from '../services/LoggerService';
import type { SettingsStore } from '../stores/SettingsStore';

const LOG_SOURCE = 'FsGuard';

/**
 * Single choke point for DESTRUCTIVE filesystem operations (RULES.md §10).
 *
 * Feature code (BackupService cleanup, UninstallService, …) must never call
 * `fs.rm`/`fs.unlink` directly — it goes through this guard, which enforces
 * dry-run mode: when dry-run is active the operation is only logged
 * ("DRY-RUN: would …") and nothing is touched on disk.
 *
 * Non-destructive operations (read, copy, mkdir) do NOT belong here.
 */
export class FsGuard {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Delete a single file. Used e.g. for a product's `.vst3`/`.dll` inside a
   * shared plugin folder (the folder itself is never deleted, PLAN.md §2.2).
   */
  async deleteFile(filePath: string): Promise<void> {
    if (this.settingsStore.effectiveDryRun) {
      this.logger.info(`DRY-RUN: would delete file ${filePath}`, LOG_SOURCE);
      return;
    }
    this.logger.info(`Deleting file ${filePath}`, LOG_SOURCE);
    await fs.promises.rm(filePath, { force: true });
  }

  /**
   * Recursively delete a folder. Used for product-owned folders
   * (ContentDir, InstallDir, CommonFiles, `.aaxplugin` bundles).
   */
  async deleteFolder(folderPath: string): Promise<void> {
    if (this.settingsStore.effectiveDryRun) {
      this.logger.info(`DRY-RUN: would delete folder ${folderPath} (recursive)`, LOG_SOURCE);
      return;
    }
    this.logger.info(`Deleting folder ${folderPath} (recursive)`, LOG_SOURCE);
    await fs.promises.rm(folderPath, { recursive: true, force: true });
  }
}
