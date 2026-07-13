import { makeAutoObservable } from 'mobx';
import type { ProductListState } from '../../shared/types/product';
import type { Product } from '../models/Product';

/**
 * Main-process source of truth for the scanned product list (MobX).
 *
 * Filled by `ProductScanService`, enriched asynchronously by
 * `ProductDiskUsageService`/`ArtworkCacheService` (phase 3) and reduced by
 * `UninstallService` (phase 6). The store-sync layer observes it and pushes
 * `ProductListState` snapshots to the renderer.
 */
export class ProductStore {
  products: Product[] = [];
  /** True while a scan runs; drives the status bar / reload spinner. */
  scanning = false;
  /** Human-readable current background activity for the status bar; null = idle. */
  statusText: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setScanning(scanning: boolean): void {
    this.scanning = scanning;
  }

  /** Set by scan/enrichment services to tell the user what runs in the background. */
  setStatusText(text: string | null): void {
    this.statusText = text;
  }

  /** Replace the whole list at the end of a scan (sorted by name for stable UI order). */
  replaceAll(products: Product[]): void {
    this.products = [...products].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Remove one product after successful uninstall (phase 6). */
  removeByName(name: string): void {
    this.products = this.products.filter((product) => product.name !== name);
  }

  findByName(name: string): Product | undefined {
    return this.products.find((product) => product.name === name);
  }

  /**
   * Serializable snapshot for the renderer. Touches every observable field
   * (including per-product `diskUsageBytes`/`artworkCachePath`), so a MobX
   * autorun over this method re-fires on any nested change.
   */
  toState(): ProductListState {
    return {
      scanning: this.scanning,
      statusText: this.statusText,
      products: this.products.map((product) => product.toDto()),
    };
  }
}
