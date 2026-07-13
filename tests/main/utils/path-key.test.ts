import { describe, expect, it } from 'vitest';
import { normalizePathKey, removeNestedPaths } from '../../../src/main/utils/path-key';

describe('normalizePathKey', () => {
  it('treats trailing-backslash variants as the same folder', () => {
    expect(normalizePathKey('D:\\VSTs\\Komplete\\content\\Deep Matter\\')).toBe(
      normalizePathKey('D:\\VSTs\\Komplete\\content\\Deep Matter'),
    );
  });

  it('is case-insensitive (Windows filesystem)', () => {
    expect(normalizePathKey('D:\\Content\\SUPER 8')).toBe(normalizePathKey('d:\\content\\super 8'));
  });

  it('collapses redundant separators and segments', () => {
    expect(normalizePathKey('D:\\Content\\\\Super 8\\.\\')).toBe(
      normalizePathKey('D:\\Content\\Super 8'),
    );
  });

  it('keeps genuinely different folders apart', () => {
    expect(normalizePathKey('D:\\Content\\A')).not.toBe(normalizePathKey('D:\\Content\\B'));
  });
});

describe('removeNestedPaths (TODO7)', () => {
  it('drops paths nested inside another listed folder', () => {
    const result = removeNestedPaths([
      'C:\\NI\\Kontakt 8',
      'C:\\NI\\Kontakt 8\\PAResources\\image\\X',
      'D:\\Content\\X',
    ]);
    expect(result).toEqual(['C:\\NI\\Kontakt 8', 'D:\\Content\\X']);
  });

  it('drops exact duplicates (case/backslash variants) too', () => {
    expect(removeNestedPaths(['D:\\A', 'd:\\a\\'])).toEqual(['D:\\A']);
  });

  it('does not confuse sibling folders sharing a prefix', () => {
    expect(removeNestedPaths(['D:\\App', 'D:\\App2'])).toEqual(['D:\\App', 'D:\\App2']);
  });
});
