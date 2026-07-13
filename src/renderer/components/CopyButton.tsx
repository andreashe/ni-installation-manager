import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

/**
 * Small copy-to-clipboard button (details panel, TODO6): copies the given
 * value and briefly shows a check mark as feedback.
 */
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      className={`copy-button${copied ? ' copied' : ''}`}
      title={copied ? 'Copied!' : `Copy: ${value}`}
      onClick={() => void copy()}
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  );
}
