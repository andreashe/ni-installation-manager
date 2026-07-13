import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductDiskUsageCache } from '../../../src/main/services/ProductDiskUsageCache';
import type { LoggerService } from '../../../src/main/services/LoggerService';

const CACHE_FOLDER = 'C:\\userData\\ProductDiskUsageCache';

function makeLogger() {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), write: vi.fn() };
}

function makeCache() {
  return new ProductDiskUsageCache(CACHE_FOLDER, makeLogger() as unknown as LoggerService);
}

function expectedFilePath(productName: string): string {
  const hash = crypto.createHash('md5').update(productName, 'utf8').digest('hex');
  return path.join(CACHE_FOLDER, `${hash}.json`);
}

/** Fake filesystem: cache folder content as filename → file content. */
let files: Map<string, string>;

beforeEach(() => {
  files = new Map();
  vi.spyOn(fs.promises, 'readFile').mockImplementation(async (target) => {
    const content = files.get(String(target));
    if (content === undefined) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }
    return content;
  });
  vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (target, content) => {
    files.set(String(target), String(content));
  });
  vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
  vi.spyOn(fs.promises, 'readdir').mockImplementation((async () =>
    [...files.keys()].map((filePath) => path.basename(filePath))) as unknown as typeof fs.promises.readdir);
  vi.spyOn(fs.promises, 'rm').mockImplementation(async (target) => {
    files.delete(String(target));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductDiskUsageCache (TODO11)', () => {
  it('write → read roundtrip returns the cached bytes for the same version', async () => {
    const cache = makeCache();
    await cache.write('Vari Comp', '1.0', 4242);
    expect(await cache.read('Vari Comp', '1.0')).toBe(4242);
  });

  it('names cache files by the MD5 of the product name + .json', async () => {
    const cache = makeCache();
    await cache.write('Vari Comp', '1.0', 1);
    expect(files.has(expectedFilePath('Vari Comp'))).toBe(true);
  });

  it('stores bytes, scan time and product version in the JSON entry', async () => {
    const cache = makeCache();
    await cache.write('Vari Comp', '1.0', 4242);
    const entry = JSON.parse(files.get(expectedFilePath('Vari Comp')) as string);
    expect(entry).toEqual({ bytes: 4242, scanTime: expect.any(String), productVersion: '1.0' });
    expect(new Date(entry.scanTime).getTime()).not.toBeNaN();
  });

  it('returns null when nothing is cached yet', async () => {
    expect(await makeCache().read('Vari Comp', '1.0')).toBeNull();
  });

  it('returns null when the cached version differs (forces a rescan)', async () => {
    const cache = makeCache();
    await cache.write('Vari Comp', '1.0', 4242);
    expect(await cache.read('Vari Comp', '2.0')).toBeNull();
  });

  it('handles null versions: matches null = null, mismatches null vs string', async () => {
    const cache = makeCache();
    await cache.write('Vari Comp', null, 7);
    expect(await cache.read('Vari Comp', null)).toBe(7);
    expect(await cache.read('Vari Comp', '1.0')).toBeNull();
  });

  it('returns null on a malformed cache file instead of throwing', async () => {
    files.set(expectedFilePath('Vari Comp'), '{not json');
    expect(await makeCache().read('Vari Comp', '1.0')).toBeNull();
  });

  it('clear removes every cache file', async () => {
    const cache = makeCache();
    await cache.write('Vari Comp', '1.0', 1);
    await cache.write('Super 8', '2.0', 2);
    await cache.clear();
    expect(files.size).toBe(0);
  });

  it('clear is a no-op when the cache folder does not exist yet', async () => {
    vi.mocked(fs.promises.readdir).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    await expect(makeCache().clear()).resolves.toBeUndefined();
  });
});
