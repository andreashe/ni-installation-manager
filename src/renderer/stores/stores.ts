import { RootStore } from './RootStore';

/**
 * The single `RootStore` instance for this window. Module-level singleton is
 * sufficient here (one window, no SSR); components access it through the
 * `useStores` hook instead of importing this directly.
 */
export const rootStore = new RootStore();
