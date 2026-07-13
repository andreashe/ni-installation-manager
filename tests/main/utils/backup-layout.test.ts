import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getBackupEntryPath,
  getProductBackupFolder,
  sanitizeBackupName,
} from '../../../src/main/utils/backup-layout';

describe('sanitizeBackupName', () => {
  it('replaces characters Windows forbids in folder names', () => {
    expect(sanitizeBackupName('A/B\\C:D*E?F"G<H>I|J')).toBe('A_B_C_D_E_F_G_H_I_J');
  });

  it('keeps normal product names unchanged', () => {
    expect(sanitizeBackupName('Vari Comp')).toBe('Vari Comp');
  });
});

describe('getProductBackupFolder', () => {
  it('joins the backup folder with the sanitized product name', () => {
    expect(getProductBackupFolder('D:\\Backup', 'Vari Comp')).toBe(
      path.join('D:\\Backup', 'Vari Comp'),
    );
  });
});

describe('getBackupEntryPath', () => {
  it('maps a disk path to files/<Kind>/<basename>', () => {
    expect(
      getBackupEntryPath('D:\\Backup\\Vari Comp', 'ContentDir', 'C:\\NI\\Vari Comp'),
    ).toBe(path.join('D:\\Backup\\Vari Comp', 'files', 'ContentDir', 'Vari Comp'));
  });

  it('ignores a trailing separator on the original path', () => {
    expect(
      getBackupEntryPath('D:\\Backup\\Vari Comp', 'InstallDir', 'C:\\NI\\Vari Comp\\'),
    ).toBe(path.join('D:\\Backup\\Vari Comp', 'files', 'InstallDir', 'Vari Comp'));
  });

  it('uses the file name for single-file locations', () => {
    expect(
      getBackupEntryPath('D:\\Backup\\X', 'InstallVST364File', 'C:\\VST3\\X.vst3'),
    ).toBe(path.join('D:\\Backup\\X', 'files', 'InstallVST364File', 'X.vst3'));
  });
});
