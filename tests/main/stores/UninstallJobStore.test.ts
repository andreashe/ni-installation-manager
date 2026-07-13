import { describe, expect, it } from 'vitest';
import { UninstallJobStore } from '../../../src/main/stores/UninstallJobStore';

describe('UninstallJobStore', () => {
  it('runs through the job lifecycle idle → running → succeeded → idle', () => {
    const store = new UninstallJobStore();
    expect(store.status).toBe('idle');

    store.startJob(['A'], 3, false, 'uninstall');
    expect(store.status).toBe('running');
    expect(store.running).toBe(true);
    expect(store.totalSteps).toBe(3);

    store.stepDone();
    store.finish(true);
    expect(store.status).toBe('succeeded');
    expect(store.running).toBe(false);

    store.reset();
    expect(store.status).toBe('idle');
    expect(store.consoleLines).toEqual([]);
  });

  it('records the error on failure', () => {
    const store = new UninstallJobStore();
    store.startJob(['A'], 1, false, 'uninstall');
    store.finish(false, 'boom');
    expect(store.status).toBe('failed');
    expect(store.error).toBe('boom');
  });

  it('clamps completed steps at the total', () => {
    const store = new UninstallJobStore();
    store.startJob(['A'], 2, true, 'uninstall');
    store.stepDone();
    store.stepDone();
    store.stepDone(); // one too many
    expect(store.completedSteps).toBe(2);
  });

  it('caps console lines at 2000, dropping the oldest', () => {
    const store = new UninstallJobStore();
    store.startJob(['A'], 1, false, 'uninstall');
    for (let i = 0; i < 2050; i++) {
      store.addLine(`line ${i}`);
    }
    expect(store.consoleLines.length).toBe(2000);
    expect(store.consoleLines[0]).toBe('line 50');
  });

  it('starting a new job clears previous console output and error', () => {
    const store = new UninstallJobStore();
    store.startJob(['A'], 1, false, 'uninstall');
    store.addLine('old');
    store.finish(false, 'old error');

    store.startJob(['B'], 5, true, 'backup');
    expect(store.consoleLines).toEqual([]);
    expect(store.error).toBeNull();
    expect(store.dryRun).toBe(true);
    expect(store.mode).toBe('backup');
    expect(store.productNames).toEqual(['B']);
    expect(store.toState().mode).toBe('backup');
  });
});
