import { describe, expect, it } from 'vitest';
import { applyRenamePatterns, isValidWindowsPath } from '../../src/shared/restore-as';
import type { RenamePattern } from '../../src/shared/types/restore';

function pattern(from: string, to: string): RenamePattern {
  return { from, to };
}

describe('applyRenamePatterns (TODO9)', () => {
  it('replaces a matching prefix from the start of the string', () => {
    expect(
      applyRenamePatterns('D:\\VSTs\\Komplete\\content\\The Gentleman', [
        pattern('D:\\VSTs\\Komplete', 'E:\\NewHome'),
      ]),
    ).toBe('E:\\NewHome\\content\\The Gentleman');
  });

  it('matches case-insensitively (Windows paths)', () => {
    expect(
      applyRenamePatterns('d:\\vsts\\komplete\\content', [pattern('D:\\VSTs\\Komplete', 'E:\\X')]),
    ).toBe('E:\\X\\content');
  });

  it('replaces an exact full match', () => {
    expect(applyRenamePatterns('D:\\Old', [pattern('D:\\Old', 'E:\\New')])).toBe('E:\\New');
  });

  it('only matches on segment boundaries — D:\\A never rewrites D:\\ABC', () => {
    expect(applyRenamePatterns('D:\\ABC\\x', [pattern('D:\\A', 'E:\\Z')])).toBe('D:\\ABC\\x');
  });

  it('handles a from-prefix with trailing backslash', () => {
    expect(
      applyRenamePatterns('D:\\Old\\content', [pattern('D:\\Old\\', 'E:\\New\\')]),
    ).toBe('E:\\New\\content');
  });

  it('applies only the FIRST matching pattern', () => {
    expect(
      applyRenamePatterns('D:\\Old\\content', [
        pattern('D:\\Old', 'E:\\First'),
        pattern('E:\\First', 'F:\\Second'),
      ]),
    ).toBe('E:\\First\\content');
  });

  it('leaves non-matching paths and skips empty from-patterns', () => {
    expect(
      applyRenamePatterns('C:\\Untouched', [pattern('', 'E:\\X'), pattern('D:\\Old', 'E:\\Y')]),
    ).toBe('C:\\Untouched');
  });
});

describe('isValidWindowsPath (TODO9)', () => {
  it('accepts absolute drive paths (also with spaces and trailing backslash)', () => {
    expect(isValidWindowsPath('C:\\Program Files\\Native Instruments\\Vari Comp')).toBe(true);
    expect(isValidWindowsPath('D:\\VSTs\\Komplete 12\\64\\')).toBe(true);
  });

  it('accepts UNC paths', () => {
    expect(isValidWindowsPath('\\\\server\\share\\folder')).toBe(true);
  });

  it('rejects relative and rootless paths', () => {
    expect(isValidWindowsPath('relative\\path')).toBe(false);
    expect(isValidWindowsPath('C:noSlash')).toBe(false);
    expect(isValidWindowsPath('')).toBe(false);
  });

  it('rejects forbidden characters and stray colons', () => {
    expect(isValidWindowsPath('C:\\bad<name')).toBe(false);
    expect(isValidWindowsPath('C:\\bad|name')).toBe(false);
    expect(isValidWindowsPath('C:\\bad?name')).toBe(false);
    expect(isValidWindowsPath('C:\\second:colon')).toBe(false);
  });

  it('rejects empty segments and segments ending with space or dot', () => {
    expect(isValidWindowsPath('C:\\a\\\\b')).toBe(false);
    expect(isValidWindowsPath('C:\\trailing \\x')).toBe(false);
    expect(isValidWindowsPath('C:\\trailing.\\x')).toBe(false);
  });
});
