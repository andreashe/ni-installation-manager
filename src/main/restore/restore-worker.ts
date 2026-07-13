import fs from 'node:fs';
import path from 'node:path';
import { CLI_ARG_JOB_FILE_PREFIX } from '../../config/default.config';
import { getRestoreWorkerLogFilePath } from '../../config/paths';
import { errorDetail, errorMessage } from '../utils/error-message';
import { LoggerService } from '../services/LoggerService';
import { RegistryService } from '../services/RegistryService';
import { SettingsStore } from '../stores/SettingsStore';
import type { UninstallProgressReporter } from '../uninstall/uninstall-job';
import { RegistryGuard } from '../utils/RegistryGuard';
import { RestoreJobRunner } from './RestoreJobRunner';
import type { RestoreJobSpec } from './restore-job';

/**
 * Headless elevated restore worker (TODO8): the app relaunched with
 * `--restore-worker --job-file=<path>` after the UAC prompt. Reads the job
 * description, copies the backed-up files/folders to their targets and
 * writes the backed-up registry keys back to HKLM (dry-run jobs never reach
 * the worker), streaming progress as JSONL into `progress.jsonl` next to
 * the job file. Exit code 0 = success.
 *
 * Never creates a window; wired from `main.ts` before normal bootstrap.
 */
export async function runRestoreWorker(cliArgs: readonly string[]): Promise<number> {
  const jobFileArg = cliArgs.find((arg) => arg.startsWith(CLI_ARG_JOB_FILE_PREFIX));
  if (!jobFileArg) {
    return 2;
  }
  const jobFile = jobFileArg.slice(CLI_ARG_JOB_FILE_PREFIX.length);
  const progressFile = path.join(path.dirname(jobFile), 'progress.jsonl');

  /**
   * Append one protocol event; also the sink for all worker console output.
   * Never throws — see uninstall-worker.ts.
   */
  const emit = (event: object): void => {
    try {
      fs.appendFileSync(progressFile, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // Progress reporting is best-effort; the worker log is the fallback.
    }
  };

  // First sign of life as early as possible (see uninstall-worker.ts).
  emit({ type: 'line', text: `Elevated restore worker started (pid ${process.pid})` });

  const logger = new LoggerService();
  try {
    logger.initializeFileSink(getRestoreWorkerLogFilePath());
    const spec = JSON.parse(await fs.promises.readFile(jobFile, 'utf8')) as RestoreJobSpec;
    emit({ type: 'line', text: `Executing restore job: ${spec.products.length} product(s)` });

    // Worker always restores for real: fresh settings store, dry-run off.
    const registryGuard = new RegistryGuard(new SettingsStore(), logger);
    registryGuard.setBackend(new RegistryService(logger));

    const reporter: UninstallProgressReporter = {
      line: (text) => {
        emit({ type: 'line', text });
        logger.info(text, 'RestoreWorker');
      },
      stepDone: () => emit({ type: 'step' }),
      productDone: (name) => emit({ type: 'product-done', name }),
    };

    await new RestoreJobRunner(registryGuard, reporter).run(spec);

    emit({ type: 'done', success: true });
    return 0;
  } catch (error) {
    // Message → progress file → UI + main log; full stack → worker log.
    emit({ type: 'done', success: false, error: errorMessage(error) });
    logger.error(`Restore worker failed: ${errorDetail(error)}`, 'RestoreWorker');
    return 1;
  }
}
