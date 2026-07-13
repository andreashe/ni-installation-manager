import { makeAutoObservable, runInAction } from 'mobx';
import type { LogEntry } from '../../shared/types/log-entry';

/** Maximum entries kept in the renderer; older lines are dropped. */
const MAX_ENTRIES = 1000;

/**
 * Live view of the central main-process log (PLAN.md §4.4). Fed by the
 * `log:entry` push stream; displayed by the log panel with autoscroll.
 */
export class LogStore {
  entries: LogEntry[] = [];

  constructor() {
    makeAutoObservable(this);
  }

  /** Subscribe to the log stream. Called once by the RootStore. */
  connect(): () => void {
    return window.api.log.onEntry((entry) => {
      runInAction(() => {
        this.entries.push(entry);
        if (this.entries.length > MAX_ENTRIES) {
          this.entries.splice(0, this.entries.length - MAX_ENTRIES);
        }
      });
    });
  }
}
