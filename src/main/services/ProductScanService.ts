import { NI_REGISTRY_ROOTS } from '../../config/ni.config';
import type { Product } from '../models/Product';
import { ProductFactory } from '../models/ProductFactory';
import type { ProductRegistrySource } from '../models/ProductFactory';
import type { ProductStore } from '../stores/ProductStore';
import type { ArtworkCacheService } from './ArtworkCacheService';
import type { ProductDiskUsageService } from './ProductDiskUsageService';
import type { LoggerService } from './LoggerService';
import type { RegistryService } from './RegistryService';

const LOG_SOURCE = 'ProductScanService';

/**
 * Scans the Windows registry for installed NI products and (re)fills the
 * `ProductStore` (PLAN.md §5). Triggered at startup (main.ts) and by the
 * reload button (products:rescan IPC handler).
 *
 * NOTE: registry values contain license data (KEY/SNO) — never log values,
 * only counts and key paths.
 */
export class ProductScanService {
  private readonly factory = new ProductFactory();
  /** Guards against overlapping scans (double-click on reload). */
  private scanRunning = false;

  constructor(
    private readonly registry: RegistryService,
    private readonly productStore: ProductStore,
    private readonly logger: LoggerService,
    private readonly artworkCache: ArtworkCacheService,
    private readonly diskUsage: ProductDiskUsageService,
  ) {}

  /**
   * Full scan: enumerate both registry roots, merge same-named subkeys into
   * one product (a product may appear in the 64-bit AND 32-bit view), build
   * models via the factory and replace the store content in one step.
   */
  async scan(): Promise<void> {
    if (this.scanRunning) {
      this.logger.debug('Scan already running — request ignored', LOG_SOURCE);
      return;
    }
    this.scanRunning = true;
    this.productStore.setScanning(true);
    this.productStore.setStatusText('Scanning registry…');
    this.logger.info('Product scan started', LOG_SOURCE);

    try {
      const sourcesByProduct = this.collectRegistrySources();
      const products: Product[] = [];
      for (const [name, sources] of sourcesByProduct) {
        products.push(await this.factory.create(name, sources));
      }
      this.productStore.replaceAll(products);
      this.logger.info(
        `Product scan finished: ${products.length} products (${products.filter((p) => p.removable).length} removable)`,
        LOG_SOURCE,
      );
    } catch (error) {
      this.logger.error(`Product scan failed: ${String(error)}`, LOG_SOURCE);
    } finally {
      this.productStore.setScanning(false);
      this.scanRunning = false;
    }

    // Background enrichment AFTER the list is visible. Order is a
    // requirement: artwork discovery/download has HIGHER priority than the
    // disk usage scan — images must be complete before the slow size scan
    // starts (they run strictly sequentially, never interleaved).
    await this.artworkCache.cacheAll();
    await this.diskUsage.scanAll();
  }

  /**
   * Read every product subkey of both NI registry roots and group the raw
   * values by product name (case-insensitive merge — registry key names are
   * case-insensitive; first-seen casing wins for display).
   */
  private collectRegistrySources(): Map<string, ProductRegistrySource[]> {
    const byLowerName = new Map<string, { displayName: string; sources: ProductRegistrySource[] }>();

    for (const root of NI_REGISTRY_ROOTS) {
      for (const subkeyName of this.registry.listSubkeyNames(root)) {
        const keyPath = `${root}\\${subkeyName}`;
        const values = this.registry.readAllValues(keyPath);
        if (values === null) {
          continue; // key vanished between enumeration and read
        }
        const lower = subkeyName.toLowerCase();
        const entry = byLowerName.get(lower) ?? { displayName: subkeyName, sources: [] };
        entry.sources.push({ keyPath, values });
        byLowerName.set(lower, entry);
      }
    }

    const result = new Map<string, ProductRegistrySource[]>();
    for (const { displayName, sources } of byLowerName.values()) {
      result.set(displayName, sources);
    }
    return result;
  }
}
