import { observer } from 'mobx-react-lite';
import React, { useMemo, useState } from 'react';
import { useStores } from '../hooks/useStores';
import { BackupProductRow } from '../components/BackupProductRow';
import { Checkbox } from '../components/Checkbox';
import { Icon } from '../components/Icon';

/**
 * Restore page (TODO8): searchable, selectable list of product backups
 * found in the configured backup folder, with per-row and bulk restore
 * actions — mirroring the Installed page. Requires the backup folder
 * setting; without it only a hint linking to the Preferences is shown.
 * "Restore … As…" buttons are placeholders for the upcoming feature.
 */
export const RestorePage = observer(function RestorePage() {
  const { restore, settings, ui } = useStores();
  const [query, setQuery] = useState('');
  const [selectedNames, setSelectedNames] = useState<ReadonlySet<string>>(new Set());

  // Frontend-only search: filter by name, case-insensitive (like Installed).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? restore.backups.filter((b) => b.name.toLowerCase().includes(q)) : restore.backups;
  }, [restore.backups, query]);

  const selectedVisible = visible.filter((b) => selectedNames.has(b.name));
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length;

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

  /** Select-all over the VISIBLE (filtered) backups, like the Installed page. */
  const toggleAll = () => {
    setSelectedNames(allSelected ? new Set() : new Set(visible.map((b) => b.name)));
  };

  const startRestore = (names: string[]) => {
    if (names.length === 0) {
      return;
    }
    restore.start(names);
    setSelectedNames(new Set());
  };

  /** Open the "Restore As…" page for the given backups (TODO9). */
  const openRestoreAs = (names: string[]) => {
    if (names.length === 0) {
      return;
    }
    ui.openRestoreAs(names);
  };

  const backupFolderConfigured = settings.settings.backupFolder !== '';

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Restore</h1>
        <button
          type="button"
          className="icon-button"
          title="Reload backup list"
          onClick={() => restore.rescan()}
        >
          <Icon name="reload" size={22} />
        </button>
      </div>

      {settings.effectiveDryRun && (
        <div className="dry-run-banner">
          Dry-run mode active — restore will only log what it would copy, nothing gets written.
        </div>
      )}

      {!backupFolderConfigured ? (
        <div className="empty-hint">
          No backup folder configured. Set the backup folder in the{' '}
          <button type="button" className="link-button" onClick={() => ui.navigate('preferences')}>
            Preferences
          </button>{' '}
          to see restorable backups.
        </div>
      ) : (
        <>
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
                : `${visible.length} backups`}
            </span>

            <div className="search-box">
              <span className="search-icon">
                <Icon name="search" size={15} />
              </span>
              <input
                value={query}
                placeholder="Search backups"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query !== '' && (
                <button
                  type="button"
                  className="search-clear"
                  title="Clear"
                  onClick={() => setQuery('')}
                >
                  <Icon name="close" size={13} />
                </button>
              )}
            </div>

            <div style={{ flex: 1 }} />

            <button
              type="button"
              className="primary-button"
              disabled={selectedVisible.length === 0}
              title="Restore the selected backups to their original locations"
              onClick={() => startRestore(selectedVisible.map((b) => b.name))}
            >
              Restore selected
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={selectedVisible.length === 0}
              title="Restore the selected backups to different locations (rename patterns)"
              onClick={() => openRestoreAs(selectedVisible.map((b) => b.name))}
            >
              Restore selected As…
            </button>
          </div>

          <div className="product-list">
            {visible.map((backup) => (
              <BackupProductRow
                key={backup.name}
                backup={backup}
                selected={selectedNames.has(backup.name)}
                onToggle={() => toggleOne(backup.name)}
                onRestore={() => startRestore([backup.name])}
                onRestoreAs={() => openRestoreAs([backup.name])}
                onDetails={() => ui.openRestoreDetails(backup.name)}
              />
            ))}
            {visible.length === 0 && (
              <div className="empty-hint">
                {restore.initialized ? 'No backups found.' : 'Loading backup list…'}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
});
