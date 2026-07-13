import { isObservable } from 'mobx';
import { describe, expect, it } from 'vitest';
import { Product } from '../../../src/main/models/Product';

function makeProduct(): Product {
  return new Product({
    name: 'Super 8',
    version: '1.2.0',
    removable: true,
    registryEntries: {
      'SOFTWARE\\Native Instruments\\Super 8': [{ name: 'ContentVersion', type: 'SZ', value: '1.2.0' }],
    },
    diskPaths: [
      { kind: 'InstallVST364Dir', rawValue: 'C:\\VST3', resolvedPath: 'C:\\VST3\\Super 8.vst3', exists: true },
    ],
  });
}

describe('Product.toDto', () => {
  it('defaults installedJsonPath to null and carries a set value into the DTO', () => {
    expect(makeProduct().toDto().installedJsonPath).toBeNull();

    const withJson = new Product({
      name: 'Super 8',
      version: null,
      removable: true,
      registryEntries: {},
      diskPaths: [],
      installedJsonPath:
        'C:\\Users\\Public\\Documents\\Native Instruments\\installed_products\\Super 8.json',
    });
    expect(withJson.toDto().installedJsonPath).toContain('Super 8.json');
  });

  it('has no artwork URL until a cache file name is set', () => {
    const product = makeProduct();
    expect(product.toDto().artworkUrl).toBeNull();

    product.setArtworkCacheFileName('Super 8.png');
    expect(product.toDto().artworkUrl).toBe('ni-assets://cache/Super%208.png');
  });

  it('reflects async disk usage updates', () => {
    const product = makeProduct();
    expect(product.toDto().diskUsageBytes).toBeNull();
    product.setDiskUsage(12345);
    expect(product.toDto().diskUsageBytes).toBe(12345);
  });

  it('returns plain (non-observable) structures — MobX proxies break IPC serialization', () => {
    const product = makeProduct();
    const dto = product.toDto();
    expect(isObservable(dto.diskPaths)).toBe(false);
    expect(isObservable(dto.registryEntries)).toBe(false);
    // Full structured-clone compatibility check:
    expect(() => structuredClone(dto)).not.toThrow();
  });
});
