/* Connected-operatives roster — JSX moved verbatim from the original
   MissionControl.jsx right rail; data now comes from the shared context. */
import { useMissionControl } from '../MissionControlContext.jsx';

export default function Roster() {
  const { players } = useMissionControl();
  return (
    <div className="mc-panel panel breathe-edge">
      <div className="panel-head"><span className="title">CONNECTED OPERATIVES</span><span className="blink mc-live">● LIVE</span></div>
      <div className="mc-roster scroll-y">
        {players.map((p) => (
          <div key={p.id} className={'mc-op' + (p.online ? '' : ' is-off')}>
            <span className="mc-op-dot" />
            <div className="mc-op-main">
              <div className="mc-op-name">{p.codename}<span className="mc-op-id">{p.id}</span></div>
              <div className="mc-op-meta meta-label">{p.node} · {p.surface.toUpperCase()}</div>
            </div>
            <div className="mc-op-lat">{p.online ? `${p.latencyMs}ms` : 'OFFLINE'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
