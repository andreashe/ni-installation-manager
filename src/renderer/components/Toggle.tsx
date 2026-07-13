import React from 'react';

/** Boolean preference switch (Preferences page). Controlled component. */
export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`toggle${on ? ' on' : ''}`}
      onClick={onToggle}
    />
  );
}
