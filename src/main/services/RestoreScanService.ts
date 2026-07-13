import fs from 'node:fs';
import path from 'node:path';
import type { ProductDto } from '../../shared/types/product';
import { BackupProduct } from '../models/BackupProduct';
import type { RestoreStore } from '../stores/RestoreStore';
import type { SettingsStore } from '../stores/SettingsStore';
import {
  BACKUP_DESCRIPTION_FILE,
  BACKUP_PRODUCT_IMAGE_FILE,
} from '../utils/backup-layout';
import { sizeOfPath } from '../utils/fs-size';
import type { ArtworkCacheService } from './ArtworkCacheService';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'RestoreScanService';

/** Parsed shape of a `niim-backup-desc.json` (written by `BackupService`). */
interface BackupDescription {
  name: string;
  version: string | null;
  backupDate: string;
  product: ProductDto;
}

/**
 * Scans the configured backup folder for restorable product backups and
 * (re)fills the `RestoreStore` (TODO8). Triggered at startup, by the
 * Restore page reload button and whenever the backup folder setting
 * changes.
 *
 * Scan = one directory dive: every DIRECT subfolder of the backup folder
 * containing a `niim-backup-desc.json` is one backup. Two enrichment phases
 * follow (visible via status bar + log): artwork (cache reuse → backup
 * `product.png` import) and backup folder sizes for descriptors without a
 * `diskUsageBytes` value.
 */
export class RestoreScanService {
  /** Guards against overlapping scans (double-click on reload). */
  private scanRunning = false;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly restoreStore: RestoreStore,
    private readonly artworkCache: ArtworkCacheService,
    private readonly logger: LoggerService,
  ) {}

  /** Full backup folder scan; replaces the store content in one step. */
  async scan(): Promise<void> {
    if (this.scanRunning) {
      this.logger.debug('Backup scan already running — request ignored', LOG_SOURCE);
      return;
    }
    this.scanRunning = true;
    this.restoreStore.setScanning(true);

    try {
      const backupFolder = this.settingsStore.settings.backupFolder;
      if (backupFolder === '') {
        this.restoreStore.replaceAll([]);
        this.logger.info('Backup scan skipped — no backup folder configured', LOG_SOURCE);
        return;
      }

      this.restoreStore.setStatusText(`Scanning backup folder: ${backupFolder}`);
      this.logger.info(`Backup scan started: ${backupFolder}`, LOG_SOURCE);

      const backups = await this.collectBackups(backupFolder);
      this.restoreStore.replaceAll(backups);
      this.logger.info(`Backup scan finished: ${backups.length} backup(s) found`, LOG_SOURCE);

      await this.resolveArtwork(backups);
      await this.scanMissingSizes(backups);
    } catch (error) {
      this.logger.error(`Backup scan failed: ${String(error)}`, LOG_SOURCE);
    } finally {
      this.restoreStore.setStatusText(null);
      this.restoreStore.setScanning(false);
      this.scanRunning = false;
    }
  }

  /** One-level dive: read every direct subfolder's backup description. */
  private async collectBackups(backupFolder: string): Promise<BackupProduct[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(backupFolder, { withFileTypes: true });
    } catch (error) {
      this.logger.warn(`Cannot read backup folder ${backupFolder}: ${String(error)}`, LOG_SOURCE);
      return [];
    }

    const backups: BackupProduct[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const productFolder = path.join(backupFolder, entry.name);
      this.restoreStore.setStatusText(`Scanning backups: ${productFolder}`);
      this.logger.debug(`Scanning backup folder: ${productFolder}`, LOG_SOURCE);
      const backup = await this.readBackupDescription(productFolder);
      if (backup) {
        backups.push(backup);
        this.logger.info(
          `Found backup: "${backup.name}" (version ${backup.version ?? '—'}, ${backup.backupDate})`,
          LOG_SOURCE,
        );
      }
    }
    return backups;
  }

  /** Parse one `niim-backup-desc.json`; null when absent or malformed. */
  private async readBackupDescription(productFolder: string): Promise<BackupProduct | null> {
    const descriptionPath = path.join(productFolder, BACKUP_DESCRIPTION_FILE);
    let raw: string;
    try {
      raw = await fs.promises.readFile(descriptionPath, 'utf8');
    } catch {
      return null; // no description file — not a backup folder
    }

    try {
      const parsed = JSON.parse(raw) as Partial<BackupDescription>;
      if (typeof parsed.name !== 'string' || parsed.name === '' || typeof parsed.product !== 'object' || parsed.product === null) {
        throw new Error('missing "name" or "product"');
      }
      return new BackupProduct({
        name: parsed.name,
        version: typeof parsed.version === 'string' ? parsed.version : null,
        backupDate: typeof parsed.backupDate === 'string' ? parsed.backupDate : '',
        backupFolderPath: productFolder,
        descriptor: parsed.product,
      });
    } catch (error) {
      this.logger.warn(`Invalid backup description ${descriptionPath}: ${String(error)}`, LOG_SOURCE);
      return null;
    }
  }

  /**
   * Artwork phase (TODO8): reuse an existing cache entry; otherwise import
   * the backup's `product.png` into the cache. Backups without either keep
   * null — the renderer falls back to the bundled alt image.
   */
  private async resolveArtwork(backups: BackupProduct[]): Promise<void> {
    for (const backup of backups) {
      const cached = await this.artworkCache.getCachedArtworkFileName(backup.name);
      if (cached) {
        backup.setArtworkCacheFileName(cached);
        continue;
      }
      const backupImage = path.join(backup.backupFolderPath, BACKUP_PRODUCT_IMAGE_FILE);
      if (await pathExists(backupImage)) {
        this.restoreStore.setStatusText(`Importing backup artwork: ${backup.name}`);
        this.logger.info(`Importing backup artwork for "${backup.name}"`, LOG_SOURCE);
        backup.setArtworkCacheFileName(await this.artworkCache.importArtwork(backup.name, backupImage));
      }
    }
  }

  /**
   * Size phase (TODO8): backups whose descriptor carries no
   * `diskUsageBytes` get the recursive size of their backup subfolder.
   * Sizes fill in live (one MobX push per backup).
   */
  private async scanMissingSizes(backups: BackupProduct[]): Promise<void> {
    for (const backup of backups) {
      if (backup.diskUsageBytes !== null) {
        continue;
      }
      this.restoreStore.setStatusText(`Scanning backup size: ${backup.name}`);
      this.logger.info(
        `Scanning backup size: ${backup.name} (${backup.backupFolderPath})`,
        LOG_SOURCE,
      );
      backup.setDiskUsage(await sizeOfPath(backup.backupFolderPath));
    }
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
