/* Broadcast history — the full editable record list with EDIT / DEL /
   PUSH actions. JSX moved verbatim from the original MissionControl.jsx;
   state/handlers now come from the shared context. */
import { BROADCAST_TYPES } from '../../lib/broadcast.js';
import { fmtDateTime, relTime } from '../../lib/format.js';
import { useMissionControl } from '../MissionControlContext.jsx';

export default function BroadcastHistory() {
  const {
    history, editKey, editItem, delItem, pushNow,
    confirmClear, requestClear, cancelClear, runClear, clearScopeCount,
  } = useMissionControl();
  return (
    <section className="mc-history panel">
      <div className="panel-head">
        <span className="title">BROADCAST HISTORY</span>
        {confirmClear ? (
          <div className="mc-clearbar">
            <span className="mc-clear-warn">
              CLEAR {clearScopeCount(confirmClear)} {confirmClear === 'all' ? 'BROADCASTS' : confirmClear === 'alert' ? 'ALERTS' : 'INTEL ITEMS'}?
            </span>
            <button className="mc-mini-btn mc-mini-btn--danger" onClick={runClear}>CONFIRM</button>
            <button className="mc-mini-btn" onClick={cancelClear}>CANCEL</button>
          </div>
        ) : (
          <div className="mc-clearbar">
            <button className="mc-mini-btn" disabled={!clearScopeCount('alert')} onClick={() => requestClear('alert')}>CLEAR ALERTS</button>
            <button className="mc-mini-btn" disabled={!clearScopeCount('intel')} onClick={() => requestClear('intel')}>CLEAR INTEL</button>
            <button className="mc-mini-btn mc-mini-btn--danger" disabled={!history.length} onClick={() => requestClear('all')}>CLEAR ALL</button>
            <span className="mc-history-count meta-label">{history.length} RECORDS</span>
          </div>
        )}
      </div>
      <div className="mc-history-list scroll-y">
        {history.length === 0 && <div className="mc-empty">No broadcasts yet.</div>}
        {history.map((item) => {
          const t = BROADCAST_TYPES[item.btype] || BROADCAST_TYPES.alert;
          return (
            <div key={item._key} className={'mc-hrow' + (item.scheduled ? ' is-sched' : '') + (editKey === item._key ? ' is-editing' : '')}>
              <span className={`mc-htag mc-htag--${t.tone}`}>{t.short}</span>
              <div className="mc-hbody">
                <div className="mc-htitle">{item.title}</div>
                <div className="mc-hmeta meta-label">
                  {item.scheduled
                    ? <span className="mc-sched-in">◷ FIRES {fmtDateTime(item.timestamp)}</span>
                    : <>{relTime(item.timestamp)} · {(item.severity || 'info').toUpperCase()}</>}
                </div>
              </div>
              <div className="mc-hactions">
                {item.scheduled && <button className="mc-mini-btn mc-mini-btn--go" onClick={() => pushNow(item)}>PUSH</button>}
                <button className="mc-mini-btn" onClick={() => editItem(item)}>EDIT</button>
                <button className="mc-mini-btn mc-mini-btn--danger" onClick={() => delItem(item)}>DEL</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
