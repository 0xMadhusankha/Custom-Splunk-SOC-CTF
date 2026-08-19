/* Live preview — exactly how the broadcast lands for an operative.
   Extracted verbatim from the original MissionControl.jsx — logic unchanged. */
import { BROADCAST_TYPES } from '../../lib/broadcast.js';

export default function Preview({ type, form }) {
  const meta = BROADCAST_TYPES[type];
  const title = form.title.trim() || '— untitled broadcast —';
  if (type === 'emergency') {
    return (
      <div className="mc-panel panel">
        <div className="panel-head"><span className="title">PREVIEW</span><span className="meta-label">AS OPERATIVE SEES IT</span></div>
        <div className="mc-prev-emerg">
          <span className="blink">◉</span>
          <div>
            <div className="mc-prev-emerg-k">EMERGENCY BROADCAST · ALL SESSIONS</div>
            <div className="mc-prev-emerg-t">{title}</div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mc-panel panel">
      <div className="panel-head"><span className="title">PREVIEW</span><span className="meta-label">AS OPERATIVE SEES IT</span></div>
      <div className={`mc-prev mc-prev--${meta.tone}`}>
        <span className="mc-prev-rail" />
        <div className="mc-prev-body">
          <div className="mc-prev-head">
            <span className="mc-prev-dot" />
            <span className="mc-prev-kicker">INCOMING TRANSMISSION</span>
            <span className="mc-prev-tag">{meta.label}</span>
          </div>
          <div className="mc-prev-title">{title}</div>
          <div className="mc-prev-foot">
            <span>MISSION CONTROL → ALL OPERATIVES</span>
            <span className="mc-prev-cta">{meta.channel === 'alert' ? 'INVESTIGATE' : 'REVIEW'} →</span>
          </div>
        </div>
      </div>
    </div>
  );
}
