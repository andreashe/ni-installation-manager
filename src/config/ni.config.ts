import type { ProductDiskPathKind } from '../shared/types/product';

/**
 * Native Instruments specific constants (PLAN.md §2). Centralized here so
 * registry paths and folder rules never live inline in service code.
 */

/**
 * Registry roots (under HKEY_LOCAL_MACHINE) that hold one subkey per
 * installed NI product. Both are scanned; same-named subkeys are merged
 * into one product.
 */
export const NI_REGISTRY_ROOTS = [
  'SOFTWARE\\WOW6432Node\\Native Instruments', // 64-bit Windows registry view (most common)
  'SOFTWARE\\Native Instruments', // 32-bit view / some entries
] as const;

/** Registry value holding the product version (may be missing). */
export const NI_VALUE_CONTENT_VERSION = 'ContentVersion';

/**
 * Registry values that carry disk paths, with the rule how to interpret
 * them (PLAN.md §2.2, TODO6):
 * - `pluginFile: null` → the value's folder belongs entirely to the product.
 * - `pluginFile` set → the value is a SHARED container folder (never
 *   removed, never sized); the product's own plugin file inside it is
 *   resolved by fuzzy name matching and recorded under `pluginFile.kind`.
 */
export const NI_PATH_VALUE_RULES: ReadonlyArray<{
  kind: 'ContentDir' | 'InstallDir' | 'InstallAAX64Dir' | 'InstallVST364Dir' | 'InstallVST64Dir';
  pluginFile: {
    kind: Extract<ProductDiskPathKind, 'InstallAAX64File' | 'InstallVST364File' | 'InstallVST64File'>;
    /** Accepted file extensions, lower-case, most specific first. */
    extensions: string[];
  } | null;
}> = [
  { kind: 'ContentDir', pluginFile: null },
  { kind: 'InstallDir', pluginFile: null },
  {
    kind: 'InstallAAX64Dir',
    pluginFile: { kind: 'InstallAAX64File', extensions: ['.aaxplugin', '.aax'] },
  },
  {
    kind: 'InstallVST364Dir',
    pluginFile: { kind: 'InstallVST364File', extensions: ['.vst3'] },
  },
  {
    kind: 'InstallVST64Dir',
    pluginFile: { kind: 'InstallVST64File', extensions: ['.dll'] },
  },
];

/**
 * Registry values that make a product count as "removable": at least one of
 * these must be present (PLAN.md §2.2).
 */
export const NI_REMOVABLE_VALUE_NAMES: readonly string[] = [
  NI_VALUE_CONTENT_VERSION,
  ...NI_PATH_VALUE_RULES.map((rule) => rule.kind),
];

/**
 * Base folder checked per product for shared NI content
 * (`<base>\<ProductName>`); if it exists it is attached as the product's
 * `CommonFiles` path and included in disk usage, backup and removal.
 * Also the root where product artwork lives (PLAN.md §2.3).
 */
export const NI_COMMON_FILES_BASE =
  (process.env.CommonProgramFiles ?? 'C:\\Program Files\\Common Files') + '\\Native Instruments';

/**
 * Second artwork location (TODO2): shared NI Resources folder in the public
 * user profile — `<base>\<ProductName>\<candidate>.png`. Checked by
 * `ArtworkCacheService` after the CommonFiles pattern.
 */
export const NI_PUBLIC_RESOURCES_IMAGE_BASE =
  'C:\\Users\\Public\\Documents\\NI Resources\\image';

/**
 * Product imagery inside NI host installations (TODO7):
 * `<NI_COMMON_FILES_BASE>\<host>\PAResources\image\<ProductName>` —
 * attached under the given kind when the folder exists. All of these are
 * BACKUP_ONLY_KINDS: backed up and counted, never deleted. The recursive
 * artwork scan covers them automatically (they live under
 * `NI_COMMON_FILES_BASE`).
 */
export const NI_HOST_IMAGE_DIR_RULES: ReadonlyArray<{
  kind: Extract<
    ProductDiskPathKind,
    'Kontakt8ImageDir' | 'Kontakt7ImageDir' | 'KompleteKontrolImageDir' | 'Machine2ImageDir'
  >;
  base: string;
}> = [
  { kind: 'Kontakt8ImageDir', base: `${NI_COMMON_FILES_BASE}\\Kontakt 8\\PAResources\\image` },
  { kind: 'Kontakt7ImageDir', base: `${NI_COMMON_FILES_BASE}\\Kontakt 7\\PAResources\\image` },
  {
    kind: 'KompleteKontrolImageDir',
    base: `${NI_COMMON_FILES_BASE}\\Komplete Kontrol\\PAResources\\image`,
  },
  { kind: 'Machine2ImageDir', base: `${NI_COMMON_FILES_BASE}\\Maschine 2\\PAResources\\image` },
];

/**
 * Per-product descriptor JSONs written by NI installers (TODO4):
 * `<base>\<ProductName>.json`. Attached to the product as
 * `installedJsonPath` + `InstalledProductsJson` disk path, so it is backed
 * up and removed together with the product.
 */
export const NI_INSTALLED_PRODUCTS_BASE =
  'C:\\Users\\Public\\Documents\\Native Instruments\\installed_products';
