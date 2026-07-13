import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import type { RestoreDetailsDto, RestoreLocationDetails } from '../../shared/types/restore';
import { useStores } from '../hooks/useStores';
import { formatBackupDate, formatBytes } from '../utils/format';
import { BottomPanel } from './BottomPanel';
import { CopyButton } from './CopyButton';

/**
 * Text color per row (TODO8): red when the descriptor mentions a location
 * the backup folder holds no data for (cannot be restored); yellow when
 * the restore TARGET already exists on disk (would be overwritten);
 * default for targets that do not exist yet.
 */
function locationClass(location: RestoreLocationDetails): string {
  if (!location.backupExists) {
    return ' details-missing';
  }
  if (location.targetExists) {
    return ' details-warning';
  }
  return '';
}

/** Human label for the target state column. */
function targetStateLabel(location: RestoreLocationDetails): string {
  if (!location.backupExists) {
    return 'not in backup';
  }
  return location.targetExists ? 'exists' : 'new';
}

/**
 * Slide-up details view for one backup (TODO8), mirroring the product
 * details panel: backup facts (version, date), the restore target of every
 * backed-up location — the targets may point to FUTURE locations that do
 * not exist yet — with the backup-side sizes and a potential-total row,
 * plus the registry paths that would be restored. Restore / Restore As…
 * shortcuts sit bottom right ("Restore As…" follows later). Data is fetched
 * on demand because backup sizes need filesystem walks.
 */
export const RestoreDetailsPanel = observer(function RestoreDetailsPanel() {
  const { ui, restore } = useStores();
  const backupName = ui.restoreDetailsName;
  const [details, setDetails] = useState<RestoreDetailsDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!backupName) {
      return;
    }
    setDetails(null);
    setLoading(true);
    let cancelled = false;
    void window.api.restore.getDetails(backupName).then((result) => {
      if (!cancelled) {
        setDetails(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [backupName]);

  if (!backupName) {
    return null;
  }

  const startRestore = () => {
    ui.closeRestoreDetails();
    restore.start([backupName]);
  };

  const openRestoreAs = () => {
    ui.openRestoreAs([backupName]); // also closes this panel
  };

  return (
    <BottomPanel
      title={`Restore details — ${backupName}`}
      height={ui.detailsPanelHeight ?? Math.round(window.innerHeight * 0.75)}
      onResize={(height, viewport) => ui.setDetailsPanelHeight(height, viewport)}
      onClose={() => ui.closeRestoreDetails()}
    >
      <div className="details-body">
        {loading && <div className="log-line">Collecting details (sizes may take a moment)…</div>}
        {!loading && !details && <div className="log-line">Backup not found.</div>}
        {details && (
          <>
            <div className="details-facts">
              <span className="details-label">Version</span>
              <span className="details-value">
                {details.version ?? '—'}
                {details.version && <CopyButton value={details.version} />}
              </span>
            </div>
            <div className="details-facts">
              <span className="details-label">Backup date</span>
              <span className="details-value">{formatBackupDate(details.backupDate)}</span>
            </div>

            <h3 className="details-heading">Restore targets</h3>
            <table className="details-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Target</th>
                  <th>Target path</th>
                  <th className="details-size">Backup size</th>
                </tr>
              </thead>
              <tbody>
                {details.locations.map((location, index) => (
                  <tr key={index}>
                    <td className={locationClass(location).trim()}>{location.kind}</td>
                    <td className={locationClass(location).trim()}>{targetStateLabel(location)}</td>
                    <td
                      className={`details-path${locationClass(location)}`}
                      title={
                        location.backupExists
                          ? location.targetPath
                          : `${location.targetPath} — no data in backup (${location.backupPath})`
                      }
                    >
                      {location.targetPath}
                      <CopyButton value={location.targetPath} />
                    </td>
                    <td className="details-size">
                      {location.backupExists ? formatBytes(location.backupSizeBytes) : '—'}
                    </td>
                  </tr>
                ))}
                {details.locations.length === 0 && (
                  <tr>
                    <td colSpan={4}>No restorable locations found.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="details-total-row">
                  <td colSpan={3}>Potential total restore size</td>
                  <td className="details-size">{formatBytes(details.totalRestoreBytes)}</td>
                </tr>
              </tfoot>
            </table>

            <h3 className="details-heading">Registry paths to restore</h3>
            <table className="details-table">
              <tbody>
                {details.registryPaths.map((registryPath) => (
                  <tr key={registryPath}>
                    <td className="details-path" title={registryPath}>
                      {registryPath}
                      <CopyButton value={registryPath} />
                    </td>
                  </tr>
                ))}
                {details.registryPaths.length === 0 && (
                  <tr>
                    <td>No registry paths found.</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="details-actions">
              <button type="button" className="primary-button" onClick={startRestore}>
                Restore
              </button>
              <button
                type="button"
                className="primary-button"
                title="Restore this backup to different locations (rename patterns)"
                onClick={openRestoreAs}
              >
                Restore As…
              </button>
            </div>
          </>
        )}
      </div>
    </BottomPanel>
  );
});
