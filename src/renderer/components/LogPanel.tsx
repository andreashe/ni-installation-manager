import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef } from 'react';
import { useStores } from '../hooks/useStores';
import { LIVE_TAB } from '../stores/LogStore';
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
 *
 * A tab row switches between the live stream and the on-disk log files
 * (main app log + the elevated workers' logs, which cannot stream live —
 * they are written by a separate elevated process). File tabs show a
 * snapshot with a Reload button.
 */
export const LogPanel = observer(function LogPanel() {
  const { log, ui } = useStores();
  const bodyRef = useRef<HTMLDivElement>(null);
  const isLive = log.activeTab === LIVE_TAB;

  // Tab list can change while the app runs (worker logs appear with the
  // first elevated job) — refresh it whenever the panel opens.
  useEffect(() => {
    void log.refreshFiles();
  }, [log]);

  // Autoscroll: follow new entries only while the view is near the bottom,
  // so manual scrolling back through history is not disturbed.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !isLive) {
      return;
    }
    const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 60;
    if (nearBottom) {
      body.scrollTop = body.scrollHeight;
    }
  }, [log.entries.length, isLive]);

  return (
    <BottomPanel
      title="Log"
      height={ui.logPanelHeight}
      onResize={(height, viewport) => ui.setLogPanelHeight(height, viewport)}
      onClose={() => ui.toggleLogPanel(false)}
    >
      <div className="log-tabs">
        <button
          className={`log-tab${isLive ? ' active' : ''}`}
          onClick={() => void log.selectTab(LIVE_TAB)}
        >
          Live
        </button>
        {log.files.map((file) => (
          <button
            key={file}
            className={`log-tab${log.activeTab === file ? ' active' : ''}`}
            onClick={() => void log.selectTab(file)}
          >
            {file}
          </button>
        ))}
        {!isLive && (
          <button className="log-tab-reload" onClick={() => void log.loadFileContent()}>
            Reload
          </button>
        )}
      </div>
      <div className="log-panel-body" ref={bodyRef}>
        {isLive ? (
          <>
            {log.entries.map((entry, index) => (
              <div key={index} className={`log-line ${entry.level}`}>
                {formatTime(entry.timestamp)} [{entry.level.toUpperCase()}] [{entry.source}]{' '}
                {entry.message}
              </div>
            ))}
            {log.entries.length === 0 && <div className="log-line">No log entries yet.</div>}
          </>
        ) : (
          <pre className="log-file-content">{log.fileContent || 'Log file is empty.'}</pre>
        )}
      </div>
    </BottomPanel>
  );
});
