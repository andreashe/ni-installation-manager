import type { LogLevel } from './app-settings';

/**
 * A single entry produced by the central logger.
 *
 * Created only by the main-process `LoggerService` (renderer messages are
 * forwarded over IPC first) and streamed back to the renderer for the
 * live log panel.
 */
export interface LogEntry {
  /** Unix epoch milliseconds when the entry was written. */
  timestamp: number;
  level: LogLevel;
  message: string;
  /** Origin of the entry, e.g. a service name or 'renderer'. */
  source: string;
}
