import { makeAutoObservable, toJS } from 'mobx';
import { buildAssetsUrl } from '../../config/assets.config';
import type {
  ProductDiskPath,
  ProductDto,
  RegistryValueDto,
} from '../../shared/types/product';

/**
 * Domain model of one installed Native Instruments product (main-process
 * source of truth, MobX observable).
 *
 * Built by `ProductFactory` from the merged registry keys of both hive
 * views. Mutable fields (`diskUsageBytes`, `artworkCachePath`) are filled in
 * asynchronously by the background services (phase 3); observation of those
 * changes drives the live UI updates.
 */
export class Product {
  /** Product name = registry subkey name; unique key of the product list. */
  readonly name: string;
  /** From `ContentVersion`; null when missing in all hives. */
  readonly version: string | null;
  /** At least one removal-relevant registry value present (PLAN.md §2.2). */
  readonly removable: boolean;
  /** Every registry value found, grouped by full key path (kept for backup and transparency). */
  readonly registryEntries: Record<string, RegistryValueDto[]>;
  /** All disk locations attached to this product (see `ProductDiskPath`). */
  readonly diskPaths: ProductDiskPath[];
  /** NI `installed_products` descriptor JSON of this product; null when absent (TODO4). */
  readonly installedJsonPath: string | null;

  /** Total bytes of all existing disk paths; null until the background scan finished. */
  diskUsageBytes: number | null = null;
  /** File NAME of the artwork inside the frontend assets cache; null until copied (or none found). */
  artworkCacheFileName: string | null = null;

  constructor(init: {
    name: string;
    version: string | null;
    removable: boolean;
    registryEntries: Record<string, RegistryValueDto[]>;
    diskPaths: ProductDiskPath[];
    installedJsonPath?: string | null;
  }) {
    this.name = init.name;
    this.version = init.version;
    this.removable = init.removable;
    this.registryEntries = init.registryEntries;
    this.diskPaths = init.diskPaths;
    this.installedJsonPath = init.installedJsonPath ?? null;
    makeAutoObservable(this);
  }

  /** Set by `ProductDiskUsageService` when the size sum for this product is known. */
  setDiskUsage(bytes: number): void {
    this.diskUsageBytes = bytes;
  }

  /** Set by `ArtworkCacheService` after copying artwork into the assets cache. */
  setArtworkCacheFileName(fileName: string | null): void {
    this.artworkCacheFileName = fileName;
  }

  /**
   * JSON-serializable snapshot sent to the renderer mirror store.
   * `toJS` strips the MobX proxies — raw observables fail Electron's
   * structured-clone serialization on `webContents.send`.
   */
  toDto(): ProductDto {
    return {
      name: this.name,
      version: this.version,
      removable: this.removable,
      registryEntries: toJS(this.registryEntries),
      diskPaths: toJS(this.diskPaths),
      installedJsonPath: this.installedJsonPath,
      diskUsageBytes: this.diskUsageBytes,
      artworkUrl: this.artworkCacheFileName ? buildAssetsUrl(this.artworkCacheFileName) : null,
    };
  }
}
