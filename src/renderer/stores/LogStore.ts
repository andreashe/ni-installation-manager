import { makeAutoObservable, runInAction } from 'mobx';
import type { LogEntry } from '../../shared/types/log-entry';

/** Maximum entries kept in the renderer; older lines are dropped. */
const MAX_ENTRIES = 1000;

/** Tab id of the live stream (all file tabs use the log file name). */
export const LIVE_TAB = 'live';

/**
 * Live view of the central main-process log (PLAN.md §4.4). Fed by the
 * `log:entry` push stream; displayed by the log panel with autoscroll.
 *
 * Also backs the panel's file tabs: the elevated workers write their own
 * log files (a separate process cannot stream into this renderer), so those
 * are read on demand via `log:files` / `log:read`.
 */
export class LogStore {
  entries: LogEntry[] = [];

  /** Log file names offered as tabs (main app log first). */
  files: string[] = [];

  /** Selected tab: `LIVE_TAB` or one of `files`. */
  activeTab: string = LIVE_TAB;

  /** Content of the selected log file (file tabs only). */
  fileContent = '';

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

  /** Refresh the tab list — called when the panel opens. */
  async refreshFiles(): Promise<void> {
    const files = await window.api.log.getFiles();
    runInAction(() => {
      this.files = files;
      if (this.activeTab !== LIVE_TAB && !files.includes(this.activeTab)) {
        this.activeTab = LIVE_TAB;
      }
    });
  }

  /** Switch tab; file tabs load their content immediately. */
  async selectTab(tab: string): Promise<void> {
    this.activeTab = tab;
    this.fileContent = '';
    if (tab !== LIVE_TAB) {
      await this.loadFileContent();
    }
  }

  /** (Re)load the selected file tab's content (also the Reload button). */
  async loadFileContent(): Promise<void> {
    if (this.activeTab === LIVE_TAB) {
      return;
    }
    const tab = this.activeTab;
    const content = await window.api.log.readFile(tab);
    runInAction(() => {
      // Ignore stale loads after another tab switch.
      if (this.activeTab === tab) {
        this.fileContent = content;
      }
    });
  }
}
