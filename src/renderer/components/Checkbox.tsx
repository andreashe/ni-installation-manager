import React from 'react';

/**
 * Custom checkbox matching the design (blue square with ✓ / – for partial
 * selection). Controlled component; used per product row and for select-all.
 */
export function Checkbox({
  checked,
  partial = false,
  disabled = false,
  onToggle,
}: {
  checked: boolean;
  /** Renders a dash instead of a check (select-all with partial selection). */
  partial?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`checkbox${checked || partial ? ' on' : ''}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {partial && !checked ? '–' : checked ? '✓' : ''}
    </button>
  );
}
