/* SETTINGS — session + system info, kept intentionally minimal.
   Logout, signed-in status, and app build info. No raw endpoints or
   technical internals (audio preferences live in the Audio Library). */
import { useOutletContext } from 'react-router-dom';
import { isRemote } from '../../services/realtime.js';

export default function Settings() {
  const { onLogout } = useOutletContext();
  const signedIn = !!onLogout;

  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // MISSION CONTROL</div>
          <h1 className="display-heading surface-title mc-title">SETTINGS</h1>
          <div className="surface-sub">Session and application information.</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><span className="title">SESSION</span></div>
        <div className="admin-rows">
          <div className="admin-row">
            <span className="admin-row-k">STATUS</span>
            <span className="admin-row-v">
              <span className="admin-dot"><span className={'admin-led ' + (signedIn ? 'admin-led--on' : 'admin-led--off')} />{signedIn ? 'Signed in · Organizer' : 'Local mode · no session'}</span>
            </span>
          </div>
          <div className="admin-row">
            <span className="admin-row-k">SESSION POLICY</span>
            <span className="admin-row-v">Stays active until logout or the browser is closed</span>
          </div>
        </div>
        {signedIn && (
          <div className="admin-settings-actions">
            <button className="btn btn--sm admin-logout-btn" onClick={onLogout}>LOGOUT</button>
            <span className="meta-label">Ends the organizer session immediately.</span>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><span className="title">APPLICATION</span></div>
        <div className="admin-rows">
          <div className="admin-row"><span className="admin-row-k">SYSTEM</span><span className="admin-row-v">TEMPLAR SOC — ANIMUS 1.0</span></div>
          <div className="admin-row"><span className="admin-row-k">TERMINAL</span><span className="admin-row-v">Mission Control · Organizer</span></div>
          <div className="admin-row"><span className="admin-row-k">MODE</span><span className="admin-row-v">{isRemote() ? 'Live relay' : 'Offline demo'}</span></div>
        </div>
      </div>
    </div>
  );
}
