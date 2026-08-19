/* Extracted verbatim from the original MissionControl.jsx — logic unchanged. */
export default function IocEditor({ value, onChange }) {
  const rows = value.length ? value : [{ type: 'domain', value: '' }];
  function upd(i, patch) { onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function add() { onChange([...rows, { type: 'ip', value: '' }]); }
  function rm(i) { onChange(rows.filter((_, idx) => idx !== i)); }
  return (
    <div className="mc-ioc">
      <label className="field-label">INDICATORS OF COMPROMISE</label>
      {rows.map((r, i) => (
        <div key={i} className="mc-ioc-row">
          <select className="select mc-ioc-type" value={r.type} onChange={(e) => upd(i, { type: e.target.value })}>
            {['domain', 'ip', 'hash', 'url', 'email'].map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
          <input className="input" value={r.value} onChange={(e) => upd(i, { value: e.target.value })} placeholder="indicator value…" />
          <button type="button" className="mc-mini-btn mc-mini-btn--danger" onClick={() => rm(i)}>✕</button>
        </div>
      ))}
      <button type="button" className="mc-mini-btn" onClick={add}>+ ADD INDICATOR</button>
    </div>
  );
}
