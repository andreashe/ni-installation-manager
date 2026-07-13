import { observer } from 'mobx-react-lite';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { applyRenamePatterns, isValidWindowsPath } from '../../shared/restore-as';
import type { RenamePattern, RestoreAsProductDto } from '../../shared/types/restore';
import { Icon } from './Icon';
import { formatBytes } from '../utils/format';

/** Debounce for the new-target existence checks while the user types. */
const EXISTS_CHECK_DEBOUNCE_MS = 300;

/**
 * Shared body of the "Restore As…" (TODO9) and "Move…" (TODO10) pages:
 * rename patterns (from → to path prefixes, persisted as ONE shared file
 * next to the settings) plus one section per product listing its target
 * locations. Every pattern change live-recomputes the new path of every
 * target via the shared `applyRenamePatterns`. New paths are colored orange
 * when they already exist on disk (would be overwritten/merged) and red when
 * they are no valid Windows path.
 *
 * The pages differ only in where the targets come from (backup descriptor
 * vs. registry scan) and what the start button does — both injected via
 * props; this component owns everything else.
 */
export const RenameTargetsPage = observer(function RenameTargetsPage({
  title,
  loadTargets,
  loadingText,
  startLabel,
  onStart,
  onCancel,
}: {
  /** Page heading ("Restore As…" / "Move…"). */
  title: string;
  /** Fetch the product target sections; recreated (new identity) when the selection changes. */
  loadTargets: () => Promise<RestoreAsProductDto[]>;
  /** Shown while `loadTargets` runs. */
  loadingText: string;
  /** Label of the primary start button. */
  startLabel: string;
  /** Start the job with the current patterns (also navigates away). */
  onStart: (patterns: RenamePattern[]) => void;
  /** Leave the page without starting. */
  onCancel: () => void;
}) {
  const [patterns, setPatterns] = useState<RenamePattern[]>([]);
  const [products, setProducts] = useState<RestoreAsProductDto[]>([]);
  const [existsByPath, setExistsByPath] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load persisted patterns + the targets of the selected products.
  // Errors land in the page (loadError) — a throw here would unmount the
  // whole React tree (black window).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void Promise.all([window.api.restore.getPatterns(), loadTargets()])
      .then(([loadedPatterns, targets]) => {
        if (!cancelled) {
          setPatterns(loadedPatterns);
          setProducts(targets);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(String(error));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadTargets]);

  /** New target path per old target path, recomputed on every pattern change. */
  const newPathByOldPath = useMemo(() => {
    const result = new Map<string, string>();
    for (const product of products) {
      for (const target of product.targets) {
        result.set(target.oldTargetPath, applyRenamePatterns(target.oldTargetPath, patterns));
      }
    }
    return result;
  }, [products, patterns]);

  // Debounced existence check for all (valid) new target paths.
  const checkCounter = useRef(0);
  useEffect(() => {
    const requestId = ++checkCounter.current;
    const paths = [...new Set([...newPathByOldPath.values()])].filter(isValidWindowsPath);
    if (paths.length === 0) {
      setExistsByPath(new Map());
      return;
    }
    const timer = setTimeout(() => {
      void window.api.restore.pathsExist(paths).then((flags) => {
        if (requestId === checkCounter.current) {
          setExistsByPath(new Map(paths.map((candidate, index) => [candidate, flags[index]])));
        }
      });
    }, EXISTS_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [newPathByOldPath]);

  /** Every pattern change goes through here: update state + persist (TODO9). */
  const changePatterns = (next: RenamePattern[]) => {
    setPatterns(next);
    void window.api.restore.savePatterns(next);
  };

  const addPattern = (from = '', to = '') => changePatterns([...patterns, { from, to }]);
  const removePattern = (index: number) => changePatterns(patterns.filter((_, i) => i !== index));
  const editPattern = (index: number, field: keyof RenamePattern, value: string) =>
    changePatterns(patterns.map((p, i) => (i === index ? { ...p, [field]: value } : p)));

  const anyInvalidNewPath = [...newPathByOldPath.values()].some(
    (candidate) => !isValidWindowsPath(candidate),
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{title}</h1>
      </div>

      <div className="restore-as-body">
        <h3 className="details-heading">Rename patterns</h3>
        <div className="pattern-list">
          {patterns.map((pattern, index) => (
            <div className="pattern-row" key={index}>
              <input
                className="pattern-input"
                value={pattern.from}
                placeholder="From (old path prefix)"
                onChange={(event) => editPattern(index, 'from', event.target.value)}
              />
              <span className="pattern-arrow">→</span>
              <input
                className="pattern-input"
                value={pattern.to}
                placeholder="To (new path prefix)"
                onChange={(event) => editPattern(index, 'to', event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                title="Remove pattern"
                onClick={() => removePattern(index)}
              >
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
          {patterns.length === 0 && <div className="pattern-empty-hint">Add a pattern first</div>}
          <div>
            <button type="button" className="row-button" onClick={() => addPattern()}>
              Add pattern
            </button>
          </div>
        </div>

        {loading && <div className="log-line">{loadingText}</div>}
        {loadError && (
          <div className="log-line details-missing">Could not load targets: {loadError}</div>
        )}
        {!loading &&
          products.map((product) => (
            <section key={product.name}>
              <h3 className="details-heading">
                {product.name}
                {product.version ? ` — ${product.version}` : ''}
              </h3>
              <table className="details-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Old target</th>
                    <th>Old target path</th>
                    <th>New target</th>
                    <th>New target path</th>
                    <th className="details-size">Size</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {product.targets.map((target, index) => {
                    const newPath = newPathByOldPath.get(target.oldTargetPath) ?? target.oldTargetPath;
                    const valid = isValidWindowsPath(newPath);
                    const exists = existsByPath.get(newPath) ?? false;
                    // Red beats orange: an invalid path cannot be used at all.
                    const newClass = !valid ? ' details-missing' : exists ? ' details-warning' : '';
                    return (
                      <tr key={index}>
                        <td>{target.kind}</td>
                        <td>{target.oldTargetExists ? 'exists' : 'not found'}</td>
                        <td className="details-path" title={target.oldTargetPath}>
                          {target.oldTargetPath}
                        </td>
                        <td className={newClass.trim()}>
                          {!valid ? 'invalid' : exists ? 'exists' : 'new'}
                        </td>
                        <td className={`details-path${newClass}`} title={newPath}>
                          {newPath}
                        </td>
                        <td className="details-size">{formatBytes(target.sizeBytes)}</td>
                        <td>
                          <button
                            type="button"
                            className="row-button"
                            title="Add a pattern pre-filled with this old target path"
                            onClick={() => addPattern(target.oldTargetPath, target.oldTargetPath)}
                          >
                            As pattern
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {product.targets.length === 0 && (
                    <tr>
                      <td colSpan={7}>No movable/restorable locations for this product.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          ))}

        <div className="details-actions">
          <button type="button" className="row-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={loading || anyInvalidNewPath}
            title={anyInvalidNewPath ? 'Fix the invalid (red) target paths first' : undefined}
            onClick={() => onStart(patterns)}
          >
            {startLabel}
          </button>
        </div>
      </div>
    </>
  );
});
