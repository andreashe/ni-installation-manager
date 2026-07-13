import type { RenamePattern } from '../../shared/types/restore';

/**
 * Shared sanitizers for unknown IPC payloads (restore + move handlers):
 * IPC arguments arrive untyped from the renderer and are reduced to
 * well-formed values before any service sees them.
 */

/** Keep only well-formed string entries from an unknown IPC payload. */
export function sanitizeNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [];
}

/** Keep only well-formed rename patterns from an unknown IPC payload. */
export function sanitizePatterns(value: unknown): RenamePattern[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (entry): entry is RenamePattern =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as RenamePattern).from === 'string' &&
        typeof (entry as RenamePattern).to === 'string',
    )
    .map((entry) => ({ from: entry.from, to: entry.to }));
}
