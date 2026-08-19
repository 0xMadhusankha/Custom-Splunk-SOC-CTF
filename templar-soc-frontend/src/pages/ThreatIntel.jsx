/* ============================================================
   THREAT INTELLIGENCE — the classified intelligence division.
   Reads like confidential analyst briefings, not dashboards.
   Organizer-published bulletins with classification banners,
   IOC blocks, and category taxonomy.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { service } from '../services/index.js';
import { useSoc } from '../context/SocContext.jsx';
import { fmtDateTime, relTime } from '../lib/format.js';
import './ThreatIntel.css';

const CATEGORIES = {
  ioc: 'IOC UPDATE', campaign: 'CAMPAIGN', technique: 'TECHNIQUE',
  infrastructure: 'INFRASTRUCTURE', advisory: 'ADVISORY', emergency: 'EMERGENCY',
};

export default function ThreatIntel() {
  const { notification } = useSoc();
  const [intel, setIntel] = useState(null);
  const [active, setActive] = useState(null);

  async function load() { setIntel(await service.getThreatIntel()); }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (notification) load(); }, [notification]);

  const list = useMemo(() => (intel ?? []).slice().sort((a, b) => b.timestamp - a.timestamp), [intel]);
  const current = active ?? list[0];

  return (
    <div className="intel">
      <div className="surface-head">
        <div>
          <div className="meta-label">TEMPLAR ORDER // CLASSIFIED INTELLIGENCE DIVISION</div>
          <h1 className="display-heading surface-title">THREAT INTELLIGENCE</h1>
          <div className="surface-sub">Confidential analyst briefings on the Rogue Assassin campaign. Distribution restricted to cleared operatives.</div>
        </div>
        <div className="intel-clearance">
          <div className="sev sev--critical">CLASSIFIED</div>
          <div className="meta-label" style={{ marginTop: 8 }}>EYES ONLY</div>
        </div>
      </div>

      <div className="intel-body">
        {/* bulletin index */}
        <div className="intel-index scroll-y">
          <div className="intel-index-cap meta-label">INTELLIGENCE FEED · {list.length}</div>
          {list.map((b) => (
            <button key={b._key} className={'intel-item' + (current?._key === b._key ? ' is-active' : '')} onClick={() => setActive(b)}>
              <div className="intel-item-top">
                <span className="intel-cat">{CATEGORIES[b.category] ?? b.category?.toUpperCase()}</span>
                <span className={`sev sev--${b.severity}`}>{b.severity}</span>
              </div>
              <div className="intel-item-title">{b.title}</div>
              <div className="intel-item-time meta-label">{relTime(b.timestamp)}</div>
            </button>
          ))}
        </div>

        {/* briefing reader — re-keyed so opening a bulletin plays a classified reveal */}
        {current && (
          <article key={current._key} className="briefing briefing--reveal panel scroll-y">
            <div className="briefing-declassify" aria-hidden="true" />
            <div className="briefing-classbar">
              <span>{current.classification ?? 'TEMPLAR // RESTRICTED'}</span>
              <span>{current.classification ?? 'TEMPLAR // RESTRICTED'}</span>
            </div>
            <div className="briefing-inner">
              <div className="briefing-head">
                <span className="intel-cat intel-cat--lg">{CATEGORIES[current.category] ?? current.category?.toUpperCase()}</span>
                <span className={`sev sev--${current.severity}`}>{current.severity}</span>
              </div>
              <h2 className="briefing-title">{current.title}</h2>
              <div className="briefing-meta">
                <MetaLine k="ISSUED" v={fmtDateTime(current.timestamp)} />
                <MetaLine k="ORIGIN" v={current.source ?? 'MISSION_CONTROL'} />
                <MetaLine k="REF" v={current._key.toUpperCase()} />
              </div>

              <div className="briefing-divider"><span>ASSESSMENT</span></div>
              <p className="briefing-text">{current.body}</p>

              {current.iocs && current.iocs.length > 0 && (
                <>
                  <div className="briefing-divider"><span>INDICATORS OF COMPROMISE</span></div>
                  <div className="ioc-table">
                    {current.iocs.map((io, i) => (
                      <div key={i} className="ioc-row">
                        <span className="ioc-type">{io.type}</span>
                        <span className="ioc-value mono">{io.value}</span>
                        <span className="ioc-flag">FLAGGED</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="briefing-foot meta-label">
                END OF BRIEFING · TEMPLAR ORDER — DISSEMINATION CONTROLLED
              </div>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function MetaLine({ k, v }) {
  return (<div className="metaline"><span className="meta-label">{k}</span><span className="metaline-v mono">{v}</span></div>);
}
