/* ============================================================
   ADMIN LOGIN — the one gate into Mission Control.
   Built entirely from existing primitives (.panel, .input, .btn,
   TemplarCross, the same "CLASSIFIED — TEMPLAR ORDER" register the
   player Login.jsx already uses) — no new design system. Real auth:
   wrong credentials show an inline error, nothing theatrical.
   ============================================================ */

import { useState } from 'react';
import TemplarCross from '../components/brand/TemplarCross.jsx';
import { login } from './authClient.js';
import './admin-login.css';

export default function AdminLogin({ onAuthenticated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy || !username || !password) return;
    setBusy(true); setError('');
    try {
      await login(username, password);
      onAuthenticated?.();
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-panel panel">
        <div className="admin-login-crest"><TemplarCross size={64} tone="gold" /></div>
        <div className="admin-login-title display-heading">MISSION CONTROL</div>
        <div className="admin-login-sub">ORGANIZER TERMINAL // ANIMUS 1.0</div>

        <div className="admin-login-classified">
          <span className="sev sev--critical">RESTRICTED</span>
          <span className="admin-login-classified-text">TEMPLAR ORDER — SENIOR ANALYST ACCESS ONLY</span>
        </div>

        <form className="admin-login-form" onSubmit={submit}>
          <div>
            <label className="field-label">USERNAME</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus disabled={busy} spellCheck={false} />
          </div>
          <div>
            <label className="field-label">PASSWORD</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </div>
          {error && <div className="admin-login-error">{error}</div>}
          <button className="btn btn--primary admin-login-submit" type="submit" disabled={busy}>
            {busy ? 'AUTHENTICATING…' : 'ACCESS MISSION CONTROL'}
          </button>
        </form>
      </div>
    </div>
  );
}
