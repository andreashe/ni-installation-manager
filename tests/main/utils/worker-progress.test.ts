import { describe, expect, it, vi } from 'vitest';
import type { LoggerService } from '../../../src/main/services/LoggerService';
import {
  describeWorkerExit,
  WorkerProgressTracker,
} from '../../../src/main/utils/worker-progress';

function makeSink() {
  return { addLine: vi.fn(), stepDone: vi.fn() };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeTracker() {
  const sink = makeSink();
  const logger = makeLogger();
  const productDone = vi.fn();
  const tracker = new WorkerProgressTracker(
    sink,
    logger as unknown as LoggerService,
    'UninstallWorker',
    productDone,
  );
  return { tracker, sink, logger, productDone };
}

describe('WorkerProgressTracker', () => {
  it('mirrors line events into the job store AND the central log', () => {
    const { tracker, sink, logger } = makeTracker();
    tracker.apply(JSON.stringify({ type: 'line', text: 'Removing C:\\VST3\\Super 8.vst3' }));
    expect(sink.addLine).toHaveBeenCalledWith('Removing C:\\VST3\\Super 8.vst3');
    expect(logger.info).toHaveBeenCalledWith('Removing C:\\VST3\\Super 8.vst3', 'UninstallWorker');
  });

  it('forwards step and product-done events', () => {
    const { tracker, sink, productDone } = makeTracker();
    tracker.apply(JSON.stringify({ type: 'step' }));
    tracker.apply(JSON.stringify({ type: 'product-done', name: 'Super 8' }));
    expect(sink.stepDone).toHaveBeenCalledTimes(1);
    expect(productDone).toHaveBeenCalledWith('Super 8');
  });

  it('remembers a failed done event and logs it as error', () => {
    const { tracker, sink, logger } = makeTracker();
    tracker.apply(JSON.stringify({ type: 'done', success: false, error: 'EPERM: C:\\VST3' }));
    expect(tracker.lastError).toBe('EPERM: C:\\VST3');
    expect(sink.addLine).toHaveBeenCalledWith('ERROR: EPERM: C:\\VST3');
    expect(logger.error).toHaveBeenCalledWith('EPERM: C:\\VST3', 'UninstallWorker');
  });

  it('failed done event without message still yields a lastError', () => {
    const { tracker } = makeTracker();
    tracker.apply(JSON.stringify({ type: 'done', success: false }));
    expect(tracker.lastError).toMatch(/without an error message/);
  });

  it('successful done event leaves lastError null', () => {
    const { tracker, sink } = makeTracker();
    tracker.apply(JSON.stringify({ type: 'done', success: true }));
    expect(tracker.lastError).toBeNull();
    expect(sink.addLine).not.toHaveBeenCalled();
  });

  it('surfaces malformed lines verbatim and warns in the log', () => {
    const { tracker, sink, logger } = makeTracker();
    tracker.apply('not json at all');
    expect(sink.addLine).toHaveBeenCalledWith('not json at all');
    expect(logger.warn).toHaveBeenCalledWith(
      'Unparsable worker output: not json at all',
      'UninstallWorker',
    );
  });
});

describe('describeWorkerExit', () => {
  it('includes the worker-reported error when available', () => {
    expect(describeWorkerExit('Uninstall', 1, 'EPERM: C:\\VST3', 'C:\\logs\\w.log')).toBe(
      'Uninstall worker failed (exit code 1): EPERM: C:\\VST3',
    );
  });

  it('points at the worker log when no error was reported', () => {
    expect(describeWorkerExit('Move', 3, null, 'C:\\logs\\move-worker.log')).toBe(
      'Move worker exited with code 3 without reporting an error — see C:\\logs\\move-worker.log',
    );
  });
});
