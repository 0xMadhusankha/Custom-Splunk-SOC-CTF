/* ============================================================
   NotificationLayer — an internal MILITARY BROADCAST, not a
   browser toast. It slides in from the right, wears the identity
   of the broadcast type (label + accent), pulses a scanline while
   live, and routes to the relevant surface on click. Emergency
   broadcasts take over as a full-width crimson band.
   The sound is fired upstream by the poller in SocContext.
   ============================================================ */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSoc } from '../../context/SocContext.jsx';
import { BROADCAST_TYPES } from '../../lib/broadcast.js';
import './notifications.css';

export default function NotificationLayer() {
  const { notification, dismiss } = useSoc();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const isEmergency = notification?.btype === 'emergency';

  useEffect(() => {
    if (!notification) return;
    setLeaving(false);
    // Emergencies require explicit acknowledgement — they never auto-dismiss.
    if (isEmergency) return;
    const hold = setTimeout(() => setLeaving(true), 11000);
    const kill = setTimeout(dismiss, 11600);
    return () => { clearTimeout(hold); clearTimeout(kill); };
  }, [notification, dismiss, isEmergency]);

  if (!notification) return null;

  const meta = BROADCAST_TYPES[notification.btype] || BROADCAST_TYPES.alert;
  const channel = meta.channel; // 'alert' | 'intel'
  const go = () => { navigate(channel === 'alert' ? '/alerts' : '/intel'); dismiss(); };
  const ack = () => { setLeaving(true); setTimeout(dismiss, 480); };

  if (isEmergency) {
    return (
      <div className={'brdcst-emerg-scrim' + (leaving ? ' is-leaving' : '')} role="alertdialog" aria-label="Emergency broadcast — acknowledgement required">
        {/* full-screen dim: blocks the SOC until the operative acknowledges */}
        <button className="brdcst-emerg-dim" onClick={ack} aria-label="Acknowledge" />
        <div className="brdcst-emerg">
          <div className="brdcst-emerg-scan" />
          <div className="brdcst-emerg-inner">
            <span className="brdcst-emerg-flare blink">◉</span>
            <div className="brdcst-emerg-copy" onClick={go}>
              <div className="brdcst-emerg-kicker">EMERGENCY BROADCAST · TEMPLAR ORDER · ALL SESSIONS</div>
              <div className="brdcst-emerg-title">{notification.title}</div>
            </div>
            <button className="brdcst-emerg-x" onClick={ack}>ACKNOWLEDGE</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      className={`brdcst brdcst--${meta.tone}` + (leaving ? ' is-leaving' : '')}
      data-type={meta.key}
      onClick={go}
    >
      <span className="brdcst-rail" />
      <span className="brdcst-scan" />
      <div className="brdcst-body">
        <div className="brdcst-head">
          <span className="brdcst-dot" />
          <span className="brdcst-kicker">INCOMING TRANSMISSION</span>
          <span className="brdcst-tag">{meta.label}</span>
        </div>
        <div className="brdcst-title">{notification.title}</div>
        <div className="brdcst-foot">
          <span className="brdcst-src">MISSION CONTROL → ALL OPERATIVES</span>
          <span className="brdcst-cta">{channel === 'alert' ? 'INVESTIGATE' : 'REVIEW'} →</span>
        </div>
      </div>
    </button>
  );
}
