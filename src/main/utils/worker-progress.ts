import type { LoggerService } from '../services/LoggerService';
import type { UninstallProgressEvent } from '../uninstall/uninstall-job';

/** Job-store surface the tracker feeds (all three job stores provide it). */
export interface WorkerProgressSink {
  addLine(text: string): void;
  stepDone(): void;
}

/**
 * Translates an elevated worker's JSONL progress events into job store
 * updates AND the central log, so the main log file carries the same detail
 * as the progress page (in-process runs get this via their reporter).
 *
 * Also remembers the last error the worker reported through a `done` event:
 * the orchestrating service attaches it to the generic "worker exited with
 * code N" failure, so the log answers WHY the worker failed (which file or
 * registry change), not only that it failed.
 *
 * Shared by `UninstallService`, `RestoreService` and `MoveService`.
 */
export class WorkerProgressTracker {
  private reportedError: string | null = null;

  constructor(
    private readonly sink: WorkerProgressSink,
    private readonly logger: LoggerService,
    private readonly logSource: string,
    private readonly onProductDone: (name: string) => void,
  ) {}

  /** Last error reported via a `done` event — null while none was seen. */
  get lastError(): string | null {
    return this.reportedError;
  }

  /** Parse one JSONL progress line. Malformed lines are surfaced verbatim. */
  apply(rawLine: string): void {
    let event: UninstallProgressEvent;
    try {
      event = JSON.parse(rawLine) as UninstallProgressEvent;
    } catch {
      this.sink.addLine(rawLine);
      this.logger.warn(`Unparsable worker output: ${rawLine}`, this.logSource);
      return;
    }
    switch (event.type) {
      case 'line':
        this.sink.addLine(event.text);
        this.logger.info(event.text, this.logSource);
        break;
      case 'step':
        this.sink.stepDone();
        break;
      case 'product-done':
        this.onProductDone(event.name);
        break;
      case 'done':
        // Exit code handling in the service decides overall success.
        if (!event.success) {
          this.reportedError = event.error ?? 'worker reported failure without an error message';
          this.sink.addLine(`ERROR: ${this.reportedError}`);
          this.logger.error(this.reportedError, this.logSource);
        }
        break;
    }
  }
}

/**
 * Failure message for a non-zero worker exit: includes the worker-reported
 * error when one arrived through the progress file, otherwise points at the
 * worker's own log file (the only place with detail when the worker died
 * before/without reporting).
 */
export function describeWorkerExit(
  jobLabel: string,
  exitCode: number,
  lastError: string | null,
  workerLogPath: string,
): string {
  return lastError !== null
    ? `${jobLabel} worker failed (exit code ${exitCode}): ${lastError}`
    : `${jobLabel} worker exited with code ${exitCode} without reporting an error — see ${workerLogPath}`;
}
