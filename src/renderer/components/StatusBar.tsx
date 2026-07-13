import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../hooks/useStores';
import { Spinner } from './Spinner';

/**
 * Constant bottom bar (PLAN.md §6): shows what currently happens in the
 * background (registry scan, disk usage, artwork, uninstall …) with a
 * spinner at the right end while busy. Empty text when idle.
 */
export const StatusBar = observer(function StatusBar() {
  const { products, restore, settings } = useStores();

  const busy =
    products.scanning || products.statusText !== null || restore.scanning || restore.statusText !== null;
  const text =
    products.statusText ??
    restore.statusText ??
    (products.scanning || restore.scanning ? 'Scanning…' : 'Ready');

  return (
    <footer className="status-bar">
      <span className="status-bar-text">
        {text}
        {settings.effectiveDryRun ? '  —  DRY-RUN MODE ACTIVE' : ''}
      </span>
      {busy && <Spinner />}
    </footer>
  );
});
