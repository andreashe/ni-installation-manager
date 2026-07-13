import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursive size of a file or folder in bytes. Symbolic links are never
 * followed (avoids cycles and double counting); unreadable entries count
 * as 0. Shared by `ProductDiskUsageService` (list sizes) and `BackupService`
 * (free-space check before copying).
 */
export async function sizeOfPath(target: string): Promise<number> {
  let stats: fs.Stats;
  try {
    stats = await fs.promises.lstat(target);
  } catch {
    return 0;
  }
  if (stats.isSymbolicLink()) {
    return 0;
  }
  if (stats.isFile()) {
    return stats.size;
  }
  if (!stats.isDirectory()) {
    return 0;
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(target, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    total += await sizeOfPath(path.join(target, entry.name));
  }
  return total;
}

/**
 * Device root of an absolute path (`C:\Program Files\…` → `C:\`). Used by
 * the restore/move free-space checks to sum required bytes per device.
 */
export function deviceRoot(target: string): string {
  return path.parse(path.resolve(target)).root;
}
