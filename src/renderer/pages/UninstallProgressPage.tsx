import { observer } from 'mobx-react-lite';
import React, { useEffect, useRef } from 'react';
import { useStores } from '../hooks/useStores';

/**
 * Uninstall progress page (PLAN.md §4.2): total progress bar advancing per
 * partial step, console-style live output, CLOSE button only once the job
 * finished or failed. Shown by `App` whenever a job is active.
 */
export const UninstallProgressPage = observer(function UninstallProgressPage() {
  const { uninstall } = useStores();
  const consoleRef = useRef<HTMLDivElement>(null);
  const { state } = uninstall;

  // Console autoscroll (same near-bottom rule as the log panel).
  useEffect(() => {
    const el = consoleRef.current;
    if (!el) {
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [state.consoleLines.length]);

  const percent = Math.round(uninstall.progress * 100);
  const finished = state.status === 'succeeded' || state.status === 'failed';

  const action =
    state.mode === 'backup'
      ? 'Backup'
      : state.mode === 'restore'
        ? 'Restore'
        : state.mode === 'move'
          ? 'Move'
          : 'Uninstall';
  const runningHeadline =
    state.mode === 'backup'
      ? `Backing up ${state.productNames.length} product(s)…`
      : state.mode === 'restore'
        ? `Restoring ${state.productNames.length} product(s)…`
        : state.mode === 'move'
          ? `Moving ${state.productNames.length} product(s)…`
          : `Uninstalling ${state.productNames.length} product(s)…`;
  const headline =
    state.status === 'running'
      ? runningHeadline
      : state.status === 'succeeded'
        ? `${action} finished`
        : `${action} failed`;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">
          {headline}
          {state.dryRun ? ' (dry-run)' : ''}
        </h1>
      </div>

      <div className="progress-page">
        <div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="progress-label" style={{ marginTop: 6 }}>
            {state.completedSteps} / {state.totalSteps} steps — {percent}%
            {state.error ? ` — ${state.error}` : ''}
          </div>
        </div>

        <div className="progress-console" ref={consoleRef}>
          {state.consoleLines.map((line, index) => (
            <div key={index} className="log-line">
              {line}
            </div>
          ))}
        </div>

        <div className="progress-actions">
          {finished && (
            <button type="button" className="primary-button" onClick={() => uninstall.dismiss()}>
              CLOSE
            </button>
          )}
        </div>
      </div>
    </>
  );
});
