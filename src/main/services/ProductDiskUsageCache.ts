import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'ProductDiskUsageCache';

/** Content of one cache file (JSON) inside the disk usage cache folder. */
interface DiskUsageCacheEntry {
  /** Resolved disk usage of the product in bytes. */
  bytes: number;
  /** ISO timestamp of when the size was scanned. */
  scanTime: string;
  /** Product version the size was scanned for; a mismatch invalidates the entry. */
  productVersion: string | null;
}

/**
 * File cache for resolved per-product disk usage (TODO11), so the slow
 * recursive size scan can be skipped when nothing changed.
 *
 * One JSON file per product in the `ProductDiskUsageCache` folder (userData),
 * named `<md5(product name)>.json` — hashing sidesteps characters that are
 * invalid in file names. An entry is only served while its `productVersion`
 * still matches the scanned product; otherwise the caller rescans.
 *
 * Cleared by the Installed page reload button (before rescanning), the
 * Preferences "Clear cache" button and after every real restore job
 * (restored files change sizes on disk).
 */
export class ProductDiskUsageCache {
  constructor(
    private readonly cacheFolderPath: string,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Cached byte size for the product, or null when no valid entry exists
   * (no file yet, unreadable/malformed file, or the version changed).
   */
  async read(productName: string, productVersion: string | null): Promise<number | null> {
    let raw: string;
    try {
      raw = await fs.promises.readFile(this.entryFilePath(productName), 'utf8');
    } catch {
      return null; // not cached yet
    }
    try {
      const entry = JSON.parse(raw) as DiskUsageCacheEntry;
      if (typeof entry.bytes !== 'number') {
        throw new Error('bytes missing');
      }
      if (entry.productVersion !== productVersion) {
        this.logger.debug(
          `Disk usage cache for ${productName} is for version ${String(entry.productVersion)} (now ${String(productVersion)}) — rescanning`,
          LOG_SOURCE,
        );
        return null;
      }
      return entry.bytes;
    } catch (error) {
      this.logger.warn(
        `Invalid disk usage cache file for ${productName}: ${String(error)}`,
        LOG_SOURCE,
      );
      return null;
    }
  }

  /** Persist the resolved size for the product (called after every scan). */
  async write(productName: string, productVersion: string | null, bytes: number): Promise<void> {
    const entry: DiskUsageCacheEntry = {
      bytes,
      scanTime: new Date().toISOString(),
      productVersion,
    };
    await fs.promises.mkdir(this.cacheFolderPath, { recursive: true });
    await fs.promises.writeFile(
      this.entryFilePath(productName),
      JSON.stringify(entry, null, 2),
      'utf8',
    );
  }

  /** Remove ALL cache files (reload button, Clear cache, after restore). */
  async clear(): Promise<void> {
    let names: string[];
    try {
      names = await fs.promises.readdir(this.cacheFolderPath);
    } catch {
      return; // folder does not exist yet — nothing to clear
    }
    for (const name of names) {
      await fs.promises.rm(path.join(this.cacheFolderPath, name), { force: true });
    }
    this.logger.info(`Disk usage cache cleared (${names.length} file(s))`, LOG_SOURCE);
  }

  /** Cache file path for one product: `<md5(name)>.json` in the cache folder. */
  private entryFilePath(productName: string): string {
    const hash = crypto.createHash('md5').update(productName, 'utf8').digest('hex');
    return path.join(this.cacheFolderPath, `${hash}.json`);
  }
}
