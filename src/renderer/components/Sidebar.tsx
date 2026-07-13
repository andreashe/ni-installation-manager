import { observer } from 'mobx-react-lite';
import React from 'react';
import { useStores } from '../hooks/useStores';
import type { AppPage } from '../stores/UiStore';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** One nav entry: icon + label, highlighted when its page is active. */
function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`sidebar-item${active ? ' active' : ''}`} onClick={onClick}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}

/**
 * Left navigation (PLAN.md §4): main sections on top, log panel toggle,
 * About and Preferences pinned to the bottom. Home is intentionally absent
 * for now — the app starts and stays on Uninstall until more sections exist.
 */
export const Sidebar = observer(function Sidebar() {
  const { ui } = useStores();

  const navigate = (page: AppPage) => () => ui.navigate(page);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-mark">NI</span>
        <span className="sidebar-logo-text">
          <span>Installation</span>
          <span>Manager</span>
        </span>
      </div>

      <nav className="sidebar-nav">
        <SidebarItem
          icon="harddrive"
          label="Installed"
          active={ui.currentPage === 'uninstall'}
          onClick={navigate('uninstall')}
        />
        <SidebarItem
          icon="restore"
          label="Restore"
          active={ui.currentPage === 'restore'}
          onClick={navigate('restore')}
        />
      </nav>

      <div className="sidebar-spacer" />

      <nav className="sidebar-nav">
        <SidebarItem
          icon="terminal"
          label="Log"
          active={ui.logPanelOpen}
          onClick={() => ui.toggleLogPanel()}
        />
        <SidebarItem
          icon="info"
          label="About"
          active={ui.currentPage === 'about'}
          onClick={navigate('about')}
        />
        <SidebarItem
          icon="gear"
          label="Preferences"
          active={ui.currentPage === 'preferences'}
          onClick={navigate('preferences')}
        />
      </nav>
    </aside>
  );
});
