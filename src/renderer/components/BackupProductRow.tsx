import { observer } from 'mobx-react-lite';
import React from 'react';
import type { BackupProductDto } from '../../shared/types/restore';
import { formatBackupDate, formatBytes } from '../utils/format';
import { Checkbox } from './Checkbox';
import altArtworkUrl from '../assets/MST_artwork_alt.png';

/**
 * One row of the backup list on the Restore page (TODO8): checkbox,
 * artwork, name, version, backup size, backup date and per-backup Details /
 * Restore / Restore As… buttons. Row click toggles selection.
 * "Restore As…" opens the rename-pattern page for this backup (TODO9).
 */
export const BackupProductRow = observer(function BackupProductRow({
  backup,
  selected,
  onToggle,
  onRestore,
  onRestoreAs,
  onDetails,
}: {
  backup: BackupProductDto;
  selected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onRestoreAs: () => void;
  onDetails: () => void;
}) {
  return (
    <div className="product-row" onClick={onToggle}>
      <Checkbox checked={selected} onToggle={onToggle} />
      <div className="product-artwork">
        {/* Bundled alternative image for backups without own artwork. */}
        <img src={backup.artworkUrl ?? altArtworkUrl} alt="" loading="lazy" />
      </div>
      <div className="product-name" title={backup.name}>
        {backup.name}
      </div>
      <div className="product-meta">{backup.version ?? '—'}</div>
      <div className="product-meta">
        {backup.diskUsageBytes === null ? '…' : formatBytes(backup.diskUsageBytes)}
      </div>
      <div className="product-meta product-backup-date" title="Backup date">
        {formatBackupDate(backup.backupDate)}
      </div>
      <button
        type="button"
        className="row-button"
        title="Show restore targets, backup sizes and registry paths"
        onClick={(event) => {
          event.stopPropagation();
          onDetails();
        }}
      >
        Details
      </button>
      <button
        type="button"
        className="row-button"
        title="Restore this backup to its original locations"
        onClick={(event) => {
          event.stopPropagation();
          onRestore();
        }}
      >
        Restore
      </button>
      <button
        type="button"
        className="row-button"
        title="Restore this backup to different locations (rename patterns)"
        onClick={(event) => {
          event.stopPropagation();
          onRestoreAs();
        }}
      >
        Restore As…
      </button>
    </div>
  );
});
