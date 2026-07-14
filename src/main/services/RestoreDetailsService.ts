import fs from 'node:fs';
import { isSharedContainerKind } from '../../shared/types/product';
import type { RestoreDetailsDto, RestoreLocationDetails } from '../../shared/types/restore';
import type { RestoreStore } from '../stores/RestoreStore';
import { getBackupEntryPath } from '../utils/backup-layout';
import { sizeOfPath } from '../utils/fs-size';
import { normalizePathKey } from '../utils/path-key';
import { displayKeyPath } from '../utils/registry-path';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'RestoreDetailsService';

/**
 * Builds the on-demand payload for the restore details panel (TODO8):
 * per-location restore target (may not exist yet — yellow when it already
 * does), the matching source inside the backup subfolder (red when the
 * descriptor mentions a kind the backup has no data for), backup sizes and
 * the potential total restore size. Called from the `restore:get-details`
 * IPC handler; sizes require filesystem walks over the backup folder.
 */
export class RestoreDetailsService {
  constructor(
    private readonly restoreStore: RestoreStore,
    private readonly logger: LoggerService,
  ) {}

  /** Details for one backup by product name; null when it is not in the store. */
  async getDetails(backupName: string): Promise<RestoreDetailsDto | null> {
    const backup = this.restoreStore.findByName(backupName);
    if (!backup) {
      this.logger.warn(`Details requested for unknown backup "${backupName}"`, LOG_SOURCE);
      return null;
    }

    // Shared plugin containers are never backed up (TODO6) — only their
    // resolved Install*File entries — so they are no restore locations.
    const locations: RestoreLocationDetails[] = [];
    for (const diskPath of backup.descriptor.diskPaths) {
      if (isSharedContainerKind(diskPath.kind)) {
        continue;
      }
      const backupPath = getBackupEntryPath(
        backup.backupFolderPath,
        diskPath.kind,
        diskPath.resolvedPath,
      );
      locations.push({
        kind: diskPath.kind,
        targetPath: diskPath.resolvedPath,
        targetExists: await pathExists(diskPath.resolvedPath),
        backupPath,
        backupExists: await pathExists(backupPath),
        backupSizeBytes: await sizeOfPath(backupPath),
      });
    }

    // Potential total: every existing backup source, identical sources once.
    const counted = new Set<string>();
    let total = 0;
    for (const location of locations) {
      const key = normalizePathKey(location.backupPath);
      if (location.backupExists && !counted.has(key)) {
        counted.add(key);
        total += location.backupSizeBytes;
      }
    }

    return {
      name: backup.name,
      version: backup.version,
      backupDate: backup.backupDate,
      locations,
      totalRestoreBytes: total,
      registryPaths: Object.keys(backup.descriptor.registryEntries).map(displayKeyPath),
    };
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
