/* Broadcast composer — the Type → Title → Message → Optional Sound →
   Preview → Broadcast workflow. JSX moved verbatim from the original
   MissionControl.jsx composer section; state/handlers now come from the
   shared MissionControlContext so logic is unchanged. */
import { BROADCAST_TYPES, BROADCAST_ORDER, SEVERITIES } from '../../lib/broadcast.js';
import { useMissionControl } from '../MissionControlContext.jsx';
import Field from './Field.jsx';
import IocEditor from './IocEditor.jsx';

export default function Composer() {
  const {
    audio, type, setType, meta, isEmergency, isIntel,
    form, set, setForm, editKey, reset, submit,
    mode, setMode, whenLocal, setWhenLocal, plusMinutes,
    confirmEmerg, setConfirmEmerg,
    attachSound, setAttachSound, sounds, defaultSoundId, onlineCount,
  } = useMissionControl();

  return (
    <section className="mc-composer panel breathe-edge--gold">
      <div className="panel-head">
        <span className="title">{editKey ? 'EDIT BROADCAST' : 'COMPOSE BROADCAST'}</span>
        {editKey && <button className="mc-mini-btn" onClick={reset}>✕ CANCEL EDIT</button>}
        <span className="mc-transmit meta-label">→ {meta.collection}</span>
      </div>

      {/* type selector */}
      <div className="mc-typegrid">
        {BROADCAST_ORDER.map((k) => {
          const t = BROADCAST_TYPES[k];
          return (
            <button
              key={k}
              className={`mc-typechip mc-typechip--${t.tone}` + (type === k ? ' is-active' : '')}
              onClick={() => { setType(k); setConfirmEmerg(false); }}
              title={t.blurb}
            >
              <span className="mc-typechip-dot" />
              {t.short}
            </button>
          );
        })}
      </div>

      <div className="mc-type-blurb meta-label">{meta.blurb}</div>

      {/* form */}
      <form className="mc-form" onSubmit={submit}>
        <Field label={isEmergency ? 'BROADCAST TITLE' : 'TITLE'}>
          <input className="input" value={form.title} onChange={set('title')} placeholder={PLACEHOLDER[type]?.title} />
        </Field>

        {!isEmergency && (
          <div className="mc-row">
            <Field label="SEVERITY">
              <select className="select" value={form.severity} onChange={set('severity')}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
              </select>
            </Field>
            {meta.channel === 'alert'
              ? <Field label="SOURCE SYSTEM"><input className="input" value={form.source} onChange={set('source')} /></Field>
              : <Field label="CLASSIFICATION"><input className="input" value={form.classification} onChange={set('classification')} /></Field>}
          </div>
        )}

        <Field label={isIntel ? 'BRIEFING BODY' : 'MESSAGE'}>
          <textarea className="textarea" rows={isEmergency ? 4 : 6} value={form.body} onChange={set('body')} placeholder={PLACEHOLDER[type]?.body} />
        </Field>

        {type === 'ioc' && <IocEditor value={form.iocs} onChange={(iocs) => setForm((f) => ({ ...f, iocs }))} />}

        {/* optional custom sound — plays for every operative with the notification */}
        {!editKey && (
          <Field label="ATTACH SOUND (OPTIONAL)">
            <div className="mc-attach">
              <select className="select" value={attachSound} onChange={(e) => setAttachSound(e.target.value)}>
                <option value="">— Themed cue (synthesized) —</option>
                {defaultSoundId && <option value={defaultSoundId}>★ Default notification sound</option>}
                {sounds.map((s) => <option key={s.id} value={s.id}>{s.category} · {s.name}</option>)}
              </select>
              {attachSound && <button type="button" className="mc-mini-btn" onClick={() => audio?.playSound(attachSound)}>▶ PREVIEW</button>}
            </div>
          </Field>
        )}

        {/* dispatch controls */}
        {!editKey && (
          <div className="mc-dispatch">
            <div className="mc-modeseg">
              <button type="button" className={'mc-modebtn' + (mode === 'now' ? ' is-active' : '')} onClick={() => setMode('now')}>▶ PUSH IMMEDIATELY</button>
              <button type="button" className={'mc-modebtn' + (mode === 'schedule' ? ' is-active' : '')} onClick={() => setMode('schedule')}>◷ SCHEDULE</button>
            </div>
            {mode === 'schedule' && (
              <div className="mc-schedrow">
                <input className="input mc-when" type="datetime-local" value={whenLocal} onChange={(e) => setWhenLocal(e.target.value)} />
                <div className="mc-quick">
                  {[1, 5, 15].map((m) => <button type="button" key={m} className="mc-mini-btn" onClick={() => setWhenLocal(plusMinutes(m))}>+{m}m</button>)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mc-actions">
          {isEmergency && confirmEmerg && !editKey ? (
            <>
              <button className="btn btn--primary mc-emerg-confirm" type="submit">⚠ CONFIRM — BROADCAST NOW</button>
              <button className="btn btn--sm" type="button" onClick={() => setConfirmEmerg(false)}>CANCEL</button>
            </>
          ) : (
            <button className={'btn btn--primary' + (isEmergency ? ' mc-btn-emerg' : '')} type="submit">
              {editKey ? '✓ SAVE CHANGES' : mode === 'schedule' ? '◷ SCHEDULE BROADCAST' : `▶ PUBLISH ${meta.short}`}
            </button>
          )}
          <span className="mc-target meta-label">{editKey ? 'EDIT MODE' : mode === 'schedule' ? 'QUEUED · NOT YET LIVE' : `${onlineCount} OPERATIVES · LIVE`}</span>
        </div>
      </form>
    </section>
  );
}

const PLACEHOLDER = {
  alert:          { title: 'e.g. Beacon activity observed — WEBPUB-01', body: 'Describe the detection in SOC language…' },
  emergency:      { title: 'e.g. ROGUE PRESENCE CONFIRMED', body: 'Short, high-impact message to every operative…' },
  intel:          { title: 'e.g. CLASSIFIED ASSESSMENT — Faction Attribution', body: 'Write the classified assessment…' },
  ioc:            { title: 'e.g. IOC UPDATE — C2 Infrastructure', body: 'Context for these indicators…' },
  campaign:       { title: 'e.g. CAMPAIGN INTELLIGENCE — Rogue Assassin', body: 'Adversary campaign and tradecraft…' },
  tactical:       { title: 'e.g. TACTICAL GUIDANCE — Reconstruct the Beacon', body: 'Direct guidance for operatives…' },
  infrastructure: { title: 'e.g. INFRASTRUCTURE CHANGE — Web Tier', body: 'What changed in the estate…' },
};
