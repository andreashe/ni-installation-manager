import { nativeImage, net } from 'electron';
import { ARTWORK_DOWNLOAD_TIMEOUT_MS, CACHED_ARTWORK_SIZE } from '../../config/assets.config';

/**
 * Produces ready-to-cache product thumbnails (134×66 PNG). Interface kept
 * separate so `ArtworkCacheService` stays unit-testable without Electron
 * (tests inject a fake).
 */
export interface ArtworkFetcher {
  /** Download a CDN asset and cover-crop it centered to the cache format (TODO6). */
  fetchAndResize(url: string): Promise<Buffer>;
  /**
   * Convert a product wallpaper file: proportional resize to 66 px height,
   * then crop the LEFT part to reach 134×66 (TODO6).
   */
  resizeWallpaper(filePath: string): Promise<Buffer>;
}

/**
 * Real implementation: Electron `net` for downloads (system proxy aware)
 * and `nativeImage` for all resizing — aspect ratio is always preserved,
 * excess is cropped, never squeezed.
 */
export class ArtworkImageProcessor implements ArtworkFetcher {
  async fetchAndResize(url: string): Promise<Buffer> {
    // Hard timeout (TODO6): a slow/unreachable CDN must not stall the
    // artwork pipeline — abort after ARTWORK_DOWNLOAD_TIMEOUT_MS.
    const abort = new AbortController();
    const timeout = setTimeout(
      () => abort.abort(new Error(`Download timed out after ${ARTWORK_DOWNLOAD_TIMEOUT_MS} ms`)),
      ARTWORK_DOWNLOAD_TIMEOUT_MS,
    );
    let bytes: ArrayBuffer;
    try {
      const response = await net.fetch(url, { signal: abort.signal });
      if (!response.ok) {
        throw new Error(`Download failed with HTTP ${response.status}`);
      }
      bytes = await response.arrayBuffer();
    } finally {
      clearTimeout(timeout);
    }
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    return cropToCacheFormat(image, 'center');
  }

  async resizeWallpaper(filePath: string): Promise<Buffer> {
    const image = nativeImage.createFromPath(filePath);
    return cropToCacheFormat(image, 'left');
  }
}

/**
 * Scale proportionally so the image covers 134×66, then crop: centered for
 * CDN assets, left-anchored for wallpapers. The scale factor is driven by
 * the height (wallpaper rule "resize to height 66"); only when that leaves
 * the image narrower than 134 px does the width dictate the factor.
 */
function cropToCacheFormat(image: Electron.NativeImage, anchor: 'center' | 'left'): Buffer {
  if (image.isEmpty()) {
    throw new Error('Source data is not a decodable image');
  }
  const { width: targetW, height: targetH } = CACHED_ARTWORK_SIZE;
  const { width, height } = image.getSize();

  let scale = targetH / height;
  if (Math.round(width * scale) < targetW) {
    scale = targetW / width;
  }
  const scaledW = Math.max(targetW, Math.round(width * scale));
  const scaledH = Math.max(targetH, Math.round(height * scale));

  const cropped = image.resize({ width: scaledW, height: scaledH, quality: 'best' }).crop({
    x: anchor === 'left' ? 0 : Math.floor((scaledW - targetW) / 2),
    y: Math.floor((scaledH - targetH) / 2),
    width: targetW,
    height: targetH,
  });
  return cropped.toPNG();
}
