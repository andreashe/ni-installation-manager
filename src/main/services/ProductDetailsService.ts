import fs from 'node:fs';
import { isSharedContainerKind } from '../../shared/types/product';
import type { ProductDetailsDto, ProductLocationDetails } from '../../shared/types/product-details';
import type { ProductStore } from '../stores/ProductStore';
import { sizeOfPath } from '../utils/fs-size';
import { normalizePathKey, removeNestedPaths } from '../utils/path-key';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'ProductDetailsService';

/**
 * Builds the on-demand payload for the product details panel (TODO6):
 * per-location type/size/dates, deduplicated total and registry paths.
 * Called from the `products:get-details` IPC handler; sizes require
 * filesystem walks, which is why this is not part of the list push.
 */
export class ProductDetailsService {
  constructor(
    private readonly productStore: ProductStore,
    private readonly logger: LoggerService,
  ) {}

  /** Details for one product by name; null when it is not in the store (e.g. just uninstalled). */
  async getDetails(productName: string): Promise<ProductDetailsDto | null> {
    const product = this.productStore.findByName(productName);
    if (!product) {
      this.logger.warn(`Details requested for unknown product "${productName}"`, LOG_SOURCE);
      return null;
    }

    const locations: ProductLocationDetails[] = [];
    for (const diskPath of product.diskPaths) {
      locations.push(await this.describeLocation(diskPath.kind, diskPath.resolvedPath, diskPath.exists));
    }

    // Total mirrors the disk usage scan (TODO6/TODO7): duplicates and paths
    // nested inside another counted folder are summed once. Shared
    // containers are excluded BEFORE the nested-dedupe — they carry size 0
    // and would otherwise swallow the plugin files living inside them
    // (Install*File is always nested in its Install*Dir).
    const countable = new Set(
      removeNestedPaths(
        locations
          .filter((location) => location.exists && !isSharedContainerKind(location.kind))
          .map((location) => location.path),
      ).map((survivor) => normalizePathKey(survivor)),
    );
    let total = 0;
    for (const location of locations) {
      const key = normalizePathKey(location.path);
      if (location.exists && countable.has(key)) {
        countable.delete(key); // count each surviving path once
        total += location.sizeBytes;
      }
    }

    return {
      name: product.name,
      version: product.version,
      removable: product.removable,
      locations,
      totalDiskUsageBytes: total,
      registryPaths: Object.keys(product.registryEntries).map((keyPath) => `HKLM\\${keyPath}`),
    };
  }

  /**
   * Stat one location: file-vs-folder, recursive size, creation/modification
   * dates. Shared plugin containers are never walked (they hold other
   * products; their size would be big, slow and meaningless) — size 0.
   */
  private async describeLocation(
    kind: ProductLocationDetails['kind'],
    target: string,
    exists: boolean,
  ): Promise<ProductLocationDetails> {
    let stats: fs.Stats | null = null;
    try {
      stats = await fs.promises.stat(target);
    } catch {
      // Path vanished since the scan — report as missing.
    }
    const shared = isSharedContainerKind(kind);
    return {
      kind,
      path: target,
      exists: exists && stats !== null,
      isFile: stats?.isFile() ?? false,
      sizeBytes: stats && !shared ? await sizeOfPath(target) : 0,
      createdAt: stats ? Math.round(stats.birthtimeMs) : null,
      modifiedAt: stats ? Math.round(stats.mtimeMs) : null,
    };
  }
}
