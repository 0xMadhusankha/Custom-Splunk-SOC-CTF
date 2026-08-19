import { NavLink } from 'react-router-dom';
import TemplarCross from '../brand/TemplarCross.jsx';

const MODULES = [
  { to: '/console', code: 'INVESTIGATION_CONSOLE', label: 'Investigation Console', icon: IconSearch },
  { to: '/alerts',  code: 'ALERTS',                label: 'Operational Alerts',    icon: IconBell },
  { to: '/intel',   code: 'THREAT_INTEL',          label: 'Threat Intelligence',   icon: IconShield },
];

export default function Sidebar({ unread = 0, onClearUnread }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <TemplarCross size={54} />
        <div className="sidebar-brand-text">TEMPLAR SOC</div>
        <div className="sidebar-brand-sub">ANIMUS 1.0</div>
      </div>

      <div className="divider" />

      <nav className="sidebar-nav">
        <div className="meta-label sidebar-nav-heading">OPERATIONAL MODULES</div>
        {MODULES.map((m) => {
          const Icon = m.icon;
          const showBadge = m.to === '/alerts' && unread > 0;
          return (
            <NavLink
              key={m.to}
              to={m.to}
              onClick={() => { if (m.to === '/alerts') onClearUnread?.(); }}
              className={({ isActive }) => 'nav-item' + (isActive ? ' is-active' : '')}
            >
              <span className="nav-item-rail" />
              <Icon />
              <span className="nav-item-code">{m.code}</span>
              {showBadge && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
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
          ALL SESSIONS MONITORED<br />
          UNAUTHORIZED ACCESS WILL BE <span className="crimson">PROSECUTED</span>
        </div>
        <div className="sidebar-copyright">© TEMPLAR ORDER — MMXXVI</div>
      </div>
    </aside>
  );
}

/* --- inline icons (stroke = currentColor) --- */
function IconSearch() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>);
}
function IconBell() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>);
}
function IconShield() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" /></svg>);
}
function IconGrid() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>);
}
