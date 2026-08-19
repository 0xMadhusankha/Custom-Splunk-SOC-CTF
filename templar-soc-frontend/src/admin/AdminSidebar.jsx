/* Mission Control sidebar — mirrors the player Sidebar.jsx pattern but
   gold-toned (reuses the existing .sidebar / .nav-item / .nav-item--admin
   styles from shell.css). Router-driven NavLinks → instant, no-reload
   view switching. */
import { NavLink } from 'react-router-dom';
import TemplarCross from '../components/brand/TemplarCross.jsx';

const MODULES = [
  { to: '/',                code: 'DASHBOARD',      icon: IconGrid,   end: true },
  { to: '/mission-control', code: 'MISSION_CONTROL', icon: IconBroadcast },
  { to: '/audio',           code: 'AUDIO_LIBRARY',  icon: IconAudio },
  { to: '/activity',        code: 'ACTIVITY_LOG',   icon: IconLog },
  { to: '/operatives',      code: 'CONNECTED_OPS',  icon: IconUsers },
  { to: '/status',          code: 'SYSTEM_STATUS',  icon: IconPulse },
  { to: '/settings',        code: 'SETTINGS',       icon: IconGear },
];

export default function AdminSidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <TemplarCross size={54} tone="gold" />
        <div className="sidebar-brand-text">TEMPLAR ORDER</div>
        <div className="sidebar-brand-sub">MISSION CONTROL</div>
      </div>

      <div className="divider" />

      <nav className="sidebar-nav">
        <div className="meta-label sidebar-nav-heading">ORGANIZER MODULES</div>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) => 'nav-item nav-item--admin' + (isActive ? ' is-active' : '')}
            >
              <span className="nav-item-rail" />
              <Icon />
              <span className="nav-item-code">{m.code}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-monitor">
        <div className="sidebar-eq" aria-hidden="true">
          {Array.from({ length: 34 }).map((_, i) => <span key={i} style={{ animationDelay: `${(i % 12) * 0.13}s` }} />)}
        </div>
        <div className="sidebar-warning">
          ORGANIZER TERMINAL<br />
          UNAUTHORIZED ACCESS WILL BE <span className="crimson">PROSECUTED</span>
        </div>
        <div className="sidebar-copyright">© TEMPLAR ORDER — MMXXVI</div>
      </div>
    </aside>
  );
}

/* --- inline icons (stroke = currentColor) --- */
function IconGrid() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>);
}
function IconBroadcast() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="2" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M9.2 9.2a4 4 0 0 0 0 5.6M14.8 9.2a4 4 0 0 1 0 5.6" /></svg>);
}
function IconAudio() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7" /></svg>);
}
function IconLog() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="8" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="8" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>);
}
function IconUsers() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.5a3 3 0 0 1 0 5.8M21 20c0-2.6-1.7-4.8-4-5.6" /></svg>);
}
function IconPulse() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 12h4l2-6 4 12 2-6h6" /></svg>);
}
function IconGear() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>);
}
