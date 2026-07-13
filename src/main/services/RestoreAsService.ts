import fs from 'node:fs';
import type { RenamePattern, RestoreAsProductDto } from '../../shared/types/restore';
import { toRestoreProductSpec } from '../restore/restore-job';
import type { RestoreStore } from '../stores/RestoreStore';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'RestoreAsService';

/**
 * Backend of the "Restore As…" page (TODO9):
 *
 * - persists the rename patterns as their OWN JSON file alongside the
 *   settings and loads them again when the page opens;
 * - assembles the restore targets (old target path/existence + backup-side
 *   size) per selected backup — reusing `toRestoreProductSpec`, so the page
 *   shows exactly what a restore job would touch;
 * - answers batched path-existence queries for the live new-target preview
 *   (the paths themselves are computed in the renderer via the shared
 *   `applyRenamePatterns`).
 */
export class RestoreAsService {
  constructor(
    private readonly restoreStore: RestoreStore,
    private readonly logger: LoggerService,
    private readonly patternsFilePath: string,
  ) {}

  /** Load the persisted rename patterns; empty when no file exists yet or it is malformed. */
  async loadPatterns(): Promise<RenamePattern[]> {
    let raw: string;
    try {
      raw = await fs.promises.readFile(this.patternsFilePath, 'utf8');
    } catch {
      return []; // no patterns saved yet
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('not an array');
      }
      return parsed.filter(
        (entry): entry is RenamePattern =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as RenamePattern).from === 'string' &&
          typeof (entry as RenamePattern).to === 'string',
      );
    } catch (error) {
      this.logger.warn(
        `Invalid rename patterns file ${this.patternsFilePath}: ${String(error)}`,
        LOG_SOURCE,
      );
      return [];
    }
  }

  /** Persist the rename patterns (called on every change from the page). */
  async savePatterns(patterns: RenamePattern[]): Promise<void> {
    await fs.promises.writeFile(
      this.patternsFilePath,
      JSON.stringify(patterns, null, 2),
      'utf8',
    );
    this.logger.debug(`Saved ${patterns.length} rename pattern(s)`, LOG_SOURCE);
  }

  /**
   * Restore targets for the Restore As page: one section per backup with
   * kind, old target path, old-target existence and the backup-side size
   * (walked once here — the pattern preview later only re-checks existence).
   */
  async getTargets(backupNames: string[]): Promise<RestoreAsProductDto[]> {
    const result: RestoreAsProductDto[] = [];
    for (const name of backupNames) {
      const backup = this.restoreStore.findByName(name);
      if (!backup) {
        this.logger.warn(`Restore As targets requested for unknown backup "${name}"`, LOG_SOURCE);
        continue;
      }
      const spec = await toRestoreProductSpec(backup);
      result.push({
        name: spec.name,
        version: spec.version,
        targets: await Promise.all(
          spec.entries.map(async (entry) => ({
            kind: entry.kind,
            oldTargetPath: entry.targetPath,
            oldTargetExists: await pathExists(entry.targetPath),
            sizeBytes: entry.sizeBytes,
          })),
        ),
      });
    }
    return result;
  }

  /** Existence flags for the given paths, same order (new-target preview). */
  async pathsExist(paths: string[]): Promise<boolean[]> {
    return Promise.all(paths.map((candidate) => pathExists(candidate)));
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.promises.access(candidate);
    return true;
  } catch {
    return false;
  }
}
