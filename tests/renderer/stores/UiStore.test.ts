import { isObservable } from 'mobx';
import { describe, expect, it } from 'vitest';
import {
  LOG_PANEL_MIN_HEIGHT,
  UiStore,
} from '../../../src/renderer/stores/UiStore';

describe('UiStore log panel height', () => {
  it('applies a dragged height within the bounds', () => {
    const ui = new UiStore();
    ui.setLogPanelHeight(500, 1000);
    expect(ui.logPanelHeight).toBe(500);
  });

  it('clamps to the minimum height', () => {
    const ui = new UiStore();
    ui.setLogPanelHeight(10, 1000);
    expect(ui.logPanelHeight).toBe(LOG_PANEL_MIN_HEIGHT);
  });

  it('clamps to 85% of the viewport height', () => {
    const ui = new UiStore();
    ui.setLogPanelHeight(5000, 1000);
    expect(ui.logPanelHeight).toBe(850);
  });

  it('toggleLogPanel flips and accepts an explicit value', () => {
    const ui = new UiStore();
    ui.toggleLogPanel();
    expect(ui.logPanelOpen).toBe(true);
    ui.toggleLogPanel(false);
    expect(ui.logPanelOpen).toBe(false);
  });

  it('details panel opens per product and closes to null', () => {
    const ui = new UiStore();
    expect(ui.detailsProductName).toBeNull();
    ui.openDetails('Super 8');
    expect(ui.detailsProductName).toBe('Super 8');
    ui.closeDetails();
    expect(ui.detailsProductName).toBeNull();
  });

  it('details panel height uses the same clamp rules', () => {
    const ui = new UiStore();
    ui.setDetailsPanelHeight(10, 1000);
    expect(ui.detailsPanelHeight).toBe(LOG_PANEL_MIN_HEIGHT);
    ui.setDetailsPanelHeight(5000, 1000);
    expect(ui.detailsPanelHeight).toBe(850);
  });
});

describe('UiStore Restore As (TODO9)', () => {
  it('openRestoreAs switches the page, stores the names and closes the details panel', () => {
    const ui = new UiStore();
    ui.openRestoreDetails('Vari Comp');
    ui.openRestoreAs(['Vari Comp', 'Super 8']);
    expect(ui.currentPage).toBe('restore-as');
    expect(ui.restoreAsNames).toEqual(['Vari Comp', 'Super 8']);
    expect(ui.restoreDetailsName).toBeNull();
  });

  it('restoreAsNames stays a PLAIN array — MobX proxies fail Electron structured clone (IPC)', () => {
    const ui = new UiStore();
    ui.openRestoreAs(['Vari Comp']);
    // Regression: a deep-observable array here crashed the renderer (black
    // window) when the Restore As page passed it to ipcRenderer.invoke.
    expect(isObservable(ui.restoreAsNames)).toBe(false);
    expect(structuredClone(ui.restoreAsNames)).toEqual(['Vari Comp']);
  });
});

describe('UiStore Move (TODO10)', () => {
  it('openMove switches the page, stores the names and closes the product details panel', () => {
    const ui = new UiStore();
    ui.openDetails('Vari Comp');
    ui.openMove(['Vari Comp', 'Super 8']);
    expect(ui.currentPage).toBe('move');
    expect(ui.moveNames).toEqual(['Vari Comp', 'Super 8']);
    expect(ui.detailsProductName).toBeNull();
  });

  it('moveNames stays a PLAIN array — MobX proxies fail Electron structured clone (IPC)', () => {
    const ui = new UiStore();
    ui.openMove(['Vari Comp']);
    expect(isObservable(ui.moveNames)).toBe(false);
    expect(structuredClone(ui.moveNames)).toEqual(['Vari Comp']);
  });
});
