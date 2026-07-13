import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef } from 'react';
import { useStores } from '../hooks/useStores';
import { BottomPanel } from './BottomPanel';

/** Render timestamp as local HH:MM:SS for compact log lines. */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
}

/**
 * Slide-up live log view (PLAN.md §4.4): streams the central log with
 * autoscroll (sticks to the bottom unless the user scrolled up) and a close
 * button. Toggled from the sidebar; vertically resizable by dragging its
 * top edge (height kept in `UiStore`, clamped there).
 */
export const LogPanel = observer(function LogPanel() {
  const { log, ui } = useStores();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Autoscroll: follow new entries only while the view is near the bottom,
  // so manual scrolling back through history is not disturbed.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    if (nearBottom) {
      body.scrollTop = body.scrollHeight;
    }
  }, [log.entries.length]);

  return (
    <BottomPanel
      title="Log"
      height={ui.logPanelHeight}
      onResize={(height, viewport) => ui.setLogPanelHeight(height, viewport)}
      onClose={() => ui.toggleLogPanel(false)}
    >
      <div className="log-panel-body" ref={bodyRef}>
        {log.entries.map((entry, index) => (
          <div key={index} className={`log-line ${entry.level}`}>
            {formatTime(entry.timestamp)} [{entry.level.toUpperCase()}] [{entry.source}]{' '}
            {entry.message}
          </div>
        ))}
        {log.entries.length === 0 && <div className="log-line">No log entries yet.</div>}
      </div>
    </BottomPanel>
  );
});
