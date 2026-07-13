import { describe, expect, it } from 'vitest';
import { matchPluginFileName } from '../../../src/main/utils/plugin-file-resolver';

const DLL = ['.dll'];

describe('matchPluginFileName (TODO6 fuzzy patterns)', () => {
  const product = 'Arturia-Prophet-VS V';

  // Every pattern from the requirement must resolve.
  it.each([
    'Prophet-VS V.dll',
    'prophet-vs V.dll',
    'prophet-vs.dll',
    'arturia-prophet-vs-v.dll',
    'Prophet_VS_V.dll',
  ])('finds "%s" for product "Arturia-Prophet-VS V"', (fileName) => {
    expect(matchPluginFileName(product, [fileName, 'Other Plugin.dll'], DLL)).toBe(fileName);
  });

  it('prefers the exact normalized match over partial ones', () => {
    const files = ['prophet-vs.dll', 'arturia-prophet-vs-v.dll'];
    expect(matchPluginFileName(product, files, DLL)).toBe('arturia-prophet-vs-v.dll');
  });

  it('prefers the longest partial match when no exact one exists', () => {
    const files = ['prophet-vs.dll', 'Prophet-VS V.dll'];
    expect(matchPluginFileName(product, files, DLL)).toBe('Prophet-VS V.dll');
  });

  it('ignores files of other products and other extensions', () => {
    expect(matchPluginFileName(product, ['Super 8.dll', 'Prophet-VS V.vst3'], DLL)).toBeNull();
  });

  it('rejects too-short substring noise', () => {
    // "vs.dll" normalizes to 2 chars — contained in the product name but junk.
    expect(matchPluginFileName(product, ['vs.dll'], DLL)).toBeNull();
  });

  it('matches simple exact names regardless of length', () => {
    expect(matchPluginFileName('Raum', ['Raum.vst3'], ['.vst3'])).toBe('Raum.vst3');
  });

  it('matches short names after dropping the vendor prefix (Arturia family)', () => {
    expect(matchPluginFileName('Arturia-B-3 V2', ['B-3 V2.dll', 'Other.dll'], DLL)).toBe('B-3 V2.dll');
    expect(matchPluginFileName('Arturia-CMI V', ['CMI V.dll'], DLL)).toBe('CMI V.dll');
    expect(matchPluginFileName('Arturia-DX7 V', ['DX7 V.dll'], DLL)).toBe('DX7 V.dll');
  });

  it('matches short containment when it covers at least half the name (VC 2A FX)', () => {
    expect(matchPluginFileName('VC 2A FX', ['VC 2A.vst3'], ['.vst3'])).toBe('VC 2A.vst3');
  });

  it('rejects short fragments that cover too little of the product name', () => {
    // "bass" is 4 chars but covers <50% of "Session Bassist - Icon Bass".
    expect(matchPluginFileName('Session Bassist - Icon Bass', ['bass.dll'], DLL)).toBeNull();
  });

  it('ignores parentheses and suffix decorations in file names', () => {
    expect(
      matchPluginFileName(
        'Spitfire Audio - BBC Symphony Orchestra',
        ['BBC Symphony Orchestra (64 Bit).dll'],
        DLL,
      ),
    ).toBe('BBC Symphony Orchestra (64 Bit).dll');
  });

  it('accepts alternative extensions (AAX)', () => {
    expect(
      matchPluginFileName('Super 8', ['Super 8.aaxplugin'], ['.aaxplugin', '.aax']),
    ).toBe('Super 8.aaxplugin');
  });
});
