import path from 'node:path';

/**
 * Canonical key for "is this the same folder/file?" comparisons (TODO6).
 * Different registry values may point to the same directory written
 * differently — trailing backslash, mixed casing, redundant segments.
 * `path.resolve` normalizes separators/trailing slashes/`..`, lower-casing
 * covers Windows' case-insensitive filesystem.
 *
 * Used by every consumer that must not process the same path twice
 * (disk usage sums, details totals, factory dedupe).
 */
export function normalizePathKey(target: string): string {
  return path.resolve(target).toLowerCase();
}

/**
 * Drop every path that lies INSIDE another path of the list (TODO7):
 * summing a folder and one of its subfolders would count the subfolder
 * twice (e.g. `…\Kontakt 8` and `…\Kontakt 8\PAResources\image\X`).
 * Comparison is normalized and separator-boundary aware. Order of the
 * survivors is preserved; exact duplicates are removed as well.
 */
export function removeNestedPaths(paths: readonly string[]): string[] {
  const keys = paths.map((candidate) => normalizePathKey(candidate));
  const result: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const isDuplicate = keys.findIndex((key) => key === keys[i]) < i;
    const isNested = keys.some(
      (other, j) => j !== i && keys[i].startsWith(other + path.sep),
    );
    if (!isDuplicate && !isNested) {
      result.push(paths[i]);
    }
  }
  return result;
}
