import fs from 'node:fs';
import path from 'node:path';
import { CLI_ARG_JOB_FILE_PREFIX } from '../../config/default.config';
import { getUninstallWorkerLogFilePath } from '../../config/paths';
import { errorDetail, errorMessage } from '../utils/error-message';
import { BackupService } from '../services/BackupService';
import { LoggerService } from '../services/LoggerService';
import { RegistryService } from '../services/RegistryService';
import { SettingsStore } from '../stores/SettingsStore';
import { FsGuard } from '../utils/FsGuard';
import { RegistryGuard } from '../utils/RegistryGuard';
import { UninstallJobRunner } from './UninstallJobRunner';
import type { UninstallJobSpec, UninstallProgressReporter } from './uninstall-job';

/**
 * Headless elevated worker (PLAN.md §3.4): the app relaunched with
 * `--uninstall-worker --job-file=<path>` after the UAC prompt. Reads the
 * job description, executes it with REAL deletion (its own guards, dry-run
 * off — dry-run jobs never reach the worker) and streams progress as JSONL
 * into `progress.jsonl` next to the job file. Exit code 0 = success.
 *
 * Never creates a window; wired from `main.ts` before normal bootstrap.
 */
export async function runUninstallWorker(cliArgs: readonly string[]): Promise<number> {
  const jobFileArg = cliArgs.find((arg) => arg.startsWith(CLI_ARG_JOB_FILE_PREFIX));
  if (!jobFileArg) {
    return 2;
  }
  const jobFile = jobFileArg.slice(CLI_ARG_JOB_FILE_PREFIX.length);
  const progressFile = path.join(path.dirname(jobFile), 'progress.jsonl');

  /**
   * Append one protocol event; also the sink for all worker console output.
   * Never throws — a broken progress file must not kill the job, and the
   * worker log still carries the full story.
   */
  const emit = (event: object): void => {
    try {
      fs.appendFileSync(progressFile, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // Progress reporting is best-effort; the worker log is the fallback.
    }
  };

  // First sign of life as early as possible: the elevated Electron instance
  // needs a few seconds to boot after the UAC prompt — this line tells the
  // tailing main process (and the user) that the worker is up.
  emit({ type: 'line', text: `Elevated worker started (pid ${process.pid})` });

  const logger = new LoggerService();
  try {
    logger.initializeFileSink(getUninstallWorkerLogFilePath());
    const spec = JSON.parse(await fs.promises.readFile(jobFile, 'utf8')) as UninstallJobSpec;
    emit({ type: 'line', text: `Executing uninstall job: ${spec.products.length} product(s)` });

    // Worker always deletes for real: fresh settings store, dry-run off.
    const settingsStore = new SettingsStore();
    const fsGuard = new FsGuard(settingsStore, logger);
    const registryGuard = new RegistryGuard(settingsStore, logger);
    const registryService = new RegistryService(logger);
    registryGuard.setBackend(registryService);

    const reporter: UninstallProgressReporter = {
      line: (text) => {
        emit({ type: 'line', text });
        logger.info(text, 'UninstallWorker');
      },
      stepDone: () => emit({ type: 'step' }),
      productDone: (name) => emit({ type: 'product-done', name }),
    };

    const runner = new UninstallJobRunner(fsGuard, registryGuard, new BackupService(), reporter);
    await runner.run(spec);

    emit({ type: 'done', success: true });
    return 0;
  } catch (error) {
    // The message travels through the progress file into the UI + main log;
    // the full stack goes to the worker's own log file.
    emit({ type: 'done', success: false, error: errorMessage(error) });
    logger.error(`Worker failed: ${errorDetail(error)}`, 'UninstallWorker');
    return 1;
  }
}
