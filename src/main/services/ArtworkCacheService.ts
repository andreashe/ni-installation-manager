import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NI_COMMON_FILES_BASE, NI_PUBLIC_RESOURCES_IMAGE_BASE } from '../../config/ni.config';
import type { Product } from '../models/Product';
import type { ProductStore } from '../stores/ProductStore';
import type { ArtworkFetcher } from '../utils/ArtworkImageProcessor';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'ArtworkCacheService';

/**
 * Artwork file names, best first. `MST_artwork.png` is the standard; some
 * products only ship a logo/box variant. Matched case-insensitively.
 */
const ARTWORK_CANDIDATES = ['MST_artwork.png', 'MST_logo.png', 'VB_artwork.png'];

/** Recursion cap for the artwork walk — the NI trees are shallow (< 6 levels). */
const MAX_SCAN_DEPTH = 10;

/**
 * Finds product artwork on disk and copies it into the frontend assets
 * cache so the renderer can display it via the `ni-assets://` protocol
 * (PLAN.md §2.3, TODO5).
 *
 * Discovery is a RECURSIVE scan of the NI artwork roots (fixed patterns
 * proved unreliable — vendor subfolders like `image\arturia\acid v\…`
 * exist): every folder directly containing an artwork candidate is treated
 * as one product, keyed by its lower-cased folder name
 * (`imagesOnDiskByProductName`). Products are then matched against that map
 * case-insensitively. Triggered by `ProductScanService` after every scan.
 */
export class ArtworkCacheService {
  /** Lower-cased product name → CDN URL (from `src/config/na_cdn-assets.json`). */
  private readonly cdnUrlsByLowerName: Map<string, string>;

  constructor(
    private readonly productStore: ProductStore,
    private readonly logger: LoggerService,
    private readonly cacheFolder: string,
    cdnAssets: Record<string, string>,
    private readonly artworkFetcher: ArtworkFetcher,
  ) {
    this.cdnUrlsByLowerName = new Map(
      Object.entries(cdnAssets).map(([name, url]) => [name.toLowerCase(), url]),
    );
  }

  /**
   * Clear the frontend assets cache (Preferences → "Clear cache", TODO6):
   * delete all cached images and reset the products' artwork references —
   * the UI falls back to the bundled alt image until the next reload scan.
   */
  async clearCache(): Promise<void> {
    await fs.promises.rm(this.cacheFolder, { recursive: true, force: true });
    await fs.promises.mkdir(this.cacheFolder, { recursive: true });
    for (const product of this.productStore.products) {
      product.setArtworkCacheFileName(null);
    }
    this.logger.info('Frontend assets cache cleared', LOG_SOURCE);
  }

  /**
   * Resolve artwork for all products. Cache first: products with an
   * existing cache file are served without touching the disk roots; the
   * (expensive) recursive scan only runs when artwork is still missing —
   * and only the missing products go through disk-map/CDN resolution.
   */
  async cacheAll(): Promise<void> {
    await fs.promises.mkdir(this.cacheFolder, { recursive: true });

    // Phase 1: reuse existing cache entries.
    this.productStore.setStatusText('Checking artwork cache…');
    let found = 0;
    const missing: Product[] = [];
    for (const product of [...this.productStore.products]) {
      if (await this.reuseCachedArtwork(product)) {
        found += 1;
      } else {
        missing.push(product);
      }
    }
    this.logger.info(
      `Artwork from cache: ${found} product(s); still missing: ${missing.length}`,
      LOG_SOURCE,
    );

    if (missing.length > 0) {
      // Phase 2: disk roots scan, only now that something is actually missing.
      this.logger.info('Artwork scan started (disk roots)', LOG_SOURCE);
      const imagesOnDiskByProductName = await this.scanArtworkOnDisk();
      this.logger.info(
        `Artwork scan found images for ${imagesOnDiskByProductName.size} product folder(s)`,
        LOG_SOURCE,
      );

      // Phase 3: resolve the missing products via disk map, then CDN.
      for (const product of missing) {
        this.productStore.setStatusText(`Caching artwork: ${product.name}`);
        if (await this.cacheProduct(product, imagesOnDiskByProductName)) {
          found += 1;
        }
      }
    }

    this.productStore.setStatusText(null);
    this.logger.info(
      `Artwork cached for ${found} of ${this.productStore.products.length} products`,
      LOG_SOURCE,
    );
  }

  /**
   * Cache file name for a product when its artwork is already cached, null
   * otherwise. Used by the restore scan (TODO8) to reuse existing artwork
   * before falling back to the backup's `product.png`.
   */
  async getCachedArtworkFileName(productName: string): Promise<string | null> {
    const cacheFileName = `${sanitizeFileName(productName)}.png`;
    return (await pathExists(path.join(this.cacheFolder, cacheFileName))) ? cacheFileName : null;
  }

  /**
   * Import an external PNG (e.g. a backup's `product.png`, TODO8) into the
   * assets cache under the product's cache file name. Returns the cache file
   * name, or null when the copy failed.
   */
  async importArtwork(productName: string, sourcePath: string): Promise<string | null> {
    const cacheFileName = `${sanitizeFileName(productName)}.png`;
    try {
      await fs.promises.mkdir(this.cacheFolder, { recursive: true });
      await fs.promises.copyFile(sourcePath, path.join(this.cacheFolder, cacheFileName));
      return cacheFileName;
    } catch (error) {
      this.logger.warn(
        `Could not import artwork for "${productName}" from ${sourcePath}: ${String(error)}`,
        LOG_SOURCE,
      );
      return null;
    }
  }

  /**
   * Walk both artwork roots and map lower-cased product-folder names to the
   * best artwork file found directly inside them (TODO5). The status bar
   * shows each directory while it is scanned.
   */
  private async scanArtworkOnDisk(): Promise<Map<string, string>> {
    /** value: artwork path + its index in ARTWORK_CANDIDATES (lower = better). */
    const best = new Map<string, { filePath: string; priority: number }>();

    for (const root of [NI_COMMON_FILES_BASE, NI_PUBLIC_RESOURCES_IMAGE_BASE]) {
      await this.walkForArtwork(root, best, 0);
    }

    const result = new Map<string, string>();
    for (const [productKey, entry] of best) {
      result.set(productKey, entry.filePath);
    }
    return result;
  }

  /** Depth-first artwork search; unreadable folders and symlinks are skipped. */
  private async walkForArtwork(
    dir: string,
    best: Map<string, { filePath: string; priority: number }>,
    depth: number,
  ): Promise<void> {
    if (depth > MAX_SCAN_DEPTH) {
      return;
    }
    this.productStore.setStatusText(`Scanning artwork: ${dir}`);
    this.logger.debug(`Scanning artwork folder: ${dir}`, LOG_SOURCE);

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // root or subfolder missing/unreadable — nothing to scan here
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await this.walkForArtwork(path.join(dir, entry.name), best, depth + 1);
        continue;
      }
      const priority = ARTWORK_CANDIDATES.findIndex(
        (candidate) => candidate.toLowerCase() === entry.name.toLowerCase(),
      );
      if (priority === -1) {
        continue;
      }
      // The folder directly containing the artwork names the product. The
      // parent folder may be a vendor prefix (TODO5): register the file
      // under both keys, e.g. `image\arturia\acid v\…` fits product
      // "Acid V" AND "Arturia-Acid V".
      const keys = [path.basename(dir).toLowerCase()];
      if (depth >= 2) {
        keys.push(`${path.basename(path.dirname(dir))}-${path.basename(dir)}`.toLowerCase());
      }
      for (const productKey of keys) {
        const known = best.get(productKey);
        if (!known || priority < known.priority) {
          best.set(productKey, { filePath: path.join(dir, entry.name), priority });
        }
      }
    }
  }

  /**
   * Phase-1 check: adopt an artwork file cached by a previous run.
   * True when the product is covered without any disk/CDN work.
   */
  private async reuseCachedArtwork(product: Product): Promise<boolean> {
    const cacheFileName = `${sanitizeFileName(product.name)}.png`;
    if (await pathExists(path.join(this.cacheFolder, cacheFileName))) {
      product.setArtworkCacheFileName(cacheFileName);
      return true;
    }
    return false;
  }

  /**
   * Resolve one MISSING product (phase 3): copy a disk hit
   * (case-insensitive map lookup), or as last resort download from the NI
   * CDN (TODO6) — resized/cover-cropped by the fetcher before caching.
   */
  private async cacheProduct(
    product: Product,
    imagesOnDiskByProductName: Map<string, string>,
  ): Promise<boolean> {
    const cacheFileName = `${sanitizeFileName(product.name)}.png`;
    const cachePath = path.join(this.cacheFolder, cacheFileName);

    const sourcePath = imagesOnDiskByProductName.get(product.name.toLowerCase());
    if (sourcePath) {
      try {
        this.logger.debug(`Caching artwork from disk: "${product.name}" ← ${sourcePath}`, LOG_SOURCE);
        await fs.promises.copyFile(sourcePath, cachePath);
        product.setArtworkCacheFileName(cacheFileName);
        return true;
      } catch (error) {
        this.logger.warn(
          `Could not cache artwork for "${product.name}": ${String(error)}`,
          LOG_SOURCE,
        );
        return false;
      }
    }

    if (await this.cacheFromCdn(product, cachePath, cacheFileName)) {
      return true;
    }
    return this.cacheFromWallpaper(product, cachePath, cacheFileName);
  }

  /** Nothing on disk: try the NI CDN asset list, download + resize + cache. */
  private async cacheFromCdn(
    product: Product,
    cachePath: string,
    cacheFileName: string,
  ): Promise<boolean> {
    const url = this.cdnUrlsByLowerName.get(product.name.toLowerCase());
    if (!url) {
      return false;
    }
    try {
      this.productStore.setStatusText(`Downloading artwork: ${product.name}`);
      this.logger.info(`Downloading artwork for "${product.name}" from ${url}`, LOG_SOURCE);
      const resizedPng = await this.artworkFetcher.fetchAndResize(url);
      this.productStore.setStatusText(`Resizing artwork: ${product.name}`);
      this.logger.debug(`Resized artwork for "${product.name}" to cache format`, LOG_SOURCE);
      await fs.promises.writeFile(cachePath, resizedPng);
      product.setArtworkCacheFileName(cacheFileName);
      this.logger.info(`Artwork for "${product.name}" downloaded and cached`, LOG_SOURCE);
      return true;
    } catch (error) {
      this.logger.warn(
        `CDN artwork download failed for "${product.name}": ${String(error)}`,
        LOG_SOURCE,
      );
      return false;
    }
  }

  /**
   * Last fallback (TODO6): a `wallpaper.png` inside one of the product's
   * ContentDir folders. Copied to a temporary file first, then converted by
   * the image processor (proportional resize to 66 px height, LEFT crop to
   * 134×66) and cached like any other artwork.
   */
  private async cacheFromWallpaper(
    product: Product,
    cachePath: string,
    cacheFileName: string,
  ): Promise<boolean> {
    for (const diskPath of product.diskPaths) {
      if (diskPath.kind !== 'ContentDir' || !diskPath.exists) {
        continue;
      }
      const wallpaperPath = path.join(diskPath.resolvedPath, 'wallpaper.png');
      if (!(await pathExists(wallpaperPath))) {
        continue;
      }

      const tempPath = path.join(os.tmpdir(), `niim-wallpaper-${Date.now()}.png`);
      try {
        this.productStore.setStatusText(`Processing wallpaper: ${product.name}`);
        this.logger.info(
          `Using wallpaper as artwork for "${product.name}": ${wallpaperPath}`,
          LOG_SOURCE,
        );
        await fs.promises.copyFile(wallpaperPath, tempPath);
        const resizedPng = await this.artworkFetcher.resizeWallpaper(tempPath);
        this.productStore.setStatusText(`Resizing wallpaper: ${product.name}`);
        this.logger.debug(`Resized wallpaper for "${product.name}" to cache format`, LOG_SOURCE);
        await fs.promises.writeFile(cachePath, resizedPng);
        product.setArtworkCacheFileName(cacheFileName);
        this.logger.info(`Wallpaper artwork cached for "${product.name}"`, LOG_SOURCE);
        return true;
      } catch (error) {
        this.logger.warn(
          `Wallpaper processing failed for "${product.name}": ${String(error)}`,
          LOG_SOURCE,
        );
      } finally {
        await fs.promises.rm(tempPath, { force: true });
      }
    }
    return false;
  }
}

/** Replace characters Windows forbids in file names so any product name maps to a cache file. */
function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
