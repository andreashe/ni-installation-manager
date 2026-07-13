/** Lifecycle of the (single) job. 'idle' = no job, progress page hidden. */
export type UninstallJobStatus = 'idle' | 'running' | 'succeeded' | 'failed';

/**
 * What the job does: full uninstall (optionally with backup), a standalone
 * backup without any deletion (TODO7), a restore of a backup (TODO8) or a
 * move of installed products to new locations (TODO10).
 */
export type JobMode = 'uninstall' | 'backup' | 'restore' | 'move';

/**
 * State of the current uninstall/backup job, pushed from main to the
 * renderer (PLAN.md §7). Drives the progress page: bar from step counts,
 * console from `consoleLines`; CLOSE button appears for 'succeeded'/'failed'.
 */
export interface UninstallJobState {
  status: UninstallJobStatus;
  mode: JobMode;
  /** True when the job ran in dry-run mode (nothing was actually deleted). */
  dryRun: boolean;
  /** Products the job operates on. */
  productNames: string[];
  /** Total partial steps (backups, deletions, …) — denominator of the progress bar. */
  totalSteps: number;
  completedSteps: number;
  /** Console-style detail output (capped in main). */
  consoleLines: string[];
  /** Failure reason when status is 'failed'. */
  error: string | null;
}
