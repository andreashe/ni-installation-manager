import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLI_ARG_JOB_FILE_PREFIX,
  CLI_FLAG_UNINSTALL_WORKER,
} from '../../config/default.config';
import { getFrontendAssetsCachePath, getUninstallWorkerLogFilePath } from '../../config/paths';
import type { JobMode } from '../../shared/types/uninstall';
import { UninstallJobRunner } from '../uninstall/UninstallJobRunner';
import { computeTotalSteps, toProductSpec } from '../uninstall/uninstall-job';
import type { UninstallJobSpec, UninstallProgressReporter } from '../uninstall/uninstall-job';
import { describeWorkerExit, WorkerProgressTracker } from '../utils/worker-progress';
import type { Product } from '../models/Product';
import type { ProductStore } from '../stores/ProductStore';
import type { SettingsStore } from '../stores/SettingsStore';
import type { UninstallJobStore } from '../stores/UninstallJobStore';
import type { FsGuard } from '../utils/FsGuard';
import { PROGRESS_POLL_MS, tailJsonlFile } from '../utils/jsonl-tail';
import type { RegistryGuard } from '../utils/RegistryGuard';
import type { BackupService } from './BackupService';
import type { ElevationService } from './ElevationService';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'UninstallService';

/**
 * Orchestrates uninstall jobs (PLAN.md §7). Started from the uninstall IPC
 * handler; feeds `UninstallJobStore`, which store-sync pushes to the
 * progress page. Execution strategy:
 *
 * - dry-run, or app already elevated → run `UninstallJobRunner` in-process
 *   (guards enforce dry-run / have admin rights);
 * - real removal without elevation → write a job file, launch the elevated
 *   worker (one UAC prompt) and tail its JSONL progress file.
 *
 * Successfully uninstalled products are removed from the `ProductStore`
 * immediately (MobX push updates the list), except in dry-run.
 */
export class UninstallService {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly productStore: ProductStore,
    private readonly jobStore: UninstallJobStore,
    private readonly fsGuard: FsGuard,
    private readonly registryGuard: RegistryGuard,
    private readonly backupService: BackupService,
    private readonly elevationService: ElevationService,
    private readonly logger: LoggerService,
    private readonly jobsFolder: string,
  ) {}

  /**
   * Start a job for the given product names. Ignored while another job runs.
   * Mode 'backup' runs the backup phase only — always in-process (copying
   * needs no elevation) and never removes products from the list (TODO7).
   */
  async start(productNames: string[], mode: JobMode = 'uninstall'): Promise<void> {
    if (this.jobStore.running) {
      this.logger.warn('Job requested while another one is running — ignored', LOG_SOURCE);
      return;
    }

    const products = productNames
      .map((name) => this.productStore.findByName(name))
      .filter((product): product is Product => product !== undefined && product.removable);
    if (products.length === 0) {
      this.logger.warn(`${mode} requested but no removable products matched`, LOG_SOURCE);
      return;
    }

    const settings = this.settingsStore.settings;
    const spec: UninstallJobSpec = {
      mode,
      dryRun: this.settingsStore.effectiveDryRun,
      backupEnabled: settings.backupEnabled,
      backupFolder: settings.backupFolder,
      ignoreSpaceCheck: settings.ignoreBackupSpaceCheck,
      deleteUserRegistryData: settings.deleteUserRegistryData,
      products: products.map((product) =>
        toProductSpec(
          product,
          // Cached artwork joins the backup as product.png (TODO7).
          product.artworkCacheFileName
            ? path.join(getFrontendAssetsCachePath(), product.artworkCacheFileName)
            : null,
        ),
      ),
    };

    this.jobStore.startJob(
      spec.products.map((product) => product.name),
      computeTotalSteps(spec),
      spec.dryRun,
      mode,
    );
    this.productStore.setStatusText(
      mode === 'backup' ? 'Backing up products…' : 'Uninstalling products…',
    );
    this.logger.info(
      `${mode} job started: ${spec.products.length} product(s), dryRun=${spec.dryRun}`,
      LOG_SOURCE,
    );

    try {
      // Backup-only jobs never need admin rights; uninstall does unless dry-run.
      if (mode === 'backup' || spec.dryRun || (await this.elevationService.isElevated())) {
        await this.runInProcess(spec);
      } else {
        await this.runElevated(spec);
      }
      this.jobStore.finish(true);
      this.logger.info(`${mode} job finished successfully`, LOG_SOURCE);
    } catch (error) {
      this.jobStore.addLine(`ERROR: ${String(error)}`);
      this.jobStore.finish(false, error instanceof Error ? error.message : String(error));
      this.logger.error(`${mode} job failed: ${String(error)}`, LOG_SOURCE);
    } finally {
      this.productStore.setStatusText(null);
    }
  }

  /** CLOSE button on the progress page. */
  dismiss(): void {
    if (!this.jobStore.running) {
      this.jobStore.reset();
    }
  }

  /**
   * Dry-run or already-elevated execution: runner reports into the job
   * store AND the central log, so the log panel/file shows the same detail
   * as the progress page (elevated jobs get this via the worker log).
   */
  private async runInProcess(spec: UninstallJobSpec): Promise<void> {
    const reporter: UninstallProgressReporter = {
      line: (text) => {
        this.jobStore.addLine(text);
        this.logger.info(text, 'UninstallJob');
      },
      stepDone: () => this.jobStore.stepDone(),
      productDone: (name) => this.onProductDone(name, spec),
    };
    const runner = new UninstallJobRunner(
      this.fsGuard,
      this.registryGuard,
      this.backupService,
      reporter,
    );
    await runner.run(spec);
  }

  /** Real removal: elevated worker executes the job; we tail its progress file. */
  private async runElevated(spec: UninstallJobSpec): Promise<void> {
    const jobDir = path.join(this.jobsFolder, `job-${Date.now()}`);
    await fs.promises.mkdir(jobDir, { recursive: true });
    const jobFile = path.join(jobDir, 'job.json');
    const progressFile = path.join(jobDir, 'progress.jsonl');
    await fs.promises.writeFile(jobFile, JSON.stringify(spec, null, 2), 'utf8');

    // Dev mode: execPath is electron.exe and needs the app path as first arg.
    const workerArgs = app.isPackaged ? [] : [app.getAppPath()];
    workerArgs.push(CLI_FLAG_UNINSTALL_WORKER, `${CLI_ARG_JOB_FILE_PREFIX}${jobFile}`);

    this.jobStore.addLine('Waiting for administrator approval (UAC)…');
    // Tracker mirrors worker lines into job store + main log and remembers
    // the worker-reported error for the failure message below.
    const tracker = new WorkerProgressTracker(this.jobStore, this.logger, 'UninstallWorker', (name) =>
      this.onProductDone(name, spec),
    );
    const stopTailing = tailJsonlFile(
      progressFile,
      (line) => tracker.apply(line),
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
        throw new Error(
          describeWorkerExit('Uninstall', exitCode, tracker.lastError, getUninstallWorkerLogFilePath()),
        );
      }
    } finally {
      stopTailing();
    }
  }

  /**
   * Remove a finished product from the live list — only for real uninstall
   * jobs (kept in dry-run and after backup-only jobs: nothing was removed).
   */
  private onProductDone(name: string, spec: UninstallJobSpec): void {
    if (spec.mode === 'uninstall' && !spec.dryRun) {
      this.productStore.removeByName(name);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
