import fs from 'node:fs';
import path from 'node:path';
import { CLI_ARG_JOB_FILE_PREFIX } from '../../config/default.config';
import { getLogFolderPath } from '../../config/paths';
import { LoggerService } from '../services/LoggerService';
import { RegistryService } from '../services/RegistryService';
import { SettingsStore } from '../stores/SettingsStore';
import type { UninstallProgressReporter } from '../uninstall/uninstall-job';
import { RegistryGuard } from '../utils/RegistryGuard';
import { MoveJobRunner } from './MoveJobRunner';
import type { MoveJobSpec } from './move-job';

/**
 * Headless elevated move worker (TODO10): the app relaunched with
 * `--move-worker --job-file=<path>` after the UAC prompt. Reads the job
 * description, relocates the products' files/folders to their new targets
 * and updates the changed path-carrying registry values in HKLM (dry-run
 * jobs never reach the worker), streaming progress as JSONL into
 * `progress.jsonl` next to the job file. Exit code 0 = success.
 *
 * Never creates a window; wired from `main.ts` before normal bootstrap.
 */
export async function runMoveWorker(cliArgs: readonly string[]): Promise<number> {
  const jobFileArg = cliArgs.find((arg) => arg.startsWith(CLI_ARG_JOB_FILE_PREFIX));
  if (!jobFileArg) {
    return 2;
  }
  const jobFile = jobFileArg.slice(CLI_ARG_JOB_FILE_PREFIX.length);
  const progressFile = path.join(path.dirname(jobFile), 'progress.jsonl');

  /** Append one protocol event; also the sink for all worker console output. */
  const emit = (event: object): void => {
    fs.appendFileSync(progressFile, `${JSON.stringify(event)}\n`, 'utf8');
  };

  // First sign of life as early as possible (see uninstall-worker.ts).
  emit({ type: 'line', text: `Elevated move worker started (pid ${process.pid})` });

  const logger = new LoggerService();
  logger.initializeFileSink(path.join(getLogFolderPath(), 'move-worker.log'));

  try {
    const spec = JSON.parse(await fs.promises.readFile(jobFile, 'utf8')) as MoveJobSpec;
    emit({ type: 'line', text: `Executing move job: ${spec.products.length} product(s)` });

    // Worker always moves for real: fresh settings store, dry-run off.
    const registryGuard = new RegistryGuard(new SettingsStore(), logger);
    registryGuard.setBackend(new RegistryService(logger));

    const reporter: UninstallProgressReporter = {
      line: (text) => {
        emit({ type: 'line', text });
        logger.info(text, 'MoveWorker');
      },
      stepDone: () => emit({ type: 'step' }),
      productDone: (name) => emit({ type: 'product-done', name }),
    };

    await new MoveJobRunner(registryGuard, reporter).run(spec);

    emit({ type: 'done', success: true });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit({ type: 'done', success: false, error: message });
    logger.error(`Move worker failed: ${message}`, 'MoveWorker');
    return 1;
  }
}
