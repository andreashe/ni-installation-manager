import { observer } from 'mobx-react-lite';
import React, { useCallback } from 'react';
import { RenameTargetsPage } from '../components/RenameTargetsPage';
import { useStores } from '../hooks/useStores';

/**
 * "Restore As…" page (TODO9): restore the selected backups to DIFFERENT
 * locations. Thin wrapper around the shared `RenameTargetsPage` (patterns +
 * live target preview): targets come from the backup descriptors; "Start
 * Restore As" hands the patterns to the restore job, which rewrites the
 * cloned specs (files, folders AND path-carrying registry values).
 */
export const RestoreAsPage = observer(function RestoreAsPage() {
  const { restore, ui } = useStores();
  const backupNames = ui.restoreAsNames;

  const loadTargets = useCallback(
    () => window.api.restore.getAsTargets(backupNames),
    [backupNames],
  );

  return (
    <RenameTargetsPage
      title="Restore As…"
      loadTargets={loadTargets}
      loadingText="Collecting restore targets…"
      startLabel="Start Restore As"
      onStart={(patterns) => {
        ui.navigate('restore'); // land back on Restore once the job is dismissed
        restore.startAs(backupNames, patterns);
      }}
      onCancel={() => ui.navigate('restore')}
    />
  );
});
