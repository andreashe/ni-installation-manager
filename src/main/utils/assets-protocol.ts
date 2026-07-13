import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSETS_PROTOCOL_SCHEME } from '../../config/assets.config';

/**
 * `ni-assets://` protocol: lets the renderer load images from the frontend
 * assets cache without file-system access (RULES.md §1). Only files DIRECTLY
 * inside the cache folder are served — path traversal is rejected.
 */

/**
 * Declare the scheme as privileged. MUST run before `app` is ready
 * (imported top-level from `main.ts`).
 */
export function registerAssetsScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSETS_PROTOCOL_SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ]);
}

/**
 * Install the request handler. Must run after `app` is ready and needs the
 * resolved cache folder (from `config/paths.ts`).
 */
export function installAssetsProtocolHandler(cacheFolder: string): void {
  protocol.handle(ASSETS_PROTOCOL_SCHEME, (request) => {
    const fileName = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''));
    const resolved = path.join(cacheFolder, fileName);

    // Traversal guard: the resolved file must stay directly under the cache folder.
    if (path.dirname(resolved) !== path.normalize(cacheFolder) || fileName.includes('..')) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(resolved).toString());
  });
}
