import { makeAutoObservable, observable } from 'mobx';

/**
 * Pages reachable from the sidebar, plus 'restore-as' which is only entered
 * through the "Restore As…" buttons (TODO9) and 'move' which is only
 * entered through the "Move…" buttons on the Installed page (TODO10).
 * The app starts on 'uninstall' (PLAN.md §6).
 */
export type AppPage = 'uninstall' | 'restore' | 'restore-as' | 'move' | 'preferences' | 'about';

/** Log panel resize bounds: never smaller than this… */
export const LOG_PANEL_MIN_HEIGHT = 120;
/** …and never taller than this fraction of the viewport. */
export const LOG_PANEL_MAX_VIEWPORT_FRACTION = 0.85;

/**
 * Renderer-only UI state (no main-process counterpart): current page, log
 * panel visibility and its user-dragged height. Page-local state like
 * search/selection deliberately lives in the pages themselves, not here
 * (PLAN.md §4.1).
 */
export class UiStore {
  currentPage: AppPage = 'uninstall';
  logPanelOpen = false;
  /** Height in px, adjustable by dragging the panel's top edge. */
  logPanelHeight = 320;
  /** Product shown in the details panel; null = panel closed (TODO6). */
  detailsProductName: string | null = null;
  /** Backup shown in the restore details panel; null = panel closed (TODO8). */
  restoreDetailsName: string | null = null;
  /**
   * Backups the "Restore As…" page operates on (TODO9). Reference-observable
   * ONLY: the array must stay a PLAIN array (no MobX proxy) because the page
   * hands it directly to `ipcRenderer.invoke`, and proxies fail Electron's
   * structured-clone serialization (blank/black renderer on throw).
   */
  restoreAsNames: string[] = [];
  /** Products the "Move…" page operates on (TODO10). Same plain-array rule as `restoreAsNames`. */
  moveNames: string[] = [];
  /** Null until the user drags — the panel then defaults to 75% of the viewport (top edge at ~25%). */
  detailsPanelHeight: number | null = null;

  constructor() {
    makeAutoObservable(this, { restoreAsNames: observable.ref, moveNames: observable.ref });
  }

  navigate(page: AppPage): void {
    this.currentPage = page;
  }

  toggleLogPanel(open?: boolean): void {
    this.logPanelOpen = open ?? !this.logPanelOpen;
  }

  openDetails(productName: string): void {
    this.detailsProductName = productName;
  }

  closeDetails(): void {
    this.detailsProductName = null;
  }

  openRestoreDetails(backupName: string): void {
    this.restoreDetailsName = backupName;
  }

  closeRestoreDetails(): void {
    this.restoreDetailsName = null;
  }

  /** Open the "Restore As…" page for the given backups (TODO9). */
  openRestoreAs(backupNames: string[]): void {
    this.restoreAsNames = [...backupNames]; // own plain copy (see field doc)
    this.restoreDetailsName = null; // panel would cover the new page
    this.currentPage = 'restore-as';
  }

  /** Open the "Move…" page for the given installed products (TODO10). */
  openMove(productNames: string[]): void {
    this.moveNames = [...productNames]; // own plain copy (see field doc)
    this.detailsProductName = null; // panel would cover the new page
    this.currentPage = 'move';
  }

  /**
   * Set the log panel height from a drag, clamped between the minimum and a
   * fraction of the viewport (passed in so the store stays DOM-free).
   */
  setLogPanelHeight(height: number, viewportHeight: number): void {
    this.logPanelHeight = clampPanelHeight(height, viewportHeight);
  }

  /** Same rule for the product details panel. */
  setDetailsPanelHeight(height: number, viewportHeight: number): void {
    this.detailsPanelHeight = clampPanelHeight(height, viewportHeight);
  }
}

function clampPanelHeight(height: number, viewportHeight: number): number {
  const max = Math.round(viewportHeight * LOG_PANEL_MAX_VIEWPORT_FRACTION);
  return Math.min(Math.max(Math.round(height), LOG_PANEL_MIN_HEIGHT), max);
}
