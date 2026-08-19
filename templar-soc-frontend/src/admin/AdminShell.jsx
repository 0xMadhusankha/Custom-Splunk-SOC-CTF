/* ============================================================
   ADMIN SHELL — sidebar + topbar + routed main, mirroring the
   player AppShell but organizer-gold. Reuses the shared shell.css
   grid; the routed <Outlet/> is keyed by pathname so the existing
   .page-enter transition plays on every (instant, no-reload) switch.
   ============================================================ */
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import { useMissionControl } from './MissionControlContext.jsx';
import { fmtDateTime } from '../lib/format.js';
import '../components/layout/shell.css';
import './admin-shell.css';

function AdminClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <span className="admin-clock mono">{fmtDateTime(now)}</span>;
}

export default function AdminShell({ onLogout }) {
  const location = useLocation();
  const { flash } = useMissionControl();

  return (
    <div className="app-shell admin-shell">
      <AdminSidebar />

      <header className="topbar admin-topbar">
        <div className="admin-bar-left">
          <span className="admin-restricted">◉ RESTRICTED — ORGANIZER ACCESS ONLY</span>
        </div>
        <AdminClock />
        {onLogout && <button className="admin-logout-btn" onClick={onLogout}>LOGOUT</button>}
      </header>

      <main className="app-main">
        <div key={location.pathname} className="page-enter">
          <Outlet context={{ onLogout }} />
        </div>
      </main>

      {flash && (
        <div className="admin-toast">
          <div className={'mc-flash mc-flash--' + flash.tone}><span className="blink">◉</span> {flash.msg}</div>
        </div>
      )}
    </div>
  );
}
