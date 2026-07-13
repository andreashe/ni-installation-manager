import fs from 'node:fs';
import path from 'node:path';
import {
  NI_COMMON_FILES_BASE,
  NI_HOST_IMAGE_DIR_RULES,
  NI_INSTALLED_PRODUCTS_BASE,
  NI_PATH_VALUE_RULES,
  NI_REMOVABLE_VALUE_NAMES,
  NI_VALUE_CONTENT_VERSION,
} from '../../config/ni.config';
import type { ProductDiskPath, RegistryValueDto } from '../../shared/types/product';
import { normalizePathKey } from '../utils/path-key';
import { resolvePluginFile } from '../utils/plugin-file-resolver';
import { Product } from './Product';

/** Raw scan input: one registry key belonging to the product. */
export interface ProductRegistrySource {
  /** Full HKLM-relative key path, e.g. `SOFTWARE\WOW6432Node\Native Instruments\Kontakt 8`. */
  keyPath: string;
  values: RegistryValueDto[];
}

/**
 * Builds `Product` models from the merged registry keys of one product
 * (PLAN.md §2.2): extracts the version, applies the disk-path resolution
 * rules (owned folder vs. product file inside a shared folder), checks path
 * existence, derives the CommonFiles path and decides removability.
 *
 * Called by `ProductScanService` once per product name during a scan.
 */
export class ProductFactory {
  /**
   * Create one product from all registry keys found for its name.
   * Performs filesystem existence checks, hence async.
   */
  async create(name: string, sources: ProductRegistrySource[]): Promise<Product> {
    const registryEntries: Record<string, RegistryValueDto[]> = {};
    for (const source of sources) {
      registryEntries[source.keyPath] = source.values;
    }

    const allValues = sources.flatMap((source) => source.values);
    const version = firstString(allValues, NI_VALUE_CONTENT_VERSION);
    const diskPaths = await this.resolveDiskPaths(name, allValues);

    // Per-product descriptor JSON in installed_products (TODO4): exposed as
    // its own property AND as disk path so backup/uninstall include it.
    const installedJsonCandidate = path.join(NI_INSTALLED_PRODUCTS_BASE, `${name}.json`);
    const installedJsonPath = (await pathExists(installedJsonCandidate))
      ? installedJsonCandidate
      : null;
    if (installedJsonPath !== null) {
      diskPaths.push({
        kind: 'InstalledProductsJson',
        rawValue: installedJsonPath,
        resolvedPath: installedJsonPath,
        exists: true,
      });
    }

    // Removable when at least one relevant value exists in ANY hive —
    // path existence on disk does not matter for this decision.
    const removable = allValues.some((value) =>
      NI_REMOVABLE_VALUE_NAMES.some((relevant) => equalsIgnoreCase(value.name, relevant)),
    );

    return new Product({ name, version, removable, registryEntries, diskPaths, installedJsonPath });
  }

  /**
   * Apply the folder rules from `NI_PATH_VALUE_RULES` to every path value
   * found in the registry, deduplicated per kind+path, plus the derived
   * CommonFiles location. Non-existing resolved paths are kept (flagged
   * `exists: false`) so the UI/backup can show what was ignored.
   *
   * Shared plugin containers (TODO6) yield up to TWO entries: the container
   * folder itself (informational, never deleted) and — when the fuzzy name
   * match finds one — the product's plugin file inside it (`Install*File`),
   * which is what backup/uninstall/disk-usage operate on.
   */
  private async resolveDiskPaths(
    productName: string,
    values: RegistryValueDto[],
  ): Promise<ProductDiskPath[]> {
    const result: ProductDiskPath[] = [];
    const seen = new Set<string>();

    /** Push unless the same kind+path is already present. */
    const pushUnique = (entry: ProductDiskPath): void => {
      const dedupeKey = `${entry.kind}|${normalizePathKey(entry.resolvedPath)}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        result.push(entry);
      }
    };

    for (const rule of NI_PATH_VALUE_RULES) {
      for (const value of values) {
        if (!equalsIgnoreCase(value.name, rule.kind) || typeof value.value !== 'string') {
          continue;
        }
        const rawValue = value.value;
        if (rawValue.trim() === '') {
          continue;
        }
        const folder = path.normalize(rawValue);
        const folderExists = await pathExists(folder);
        pushUnique({ kind: rule.kind, rawValue, resolvedPath: folder, exists: folderExists });

        if (rule.pluginFile && folderExists) {
          const pluginPath = await resolvePluginFile(folder, productName, rule.pluginFile.extensions);
          if (pluginPath) {
            pushUnique({
              kind: rule.pluginFile.kind,
              rawValue,
              resolvedPath: pluginPath,
              exists: true,
            });
          }
        }
      }
    }

    // Derived location: shared NI content/artwork folder for this product.
    const commonFilesPath = path.join(NI_COMMON_FILES_BASE, productName);
    if (await pathExists(commonFilesPath)) {
      result.push({
        kind: 'CommonFilesDetected',
        rawValue: commonFilesPath,
        resolvedPath: commonFilesPath,
        exists: true,
      });
    }

    // Derived locations (TODO7): product imagery inside NI host trees
    // (Kontakt 8/7, Komplete Kontrol, Maschine 2) — backed up and counted,
    // but never deleted (BACKUP_ONLY_KINDS).
    for (const rule of NI_HOST_IMAGE_DIR_RULES) {
      const imagePath = path.join(rule.base, productName);
      if (await pathExists(imagePath)) {
        result.push({
          kind: rule.kind,
          rawValue: imagePath,
          resolvedPath: imagePath,
          exists: true,
        });
      }
    }

    return result;
  }
}

/** First string value with the given name (case-insensitive), or null. */
function firstString(values: RegistryValueDto[], name: string): string | null {
  for (const value of values) {
    if (equalsIgnoreCase(value.name, name) && typeof value.value === 'string' && value.value !== '') {
      return value.value;
    }
  }
  return null;
}

/** Registry names are case-insensitive on Windows. */
function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
