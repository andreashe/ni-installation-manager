import type { RegistryValueDto } from '../../shared/types/product';
import type { LoggerService } from '../services/LoggerService';
import type { SettingsStore } from '../stores/SettingsStore';

const LOG_SOURCE = 'RegistryGuard';

/**
 * Registry MUTATIONS the guard can execute (deletions and restore writes).
 * Implemented by `RegistryService` (phase 2) on top of the registry
 * library; kept as an interface so the guard has no dependency on the
 * concrete backend.
 */
export interface RegistryMutationBackend {
  /**
   * Recursively delete a key and everything below it. `keyPath` may carry a
   * hive prefix (`HKLM\`, `HKCU\`, `HKCR\`); bare paths mean HKLM (TODO12).
   */
  deleteKeyTree(keyPath: string): Promise<void>;
  /** Delete a single value inside a key (same path convention). */
  deleteValue(keyPath: string, valueName: string): Promise<void>;
  /** Create a key (if missing) and write all given values into it (TODO8 restore; same path convention). */
  restoreKeyValues(keyPath: string, values: RegistryValueDto[]): Promise<void>;
}

/**
 * Single choke point for registry MUTATIONS (RULES.md §10): deletions and
 * restore writes — both modify HKLM and both must honor dry-run.
 *
 * Same contract as `FsGuard`: dry-run mode turns every mutation into a
 * log-only no-op. The actual work is delegated to the injected
 * `RegistryMutationBackend` (wired in phase 2 — until then calls in
 * non-dry-run mode fail loudly instead of silently).
 */
export class RegistryGuard {
  private backend: RegistryMutationBackend | null = null;

  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly logger: LoggerService,
  ) {}

  /** Wire the concrete registry backend (called from the composition root once `RegistryService` exists). */
  setBackend(backend: RegistryMutationBackend): void {
    this.backend = backend;
  }

  /** Recursively delete a registry key (a product's `<ProductName>` subkey). */
  async deleteKeyTree(keyPath: string): Promise<void> {
    if (this.settingsStore.effectiveDryRun) {
      this.logger.info(`DRY-RUN: would delete registry key tree ${keyPath}`, LOG_SOURCE);
      return;
    }
    this.logger.info(`Deleting registry key tree ${keyPath}`, LOG_SOURCE);
    await this.requireBackend().deleteKeyTree(keyPath);
  }

  /** Delete a single value inside a registry key. */
  async deleteValue(keyPath: string, valueName: string): Promise<void> {
    if (this.settingsStore.effectiveDryRun) {
      this.logger.info(`DRY-RUN: would delete registry value ${keyPath}\\${valueName}`, LOG_SOURCE);
      return;
    }
    this.logger.info(`Deleting registry value ${keyPath}\\${valueName}`, LOG_SOURCE);
    await this.requireBackend().deleteValue(keyPath, valueName);
  }

  /** Restore all values of one backed-up key (TODO8) — creates the key when missing. */
  async restoreKeyValues(keyPath: string, values: RegistryValueDto[]): Promise<void> {
    if (this.settingsStore.effectiveDryRun) {
      this.logger.info(
        `DRY-RUN: would restore registry key ${keyPath} (${values.length} value(s))`,
        LOG_SOURCE,
      );
      return;
    }
    this.logger.info(`Restoring registry key ${keyPath} (${values.length} value(s))`, LOG_SOURCE);
    await this.requireBackend().restoreKeyValues(keyPath, values);
  }

  /** Fail loudly if no backend is wired yet — a real mutation must never be skipped silently. */
  private requireBackend(): RegistryMutationBackend {
    if (!this.backend) {
      throw new Error('RegistryGuard: no registry backend registered (RegistryService not wired yet)');
    }
    return this.backend;
  }
}
