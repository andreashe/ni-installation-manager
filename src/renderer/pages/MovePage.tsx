import { observer } from 'mobx-react-lite';
import React, { useCallback } from 'react';
import { RenameTargetsPage } from '../components/RenameTargetsPage';
import { useStores } from '../hooks/useStores';

/**
 * "Move…" page (TODO10): relocate the selected INSTALLED products to
 * different locations. Thin wrapper around the shared `RenameTargetsPage`
 * (same rename patterns as "Restore As…"): targets are the products'
 * CURRENT disk locations from the registry scan; "Start move" hands the
 * patterns to the move job, which moves the files (never when source =
 * target) and then updates the path-carrying registry values.
 */
export const MovePage = observer(function MovePage() {
  const { products, ui } = useStores();
  const productNames = ui.moveNames;

  const loadTargets = useCallback(
    () => window.api.move.getTargets(productNames),
    [productNames],
  );

  return (
    <RenameTargetsPage
      title="Move…"
      loadTargets={loadTargets}
      loadingText="Collecting current product locations…"
      startLabel="Start move"
      onStart={(patterns) => {
        ui.navigate('uninstall'); // land back on Installed once the job is dismissed
        products.startMove(productNames, patterns);
      }}
      onCancel={() => ui.navigate('uninstall')}
    />
  );
});
