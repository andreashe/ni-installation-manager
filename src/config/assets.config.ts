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
