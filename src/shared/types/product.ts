/**
 * Registry value names that carry a disk path relevant for uninstall
 * (PLAN.md §2.2), plus the synthetic locations derived from the product
 * name rather than read from the registry: `CommonFilesDetected` (the
 * product's folder under Common Files\Native Instruments),
 * `Kontakt8ImageDir` (product imagery inside the Kontakt 8 tree, TODO7)
 * and `InstalledProductsJson` (the product's descriptor in
 * `installed_products`, TODO4).
 */
export type ProductDiskPathKind =
  | 'ContentDir'
  | 'InstallDir'
  | 'InstallAAX64Dir'
  | 'InstallVST364Dir'
  | 'InstallVST64Dir'
  | 'InstallAAX64File'
  | 'InstallVST364File'
  | 'InstallVST64File'
  | 'CommonFilesDetected'
  | 'Kontakt8ImageDir'
  | 'Kontakt7ImageDir'
  | 'KompleteKontrolImageDir'
  | 'Machine2ImageDir'
  | 'InstalledProductsJson';

/**
 * Shared plugin CONTAINER folders (registry values): they hold plugins of
 * many products, the product-name-based guess inside them is unreliable
 * (TODO6). They are shown for information only and must NEVER be deleted,
 * backed up or counted into disk usage — that role moved to the resolved
 * `Install*File` entries.
 */
export const SHARED_CONTAINER_KINDS: readonly ProductDiskPathKind[] = [
  'InstallAAX64Dir',
  'InstallVST364Dir',
  'InstallVST64Dir',
];

/** Plugin files resolved inside a shared container via fuzzy name matching. */
export const PLUGIN_FILE_KINDS: readonly ProductDiskPathKind[] = [
  'InstallAAX64File',
  'InstallVST364File',
  'InstallVST64File',
];

export function isSharedContainerKind(kind: ProductDiskPathKind): boolean {
  return SHARED_CONTAINER_KINDS.includes(kind);
}

/**
 * Locations included in backup and disk usage but NEVER deleted on
 * uninstall (TODO7): product imagery living inside ANOTHER product's tree
 * (Kontakt/Komplete Kontrol/Maschine host installations).
 */
export const BACKUP_ONLY_KINDS: readonly ProductDiskPathKind[] = [
  'Kontakt8ImageDir',
  'Kontakt7ImageDir',
  'KompleteKontrolImageDir',
  'Machine2ImageDir',
];

export function isBackupOnlyKind(kind: ProductDiskPathKind): boolean {
  return BACKUP_ONLY_KINDS.includes(kind);
}

/**
 * One disk location belonging to a product.
 *
 * For shared plugin folders (AAX/VST3/VST2) `rawValue` is the shared folder
 * from the registry while `resolvedPath` points to the product's OWN entry
 * inside it (e.g. `<dir>\Super 8.vst3`) — the only thing that may ever be
 * backed up or deleted. For product-owned kinds both are the same path.
 */
export interface ProductDiskPath {
  kind: ProductDiskPathKind;
  /** Path exactly as stored in the registry (or derived, for CommonFiles). */
  rawValue: string;
  /** The path uninstall/backup/disk-usage actually operate on. */
  resolvedPath: string;
  /** False when `resolvedPath` does not exist on disk — entry is then ignored by operations. */
  exists: boolean;
}

/**
 * A single registry value found under a product key, JSON-serializable.
 * Binary data is base64-encoded; QWORDs above the safe integer range are
 * stringified. `type` is the Windows registry type name (`SZ`, `DWORD`, …).
 */
export interface RegistryValueDto {
  name: string;
  type: string;
  value: string | number | string[] | null;
}

/**
 * Serializable snapshot of one Native Instruments product, assembled from
 * one or more registry keys (64-bit and 32-bit views may both contain the
 * product — they are merged by product name).
 */
export interface ProductDto {
  /** Product name = registry subkey name (also used for artwork/CommonFiles lookup). */
  name: string;
  /** From the `ContentVersion` value; null when not present in any hive. */
  version: string | null;
  /** True when at least one removal-relevant value exists (PLAN.md §2.2). */
  removable: boolean;
  /** All registry values per full key path where this product was found. */
  registryEntries: Record<string, RegistryValueDto[]>;
  /** All disk locations attached to this product. */
  diskPaths: ProductDiskPath[];
  /**
   * Path of the product's descriptor JSON in the NI `installed_products`
   * folder; null when no such file exists. Also present in `diskPaths`
   * (kind `InstalledProductsJson`) so backup/uninstall handle it.
   */
  installedJsonPath: string | null;
  /** Summed size in bytes of all existing disk paths; null until the background scan delivered it. */
  diskUsageBytes: number | null;
  /** `ni-assets://` URL of the cached artwork (renderer-loadable); null when not (yet) available. */
  artworkUrl: string | null;
}

/** Product list state pushed from main to the renderer mirror store. */
export interface ProductListState {
  /** True while a registry/product scan is running. */
  scanning: boolean;
  /** Current background activity for the status bar; null when idle. */
  statusText: string | null;
  products: ProductDto[];
}
