/* ============================================================
   LOGIN — the threshold into the captured SOC.
   Players arrive here with credentials recovered from the AD
   breach. Copy reinforces that these are compromised Templar
   credentials being used by intruders. Real auth: the fields start
   empty (never pre-fill a real credential value into the DOM), wrong
   credentials show an inline error, and only a genuine successful
   login plays the boot sequence before handing off to the console.
   ============================================================ */

import { useState } from 'react';
import TemplarCross from '../components/brand/TemplarCross.jsx';
import { login } from '../playerAuthClient.js';
import './Login.css';

const BOOT = [
  'ESTABLISHING SECURE CHANNEL // ERUDITO_NETWORK',
  'VALIDATING RECOVERED CREDENTIALS...',
  'CREDENTIAL SET ACCEPTED — TEMPLAR SOC',
  'ELEVATING SESSION // ANIMUS SYNC',
  'ACCESS GRANTED',
];

export default function Login({ onAuthenticated }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [line, setLine] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy || !user || !pass) return;
    setBusy(true); setError('');
    try {
      await login(user, pass);
    } catch (err) {
      setError(err.message || 'Login failed.');
      setBusy(false);
      return;
    }
    let i = 0;
    const tick = () => {
      setLine(BOOT[i]);
      i += 1;
      if (i < BOOT.length) setTimeout(tick, 520);
      else setTimeout(() => onAuthenticated?.(), 650);
    };
    tick();
  }

  return (
    <div className="login">
      <div className="login-panel panel">
        <div className="login-scanline" />
        <div className="login-crest">
          <TemplarCross size={78} />
        </div>
        <div className="login-title display-heading">TEMPLAR SOC</div>
        <div className="login-sub">SECURITY OPERATIONS CENTER // ANIMUS 1.0</div>

        <div className="login-classified">
          <span className="sev sev--critical">CLASSIFIED</span>
          <span className="login-classified-text">TEMPLAR ORDER — AUTHORIZED PERSONNEL ONLY</span>
        </div>

        <form className="login-form" onSubmit={submit}>
          <div>
            <label className="field-label">OPERATOR CREDENTIAL</label>
            <input className="input" value={user} onChange={(e) => setUser(e.target.value)} autoFocus spellCheck={false} disabled={busy} />
          </div>
          <div>
            <label className="field-label">AUTHENTICATION KEY</label>
            <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} disabled={busy} />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn--primary login-submit" type="submit" disabled={busy}>
            {busy ? 'SYNCHRONIZING…' : 'INITIATE SYNC'}
          </button>
        </form>

        {busy && (
          <div className="login-boot mono">
            <span className="login-boot-dot" /> {line}
          </div>
        )}

        <div className="login-notice">
          <span className="crimson">SECURITY NOTICE —</span> Unauthorized access detected.
          Compromised privileged credentials originating from the Domain Controller incident
          remain active. All sessions are logged and monitored.
        </div>
      </div>

      <div className="login-footer meta-label">
        ERUDITO_NETWORK // UDR_SECTOR &nbsp;·&nbsp; SYNC_PORT :: 07 &nbsp;·&nbsp; © TEMPLAR ORDER — MMXXVI
      </div>
    </div>
  );
}
