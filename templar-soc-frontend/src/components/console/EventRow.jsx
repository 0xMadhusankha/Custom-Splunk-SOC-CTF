/* Expandable raw-event row, styled after Splunk's Events list:
   time column, raw line, and field=value meta pairs. Expanding
   reveals the interesting-fields table (the pivot surface). */

import { useState } from 'react';
import { fmtDateTime } from '../../lib/format.js';
import './EventRow.css';

export default function EventRow({ ev, n }) {
  const [open, setOpen] = useState(false);
  const d = new Date(ev._time);
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  const time = d.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getUTCMilliseconds()).padStart(3, '0');

  // Render every field Splunk actually returned for this event — never a
  // fixed allowlist, since different sourcetypes (Windows Security, Sysmon,
  // IIS, DNS, ...) carry entirely different fields. _time/_raw already have
  // dedicated slots above, so they're excluded here.
  const fields = Object.entries(ev)
    .filter(([k, v]) => k !== '_time' && k !== '_raw' && v !== undefined && v !== null);

  return (
    <div className={'event' + (open ? ' is-open' : '')}>
      <button className="event-main" onClick={() => setOpen((o) => !o)}>
        <span className="event-caret">{open ? '▾' : '▸'}</span>
        <span className="event-time mono">
          <span className="event-date">{date}</span>
          <span className="event-hms">{time}</span>
        </span>
        <span className="event-raw mono">
          <RawLine raw={ev._raw} />
          <span className="event-metaline">
            <Meta k="host" v={ev.host} />
            <Meta k="source" v={ev.source} truncate />
            <Meta k="sourcetype" v={ev.sourcetype} />
          </span>
        </span>
      </button>

      {open && (
        <div className="event-expand">
          <div className="event-expand-cap meta-label">EVENT FIELDS</div>
          <table className="event-fields">
            <tbody>
              {fields.map(([k, v]) => (
                <tr key={k}>
                  <td className="ef-key">{k}</td>
                  <td className="ef-val mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RawLine({ raw }) {
  // highlight the C2 domain + status inside the raw line
  if (!raw) return null;
  const nodes = [];
  const re = /(assets\.windowslive-cdn\.net|POST|200|10\.20\.10\.10)/g;
  let last = 0, m;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) nodes.push(raw.slice(last, m.index));
    const cls = m[0] === 'assets.windowslive-cdn.net' ? 'raw-ioc' : m[0] === 'POST' ? 'raw-method' : m[0] === '200' ? 'raw-status' : 'raw-ip';
    nodes.push(<span key={m.index} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  nodes.push(raw.slice(last));
  return <span className="event-rawtext">{nodes}</span>;
}

function Meta({ k, v, truncate }) {
  if (v === undefined || v === null) return null;
  return (
    <span className="meta-pair">
      <span className="meta-k">{k} = </span>
      <span className={'meta-v' + (truncate ? ' meta-v--trunc' : '')}>{String(v)}</span>
    </span>
  );
}
