/**
 * Hive-qualified registry key paths (TODO12): most product keys live under
 * HKLM, but per-user keys (`HKCU\SOFTWARE\Native Instruments\<name>`) and
 * the Windows Installer registration (`HKCR\Installer\Products\<hash>`)
 * belong to a product too.
 *
 * Convention everywhere in the app (scan results, job specs, registry
 * backups): a key path MAY start with an explicit hive prefix (`HKLM\`,
 * `HKCU\`, `HKCR\`); a bare path means HKLM. Old backups (written before
 * hive prefixes existed) therefore stay restorable unchanged.
 */

export type RegistryHiveLabel = 'HKLM' | 'HKCU' | 'HKCR';

const HIVE_PREFIX = /^(HKLM|HKCU|HKCR)\\/i;

/** Split an (optionally) hive-prefixed key path; bare paths default to HKLM. */
export function splitHiveKeyPath(keyPath: string): { hive: RegistryHiveLabel; path: string } {
  const match = HIVE_PREFIX.exec(keyPath);
  if (!match) {
    return { hive: 'HKLM', path: keyPath };
  }
  return {
    hive: match[1].toUpperCase() as RegistryHiveLabel,
    path: keyPath.slice(match[0].length),
  };
}

/** Human-readable form for logs/UI: always hive-prefixed. */
export function displayKeyPath(keyPath: string): string {
  return HIVE_PREFIX.test(keyPath) ? keyPath : `HKLM\\${keyPath}`;
}
