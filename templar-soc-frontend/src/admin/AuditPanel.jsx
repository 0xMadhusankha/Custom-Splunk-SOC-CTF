/* ============================================================
   AUDIT PANEL — "a small audit log showing login time, logout
   time, and important administrator actions." Reuses the SAME
   .mc-panel/.panel styling already established in Mission
   Control's right rail — additive, not a redesign.
   ============================================================ */

import { useEffect, useState } from 'react';
import { apiGet } from '../services/realtime.js';
import { fmtDateTime } from '../lib/format.js';
import './admin-audit.css';

export default function AuditPanel() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try { const { entries } = await apiGet('/api/auth/audit'); if (alive) setEntries(entries); } catch { /* ignore transient errors */ }
    }
    load();
    const id = setInterval(load, 8000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div className="mc-panel panel admin-audit">
      <div className="panel-head"><span className="title">ACTIVITY LOG</span><span className="meta-label">ORGANIZER SESSION</span></div>
      <div className="admin-audit-list scroll-y">
        {entries.length === 0 && <div className="mc-empty">No activity yet.</div>}
        {entries.map((e) => (
          <div key={e.id} className="admin-audit-row">
            <span className={`admin-audit-action admin-audit-action--${actionTone(e.action)}`}>{e.action.replace(/_/g, ' ').toUpperCase()}</span>
            <span className="admin-audit-detail">{e.detail || '—'}</span>
            <span className="admin-audit-time meta-label">{fmtDateTime(e.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function actionTone(action) {
  if (action === 'login_failed') return 'warn';
  if (action === 'login' || action === 'logout') return 'session';
  return 'action';
}
