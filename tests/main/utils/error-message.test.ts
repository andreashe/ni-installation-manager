import { describe, expect, it } from 'vitest';
import { errorDetail, errorMessage } from '../../../src/main/utils/error-message';

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(errorMessage('plain string')).toBe('plain string');
    expect(errorMessage(42)).toBe('42');
  });
});

describe('errorDetail', () => {
  it('returns the stack of an Error when present', () => {
    const error = new Error('boom');
    expect(errorDetail(error)).toBe(error.stack);
    expect(errorDetail(error)).toContain('boom');
  });

  it('falls back to String() for stackless values', () => {
    expect(errorDetail('plain string')).toBe('plain string');
    const stackless = new Error('no stack');
    stackless.stack = undefined;
    expect(errorDetail(stackless)).toBe('Error: no stack');
  });
});
