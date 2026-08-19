/* DASHBOARD — minimal, read-only event overview. Everything here is
   derived from the live data the console already polls (history +
   players); no new probing, no raw technical detail. */
import { BROADCAST_TYPES } from '../../lib/broadcast.js';
import { relTime } from '../../lib/format.js';
import { useMissionControl } from '../MissionControlContext.jsx';

export default function Dashboard() {
  const { history, onlineCount, players, lastSync } = useMissionControl();

  const active = history.filter((h) => !h.scheduled);
  const scheduled = history.filter((h) => h.scheduled);
  const emergency = active.find((h) => h.btype === 'emergency');
  const recent = history.slice(0, 6);
  const online = lastSync && Date.now() - lastSync < 15000;

  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // MISSION CONTROL</div>
          <h1 className="display-heading surface-title mc-title">DASHBOARD</h1>
          <div className="surface-sub">Operational overview at a glance.</div>
        </div>
      </div>

      {emergency && (
        <div className="admin-emerg">
          <span className="blink">◉</span>
          <div>
            <div className="admin-emerg-k">ACTIVE EMERGENCY BROADCAST</div>
            <div className="admin-emerg-t">{emergency.title}</div>
          </div>
        </div>
      )}

      <div className="admin-cards">
        <div className="panel admin-stat">
          <div className="admin-stat-n">{onlineCount}<span>/{players.length || '—'}</span></div>
          <div className="admin-stat-l">OPERATIVES ONLINE</div>
        </div>
        <div className="panel admin-stat">
          <div className="admin-stat-n">{active.length}</div>
          <div className="admin-stat-l">ACTIVE BROADCASTS</div>
        </div>
        <div className="panel admin-stat">
          <div className="admin-stat-n">{scheduled.length}</div>
          <div className="admin-stat-l">SCHEDULED</div>
        </div>
        <div className="panel admin-stat">
          <div className="admin-dot">
            <span className={'admin-led ' + (online ? 'admin-led--on' : 'admin-led--off')} />
            <span className="admin-stat-n" style={{ fontSize: 18 }}>{online ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
          <div className="admin-stat-l">RELAY / SERVER</div>
        </div>
      </div>

      <div className="admin-two">
        <div className="panel">
          <div className="panel-head"><span className="title">RECENT ACTIVITY</span></div>
          <div className="admin-rows">
            {recent.length === 0 && <div className="admin-quiet">No broadcasts yet.</div>}
            {recent.map((item) => {
              const t = BROADCAST_TYPES[item.btype] || BROADCAST_TYPES.alert;
              return (
                <div key={item._key} className="admin-row">
                  <span className="admin-row-k"><span className={`mc-htag mc-htag--${t.tone}`}>{t.short}</span></span>
                  <span className="admin-row-v" style={{ flex: 1, textAlign: 'left', paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span className="admin-row-k">{item.scheduled ? '◷ SCHEDULED' : relTime(item.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="title">SCHEDULED BROADCASTS</span><span className="meta-label" style={{ marginLeft: 'auto' }}>{scheduled.length} QUEUED</span></div>
          <div className="admin-rows">
            {scheduled.length === 0 && <div className="admin-quiet">Nothing queued.</div>}
            {scheduled.map((item) => {
              const t = BROADCAST_TYPES[item.btype] || BROADCAST_TYPES.alert;
              return (
                <div key={item._key} className="admin-row">
                  <span className="admin-row-k"><span className={`mc-htag mc-htag--${t.tone}`}>{t.short}</span></span>
                  <span className="admin-row-v" style={{ flex: 1, textAlign: 'left', paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span className="admin-row-k mc-sched-in">◷ FIRES</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
