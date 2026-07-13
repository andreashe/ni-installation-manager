import React from 'react';

/** Small rotating activity indicator (status bar, reload button, list loading). */
export function Spinner({ size = 14 }: { size?: number }) {
  return <div className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}
