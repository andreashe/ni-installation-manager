import { makeAutoObservable, runInAction } from 'mobx';
import type { ProductDto, ProductListState } from '../../shared/types/product';
import type { RenamePattern } from '../../shared/types/restore';

/**
 * Renderer mirror of the main-process product store (RULES.md §5).
 *
 * Receives `ProductListState` snapshots pushed from main (scan results,
 * async disk-usage/artwork updates, removals after uninstall). The Uninstall
 * page (phase 4) reads it via `useStores()` + `observer`; `rescan()` backs
 * the reload button.
 */
export class ProductStore {
  products: ProductDto[] = [];
  /** True while main runs a scan; drives reload spinner / status bar. */
  scanning = false;
  /** Current background activity for the status bar; null when idle. */
  statusText: string | null = null;
  /** False until the first snapshot arrived from main. */
  initialized = false;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Fetch the initial state and subscribe to pushes from main.
   * Called once by the RootStore; returns the unsubscribe function.
   */
  connect(): () => void {
    const unsubscribe = window.api.products.onChanged((state) => this.applyState(state));
    void window.api.products.get().then((state) => this.applyState(state));
    return unsubscribe;
  }

  /** Trigger a full rescan in main (reload button). Result arrives via push. */
  rescan(): void {
    void window.api.products.rescan();
  }

  /** Start a move job with rename patterns ("Move…" page, TODO10). */
  startMove(productNames: string[], patterns: RenamePattern[]): void {
    void window.api.move.start(productNames, patterns);
  }

  /** Apply an authoritative snapshot received from the main process. */
  private applyState(state: ProductListState): void {
    runInAction(() => {
      this.products = state.products;
      this.scanning = state.scanning;
      this.statusText = state.statusText;
      this.initialized = true;
    });
  }
}
