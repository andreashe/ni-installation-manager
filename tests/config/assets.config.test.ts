import { describe, expect, it } from 'vitest';
import { ASSETS_PROTOCOL_HOST, ASSETS_PROTOCOL_SCHEME, buildAssetsUrl } from '../../src/config/assets.config';

describe('buildAssetsUrl', () => {
  it('builds a URL under the configured scheme and host', () => {
    expect(buildAssetsUrl('Kontakt 8.png')).toBe(
      `${ASSETS_PROTOCOL_SCHEME}://${ASSETS_PROTOCOL_HOST}/Kontakt%208.png`,
    );
  });

  it('percent-encodes characters that would break the URL', () => {
    expect(buildAssetsUrl('a#b?c.png')).toBe('ni-assets://cache/a%23b%3Fc.png');
  });
});
