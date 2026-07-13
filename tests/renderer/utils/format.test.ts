import { describe, expect, it } from 'vitest';
import { formatBackupDate, formatBytes } from '../../../src/renderer/utils/format';

describe('formatBytes', () => {
  it('shows plain bytes below 1024', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('converts to KB/MB/GB with 1024 base', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('keeps up to two decimals and trims trailing zeros', () => {
    expect(formatBytes(1536)).toBe('1.5 KB'); // 1.50 → 1.5
    expect(formatBytes(4.29 * 1024 * 1024 * 1024)).toBe('4.29 GB');
  });

  it('rounds to whole numbers from 100 upwards', () => {
    expect(formatBytes(100.4 * 1024)).toBe('100 KB');
    expect(formatBytes(890 * 1024 * 1024)).toBe('890 MB');
  });
});

describe('formatBackupDate (TODO8)', () => {
  it('formats an ISO timestamp as DD.MM.YYYY HH:MM in local time', () => {
    // Fixed local time (no timezone suffix → interpreted as local).
    expect(formatBackupDate('2026-07-05T19:04:51.334')).toBe('05.07.2026 19:04');
  });

  it('pads day, month, hour and minute to two digits', () => {
    expect(formatBackupDate('2026-01-02T03:04:00')).toBe('02.01.2026 03:04');
  });

  it("returns '—' for empty or unparseable values", () => {
    expect(formatBackupDate('')).toBe('—');
    expect(formatBackupDate('not a date')).toBe('—');
  });
});
