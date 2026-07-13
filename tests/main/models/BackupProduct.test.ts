import { describe, expect, it } from 'vitest';
import { BackupProduct } from '../../../src/main/models/BackupProduct';
import type { ProductDto } from '../../../src/shared/types/product';

function descriptor(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    name: 'Vari Comp',
    version: '1.0',
    removable: true,
    registryEntries: {},
    diskPaths: [],
    installedJsonPath: null,
    diskUsageBytes: null,
    artworkUrl: null,
    ...overrides,
  };
}

function makeBackup(overrides: Partial<ProductDto> = {}): BackupProduct {
  return new BackupProduct({
    name: 'Vari Comp',
    version: '1.0',
    backupDate: '2026-07-05T19:04:51.334Z',
    backupFolderPath: 'D:\\Backup\\Vari Comp',
    descriptor: descriptor(overrides),
  });
}

describe('BackupProduct', () => {
  it('initializes diskUsageBytes from the descriptor', () => {
    expect(makeBackup().diskUsageBytes).toBeNull();
    expect(makeBackup({ diskUsageBytes: 12345 }).diskUsageBytes).toBe(12345);
  });

  it('updates diskUsageBytes and artworkCacheFileName via setters', () => {
    const backup = makeBackup();
    backup.setDiskUsage(999);
    backup.setArtworkCacheFileName('Vari Comp.png');
    expect(backup.diskUsageBytes).toBe(999);
    expect(backup.artworkCacheFileName).toBe('Vari Comp.png');
  });

  it('serializes to a DTO with an assets URL for cached artwork', () => {
    const backup = makeBackup({ diskUsageBytes: 42 });
    backup.setArtworkCacheFileName('Vari Comp.png');
    const dto = backup.toDto();

    expect(dto.name).toBe('Vari Comp');
    expect(dto.version).toBe('1.0');
    expect(dto.backupDate).toBe('2026-07-05T19:04:51.334Z');
    expect(dto.backupFolderPath).toBe('D:\\Backup\\Vari Comp');
    expect(dto.diskUsageBytes).toBe(42);
    expect(dto.artworkUrl).toBe('ni-assets://cache/Vari%20Comp.png');
    expect(dto.product.name).toBe('Vari Comp');
  });

  it('serializes a null artwork URL when no artwork is cached', () => {
    expect(makeBackup().toDto().artworkUrl).toBeNull();
  });
});
