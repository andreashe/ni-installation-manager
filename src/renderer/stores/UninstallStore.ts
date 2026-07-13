import { makeAutoObservable, runInAction } from 'mobx';
import type { UninstallJobState } from '../../shared/types/uninstall';

/** Initial/empty job state — progress page hidden. */
const IDLE_STATE: UninstallJobState = {
  status: 'idle',
  mode: 'uninstall',
  dryRun: false,
  productNames: [],
  totalSteps: 0,
  completedSteps: 0,
  consoleLines: [],
  error: null,
};

/**
 * Renderer mirror of the main-process uninstall job state (RULES.md §5).
 * `App` switches to the progress page whenever `state.status !== 'idle'`;
 * the page's CLOSE button calls `dismiss()` after the job finished.
 */
export class UninstallStore {
  state: UninstallJobState = IDLE_STATE;

  constructor() {
    makeAutoObservable(this);
  }

  /** Subscribe to job pushes from main. Called once by the RootStore. */
  connect(): () => void {
    return window.api.uninstall.onChanged((state) => {
      runInAction(() => {
        this.state = state;
      });
    });
  }

  /** Progress ratio 0..1 for the progress bar. */
  get progress(): number {
    return this.state.totalSteps === 0 ? 0 : this.state.completedSteps / this.state.totalSteps;
  }

  /** Start an uninstall job (per-row button or "Uninstall selected"). */
  start(productNames: string[]): void {
    void window.api.uninstall.start(productNames);
  }

  /** Start a backup-only job (per-row button or "Backup selected", TODO7). */
  backup(productNames: string[]): void {
    void window.api.uninstall.backup(productNames);
  }

  /** Close the progress page after the job finished or failed. */
  dismiss(): void {
    void window.api.uninstall.dismiss();
  }
}
