import * as reg from 'native-reg';
import type { RegistryValueDto } from '../../shared/types/product';
import type { RegistryMutationBackend } from '../utils/RegistryGuard';
import { displayKeyPath, splitHiveKeyPath } from '../utils/registry-path';
import type { RegistryHiveLabel } from '../utils/registry-path';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'RegistryService';

/** Hive handles addressable through key-path prefixes (TODO12). */
const HIVES: Record<RegistryHiveLabel, reg.HKEY> = {
  HKLM: reg.HKLM,
  HKCU: reg.HKCU,
  HKCR: reg.HKCR,
};

/**
 * Low-level Windows registry access via the `native-reg` library
 * (RULES.md §11: never shell out to regedit/reg.exe).
 *
 * Read side is used by `ProductScanService`; the mutating side (deletions,
 * restore writes) implements `RegistryMutationBackend` and is ONLY
 * reachable through `RegistryGuard` (dry-run enforcement) — feature code
 * must not call mutation methods here.
 *
 * Key paths may carry a hive prefix (`HKLM\`, `HKCU\`, `HKCR\`); bare paths
 * mean HKLM (see `src/main/utils/registry-path.ts`) — that keeps the
 * original HKLM-relative paths (and old registry backups) working while
 * per-user and installer keys are addressable too (TODO12).
 */
export class RegistryService implements RegistryMutationBackend {
  constructor(private readonly logger: LoggerService) {}

  /**
   * List the names of all direct subkeys of a key.
   * Returns an empty array when the key does not exist (e.g. 32-bit root
   * missing on some systems).
   */
  listSubkeyNames(keyPath: string): string[] {
    const key = this.openRead(keyPath);
    if (!key) {
      this.logger.debug(`Key not found: ${displayKeyPath(keyPath)}`, LOG_SOURCE);
      return [];
    }
    try {
      return reg.enumKeyNames(key);
    } finally {
      reg.closeKey(key);
    }
  }

  /** True when the key exists. */
  keyExists(keyPath: string): boolean {
    const key = this.openRead(keyPath);
    if (!key) {
      return false;
    }
    reg.closeKey(key);
    return true;
  }

  /**
   * Read all values of a key as JSON-serializable DTOs
   * (used to remember every product entry and later for registry backup).
   * Returns null when the key does not exist.
   */
  readAllValues(keyPath: string): RegistryValueDto[] | null {
    const key = this.openRead(keyPath);
    if (!key) {
      return null;
    }
    try {
      return reg.enumValueNames(key).map((name) => {
        const raw = reg.queryValueRaw(key, name);
        return {
          name,
          type: raw ? reg.ValueType[raw.type] : 'NONE',
          value: toJsonValue(raw),
        };
      });
    } finally {
      reg.closeKey(key);
    }
  }

  /**
   * Convenience: read one string value (e.g. `ContentDir`) from a key.
   * Null when key or value is missing or not a string.
   */
  readStringValue(keyPath: string, valueName: string): string | null {
    const { hive, path } = splitHiveKeyPath(keyPath);
    const parsed = reg.getValue(HIVES[hive], path, valueName);
    return typeof parsed === 'string' ? parsed : null;
  }

  // ── RegistryMutationBackend (only called through RegistryGuard) ────────

  /** Recursively delete a key and everything below it. */
  async deleteKeyTree(keyPath: string): Promise<void> {
    const { hive, path } = splitHiveKeyPath(keyPath);
    reg.deleteTree(HIVES[hive], path);
    // deleteTree removes children; the key itself needs a separate delete.
    reg.deleteKey(HIVES[hive], path);
  }

  /** Delete a single value inside a key. */
  async deleteValue(keyPath: string, valueName: string): Promise<void> {
    const { hive, path } = splitHiveKeyPath(keyPath);
    reg.deleteKeyValue(HIVES[hive], path, valueName);
  }

  /**
   * Restore all values of one backed-up key (TODO8): creates the key
   * (incl. missing ancestors — RegCreateKeyEx semantics) and writes every
   * value back with its original registry type. Inverse of
   * `readAllValues` / `toJsonValue`. Existing values are overwritten.
   */
  async restoreKeyValues(keyPath: string, values: RegistryValueDto[]): Promise<void> {
    const { hive, path } = splitHiveKeyPath(keyPath);
    const key = reg.createKey(HIVES[hive], path, reg.Access.ALL_ACCESS);
    try {
      for (const value of values) {
        if (value.value === null) {
          this.logger.warn(
            `Skipping registry value ${displayKeyPath(keyPath)}\\${value.name} — no data in backup`,
            LOG_SOURCE,
          );
          continue;
        }
        writeValue(key, value);
      }
    } finally {
      reg.closeKey(key);
    }
  }

  /** Open a key of any supported hive for reading; null when missing. */
  private openRead(keyPath: string): reg.HKEY | null {
    const { hive, path } = splitHiveKeyPath(keyPath);
    return reg.openKey(HIVES[hive], path, reg.Access.READ);
  }
}

/**
 * Write one backed-up value with its original type — the inverse of
 * `toJsonValue`: strings/string-arrays/numbers pass through, QWORDs may
 * arrive as strings (when beyond the safe integer range), everything else
 * (BINARY and exotic types) was stored as base64.
 */
function writeValue(key: reg.HKEY, dto: RegistryValueDto): void {
  switch (dto.type) {
    case 'SZ':
      reg.setValueSZ(key, dto.name, String(dto.value));
      break;
    case 'EXPAND_SZ':
      reg.setValueEXPAND_SZ(key, dto.name, String(dto.value));
      break;
    case 'MULTI_SZ':
      reg.setValueMULTI_SZ(
        key,
        dto.name,
        Array.isArray(dto.value) ? dto.value : [String(dto.value)],
      );
      break;
    case 'DWORD_LITTLE_ENDIAN':
      reg.setValueDWORD(key, dto.name, Number(dto.value));
      break;
    case 'QWORD_LITTLE_ENDIAN':
      reg.setValueQWORD(key, dto.name, BigInt(dto.value as string | number));
      break;
    default: {
      // BINARY and exotic types were serialized as base64 by toJsonValue.
      const type = reg.ValueType[dto.type as keyof typeof reg.ValueType];
      reg.setValueRaw(
        key,
        dto.name,
        typeof type === 'number' ? type : reg.ValueType.BINARY,
        Buffer.from(String(dto.value), 'base64'),
      );
    }
  }
}

/**
 * Convert a raw registry value to something JSON-serializable:
 * strings/numbers/string-arrays pass through, QWORD bigints become strings
 * when unsafe, binary buffers become base64 strings.
 */
function toJsonValue(raw: reg.Value | null): RegistryValueDto['value'] {
  const parsed = reg.parseValue(raw);
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (typeof parsed === 'string' || typeof parsed === 'number' || Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed === 'bigint') {
    return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : parsed.toString();
  }
  // Remaining case: Buffer (REG_BINARY and friends) → base64.
  return Buffer.from(parsed).toString('base64');
}
