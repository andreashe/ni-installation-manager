import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductScanService } from '../../../src/main/services/ProductScanService';
import type { ArtworkCacheService } from '../../../src/main/services/ArtworkCacheService';
import type { LoggerService } from '../../../src/main/services/LoggerService';
import type { ProductDiskUsageService } from '../../../src/main/services/ProductDiskUsageService';
import type { RegistryService } from '../../../src/main/services/RegistryService';
import type { Product } from '../../../src/main/models/Product';
import type { ProductStore } from '../../../src/main/stores/ProductStore';
import type { RegistryValueDto } from '../../../src/shared/types/product';

const HKLM_ROOT_64 = 'SOFTWARE\\WOW6432Node\\Native Instruments';
const HKLM_ROOT_32 = 'SOFTWARE\\Native Instruments';
const HKCU_ROOT = 'HKCU\\SOFTWARE\\Native Instruments';
const INSTALLER_ROOT = 'HKCR\\Installer\\Products';

function stringValue(name: string, value: string): RegistryValueDto {
  return { name, type: 'SZ', value };
}

/** Fake registry: maps key path → values, plus subkey listings per root. */
function makeRegistry(config: {
  subkeys: Record<string, string[]>;
  values: Record<string, RegistryValueDto[]>;
}) {
  return {
    listSubkeyNames: vi.fn((root: string) => config.subkeys[root] ?? []),
    readAllValues: vi.fn((keyPath: string) => config.values[keyPath] ?? null),
    readStringValue: vi.fn((keyPath: string, valueName: string) => {
      const match = (config.values[keyPath] ?? []).find((value) => value.name === valueName);
      return match && typeof match.value === 'string' ? match.value : null;
    }),
  };
}

function makeService(registry: ReturnType<typeof makeRegistry>) {
  const replaceAll = vi.fn();
  const productStore = {
    replaceAll,
    setScanning: vi.fn(),
    setStatusText: vi.fn(),
  };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const artworkCache = { cacheAll: vi.fn().mockResolvedValue(undefined) };
  const diskUsage = { scanAll: vi.fn().mockResolvedValue(undefined) };
  const service = new ProductScanService(
    registry as unknown as RegistryService,
    productStore as unknown as ProductStore,
    logger as unknown as LoggerService,
    artworkCache as unknown as ArtworkCacheService,
    diskUsage as unknown as ProductDiskUsageService,
  );
  return { service, replaceAll };
}

function scannedProducts(replaceAll: ReturnType<typeof vi.fn>): Product[] {
  return replaceAll.mock.calls[0][0] as Product[];
}

beforeEach(() => {
  // No disk paths exist in these tests — the factory checks with fs.access.
  vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('ENOENT'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductScanService supplemental registry keys (TODO12)', () => {
  it('adds the HKCU product key and the matching installer key to the product', async () => {
    const registry = makeRegistry({
      subkeys: {
        [HKLM_ROOT_64]: ['RC 48'],
        [INSTALLER_ROOT]: ['AB469C61D2E7CE94697DA34179576106', 'FFFF0000'],
      },
      values: {
        [`${HKLM_ROOT_64}\\RC 48`]: [stringValue('ContentDir', 'D:\\Content\\RC 48')],
        [`${HKCU_ROOT}\\RC 48`]: [stringValue('UserSetting', 'x')],
        [`${INSTALLER_ROOT}\\AB469C61D2E7CE94697DA34179576106`]: [
          stringValue('ProductName', 'Native Instruments RC 48'),
        ],
        [`${INSTALLER_ROOT}\\FFFF0000`]: [stringValue('ProductName', 'Other Vendor Thing')],
      },
    });
    const { service, replaceAll } = makeService(registry);
    await service.scan();

    const [product] = scannedProducts(replaceAll);
    expect(Object.keys(product.registryEntries)).toEqual([
      `${HKLM_ROOT_64}\\RC 48`,
      `${HKCU_ROOT}\\RC 48`,
      `${INSTALLER_ROOT}\\AB469C61D2E7CE94697DA34179576106`,
    ]);
  });

  it('matches the installer ProductName case-insensitively', async () => {
    const registry = makeRegistry({
      subkeys: {
        [HKLM_ROOT_64]: ['RC 48'],
        [INSTALLER_ROOT]: ['AB469C61D2E7CE94697DA34179576106'],
      },
      values: {
        [`${HKLM_ROOT_64}\\RC 48`]: [stringValue('ContentDir', 'D:\\Content\\RC 48')],
        [`${INSTALLER_ROOT}\\AB469C61D2E7CE94697DA34179576106`]: [
          stringValue('ProductName', 'NATIVE INSTRUMENTS rc 48'),
        ],
      },
    });
    const { service, replaceAll } = makeService(registry);
    await service.scan();

    expect(Object.keys(scannedProducts(replaceAll)[0].registryEntries)).toContain(
      `${INSTALLER_ROOT}\\AB469C61D2E7CE94697DA34179576106`,
    );
  });

  it('adds nothing when neither HKCU key nor installer entry exists', async () => {
    const registry = makeRegistry({
      subkeys: { [HKLM_ROOT_64]: ['RC 48'] },
      values: {
        [`${HKLM_ROOT_64}\\RC 48`]: [stringValue('ContentDir', 'D:\\Content\\RC 48')],
      },
    });
    const { service, replaceAll } = makeService(registry);
    await service.scan();

    expect(Object.keys(scannedProducts(replaceAll)[0].registryEntries)).toEqual([
      `${HKLM_ROOT_64}\\RC 48`,
    ]);
  });

  it('never attaches another product\'s installer key', async () => {
    const registry = makeRegistry({
      subkeys: {
        [HKLM_ROOT_64]: ['RC 48', 'Kontakt 8'],
        [INSTALLER_ROOT]: ['AB469C61D2E7CE94697DA34179576106'],
      },
      values: {
        [`${HKLM_ROOT_64}\\RC 48`]: [stringValue('ContentDir', 'D:\\Content\\RC 48')],
        [`${HKLM_ROOT_64}\\Kontakt 8`]: [stringValue('ContentDir', 'D:\\Content\\K8')],
        [`${INSTALLER_ROOT}\\AB469C61D2E7CE94697DA34179576106`]: [
          stringValue('ProductName', 'Native Instruments RC 48'),
        ],
      },
    });
    const { service, replaceAll } = makeService(registry);
    await service.scan();

    const products = scannedProducts(replaceAll);
    const kontakt = products.find((product) => product.name === 'Kontakt 8');
    expect(kontakt).toBeDefined();
    expect(Object.keys(kontakt?.registryEntries ?? {})).toEqual([`${HKLM_ROOT_64}\\Kontakt 8`]);
  });

  it('still merges the same product from both HKLM views into one entry', async () => {
    const registry = makeRegistry({
      subkeys: { [HKLM_ROOT_64]: ['RC 48'], [HKLM_ROOT_32]: ['rc 48'] },
      values: {
        [`${HKLM_ROOT_64}\\RC 48`]: [stringValue('ContentDir', 'D:\\Content\\RC 48')],
        [`${HKLM_ROOT_32}\\rc 48`]: [stringValue('InstallDir', 'C:\\Apps\\RC 48')],
      },
    });
    const { service, replaceAll } = makeService(registry);
    await service.scan();

    const products = scannedProducts(replaceAll);
    expect(products).toHaveLength(1);
    expect(Object.keys(products[0].registryEntries)).toEqual([
      `${HKLM_ROOT_64}\\RC 48`,
      `${HKLM_ROOT_32}\\rc 48`,
    ]);
  });
});
