/* ============================================================
   INVESTIGATION CONSOLE — the analyst workstation.
   This is the product. Players execute SPL, inspect telemetry,
   pivot through evidence, and reconstruct the intrusion.
   Deliberately NOT a Splunk clone: only the surfaces an analyst
   uses during the operation are exposed — SPL editor, time range,
   run/clear, Events / Patterns / Statistics / Visualization,
   timeline, field-aware event rows, pagination. Splunk's internal
   job/sampling/export machinery is intentionally hidden; Splunk is
   the invisible engine underneath, never part of the fiction.
   ============================================================ */

import { useMemo, useRef, useState } from 'react';
import { service } from '../services/index.js';
import { fmtDateTime } from '../lib/format.js';
import Spl from '../components/console/Spl.jsx';
import Timeline from '../components/console/Timeline.jsx';
import EventRow from '../components/console/EventRow.jsx';
import './InvestigationConsole.css';

const DEFAULT_SPL = '';

const TABS = ['EVENTS', 'STATISTICS', 'VISUALIZATION'];
const TIME_PRESETS = ['Last 15 minutes', 'Last 24 hours', 'Last 7 days', 'Last 30 days', 'All time'];

export default function InvestigationConsole() {
  const [spl, setSpl] = useState(DEFAULT_SPL);
  const [timeRange, setTimeRange] = useState('All time');
  const [showTime, setShowTime] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('EVENTS');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const runSeq = useRef(0);

  async function run(next = spl) {
    const seq = ++runSeq.current;
    setStatus('running');
    setResult(null);
    setError(null);
    try {
      const res = await service.search(next, timeRange);
      if (seq !== runSeq.current) return; // superseded
      setResult(res);
      setStatus('done');
      setPage(1);
    } catch (err) {
      if (seq !== runSeq.current) return; // superseded
      setError(err?.message || 'Search failed. Please try again.');
      setStatus('error');
    }
  }

  const events = result?.events ?? [];
  const totalPages = Math.max(1, Math.ceil(events.length / perPage));
  const pageEvents = useMemo(
    () => events.slice((page - 1) * perPage, page * perPage),
    [events, page, perPage]
  );

  return (
    <div className="console">
      {/* ---- header ---- */}
      <div className="console-head">
        <div className="console-head-titles">
          <h1 className="display-heading console-title">
            INVESTIGATION CONSOLE <span className="console-title-tag">/ ANALYST WORKSTATION</span>
          </h1>
          <div className="console-subtitle meta-label">EXECUTE SPL AND ANALYZE SECURITY TELEMETRY</div>
        </div>
        <div className="console-index-chip">
          <span className="blink console-index-dot" />
          INDEX :: templar_investigation
        </div>
      </div>

      {/* ---- query bar ---- */}
      <div className="console-query panel">
        <div className="console-query-grid">
          <div className="console-query-editor">
            <div className="meta-label console-field-cap">SPL QUERY</div>
            <Spl value={spl} onChange={setSpl} onRun={() => run()} />
          </div>
          <div className="console-query-side">
            <div className="meta-label console-field-cap">TIME RANGE</div>
            <div className="timepicker">
              <button className="timepicker-btn" onClick={() => setShowTime((s) => !s)}>
                <IconClock />
                <span>{timeRange}</span>
                <IconChevron />
              </button>
              {showTime && (
                <div className="timepicker-menu">
                  {TIME_PRESETS.map((t) => (
                    <button key={t} className={'timepicker-opt' + (t === timeRange ? ' is-sel' : '')}
                      onClick={() => { setTimeRange(t); setShowTime(false); }}>{t}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="console-query-actions">
              <button className="btn btn--primary" onClick={() => run()} disabled={status === 'running'}>
                <IconSearch /> {status === 'running' ? 'RUNNING…' : 'RUN SEARCH'}
              </button>
              <button className="btn btn--ghost" onClick={() => { setSpl(''); setResult(null); setError(null); setStatus('idle'); }}>
                CLEAR
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---- search status readout ---- */}
      <div className="console-jobbar">
        <div className="console-jobstatus">
          {status === 'running' && <><span className="job-spinner" /> SEARCHING TEMPLAR TELEMETRY…</>}
          {status === 'done' && result && (
            <><IconCheck /> <b>{result.meta.total.toLocaleString()}</b>&nbsp;events matched
              <span className="muted"> · {events.length.toLocaleString()} returned</span></>
          )}
          {status === 'idle' && <span className="muted">NO ACTIVE SEARCH — ENTER SPL AND RUN</span>}
          {status === 'error' && <span className="console-jobstatus-error">⚠ {error}</span>}
        </div>
      </div>

      {/* ---- body : results ---- */}
      <div className="console-body">
        {/* results */}
        <section className="results panel">
          <div className="results-tabs">
            {TABS.map((t) => (
              <button key={t} className={'results-tab' + (t === tab ? ' is-active' : '')}
                onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          <div className="results-scroll scroll-y">
            {status === 'running' && <SearchRunning />}

            {status === 'done' && result && tab === 'EVENTS' && (
              <>
                <Timeline buckets={result.timeline} />
                <div className="results-toolbar">
                  <div className="results-toolbar-left">
                    <span className="results-tool">
                      Show:
                      <select className="results-select" value={perPage}
                        onChange={(e) => { setPerPage(+e.target.value); setPage(1); }}>
                        {[20, 50, 100].map((n) => <option key={n} value={n}>{n} Per Page</option>)}
                      </select>
                    </span>
                  </div>
                  <Pager page={page} totalPages={totalPages} onPage={setPage} />
                </div>
                <div className="events">
                  <div className="events-head">
                    <span className="events-col-i">i</span>
                    <span className="events-col-time">Time</span>
                    <span className="events-col-event">Event</span>
                  </div>
                  {pageEvents.map((ev, i) => (
                    <EventRow key={ev._time + '_' + i} ev={ev} n={(page - 1) * perPage + i + 1} />
                  ))}
                </div>
              </>
            )}

            {status === 'done' && result && tab === 'STATISTICS' && (
              <StatsView result={result} />
            )}
            {status === 'done' && result && tab === 'VISUALIZATION' && (
              <VizView buckets={result.timeline} />
            )}
            {status === 'idle' && <EmptyState />}
            {status === 'error' && <ErrorState message={error} />}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Pager({ page, totalPages, onPage }) {
  const nums = [];
  for (let i = 1; i <= Math.min(totalPages, 8); i++) nums.push(i);
  return (
    <div className="pager">
      <button className="pager-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {nums.map((n) => (
        <button key={n} className={'pager-num' + (n === page ? ' is-active' : '')} onClick={() => onPage(n)}>{n}</button>
      ))}
      {totalPages > 8 && <span className="pager-ellipsis">…</span>}
      <button className="pager-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}

function SearchRunning() {
  return (
    <div className="console-loading">
      <div className="console-loading-bars">{Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
      <div className="meta-label">SEARCHING TEMPLAR TELEMETRY…</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="console-empty">
      <div className="console-empty-mark">◈</div>
      <div className="display-heading" style={{ fontSize: 16 }}>NO ACTIVE SEARCH</div>
      <div className="meta-label" style={{ marginTop: 8 }}>WRITE SPL, THEN RUN SEARCH</div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="console-empty">
      <div className="console-empty-mark" style={{ color: 'var(--crimson-bright)' }}>⚠</div>
      <div className="display-heading" style={{ fontSize: 16 }}>SEARCH FAILED</div>
      <div className="meta-label" style={{ marginTop: 8, maxWidth: 480, textAlign: 'center', textTransform: 'none', letterSpacing: 'normal' }}>
        {message}
      </div>
    </div>
  );
}

function StatsView({ result }) {
  if (result.mode !== 'stats') {
    return (
      <div className="console-empty">
        <div className="console-empty-mark">◈</div>
        <div className="display-heading" style={{ fontSize: 16 }}>NO TABULAR RESULTS</div>
        <div className="meta-label" style={{ marginTop: 8 }}>USE stats / chart / timechart TO SEE DATA HERE</div>
      </div>
    );
  }
  const rows = result.rows;
  const cols = result.columns;
  return (
    <div className="stats">
      <table className="stats-table">
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'stats-key' : 'stats-num'}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VizView({ buckets }) {
  const max = Math.max(...buckets);
  return (
    <div className="viz">
      <div className="meta-label" style={{ marginBottom: 14 }}>EVENT VOLUME</div>
      <div className="viz-chart">
        {buckets.map((b, i) => (
          <div key={i} className="viz-bar" style={{ height: `${(b / max) * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

/* ---- icons ---- */
function IconSearch() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>); }
function IconClock() { return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>); }
function IconChevron() { return (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>); }
function IconCheck() { return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--crimson)" strokeWidth="2.4"><path d="M20 6L9 17l-5-5" /></svg>); }
