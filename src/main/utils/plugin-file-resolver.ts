import fs from 'node:fs';
import path from 'node:path';

/**
 * Fuzzy plugin-file resolution (TODO6): the plugin inside a shared folder
 * rarely matches the registry product name exactly. For "Arturia-Prophet-VS V"
 * all of these must be found:
 *
 *   Prophet-VS V.dll · prophet-vs V.dll · prophet-vs.dll ·
 *   arturia-prophet-vs-v.dll · Prophet_VS_V.dll
 *
 * Matching: both sides are normalized (lower case, all spaces/dashes/
 * underscores removed), then
 *   - exact normalized equality wins,
 *   - otherwise a file whose normalized name is CONTAINED in the product
 *     name (vendor prefix dropped, suffix words dropped) counts, and vice
 *     versa a file name containing the product name;
 *   - ambiguity resolved by the longest (most specific) match. Substring
 *     matches shorter than 5 characters are rejected as noise.
 */

/** Lower-case and strip everything non-alphanumeric, so word boundaries, separators and parentheses stop mattering. */
function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Comparison tokens for a product name: the full normalized name, plus the
 * name with a vendor prefix removed ("Arturia-B-3 V2" → "b3v2") — plugin
 * files are often named without the vendor.
 */
function productTokens(productName: string): string[] {
  const tokens = [normalizeToken(productName)];
  const dashIndex = productName.indexOf('-');
  if (dashIndex > 0) {
    const afterVendor = normalizeToken(productName.slice(dashIndex + 1));
    if (afterVendor && !tokens.includes(afterVendor)) {
      tokens.push(afterVendor);
    }
  }
  return tokens.filter((token) => token.length > 0);
}

/**
 * Score one normalized file base name against the product tokens:
 * 3 = exact equality with any token; 2 = containment either way, but only
 * when the shorter side covers MORE than half of the longer one and has 4+
 * characters (rejects noise like "vs", "x64" or a lone word shared with an
 * unrelated product).
 */
function scoreFileName(normFile: string, tokens: readonly string[]): number {
  let best = 0;
  for (const token of tokens) {
    if (normFile === token) {
      return 3;
    }
    if (token.includes(normFile) && normFile.length >= 4 && normFile.length / token.length > 0.5) {
      best = Math.max(best, 2);
    } else if (
      normFile.includes(token) &&
      token.length >= 4 &&
      token.length / normFile.length > 0.5
    ) {
      best = Math.max(best, 2);
    }
  }
  return best;
}

/**
 * Pick the best-matching plugin file name for a product from a folder
 * listing. Pure — testable without filesystem. Returns null when nothing
 * plausible matches.
 */
export function matchPluginFileName(
  productName: string,
  fileNames: readonly string[],
  extensions: readonly string[],
): string | null {
  const tokens = productTokens(productName);
  if (tokens.length === 0) {
    return null;
  }

  let best: { fileName: string; score: number; length: number } | null = null;
  for (const fileName of fileNames) {
    const lower = fileName.toLowerCase();
    const extension = extensions.find((candidate) => lower.endsWith(candidate));
    if (!extension) {
      continue;
    }
    const normFile = normalizeToken(fileName.slice(0, fileName.length - extension.length));
    if (normFile === '') {
      continue;
    }
    const score = scoreFileName(normFile, tokens);
    if (score === 0) {
      continue;
    }
    if (!best || score > best.score || (score === best.score && normFile.length > best.length)) {
      best = { fileName, score, length: normFile.length };
    }
  }
  return best?.fileName ?? null;
}

/**
 * Resolve the product's plugin file inside a shared container folder.
 * Returns the full path or null (folder unreadable / no plausible match).
 */
export async function resolvePluginFile(
  folder: string,
  productName: string,
  extensions: readonly string[],
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(folder);
  } catch {
    return null;
  }
  const match = matchPluginFileName(productName, entries, extensions);
  return match ? path.join(folder, match) : null;
}
