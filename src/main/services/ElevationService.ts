import { execFile, spawn } from 'node:child_process';
import type { LoggerService } from './LoggerService';

const LOG_SOURCE = 'ElevationService';

/**
 * Build the PowerShell command that launches the worker elevated.
 * Exported for unit tests.
 *
 * Two quoting layers are required:
 * - single quotes make each piece a PowerShell string literal (embedded
 *   single quotes doubled);
 * - additional embedded double quotes around every argument, because
 *   `Start-Process` joins `-ArgumentList` with spaces WITHOUT quoting —
 *   without them an argument like the job-file path under
 *   `%APPDATA%\NI Installation Manager\…` arrives split at every space
 *   in the worker's argv.
 */
export function buildElevatedWorkerCommand(exePath: string, workerArgs: string[]): string {
  const quotedArgs = workerArgs.map((arg) => `'"${arg.replace(/'/g, "''")}"'`).join(',');
  return (
    `$p = Start-Process -FilePath '${exePath.replace(/'/g, "''")}'` +
    ` -ArgumentList @(${quotedArgs}) -Verb RunAs -PassThru -Wait; exit $p.ExitCode`
  );
}

/**
 * Administrator-rights handling for real uninstall jobs (PLAN.md §3.4):
 * HKLM writes and Program Files deletions need elevation. The app itself
 * runs unelevated; a whole uninstall job is executed by a relaunched,
 * elevated worker instance of this app — one UAC prompt per job.
 */
export class ElevationService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * True when the current process already has administrator rights
   * (then real jobs can run in-process without a UAC prompt).
   * `net session` succeeds only for elevated processes — cheap, no output parsed.
   */
  isElevated(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('net', ['session'], { windowsHide: true }, (error) => resolve(error === null));
    });
  }

  /**
   * Launch the uninstall worker elevated (UAC prompt) and resolve with its
   * exit code once it finished. Rejects when the UAC prompt is declined.
   *
   * PowerShell `Start-Process -Verb RunAs` is the documented Windows way to
   * request elevation for a child process; the worker itself does all
   * registry/file work through the normal Node/native-reg APIs.
   */
  runWorkerElevated(workerArgs: string[]): Promise<number> {
    // -PassThru + -Wait: propagate the worker's real exit code back out.
    const command = buildElevatedWorkerCommand(process.execPath, workerArgs);

    this.logger.info('Requesting elevation for uninstall worker (UAC prompt)', LOG_SOURCE);

    return new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { windowsHide: true, stdio: 'ignore' },
      );
      child.on('error', reject);
      child.on('exit', (code) => {
        // PowerShell exits non-zero when Start-Process throws (UAC declined).
        if (code === null) {
          reject(new Error('Elevation process terminated unexpectedly'));
        } else {
          resolve(code);
        }
      });
    });
  }
}
