/* SYSTEM STATUS — minimal, human-readable operational health.
   Derived only from values the console already has (connection, audio
   engine, roster, broadcast counts, last sync). No raw endpoints, env,
   tokens, or internal counters. */
import { isRemote } from '../../services/realtime.js';
import { relTime } from '../../lib/format.js';
import { useMissionControl } from '../MissionControlContext.jsx';

export default function SystemStatus() {
  const { audio, onlineCount, players, history, lastSync } = useMissionControl();
  const online = lastSync && Date.now() - lastSync < 15000;
  const active = history.filter((h) => !h.scheduled).length;
  const scheduled = history.filter((h) => h.scheduled).length;

  const rows = [
    { k: 'RELAY / SERVER', v: online ? 'Connected' : 'Offline', led: online ? 'on' : 'off' },
    { k: 'TRANSPORT', v: isRemote() ? 'Live relay' : 'Local (offline demo)', led: isRemote() ? 'gold' : 'off' },
    { k: 'SERVER TIME', v: online ? 'Synced' : '—', led: online ? 'on' : 'off' },
    { k: 'AUDIO ENGINE', v: audio?.ready ? 'Armed' : 'Idle', led: audio?.ready ? 'on' : 'off' },
    { k: 'OPERATIVES ONLINE', v: `${onlineCount} / ${players.length || 0}` },
    { k: 'ACTIVE BROADCASTS', v: String(active) },
    { k: 'SCHEDULED BROADCASTS', v: String(scheduled) },
    { k: 'LAST SYNC', v: lastSync ? relTime(lastSync) : '—' },
  ];

  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // MISSION CONTROL</div>
          <h1 className="display-heading surface-title mc-title">SYSTEM STATUS</h1>
          <div className="surface-sub">Operational health of the Mission Control console.</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="title">OPERATIONAL HEALTH</span></div>
        <div className="admin-rows">
          {rows.map((r) => (
            <div key={r.k} className="admin-row">
              <span className="admin-row-k">{r.k}</span>
              <span className="admin-row-v">
                {r.led
                  ? <span className="admin-dot"><span className={`admin-led admin-led--${r.led}`} />{r.v}</span>
                  : r.v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
