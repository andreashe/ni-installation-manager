import { describe, expect, it } from 'vitest';
import { displayKeyPath, splitHiveKeyPath } from '../../../src/main/utils/registry-path';

describe('splitHiveKeyPath', () => {
  it('treats bare paths as HKLM (backwards compatible with old backups)', () => {
    expect(splitHiveKeyPath('SOFTWARE\\WOW6432Node\\Native Instruments\\Kontakt 8')).toEqual({
      hive: 'HKLM',
      path: 'SOFTWARE\\WOW6432Node\\Native Instruments\\Kontakt 8',
    });
  });

  it('splits explicit hive prefixes', () => {
    expect(splitHiveKeyPath('HKCU\\SOFTWARE\\Native Instruments\\RC 48')).toEqual({
      hive: 'HKCU',
      path: 'SOFTWARE\\Native Instruments\\RC 48',
    });
    expect(splitHiveKeyPath('HKCR\\Installer\\Products\\AB469C61D2E7CE94697DA34179576106')).toEqual({
      hive: 'HKCR',
      path: 'Installer\\Products\\AB469C61D2E7CE94697DA34179576106',
    });
    expect(splitHiveKeyPath('HKLM\\SOFTWARE\\Native Instruments\\RC 48')).toEqual({
      hive: 'HKLM',
      path: 'SOFTWARE\\Native Instruments\\RC 48',
    });
  });

  it('accepts lower-case prefixes (registry is case-insensitive)', () => {
    expect(splitHiveKeyPath('hkcu\\SOFTWARE\\X').hive).toBe('HKCU');
  });

  it('does not mistake path segments for prefixes', () => {
    expect(splitHiveKeyPath('SOFTWARE\\HKCU\\X')).toEqual({
      hive: 'HKLM',
      path: 'SOFTWARE\\HKCU\\X',
    });
  });
});

describe('displayKeyPath', () => {
  it('prefixes bare paths with HKLM', () => {
    expect(displayKeyPath('SOFTWARE\\Native Instruments\\RC 48')).toBe(
      'HKLM\\SOFTWARE\\Native Instruments\\RC 48',
    );
  });

  it('leaves hive-prefixed paths unchanged', () => {
    expect(displayKeyPath('HKCU\\SOFTWARE\\Native Instruments\\RC 48')).toBe(
      'HKCU\\SOFTWARE\\Native Instruments\\RC 48',
    );
  });
});
