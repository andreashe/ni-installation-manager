import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_TAB, LogStore } from '../../../src/renderer/stores/LogStore';

const getFiles = vi.fn();
const readFile = vi.fn();

beforeEach(() => {
  getFiles.mockReset().mockResolvedValue(['ni-installation-manager.log', 'uninstall-worker.log']);
  readFile.mockReset().mockResolvedValue('file content');
  vi.stubGlobal('window', { api: { log: { getFiles, readFile, onEntry: vi.fn() } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LogStore file tabs', () => {
  it('starts on the live tab', () => {
    const store = new LogStore();
    expect(store.activeTab).toBe(LIVE_TAB);
    expect(store.files).toEqual([]);
  });

  it('refreshFiles fills the tab list', async () => {
    const store = new LogStore();
    await store.refreshFiles();
    expect(store.files).toEqual(['ni-installation-manager.log', 'uninstall-worker.log']);
  });

  it('refreshFiles falls back to the live tab when the selected file disappeared', async () => {
    const store = new LogStore();
    await store.refreshFiles();
    await store.selectTab('uninstall-worker.log');
    getFiles.mockResolvedValue(['ni-installation-manager.log']);
    await store.refreshFiles();
    expect(store.activeTab).toBe(LIVE_TAB);
  });

  it('selecting a file tab loads its content', async () => {
    const store = new LogStore();
    await store.selectTab('uninstall-worker.log');
    expect(readFile).toHaveBeenCalledWith('uninstall-worker.log');
    expect(store.fileContent).toBe('file content');
  });

  it('switching back to live clears the file content and loads nothing', async () => {
    const store = new LogStore();
    await store.selectTab('uninstall-worker.log');
    readFile.mockClear();
    await store.selectTab(LIVE_TAB);
    expect(store.fileContent).toBe('');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('ignores a stale load finishing after another tab switch', async () => {
    const store = new LogStore();
    let resolveSlow: (value: string) => void = () => undefined;
    readFile.mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveSlow = resolve)),
    );
    const slowLoad = store.selectTab('uninstall-worker.log');
    await store.selectTab(LIVE_TAB);
    resolveSlow('late content');
    await slowLoad;
    expect(store.fileContent).toBe('');
  });
});
