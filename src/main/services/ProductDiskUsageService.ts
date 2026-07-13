import { isSharedContainerKind } from '../../shared/types/product';
import type { Product } from '../models/Product';
import type { ProductStore } from '../stores/ProductStore';
import { sizeOfPath } from '../utils/fs-size';
import { removeNestedPaths } from '../utils/path-key';
import type { LoggerService } from './LoggerService';
import type { ProductDiskUsageCache } from './ProductDiskUsageCache';

const LOG_SOURCE = 'ProductDiskUsageService';

/**
 * Background per-product disk-usage scanner (PLAN.md §5 step 5).
 *
 * Sums the size of every EXISTING disk path of each product and writes the
 * result into the product model one by one — each `setDiskUsage` triggers a
 * MobX push, so sizes fill in live in the UI. Triggered by
 * `ProductScanService` after every (re)scan; a newer run cancels the
 * remaining work of an older one.
 *
 * Resolved sizes are cached per product (`ProductDiskUsageCache`, TODO11):
 * a valid cache entry (same product version) skips the scan entirely; after
 * a real scan the result is written back to the cache.
 */
export class ProductDiskUsageService {
  /** Incremented per run; stale runs notice and stop between products. */
  private runCounter = 0;

  constructor(
    private readonly productStore: ProductStore,
    private readonly logger: LoggerService,
    private readonly cache: ProductDiskUsageCache,
  ) {}

  /** Sum sizes for all products currently in the store, one product at a time. */
  async scanAll(): Promise<void> {
    const runId = ++this.runCounter;
    const products = [...this.productStore.products];
    this.logger.info(`Disk usage scan started for ${products.length} products`, LOG_SOURCE);
    this.productStore.setStatusText('Scanning disk usage…');

    let scanned = 0;
    for (const product of products) {
      if (runId !== this.runCounter) {
        this.logger.debug('Disk usage scan superseded by a newer run — stopping', LOG_SOURCE);
        return;
      }
      await this.scanProduct(product);
      scanned += 1;
    }

    if (runId === this.runCounter) {
      this.productStore.setStatusText(null);
      this.logger.info(`Disk usage scan finished (${scanned} products)`, LOG_SOURCE);
    }
  }

  /**
   * Resolve the disk usage of one product: from the cache when a valid
   * entry for the product's version exists (scan skipped, TODO11),
   * otherwise by summing all existing disk paths and caching the result.
   *
   * Identical resolved paths are counted once — "identical" via
   * `normalizePathKey`, so ContentDir equal to InstallDir, trailing-
   * backslash variants and casing differences all collapse to one entry
   * (TODO6). Logs and shows in the status bar which product/folder is
   * currently analyzed (TODO2), so the user can follow long scans.
   */
  private async scanProduct(product: Product): Promise<void> {
    const cachedBytes = await this.cache.read(product.name, product.version);
    if (cachedBytes !== null) {
      this.logger.debug(
        `Disk usage from cache: ${product.name} (${cachedBytes} bytes) — scan skipped`,
        LOG_SOURCE,
      );
      product.setDiskUsage(cachedBytes);
      return;
    }

    // Shared plugin containers hold OTHER products too — never sum them.
    // Duplicates (backslash/casing variants) and paths nested inside another
    // counted folder are removed so nothing is summed twice (TODO7).
    const uniquePaths = removeNestedPaths(
      product.diskPaths
        .filter((diskPath) => diskPath.exists && !isSharedContainerKind(diskPath.kind))
        .map((diskPath) => diskPath.resolvedPath),
    );
    this.logger.info(
      `Scanning disk usage: ${product.name} (${uniquePaths.length} location(s))`,
      LOG_SOURCE,
    );

    let total = 0;
    for (const target of uniquePaths) {
      this.logger.debug(`Scanning disk usage: ${product.name} - ${target}`, LOG_SOURCE);
      this.productStore.setStatusText(`Scanning disk usage: ${product.name} - ${target}`);
      total += await sizeOfPath(target);
    }
    product.setDiskUsage(total);

    this.logger.info(`Creating disk usage cache for ${product.name} (${total} bytes)`, LOG_SOURCE);
    this.productStore.setStatusText(`Creating disk usage cache: ${product.name}`);
    await this.cache.write(product.name, product.version, total);
  }
}
