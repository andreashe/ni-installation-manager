import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerService } from '../../../src/main/services/LoggerService';
import { broadcastToRenderers } from '../../../src/main/ipc/renderer-push';
import { IpcChannels } from '../../../src/shared/ipc-channels';

// renderer-push imports `electron` — replace it entirely for unit tests.
vi.mock('../../../src/main/ipc/renderer-push', () => ({ broadcastToRenderers: vi.fn() }));

const broadcastMock = vi.mocked(broadcastToRenderers);

beforeEach(() => {
  broadcastMock.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('LoggerService level filtering', () => {
  it('drops entries below the configured minimum level', () => {
    const logger = new LoggerService(); // default level: info
    logger.debug('hidden', 'Test');
    expect(broadcastMock).not.toHaveBeenCalled();

    logger.info('visible', 'Test');
    expect(broadcastMock).toHaveBeenCalledTimes(1);
  });

  it('level is adjustable at runtime', () => {
    const logger = new LoggerService();
    logger.setLevel('error');
    logger.warn('hidden', 'Test');
    expect(broadcastMock).not.toHaveBeenCalled();

    logger.setLevel('debug');
    logger.debug('visible now', 'Test');
    expect(broadcastMock).toHaveBeenCalledTimes(1);
  });

  it('streams entries on the log:entry channel with the full LogEntry shape', () => {
    const logger = new LoggerService();
    logger.error('boom', 'UnitTest');

    expect(broadcastMock).toHaveBeenCalledWith(
      IpcChannels.log.entry,
      expect.objectContaining({ level: 'error', message: 'boom', source: 'UnitTest', timestamp: expect.any(Number) }),
    );
  });

  it('does not write to a file until the sink is initialized', () => {
    // No initializeFileSink call: must not throw despite missing file path.
    const logger = new LoggerService();
    expect(() => logger.info('no sink yet', 'Test')).not.toThrow();
  });
});

describe('LoggerService.clearLogFiles (TODO11)', () => {
  const LOG_FOLDER = 'C:\\userData\\logs';
  const LOG_FILE = path.join(LOG_FOLDER, 'ni-installation-manager.log');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeInitializedLogger() {
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'appendFileSync').mockReturnValue(undefined);
    const logger = new LoggerService();
    logger.initializeFileSink(LOG_FILE);
    return { logger, writeSpy };
  }

  it('truncates every .log file in the log folder and skips other files', () => {
    vi.spyOn(fs, 'readdirSync').mockReturnValue([
      'ni-installation-manager.log',
      'restore-worker.log',
      'notes.txt',
    ] as unknown as ReturnType<typeof fs.readdirSync>);
    const { logger, writeSpy } = makeInitializedLogger();

    logger.clearLogFiles();

    expect(writeSpy).toHaveBeenCalledWith(LOG_FILE, '', 'utf8');
    expect(writeSpy).toHaveBeenCalledWith(path.join(LOG_FOLDER, 'restore-worker.log'), '', 'utf8');
    expect(writeSpy).not.toHaveBeenCalledWith(path.join(LOG_FOLDER, 'notes.txt'), '', 'utf8');
    // Marker entry written afterwards.
    expect(broadcastMock).toHaveBeenCalledWith(
      IpcChannels.log.entry,
      expect.objectContaining({ message: expect.stringContaining('Log files cleared (2 file(s))') }),
    );
  });

  it('is a no-op before the sink is initialized', () => {
    const readdirSpy = vi.spyOn(fs, 'readdirSync');
    const logger = new LoggerService();
    expect(() => logger.clearLogFiles()).not.toThrow();
    expect(readdirSpy).not.toHaveBeenCalled();
  });
});
