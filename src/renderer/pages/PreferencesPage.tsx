import { observer } from 'mobx-react-lite';
import React from 'react';
import { LOG_LEVELS } from '../../shared/types/app-settings';
import type { LogLevel } from '../../shared/types/app-settings';
import { useStores } from '../hooks/useStores';
import { Toggle } from '../components/Toggle';

/**
 * Preferences page (PLAN.md §4.3): list of settings; booleans as toggles,
 * backup folder via native picker, log level as select. Every change is
 * persisted immediately through the settings IPC.
 */
export const PreferencesPage = observer(function PreferencesPage() {
  const { settings } = useStores();
  const current = settings.settings;

  const pickBackupFolder = async () => {
    const folder = await window.api.dialog.selectFolder();
    if (folder !== null) {
      await settings.update({ backupFolder: folder });
    }
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Preferences</h1>
      </div>

      <div className="prefs-list">
        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Dry-run mode</div>
            <div className="pref-desc">
              Uninstall only logs what it would delete — no files, folders or registry entries are
              touched.
              {settings.dryRunForcedByCli && ' (Currently forced ON by the --dry-run start flag.)'}
            </div>
          </div>
          <Toggle on={current.dryRun} onToggle={() => settings.update({ dryRun: !current.dryRun })} />
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Backup before uninstall</div>
            <div className="pref-desc">
              Copy product folders and registry entries to the backup folder before removal.
            </div>
          </div>
          <Toggle
            on={current.backupEnabled}
            onToggle={() => settings.update({ backupEnabled: !current.backupEnabled })}
          />
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Backup folder</div>
            <div className="pref-desc">Target for uninstall backups.</div>
          </div>
          <span className="pref-path" title={current.backupFolder}>
            {current.backupFolder || 'Not configured'}
          </span>
          <button type="button" className="row-button" onClick={() => void pickBackupFolder()}>
            Choose…
          </button>
          <button
            type="button"
            className="row-button"
            disabled={current.backupFolder === ''}
            title="Unset the backup folder (disables the Backup buttons)"
            onClick={() => void settings.update({ backupFolder: '' })}
          >
            Clear
          </button>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Ignore space check for backup</div>
            <div className="pref-desc">
              Skip the free-disk-space check on the backup target before backing up.
            </div>
          </div>
          <Toggle
            on={current.ignoreBackupSpaceCheck}
            onToggle={() =>
              settings.update({ ignoreBackupSpaceCheck: !current.ignoreBackupSpaceCheck })
            }
          />
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Ignore space check for restore</div>
            <div className="pref-desc">
              Skip the per-device free-disk-space check on the restore targets before restoring.
            </div>
          </div>
          <Toggle
            on={current.ignoreRestoreSpaceCheck}
            onToggle={() =>
              settings.update({ ignoreRestoreSpaceCheck: !current.ignoreRestoreSpaceCheck })
            }
          />
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Ignore space check for move</div>
            <div className="pref-desc">
              Skip the per-device free-disk-space check on the move targets before moving.
            </div>
          </div>
          <Toggle
            on={current.ignoreMoveSpaceCheck}
            onToggle={() => settings.update({ ignoreMoveSpaceCheck: !current.ignoreMoveSpaceCheck })}
          />
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Log level</div>
            <div className="pref-desc">Minimum severity written to the log file and log panel.</div>
          </div>
          <select
            className="select"
            value={current.logLevel}
            onChange={(event) => settings.update({ logLevel: event.target.value as LogLevel })}
          >
            {LOG_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Clear Log</div>
            <div className="pref-desc">
              Empties all log files (app log and elevated worker logs).
            </div>
          </div>
          <button type="button" className="row-button" onClick={() => void window.api.log.clear()}>
            Clear Log
          </button>
        </div>

        <div className="pref-row">
          <div className="pref-text">
            <div className="pref-title">Clear cache</div>
            <div className="pref-desc">
              Removes all cached product images and product disk usage cache files. They are rebuilt
              (disk scan / CDN download) on the next reload.
            </div>
          </div>
          <button type="button" className="row-button" onClick={() => void window.api.cache.clear()}>
            Clear cache
          </button>
        </div>
      </div>
    </>
  );
});
