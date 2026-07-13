import { rootStore } from '../stores/stores';
import type { RootStore } from '../stores/RootStore';

/**
 * Access the renderer stores from React components.
 *
 * Components using observable state from these stores must be wrapped in
 * `observer` from `mobx-react-lite`, otherwise they will not re-render on
 * store changes.
 */
export function useStores(): RootStore {
  return rootStore;
}
