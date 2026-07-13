/**
 * Human-readable byte size ("798 KB", "4.29 GB") for the product list and
 * backup messages. Uses 1024-based units, up to two decimals, trimmed.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(2).replace(/\.?0+$/, '');
  return `${rounded} ${units[unitIndex]}`;
}

/**
 * Backup timestamp for the Restore page (TODO8): `DD.MM.YYYY HH:MM` in
 * local time; '—' when the value is missing or not a parseable date.
 */
export function formatBackupDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (isoTimestamp === '' || Number.isNaN(date.getTime())) {
    return '—';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
