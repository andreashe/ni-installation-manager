import { describe, expect, it } from 'vitest';
import { Product } from '../../../src/main/models/Product';
import { ProductStore } from '../../../src/main/stores/ProductStore';

function makeProduct(name: string): Product {
  return new Product({
    name,
    version: '1.0.0',
    removable: true,
    registryEntries: {},
    diskPaths: [],
  });
}

describe('ProductStore', () => {
  it('replaceAll sorts products by name', () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('Zebra'), makeProduct('Alpha'), makeProduct('Kontakt 8')]);
    expect(store.products.map((p) => p.name)).toEqual(['Alpha', 'Kontakt 8', 'Zebra']);
  });

  it('findByName and removeByName work on exact names', () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('A'), makeProduct('B')]);
    expect(store.findByName('B')?.name).toBe('B');
    store.removeByName('B');
    expect(store.findByName('B')).toBeUndefined();
    expect(store.products.length).toBe(1);
  });

  it('toState includes scanning flag, status text and serialized products', () => {
    const store = new ProductStore();
    store.replaceAll([makeProduct('A')]);
    store.setScanning(true);
    store.setStatusText('Scanning disk usage: A - C:\\x');
    const state = store.toState();
    expect(state.scanning).toBe(true);
    expect(state.statusText).toBe('Scanning disk usage: A - C:\\x');
    expect(state.products[0].name).toBe('A');
  });
});
