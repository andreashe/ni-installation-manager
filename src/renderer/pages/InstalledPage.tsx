import { observer } from 'mobx-react-lite';
import React, { useMemo, useState } from 'react';
import { useStores } from '../hooks/useStores';
import { Checkbox } from '../components/Checkbox';
import { Icon } from '../components/Icon';
import { ProductRow } from '../components/ProductRow';
import { Spinner } from '../components/Spinner';

/**
 * Start page "Installed" (PLAN.md §4.1): searchable, selectable list of
 * installed products with per-row and bulk uninstall AND backup actions.
 * Search and selection are page-local state — future sections manage
 * their own.
 */
export const InstalledPage = observer(function InstalledPage() {
  const { products, uninstall, settings, ui } = useStores();
  const [query, setQuery] = useState('');
  const [selectedNames, setSelectedNames] = useState<ReadonlySet<string>>(new Set());

  // Frontend-only search (PLAN.md §4.1): filter by name, case-insensitive.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.products.filter((p) => p.name.toLowerCase().includes(q)) : products.products;
  }, [products.products, query]);

  const selectable = visible.filter((p) => p.removable);
  const selectedVisible = selectable.filter((p) => selectedNames.has(p.name));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;

  const toggleOne = (name: string) => {
    setSelectedNames((previous) => {
      const next = new Set(previous);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  /** Select-all over the VISIBLE (filtered) selectable products, like the mockup. */
  const toggleAll = () => {
    setSelectedNames(allSelected ? new Set() : new Set(selectable.map((p) => p.name)));
  };

  const startUninstall = (names: string[]) => {
    if (names.length === 0) {
      return;
    }
    uninstall.start(names);
    setSelectedNames(new Set());
  };

  const startBackup = (names: string[]) => {
    if (names.length === 0) {
      return;
    }
    uninstall.backup(names);
    setSelectedNames(new Set());
  };

  /** Open the "Move…" page for the given products (TODO10). */
  const openMove = (names: string[]) => {
    if (names.length === 0) {
      return;
    }
    ui.openMove(names);
  };

  // Backup buttons need a configured target folder (TODO7).
  const backupPossible = settings.settings.backupFolder !== '';
  // Uninstall implicitly backs up when the setting is on and a folder is set.
  const uninstallAlsoBackups = settings.settings.backupEnabled && backupPossible;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Installed</h1>
        <button
          type="button"
          className="icon-button"
          title="Reload product list"
          onClick={() => products.rescan()}
        >
          <Icon name="reload" size={22} />
        </button>
      </div>

      {settings.effectiveDryRun && (
        <div className="dry-run-banner">
          Dry-run mode active — uninstall will only log what it would do, nothing gets deleted.
        </div>
      )}

      <div className="list-toolbar">
        <label className="checkbox-label">
          <Checkbox
            checked={allSelected}
            partial={selectedVisible.length > 0 && !allSelected}
            onToggle={toggleAll}
          />
          <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
        </label>
        <span className="list-toolbar-count">
          {selectedVisible.length > 0
            ? `${selectedVisible.length} of ${visible.length} selected`
            : `${visible.length} products`}
        </span>

        <div className="search-box">
          <span className="search-icon">
            <Icon name="search" size={15} />
          </span>
          <input
            value={query}
            placeholder="Search products"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query !== '' && (
            <button type="button" className="search-clear" title="Clear" onClick={() => setQuery('')}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          className="primary-button"
          disabled={selectedVisible.length === 0 || !backupPossible}
          title={backupPossible ? 'Back up the selected products' : 'Define backup folder in settings'}
          onClick={() => startBackup(selectedVisible.map((p) => p.name))}
        >
          Backup selected
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={selectedVisible.length === 0}
          title="Move the selected products to different locations (rename patterns)"
          onClick={() => openMove(selectedVisible.map((p) => p.name))}
        >
          Move selected…
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={selectedVisible.length === 0}
          title={uninstallAlsoBackups ? 'Will also backup' : undefined}
          onClick={() => startUninstall(selectedVisible.map((p) => p.name))}
        >
          Uninstall selected
        </button>
      </div>

      <div className="product-list">
        {visible.map((product) => (
          <ProductRow
            key={product.name}
            product={product}
            selected={selectedNames.has(product.name)}
            onToggle={() => toggleOne(product.name)}
            onUninstall={() => startUninstall([product.name])}
            onBackup={() => startBackup([product.name])}
            onMove={() => openMove([product.name])}
            onDetails={() => ui.openDetails(product.name)}
            backupPossible={backupPossible}
            uninstallAlsoBackups={uninstallAlsoBackups}
          />
        ))}
        {visible.length === 0 && (
          <div className="empty-hint">
            {products.initialized ? (
              'No products match.'
            ) : (
              <span className="loading-hint">
                <Spinner size={20} />
                Loading product list…
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
});
