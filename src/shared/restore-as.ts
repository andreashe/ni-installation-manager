import type { RenamePattern } from './types/restore';

/**
 * Pure "Restore As…" path logic (TODO9), shared by the renderer (live
 * preview on the Restore As page) and the main process (rewriting the
 * cloned restore job spec) so both always agree on the resulting paths.
 */

/**
 * Registry value names that carry a disk path which must be rewritten when
 * restoring to a different location (TODO9). Matched case-insensitively.
 */
export const RESTORE_AS_REGISTRY_PATH_VALUE_NAMES: readonly string[] = [
  'ContentDir',
  'InstallAAX64Dir',
  'InstallDir',
  'InstallVST364Dir',
  'InstallVST64Dir',
];

/**
 * Apply the rename patterns to one path: the FIRST pattern whose `from` is
 * a prefix of the path (case-insensitive — Windows paths) replaces that
 * prefix with its `to`; later patterns are not applied on top. The match
 * must end on a path-segment boundary so `D:\A` never rewrites `D:\ABC`.
 * Patterns with an empty `from` and non-matching patterns leave the path
 * unchanged.
 */
export function applyRenamePatterns(targetPath: string, patterns: readonly RenamePattern[]): string {
  for (const pattern of patterns) {
    if (pattern.from === '') {
      continue;
    }
    if (targetPath.length < pattern.from.length) {
      continue;
    }
    if (targetPath.slice(0, pattern.from.length).toLowerCase() !== pattern.from.toLowerCase()) {
      continue;
    }
    const rest = targetPath.slice(pattern.from.length);
    // Segment boundary: prefix consumed everything, ended on a separator,
    // or the remainder starts with one.
    if (rest !== '' && !pattern.from.endsWith('\\') && !rest.startsWith('\\')) {
      continue;
    }
    return pattern.to + rest;
  }
  return targetPath;
}

/**
 * Conservative Windows path syntax check for the new target paths (TODO9):
 * absolute drive path (`C:\…`) or UNC path (`\\server\share\…`), no
 * forbidden characters (`<>"|?*`, colon outside the drive letter), no
 * control characters, no empty path segments and no segment ending with a
 * space or dot (Windows strips/rejects those).
 */
export function isValidWindowsPath(target: string): boolean {
  const drive = /^[a-zA-Z]:\\/.exec(target);
  const unc = /^\\\\[^\\]+\\[^\\]+(\\|$)/.exec(target);
  if (!drive && !unc) {
    return false;
  }
  const rest = drive ? target.slice(drive[0].length) : target.slice(2);
  const withoutSeparators = rest.replace(/\\/g, '');
  // eslint-disable-next-line no-control-regex
  if (/[<>:"|?*]/.test(withoutSeparators) || /[\x00-\x1f]/.test(withoutSeparators)) {
    return false;
  }
  const segments = rest === '' ? [] : rest.split('\\');
  return segments.every(
    (segment, index) =>
      // A single trailing backslash produces one empty LAST segment — allowed.
      (segment !== '' || index === segments.length - 1) &&
      !segment.endsWith(' ') &&
      !segment.endsWith('.'),
  );
}
