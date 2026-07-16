import { observer } from 'mobx-react-lite';
import React from 'react';
import type { ProductDto } from '../../shared/types/product';
import { formatBytes } from '../utils/format';
import { Checkbox } from './Checkbox';
import { Icon } from './Icon';
import altArtworkUrl from '../assets/MST_artwork_alt.png';

/**
 * One row of the product list: checkbox, artwork, name, bookmark toggle,
 * version, disk usage, per-product uninstall button. Row click toggles
 * selection. Non-removable products (no removal-relevant registry values)
 * cannot be selected or uninstalled.
 */
export const ProductRow = observer(function ProductRow({
  product,
  selected,
  bookmarked,
  onToggle,
  onToggleBookmark,
  onUninstall,
  onBackup,
  onMove,
  onDetails,
  backupPossible,
  uninstallAlsoBackups,
}: {
  product: ProductDto;
  selected: boolean;
  /** True when the product is bookmarked (filled yellow icon). */
  bookmarked: boolean;
  onToggle: () => void;
  onToggleBookmark: () => void;
  onUninstall: () => void;
  onBackup: () => void;
  onMove: () => void;
  onDetails: () => void;
  /** False while no backup folder is configured — backup buttons disabled (TODO7). */
  backupPossible: boolean;
  /** True when uninstall will implicitly back up first (setting + folder). */
  uninstallAlsoBackups: boolean;
}) {
  return (
    <div className="product-row" onClick={product.removable ? onToggle : undefined}>
      <Checkbox checked={selected} disabled={!product.removable} onToggle={onToggle} />
      <div className="product-artwork">
        {/* Bundled alternative image for products without own artwork (TODO2). */}
        <img src={product.artworkUrl ?? altArtworkUrl} alt="" loading="lazy" />
      </div>
      <div className="product-name" title={product.name}>
        {product.name}
      </div>
      <button
        type="button"
        className={`bookmark-button${bookmarked ? ' bookmarked' : ''}`}
        title={bookmarked ? 'Remove bookmark' : 'Bookmark this product'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleBookmark();
        }}
      >
        <Icon name="bookmark" size={17} />
      </button>
      <div className="product-meta">{product.version ?? '—'}</div>
      <div className="product-meta">
        {product.diskUsageBytes === null ? '…' : formatBytes(product.diskUsageBytes)}
      </div>
      <button
        type="button"
        className="row-button"
        title="Show disk locations, sizes and registry paths"
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
        disabled={!product.removable || !backupPossible}
        title={backupPossible ? 'Back up this product' : 'Define backup folder in settings'}
        onClick={(event) => {
          event.stopPropagation();
          onBackup();
        }}
      >
        Backup
      </button>
      <button
        type="button"
        className="row-button"
        disabled={!product.removable}
        title="Move this product to different locations (rename patterns)"
        onClick={(event) => {
          event.stopPropagation();
          onMove();
        }}
      >
        Move…
      </button>
      <button
        type="button"
        className="row-button"
        disabled={!product.removable}
        title={
          !product.removable
            ? 'No removable data found for this product'
            : uninstallAlsoBackups
              ? 'Will also backup'
              : undefined
        }
        onClick={(event) => {
          event.stopPropagation();
          onUninstall();
        }}
      >
        Uninstall
      </button>
    </div>
  );
});
