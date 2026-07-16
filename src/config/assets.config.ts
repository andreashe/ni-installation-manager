/**
 * Custom protocol serving files from the frontend assets cache to the
 * renderer (`<img src="ni-assets://cache/<file>">`). Registered/handled in
 * `src/main/utils/assets-protocol.ts`; URLs are built by `Product.toDto()`.
 */
export const ASSETS_PROTOCOL_SCHEME = 'ni-assets';

/** Host part of assets URLs; the path below it is the cache-relative file name. */
export const ASSETS_PROTOCOL_HOST = 'cache';

/** Build the renderer-loadable URL for a file inside the assets cache. */
export function buildAssetsUrl(fileName: string): string {
  return `${ASSETS_PROTOCOL_SCHEME}://${ASSETS_PROTOCOL_HOST}/${encodeURIComponent(fileName)}`;
}

/**
 * Target size for artwork downloaded from the NI CDN (TODO6): the product
 * row thumbnail format. Images are cover-cropped to this, never squeezed.
 */
export const CACHED_ARTWORK_SIZE = { width: 134, height: 66 } as const;

/** Abort a CDN artwork download when it takes longer than this. */
export const ARTWORK_DOWNLOAD_TIMEOUT_MS = 3000;

/**
 * Scan-result cache file inside the frontend assets cache folder: remembers
 * the artwork hits AND which base subfolders were already scanned (with
 * timestamp), so the next scan can skip them including their subfolders.
 * Removed together with the folder by Preferences → "Clear cache".
 */
export const ARTWORK_SCAN_CACHE_FILE_NAME = 'artwork-scan.json';

/**
 * A folder recorded as scanned is skipped by later artwork scans until its
 * scan is older than this; then it is walked (and stamped) again.
 */
export const ARTWORK_SCAN_MAX_AGE_DAYS = 365;
