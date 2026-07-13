import { describe, expect, it } from 'vitest';
import { BackupProduct } from '../../../src/main/models/BackupProduct';
import { RestoreStore } from '../../../src/main/stores/RestoreStore';
import type { ProductDto } from '../../../src/shared/types/product';

function makeBackup(name: string): BackupProduct {
  const descriptor: ProductDto = {
    name,
    version: null,
    removable: true,
    registryEntries: {},
    diskPaths: [],
    installedJsonPath: null,
    diskUsageBytes: null,
    artworkUrl: null,
  };
  return new BackupProduct({
    name,
    version: null,
    backupDate: '2026-07-05T19:04:51.334Z',
    backupFolderPath: `D:\\Backup\\${name}`,
    descriptor,
  });
}

describe('RestoreStore', () => {
  it('replaceAll sorts backups by name for a stable UI order', () => {
    const store = new RestoreStore();
    store.replaceAll([makeBackup('Zebra'), makeBackup('Alpha')]);
    expect(store.backups.map((b) => b.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('finds backups by name', () => {
    const store = new RestoreStore();
    store.replaceAll([makeBackup('Vari Comp')]);
    expect(store.findByName('Vari Comp')?.name).toBe('Vari Comp');
    expect(store.findByName('Unknown')).toBeUndefined();
  });

  it('toState serializes scanning, statusText and backup DTOs', () => {
    const store = new RestoreStore();
    store.setScanning(true);
    store.setStatusText('Scanning backups…');
    store.replaceAll([makeBackup('Vari Comp')]);

    const state = store.toState();
    expect(state.scanning).toBe(true);
    expect(state.statusText).toBe('Scanning backups…');
    expect(state.backups).toHaveLength(1);
    expect(state.backups[0].name).toBe('Vari Comp');
  });
});
