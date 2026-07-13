import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLI_ARG_JOB_FILE_PREFIX,
  CLI_FLAG_MOVE_WORKER,
} from '../../config/default.config';
import { MoveJobRunner } from '../move/MoveJobRunner';
import {
  collectMoveSources,
  computeMoveTotalSteps,
  toMoveProductSpec,
} from '../move/move-job';
import type { MoveJobSpec } from '../move/move-job';
import type { RenamePattern, RestoreAsProductDto } from '../../shared/types/restore';
import type {
  UninstallProgressEvent,
  UninstallProgressReporter,
} from '../uninstall/uninstall-job';
import type { Product } from '../models/Product';
import type { ProductStore } from '../stores/ProductStore';
import type { SettingsStore } from '../stores/SettingsStore';
import type { UninstallJobStore } from '../stores/UninstallJobStore';
import { PROGRESS_POLL_MS, tailJsonlFile } from '../utils/jsonl-tail';
import type { RegistryGuard } from '../utils/RegistryGuard';
import type { ElevationService } from './ElevationService';
import type { LoggerService } from './LoggerService';
import type { ProductScanService } from './ProductScanService';

const LOG_SOURCE = 'MoveService';

/**
 * Orchestrates move jobs (TODO10) and backs the Move page. Unlike restore,
 * the data comes from the INSTALLED products (registry scan) — `getTargets`
 * lists their current disk locations for the page, `start` builds the job
 * from cloned product DTOs with the rename patterns applied.
 *
 * Job execution mirrors `RestoreService` (same shared `UninstallJobStore`,
 * mode 'move', same progress page):
 *
 * - dry-run, or app already elevated → run `MoveJobRunner` in-process;
 * - real move without elevation → write a job file, launch the elevated
 *   move worker (one UAC prompt) and tail its JSONL progress file
 *   (sources like `C:\Program Files\…` and HKLM need admin rights).
 *
 * After a successful real move the product list is rescanned — disk paths
 * and registry values changed.
 */
export class MoveService {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly productStore: ProductStore,
    private readonly jobStore: UninstallJobStore,
    private readonly registryGuard: RegistryGuard,
    private readonly elevationService: ElevationService,
    private readonly productScanService: ProductScanService,
    private readonly logger: LoggerService,
    private readonly jobsFolder: string,
  ) {}

  /**
   * Move sources for the Move page: one section per installed product with
   * kind, current path, existence and size — same DTO shape as the Restore
   * As page ("old target" = current location).
   */
  async getTargets(productNames: string[]): Promise<RestoreAsProductDto[]> {
    const result: RestoreAsProductDto[] = [];
    for (const name of productNames) {
      const product = this.productStore.findByName(name);
      if (!product) {
        this.logger.warn(`Move targets requested for unknown product "${name}"`, LOG_SOURCE);
        continue;
      }
      const sources = await collectMoveSources(product.toDto());
      result.push({
        name: product.name,
        version: product.version,
        targets: sources.map((source) => ({
          kind: source.kind,
          oldTargetPath: source.sourcePath,
          oldTargetExists: source.exists,
          sizeBytes: source.sizeBytes,
        })),
      });
    }
    return result;
  }

  /**
   * Start a move job for the given product names with the given rename
   * patterns. Ignored while another job (uninstall, backup, restore or
   * move — one shared job store) runs. Locations the patterns leave
   * unchanged are never touched (source = target, TODO10).
   */
  async start(productNames: string[], renamePatterns: RenamePattern[]): Promise<void> {
    if (this.jobStore.running) {
      this.logger.warn('Move requested while another job is running — ignored', LOG_SOURCE);
      return;
    }

    const products = productNames
      .map((name) => this.productStore.findByName(name))
      .filter((product): product is Product => product !== undefined);
    if (products.length === 0) {
      this.logger.warn('Move requested but no products matched', LOG_SOURCE);
      return;
    }

    const spec: MoveJobSpec = {
      dryRun: this.settingsStore.effectiveDryRun,
      ignoreSpaceCheck: this.settingsStore.settings.ignoreMoveSpaceCheck,
      // Each spec is built from `toDto()` — a deep copy, the scanned model
      // stays untouched (same clone rule as restore-as).
      products: await Promise.all(
        products.map((product) => toMoveProductSpec(product.toDto(), renamePatterns)),
      ),
    };

    this.jobStore.startJob(
      spec.products.map((product) => product.name),
      computeMoveTotalSteps(spec),
      spec.dryRun,
      'move',
    );
    this.productStore.setStatusText('Moving products…');
    this.logger.info(
      `Move job started: ${spec.products.length} product(s), ${renamePatterns.length} pattern(s), dryRun=${spec.dryRun}`,
      LOG_SOURCE,
    );

    try {
      if (spec.dryRun || (await this.elevationService.isElevated())) {
        await this.runInProcess(spec);
      } else {
        await this.runElevated(spec);
      }
      this.jobStore.finish(true);
      this.logger.info('Move job finished successfully', LOG_SOURCE);
      if (!spec.dryRun) {
        // Paths and registry values changed — refresh the product list.
        void this.productScanService.scan();
      }
    } catch (error) {
      this.jobStore.addLine(`ERROR: ${String(error)}`);
      this.jobStore.finish(false, error instanceof Error ? error.message : String(error));
      this.logger.error(`Move job failed: ${String(error)}`, LOG_SOURCE);
    } finally {
      this.productStore.setStatusText(null);
    }
  }

  /** Dry-run or already-elevated execution: runner reports into job store + central log. */
  private async runInProcess(spec: MoveJobSpec): Promise<void> {
    const reporter: UninstallProgressReporter = {
      line: (text) => {
        this.jobStore.addLine(text);
        this.logger.info(text, 'MoveJob');
      },
      stepDone: () => this.jobStore.stepDone(),
      productDone: () => undefined, // nothing to remove from any list on move
    };
    await new MoveJobRunner(this.registryGuard, reporter).run(spec);
  }

  /** Real move: elevated worker executes the job; we tail its progress file. */
  private async runElevated(spec: MoveJobSpec): Promise<void> {
    const jobDir = path.join(this.jobsFolder, `move-${Date.now()}`);
    await fs.promises.mkdir(jobDir, { recursive: true });
    const jobFile = path.join(jobDir, 'job.json');
    const progressFile = path.join(jobDir, 'progress.jsonl');
    await fs.promises.writeFile(jobFile, JSON.stringify(spec, null, 2), 'utf8');

    // Dev mode: execPath is electron.exe and needs the app path as first arg.
    const workerArgs = app.isPackaged ? [] : [app.getAppPath()];
    workerArgs.push(CLI_FLAG_MOVE_WORKER, `${CLI_ARG_JOB_FILE_PREFIX}${jobFile}`);

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
        throw new Error(`Move worker exited with code ${exitCode}`);
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
        break; // nothing to remove from any list on move
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
