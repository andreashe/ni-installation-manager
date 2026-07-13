import { observer } from 'mobx-react-lite';
import React, { useEffect, useState } from 'react';
import { isSharedContainerKind, PLUGIN_FILE_KINDS } from '../../shared/types/product';
import type { ProductDetailsDto, ProductLocationDetails } from '../../shared/types/product-details';
import { useStores } from '../hooks/useStores';
import { formatBytes } from '../utils/format';
import { BottomPanel } from './BottomPanel';
import { CopyButton } from './CopyButton';

/** Epoch ms → local date+time; '—' when unknown. */
function formatDate(timestamp: number | null): string {
  return timestamp === null ? '—' : new Date(timestamp).toLocaleString('en-GB', { hour12: false });
}

/** Human label distinguishing containers, exclusive folders and plugin files. */
function locationTypeLabel(location: ProductLocationDetails): string {
  if (!location.exists) {
    return 'missing';
  }
  if (isSharedContainerKind(location.kind)) {
    return 'container';
  }
  return location.isFile ? 'file' : 'folder';
}

/**
 * Text color per row (TODO6): resolved plugin files green, anything missing
 * red, shared containers and normal locations default.
 */
function locationClass(location: ProductLocationDetails): string {
  if (!location.exists) {
    return ' details-missing';
  }
  if (PLUGIN_FILE_KINDS.includes(location.kind)) {
    return ' details-found';
  }
  return '';
}

/**
 * Slide-up details view for one product (TODO6): version, disk locations
 * with type/size/dates and a total-usage summation row, registry paths —
 * every value with an inline copy-to-clipboard button — plus an uninstall
 * shortcut top right. Opened via the "Details" button of a product row;
 * data is fetched on demand because per-location sizes need filesystem
 * walks. Starts at half the viewport height, resizable like the log panel.
 */
export const ProductDetailsPanel = observer(function ProductDetailsPanel() {
  const { ui, uninstall, settings } = useStores();
  const productName = ui.detailsProductName;
  const [details, setDetails] = useState<ProductDetailsDto | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productName) {
      return;
    }
    setDetails(null);
    setLoading(true);
    let cancelled = false;
    void window.api.products.getDetails(productName).then((result) => {
      if (!cancelled) {
        setDetails(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productName]);

  if (!productName) {
    return null;
  }

  const startUninstall = () => {
    ui.closeDetails();
    uninstall.start([productName]);
  };

  const startBackup = () => {
    ui.closeDetails();
    uninstall.backup([productName]);
  };

  const backupPossible = settings.settings.backupFolder !== '';
  const uninstallAlsoBackups = settings.settings.backupEnabled && backupPossible;

  return (
    <BottomPanel
      title={`Details — ${productName}`}
      height={ui.detailsPanelHeight ?? Math.round(window.innerHeight * 0.75)}
      onResize={(height, viewport) => ui.setDetailsPanelHeight(height, viewport)}
      onClose={() => ui.closeDetails()}
    >
      <div className="details-body">
        {loading && <div className="log-line">Collecting details (sizes may take a moment)…</div>}
        {!loading && !details && <div className="log-line">Product not found.</div>}
        {details && (
          <>
            <div className="details-facts">
              <span className="details-label">Version</span>
              <span className="details-value">
                {details.version ?? '—'}
                {details.version && <CopyButton value={details.version} />}
              </span>
            </div>

            <h3 className="details-heading">Disk locations</h3>
            <table className="details-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Type</th>
                  <th>Path</th>
                  <th className="details-size">Size</th>
                  <th>Created</th>
                  <th>Modified</th>
                </tr>
              </thead>
              <tbody>
                {details.locations.map((location, index) => (
                  <tr key={index}>
                    <td className={locationClass(location).trim()}>{location.kind}</td>
                    <td className={locationClass(location).trim()}>{locationTypeLabel(location)}</td>
                    <td className={`details-path${locationClass(location)}`} title={location.path}>
                      {location.path}
                      <CopyButton value={location.path} />
                    </td>
                    <td className="details-size">
                      {location.exists && !isSharedContainerKind(location.kind)
                        ? formatBytes(location.sizeBytes)
                        : '—'}
                    </td>
                    <td>{formatDate(location.createdAt)}</td>
                    <td>{formatDate(location.modifiedAt)}</td>
                  </tr>
                ))}
                {details.locations.length === 0 && (
                  <tr>
                    <td colSpan={6}>No disk locations found.</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="details-total-row">
                  <td colSpan={3}>Total disk usage</td>
                  <td className="details-size">{formatBytes(details.totalDiskUsageBytes)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>

            <h3 className="details-heading">Registry paths</h3>
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
              <button
                type="button"
                className="primary-button"
                disabled={!details.removable || !backupPossible}
                title={backupPossible ? 'Back up this product' : 'Define backup folder in settings'}
                onClick={startBackup}
              >
                Backup
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!details.removable}
                title={uninstallAlsoBackups ? 'Will also backup' : undefined}
                onClick={startUninstall}
              >
                Uninstall
              </button>
            </div>
          </>
        )}
      </div>
    </BottomPanel>
  );
});
