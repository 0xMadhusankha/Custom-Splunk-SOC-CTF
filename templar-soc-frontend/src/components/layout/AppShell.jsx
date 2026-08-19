import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import NotificationLayer from '../notifications/NotificationLayer.jsx';
import { useSoc } from '../../context/SocContext.jsx';
import './shell.css';

export default function AppShell() {
  const { session, unread, clearUnread } = useSoc();
  const location = useLocation();
  return (
    <div className="app-shell">
      <Sidebar
        unread={unread}
        onClearUnread={clearUnread}
      />
      <TopBar session={session} />
      <main className="app-main">
        {/* keyed by path → each surface performs a smooth entrance */}
        <div key={location.pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
      <NotificationLayer />
    </div>
  );
}
