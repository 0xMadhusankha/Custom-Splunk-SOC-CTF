/* MISSION CONTROL — dedicated broadcast page.
   Type → Title → Message → Optional Sound → Preview → Broadcast.
   Composer + live Preview only; history/roster/audio moved to their
   own views so this surface stays a focused, no-scroll workflow. */
import TemplarCross from '../../components/brand/TemplarCross.jsx';
import { useMissionControl } from '../MissionControlContext.jsx';
import Composer from '../components/Composer.jsx';
import Preview from '../components/Preview.jsx';
import '../../pages/MissionControl.css';

export default function MissionControlView() {
  const { type, form, onlineCount, players } = useMissionControl();
  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // SENIOR ANALYST CONTROL</div>
          <h1 className="display-heading surface-title mc-title">MISSION CONTROL</h1>
          <div className="surface-sub">Compose, preview, and broadcast to every connected operative — live or scheduled.</div>
        </div>
        <div className="mc-head-right">
          <div className="mc-presence">
            <span className="mc-presence-dot" />
            <div>
              <div className="mc-presence-n">{onlineCount}<span>/{players.length || '—'}</span></div>
              <div className="meta-label">OPERATIVES ONLINE</div>
            </div>
          </div>
          <div className="mc-crest"><TemplarCross size={44} tone="gold" /></div>
        </div>
      </div>

      <div className="mc-grid">
        <Composer />
        <aside className="mc-side">
          <Preview type={type} form={form} />
        </aside>
      </div>
    </div>
  );
}
