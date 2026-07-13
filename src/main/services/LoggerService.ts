import fs from 'node:fs';
import path from 'node:path';
import { IpcChannels } from '../../shared/ipc-channels';
import { LOG_LEVELS } from '../../shared/types/app-settings';
import type { LogLevel } from '../../shared/types/app-settings';
import type { LogEntry } from '../../shared/types/log-entry';
import { broadcastToRenderers } from '../ipc/renderer-push';

/**
 * Central logging service (RULES.md §9). The single sink for all log output:
 *
 * - filters by a runtime-adjustable minimum level (from settings),
 * - appends to a log file in the userData folder,
 * - mirrors to the console (dev convenience),
 * - streams every written entry to the renderer for the live log panel.
 *
 * Instantiated once in the composition root (`app-context.ts`); services log
 * through the instance handed to them — no stray `console.log` in main code.
 */
/** Upper bound for one log-file read into the renderer log panel. */
const LOG_READ_MAX_BYTES = 256 * 1024;

export class LoggerService {
  private minLevel: LogLevel = 'info';
  private logFilePath: string | null = null;

  /**
   * Point the logger at its log file and make sure the folder exists.
   * Called once at startup after Electron paths are available.
   */
  initializeFileSink(logFilePath: string): void {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    this.logFilePath = logFilePath;
  }

  /**
   * Adjust the minimum written level at runtime. Called at startup and by the
   * settings-change reaction whenever the user changes `logLevel`.
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Truncate ALL `.log` files in the log folder (TODO11): the app log plus
   * the worker logs written by the elevated uninstall/restore/move workers.
   * Truncating (not deleting) keeps files owned by an elevated worker
   * writable. No-op until the sink is initialized. Writes a marker entry
   * afterwards so the file shows when it was cleared.
   */
  clearLogFiles(): void {
    if (!this.logFilePath) {
      return;
    }
    const logFolder = path.dirname(this.logFilePath);
    let names: string[];
    try {
      names = fs.readdirSync(logFolder);
    } catch {
      return; // folder missing — nothing to clear
    }
    let cleared = 0;
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.log')) {
        continue;
      }
      try {
        fs.writeFileSync(path.join(logFolder, name), '', 'utf8');
        cleared += 1;
      } catch (error) {
        this.warn(`Could not clear log file ${name}: ${String(error)}`, 'LoggerService');
      }
    }
    this.info(`Log files cleared (${cleared} file(s))`, 'LoggerService');
  }

  /**
   * All `.log` file names in the log folder, main app log first, rest
   * alphabetical — the tab list of the renderer log panel. Empty until the
   * sink is initialized or when the folder is missing.
   */
  listLogFiles(): string[] {
    if (!this.logFilePath) {
      return [];
    }
    const mainName = path.basename(this.logFilePath);
    let names: string[];
    try {
      names = fs.readdirSync(path.dirname(this.logFilePath));
    } catch {
      return [];
    }
    return names
      .filter((name) => name.toLowerCase().endsWith('.log'))
      .sort((a, b) => (a === mainName ? -1 : b === mainName ? 1 : a.localeCompare(b)));
  }

  /**
   * Read the tail of one log file for the log panel's file tabs. `fileName`
   * is validated against `listLogFiles()` (no paths from the renderer, only
   * known basenames). Returns at most the last `LOG_READ_MAX_BYTES` and an
   * empty string for unknown/unreadable files.
   */
  readLogFile(fileName: string): string {
    if (!this.logFilePath || !this.listLogFiles().includes(fileName)) {
      return '';
    }
    try {
      const content = fs.readFileSync(path.join(path.dirname(this.logFilePath), fileName), 'utf8');
      return content.length > LOG_READ_MAX_BYTES ? content.slice(-LOG_READ_MAX_BYTES) : content;
    } catch {
      return '';
    }
  }

  debug(message: string, source: string): void {
    this.write('debug', message, source);
  }

  info(message: string, source: string): void {
    this.write('info', message, source);
  }

  warn(message: string, source: string): void {
    this.write('warn', message, source);
  }

  error(message: string, source: string): void {
    this.write('error', message, source);
  }

  /**
   * Core sink: filter by level, then fan out to file, console and renderer.
   * Also the entry point for renderer-originated messages (via the
   * `log:from-renderer` IPC handler).
   */
  write(level: LogLevel, message: string, source: string): void {
    if (LOG_LEVELS.indexOf(level) < LOG_LEVELS.indexOf(this.minLevel)) {
      return;
    }
    const entry: LogEntry = { timestamp: Date.now(), level, message, source };
    this.appendToFile(entry);
    this.mirrorToConsole(entry);
    broadcastToRenderers(IpcChannels.log.entry, entry);
  }

  /** Append one formatted line to the log file (no-op until the sink is initialized). */
  private appendToFile(entry: LogEntry): void {
    if (!this.logFilePath) {
      return;
    }
    const line = `${new Date(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}\n`;
    // Sync append keeps ordering deterministic; log volume here is low.
    fs.appendFileSync(this.logFilePath, line, 'utf8');
  }

  /** Mirror to the terminal so `npm start` shows the log live. */
  private mirrorToConsole(entry: LogEntry): void {
    const prefix = `[${entry.level.toUpperCase()}] [${entry.source}]`;
    if (entry.level === 'error') {
      console.error(prefix, entry.message);
    } else if (entry.level === 'warn') {
      console.warn(prefix, entry.message);
    } else {
      console.log(prefix, entry.message);
    }
  }
}
