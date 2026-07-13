import type { ProductDiskPathKind } from './product';

/**
 * One disk location of a product, enriched with filesystem facts for the
 * details panel (TODO6). `isFile` distinguishes single plugin files
 * (VST2 dll / VST3 / AAX inside shared folders) from product-exclusive
 * folders (ContentDir, InstallDir, CommonFiles).
 */
export interface ProductLocationDetails {
  kind: ProductDiskPathKind;
  path: string;
  exists: boolean;
  isFile: boolean;
  /** Recursive size (files: plain file size); 0 when the path does not exist. */
  sizeBytes: number;
  /** Creation time (epoch ms); null when the path does not exist. */
  createdAt: number | null;
  /** Last modification time (epoch ms); null when the path does not exist. */
  modifiedAt: number | null;
}

/**
 * Payload of `products:get-details` for the details panel. Computed on
 * demand in main (`ProductDetailsService`) because per-location sizes and
 * dates require filesystem walks that are too slow for the list push.
 */
export interface ProductDetailsDto {
  name: string;
  version: string | null;
  removable: boolean;
  locations: ProductLocationDetails[];
  /** Sum over unique existing locations (identical resolved paths counted once). */
  totalDiskUsageBytes: number;
  /** Full registry key paths (with hive prefix) the product was found under. */
  registryPaths: string[];
}
