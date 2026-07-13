import { LogStore } from './LogStore';
import { ProductStore } from './ProductStore';
import { RestoreStore } from './RestoreStore';
import { SettingsStore } from './SettingsStore';
import { UiStore } from './UiStore';
import { UninstallStore } from './UninstallStore';

/**
 * Container for all renderer stores. Created exactly once per window (see
 * `stores.ts`) and handed to components via the `useStores` hook.
 * Mirror stores connect to their main-process counterparts on creation.
 */
export class RootStore {
  readonly settings: SettingsStore;
  readonly products: ProductStore;
  readonly restore: RestoreStore;
  readonly uninstall: UninstallStore;
  readonly log: LogStore;
  readonly ui: UiStore;

  constructor() {
    this.settings = new SettingsStore();
    this.settings.connect();
    this.products = new ProductStore();
    this.products.connect();
    this.restore = new RestoreStore();
    this.restore.connect();
    this.uninstall = new UninstallStore();
    this.uninstall.connect();
    this.log = new LogStore();
    this.log.connect();
    this.ui = new UiStore();
  }
}
