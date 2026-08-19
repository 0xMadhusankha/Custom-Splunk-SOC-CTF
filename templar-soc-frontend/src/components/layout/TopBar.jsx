import { useEffect, useState } from 'react';
import TemplarCross from '../brand/TemplarCross.jsx';
import { fmtDateTime } from '../../lib/format.js';
import { getServerNow } from '../../services/realtime.js';

const SUBSYSTEMS = [
  { code: 'SENSOR', label: 'Sensor grid — online', tone: 'green', rate: 3.2 },
  { code: 'EDR', label: 'Endpoint detection — online', tone: 'green', rate: 2.6 },
  { code: 'IDENT', label: 'Identity fabric — degraded', tone: 'amber', rate: 1.8 },
  { code: 'UPLINK', label: 'ANIMUS uplink — active', tone: 'crimson', rate: 1.3 },
];

export default function TopBar({ session }) {
  const [now, setNow] = useState(getServerNow());
  useEffect(() => {
    const id = setInterval(() => setNow(getServerNow()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="sys-leds" title="Subsystem telemetry — nominal">
          {SUBSYSTEMS.map((s, i) => (
            <span key={s.code} className="sys-led" title={s.label}>
              <span className={`led led--${s.tone}`} style={{ animationDelay: `${i * 0.4}s`, animationDuration: `${s.rate}s` }} />
              <span className="sys-led-code">{s.code}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="topbar-center">
        <span className="topbar-org">TEMPLAR ORDER</span>
        <span className="topbar-sep">//</span>
        <span className="topbar-org">SECURITY OPERATIONS COMMAND</span>
      </div>

      <div className="topbar-right">
        <div className="topbar-meta">
          <div className="topbar-meta-row">
            <span className="meta-label">SESSION ID</span>
            <span className="topbar-meta-val">{session?.sessionId ?? '—'}</span>
          </div>
          <div className="topbar-meta-row">
            <span className="meta-label">CLASSIFICATION</span>
            <span className="topbar-meta-val crimson">{session?.classification ?? 'TOP SECRET'}</span>
          </div>
        </div>
        <div className="topbar-mark"><TemplarCross size={34} tone="gold" /></div>
      </div>

      <div className="topbar-clock mono">{fmtDateTime(now)}</div>
    </header>
  );
}
