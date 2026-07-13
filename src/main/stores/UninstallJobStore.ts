import { makeAutoObservable } from 'mobx';
import type { JobMode, UninstallJobState, UninstallJobStatus } from '../../shared/types/uninstall';

/** Console lines kept for the progress page; older ones are dropped. */
const MAX_CONSOLE_LINES = 2000;

/**
 * Main-process source of truth for the (single) uninstall job (MobX).
 * Written by `UninstallService` (in-process runs and worker progress
 * tailing); pushed to the renderer via store-sync. Only one job at a time.
 */
export class UninstallJobStore {
  status: UninstallJobStatus = 'idle';
  mode: JobMode = 'uninstall';
  dryRun = false;
  productNames: string[] = [];
  totalSteps = 0;
  completedSteps = 0;
  consoleLines: string[] = [];
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get running(): boolean {
    return this.status === 'running';
  }

  /** Initialize and switch the renderer to the progress page. */
  startJob(productNames: string[], totalSteps: number, dryRun: boolean, mode: JobMode): void {
    this.status = 'running';
    this.mode = mode;
    this.dryRun = dryRun;
    this.productNames = productNames;
    this.totalSteps = totalSteps;
    this.completedSteps = 0;
    this.consoleLines = [];
    this.error = null;
  }

  addLine(text: string): void {
    this.consoleLines.push(text);
    if (this.consoleLines.length > MAX_CONSOLE_LINES) {
      this.consoleLines.splice(0, this.consoleLines.length - MAX_CONSOLE_LINES);
    }
  }

  stepDone(): void {
    this.completedSteps = Math.min(this.completedSteps + 1, this.totalSteps);
  }

  finish(success: boolean, error?: string): void {
    this.status = success ? 'succeeded' : 'failed';
    this.error = error ?? null;
  }

  /** CLOSE button: back to idle, progress page disappears. */
  reset(): void {
    this.status = 'idle';
    this.productNames = [];
    this.totalSteps = 0;
    this.completedSteps = 0;
    this.consoleLines = [];
    this.error = null;
  }

  /** Serializable snapshot for the renderer mirror store. */
  toState(): UninstallJobState {
    return {
      status: this.status,
      mode: this.mode,
      dryRun: this.dryRun,
      productNames: [...this.productNames],
      totalSteps: this.totalSteps,
      completedSteps: this.completedSteps,
      consoleLines: [...this.consoleLines],
      error: this.error,
    };
  }
}
