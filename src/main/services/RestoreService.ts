import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLI_ARG_JOB_FILE_PREFIX,
  CLI_FLAG_RESTORE_WORKER,
} from '../../config/default.config';
import { RestoreJobRunner } from '../restore/RestoreJobRunner';
import {
  applyRenamePatternsToProductSpec,
  computeRestoreTotalSteps,
  toRestoreProductSpec,
} from '../restore/restore-job';
import type { RestoreJobSpec } from '../restore/restore-job';
import type { RenamePattern } from '../../shared/types/restore';
import type {
  UninstallProgressEvent,
  UninstallProgressReporter,
} from '../uninstall/uninstall-job';
import type { BackupProduct } from '../models/BackupProduct';
import type { RestoreStore } from '../stores/RestoreStore';
import type { SettingsStore } from '../stores/SettingsStore';
import type { UninstallJobStore } from '../stores/UninstallJobStore';
import { PROGRESS_POLL_MS, tailJsonlFile } from '../utils/jsonl-tail';
import type { RegistryGuard } from '../utils/RegistryGuard';
import type { ElevationService } from './ElevationService';
import type { LoggerService } from './LoggerService';
import type { ProductDiskUsageCache } from './ProductDiskUsageCache';

const LOG_SOURCE = 'RestoreService';

/**
 * Orchestrates restore jobs (TODO8). Started from the restore IPC handler;
 * feeds the shared `UninstallJobStore` (mode 'restore'), which store-sync
 * pushes to the same progress page uninstall/backup jobs use. Execution
 * strategy mirrors `UninstallService`:
 *
 * - dry-run, or app already elevated → run `RestoreJobRunner` in-process;
 * - real restore without elevation → write a job file, launch the elevated
 *   restore worker (one UAC prompt) and tail its JSONL progress file
 *   (targets like `C:\Program Files\…` need admin rights).
 */
export class RestoreService {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly restoreStore: RestoreStore,
    private readonly jobStore: UninstallJobStore,
    private readonly registryGuard: RegistryGuard,
    private readonly elevationService: ElevationService,
    private readonly productDiskUsageCache: ProductDiskUsageCache,
    private readonly logger: LoggerService,
    private readonly jobsFolder: string,
  ) {}

  /**
   * Start a restore job for the given backup names. Ignored while another
   * job (uninstall, backup or restore — one shared job store) runs.
   *
   * `renamePatterns` is ONLY passed by the "Restore As…" page (TODO9): the
   * cloned product specs are then rewritten (file/folder targets AND
   * path-carrying registry values) before the job runs. The normal restore
   * never passes patterns and stays untouched.
   */
  async start(backupNames: string[], renamePatterns: RenamePattern[] = []): Promise<void> {
    if (this.jobStore.running) {
      this.logger.warn('Restore requested while another job is running — ignored', LOG_SOURCE);
      return;
    }

    const backups = backupNames
      .map((name) => this.restoreStore.findByName(name))
      .filter((backup): backup is BackupProduct => backup !== undefined);
    if (backups.length === 0) {
      this.logger.warn('Restore requested but no backups matched', LOG_SOURCE);
      return;
    }

    const spec: RestoreJobSpec = {
      dryRun: this.settingsStore.effectiveDryRun,
      ignoreSpaceCheck: this.settingsStore.settings.ignoreRestoreSpaceCheck,
      // Each spec works on a CLONE of the descriptor (restore-as safety, TODO8).
      products: await Promise.all(backups.map((backup) => toRestoreProductSpec(backup))),
    };
    if (renamePatterns.length > 0) {
      for (const product of spec.products) {
        applyRenamePatternsToProductSpec(product, renamePatterns);
      }
      this.logger.info(
        `Restore As: ${renamePatterns.length} rename pattern(s) applied to ${spec.products.length} product(s)`,
        LOG_SOURCE,
      );
    }

    this.jobStore.startJob(
      spec.products.map((product) => product.name),
      computeRestoreTotalSteps(spec),
      spec.dryRun,
      'restore',
    );
    this.restoreStore.setStatusText('Restoring products…');
    this.logger.info(
      `Restore job started: ${spec.products.length} product(s), dryRun=${spec.dryRun}`,
      LOG_SOURCE,
    );

    try {
      if (spec.dryRun || (await this.elevationService.isElevated())) {
        await this.runInProcess(spec);
      } else {
        await this.runElevated(spec);
      }
      this.jobStore.finish(true);
      this.logger.info('Restore job finished successfully', LOG_SOURCE);
      if (!spec.dryRun) {
        // Restored files change sizes on disk — cached product sizes are stale (TODO11).
        await this.productDiskUsageCache.clear();
      }
    } catch (error) {
      this.jobStore.addLine(`ERROR: ${String(error)}`);
      this.jobStore.finish(false, error instanceof Error ? error.message : String(error));
      this.logger.error(`Restore job failed: ${String(error)}`, LOG_SOURCE);
    } finally {
      this.restoreStore.setStatusText(null);
    }
  }

  /** Dry-run or already-elevated execution: runner reports into job store + central log. */
  private async runInProcess(spec: RestoreJobSpec): Promise<void> {
    const reporter: UninstallProgressReporter = {
      line: (text) => {
        this.jobStore.addLine(text);
        this.logger.info(text, 'RestoreJob');
      },
      stepDone: () => this.jobStore.stepDone(),
      productDone: () => undefined, // nothing to remove from any list on restore
    };
    await new RestoreJobRunner(this.registryGuard, reporter).run(spec);
  }

  /** Real restore: elevated worker executes the job; we tail its progress file. */
  private async runElevated(spec: RestoreJobSpec): Promise<void> {
    const jobDir = path.join(this.jobsFolder, `restore-${Date.now()}`);
    await fs.promises.mkdir(jobDir, { recursive: true });
    const jobFile = path.join(jobDir, 'job.json');
    const progressFile = path.join(jobDir, 'progress.jsonl');
    await fs.promises.writeFile(jobFile, JSON.stringify(spec, null, 2), 'utf8');

    // Dev mode: execPath is electron.exe and needs the app path as first arg.
    const workerArgs = app.isPackaged ? [] : [app.getAppPath()];
    workerArgs.push(CLI_FLAG_RESTORE_WORKER, `${CLI_ARG_JOB_FILE_PREFIX}${jobFile}`);

    this.jobStore.addLine('Waiting for administrator approval (UAC)…');
    const stopTailing = tailJsonlFile(
      progressFile,
      (line) => this.applyProgressEvent(line),
      (seconds) =>
        this.jobStore.addLine(
          `…still waiting for the elevated worker to start (${seconds}s — UAC confirmation + worker startup)`,
        ),
    );
    try {
      const exitCode = await this.elevationService.runWorkerElevated(workerArgs);
      // Give the tail one final pass so late lines are not lost.
      await delay(PROGRESS_POLL_MS * 2);
      if (exitCode !== 0) {
        throw new Error(`Restore worker exited with code ${exitCode}`);
      }
    } finally {
      stopTailing();
    }
  }

  /** Parse one JSONL progress line from the worker. Malformed lines are surfaced verbatim. */
  private applyProgressEvent(rawLine: string): void {
    let event: UninstallProgressEvent;
    try {
      event = JSON.parse(rawLine) as UninstallProgressEvent;
    } catch {
      this.jobStore.addLine(rawLine);
      return;
    }
    switch (event.type) {
      case 'line':
        this.jobStore.addLine(event.text);
        break;
      case 'step':
        this.jobStore.stepDone();
        break;
      case 'product-done':
        break; // nothing to remove from any list on restore
      case 'done':
        if (!event.success && event.error) {
          this.jobStore.addLine(`ERROR: ${event.error}`);
        }
        break;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
