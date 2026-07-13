import React from 'react';
import { Icon } from './Icon';

/**
 * Shared slide-up panel pinned above the status bar (log panel, product
 * details panel): title bar with close button and a draggable top edge for
 * vertical resizing. Height state lives with the caller (UiStore).
 */
export function BottomPanel({
  title,
  height,
  onResize,
  onClose,
  headerActions,
  children,
}: {
  title: React.ReactNode;
  height: number;
  /** Receives the desired height and the viewport height (for clamping). */
  onResize: (height: number, viewportHeight: number) => void;
  onClose: () => void;
  /** Extra controls rendered top right, left of the close button. */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  /**
   * Drag-to-resize: while the pointer is down on the top handle, the panel
   * height follows the cursor. The panel is pinned 30 px (status bar) above
   * the viewport bottom, so height = panel bottom edge − cursor Y.
   */
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const panelBottom = window.innerHeight - 30;
    const onMove = (move: PointerEvent) => {
      onResize(panelBottom - move.clientY, window.innerHeight);
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
  };

  return (
    <div className="log-panel" style={{ height }}>
      <div className="log-panel-resizer" title="Drag to resize" onPointerDown={startResize} />
      <div className="log-panel-header">
        <span>{title}</span>
        <span className="log-panel-header-actions">
          {headerActions}
          <button type="button" className="icon-button" title="Close panel" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </span>
      </div>
      {children}
    </div>
  );
}
