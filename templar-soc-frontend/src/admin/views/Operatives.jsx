/* CONNECTED OPERATIVES — the existing live roster, on its own page.
   Connection information only (codename, id, node, surface, latency). */
import { useMissionControl } from '../MissionControlContext.jsx';
import Roster from '../components/Roster.jsx';

export default function Operatives() {
  const { onlineCount, players } = useMissionControl();
  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // MISSION CONTROL</div>
          <h1 className="display-heading surface-title mc-title">CONNECTED OPERATIVES</h1>
          <div className="surface-sub">Live roster of every session synced to the SOC.</div>
        </div>
        <div className="mc-head-right">
          <div className="mc-presence">
            <span className="mc-presence-dot" />
            <div>
              <div className="mc-presence-n">{onlineCount}<span>/{players.length || '—'}</span></div>
              <div className="meta-label">OPERATIVES ONLINE</div>
            </div>
          </div>
        </div>
      </div>

      <Roster />
    </div>
  );
}
