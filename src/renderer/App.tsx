import { observer } from 'mobx-react-lite';
import React from 'react';
import { LogPanel } from './components/LogPanel';
import { ProductDetailsPanel } from './components/ProductDetailsPanel';
import { RestoreDetailsPanel } from './components/RestoreDetailsPanel';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { useStores } from './hooks/useStores';
import { AboutPage } from './pages/AboutPage';
import { MovePage } from './pages/MovePage';
import { PreferencesPage } from './pages/PreferencesPage';
import { InstalledPage } from './pages/InstalledPage';
import { RestoreAsPage } from './pages/RestoreAsPage';
import { RestorePage } from './pages/RestorePage';
import { UninstallProgressPage } from './pages/UninstallProgressPage';

/**
 * Root component: layout shell (sidebar / content / status bar) and page
 * switching. A running or finished uninstall job overrides the current page
 * with the progress page until it is dismissed (PLAN.md §4.2).
 */
const App = observer(function App() {
  const { ui, uninstall } = useStores();

  const page =
    uninstall.state.status !== 'idle' ? (
      <UninstallProgressPage />
    ) : ui.currentPage === 'preferences' ? (
      <PreferencesPage />
    ) : ui.currentPage === 'about' ? (
      <AboutPage />
    ) : ui.currentPage === 'restore' ? (
      <RestorePage />
    ) : ui.currentPage === 'restore-as' ? (
      <RestoreAsPage />
    ) : ui.currentPage === 'move' ? (
      <MovePage />
    ) : (
      <InstalledPage />
    );

  return (
    <div className="app-shell">
      <div className="app-body">
        <Sidebar />
        <main className="app-content">{page}</main>
      </div>
      <StatusBar />
      {ui.logPanelOpen && <LogPanel />}
      {ui.detailsProductName !== null && <ProductDetailsPanel />}
      {ui.restoreDetailsName !== null && <RestoreDetailsPanel />}
    </div>
  );
});

export default App;
