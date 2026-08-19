/* ============================================================
   ANIMUS 1.0 — MISSION CONTROL — organizer session client
   ------------------------------------------------------------
   Single account, session-only: no registration, no user
   management, no RBAC. Exists purely to stop a player who finds
   the admin URL from getting into Mission Control.

   Access token lives in memory only (a module-level variable —
   lost on a hard refresh by design; restored via silentRefresh()
   using the relay's HttpOnly refresh cookie). The refresh cookie
   itself carries a SERVER-SIDE sliding inactivity window: as long
   as this module keeps calling /api/auth/refresh while the tab is
   visible, the session stays alive; stop, and it genuinely expires.

   Only ever used when a relay is configured (isRemote()) — with no
   relay, admin.jsx skips this module entirely and Mission Control
   opens directly, matching today's zero-config local/dev behavior.
   ============================================================ */

import { remoteUrl, setAuthTokenGetter, setUnauthorizedHandler } from '../services/realtime.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // well inside the ~20min access TTL

let accessToken = null;
let refreshTimer = null;
const listeners = new Set();

function emit() { listeners.forEach((fn) => fn(isAuthenticated())); }
export function subscribeAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function isAuthenticated() { return !!accessToken; }

setAuthTokenGetter(() => accessToken);
setUnauthorizedHandler(() => { accessToken = null; stopRefreshLoop(); emit(); });

async function call(path, opts) {
  return fetch(remoteUrl(path), { ...opts, credentials: 'include' });
}

export async function login(username, password) {
  const res = await call('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Invalid credentials.' : 'Login failed.');
  const { token } = await res.json();
  accessToken = token;
  startRefreshLoop();
  emit();
}

/** Silently restore a session across a page refresh using the refresh
    cookie. Returns true if restored, false if the session is gone. */
export async function silentRefresh() {
  try {
    const res = await call('/api/auth/refresh', { method: 'POST' });
    if (!res.ok) { accessToken = null; emit(); return false; }
    const { token } = await res.json();
    accessToken = token;
    startRefreshLoop();
    emit();
    return true;
  } catch {
    accessToken = null; emit(); return false;
  }
}

export async function logout() {
  try { await call('/api/auth/logout', { method: 'POST' }); } catch {}
  accessToken = null;
  stopRefreshLoop();
  emit();
}

function startRefreshLoop() {
  stopRefreshLoop();
  // Runs continuously (no tab-visibility gate) so the organizer's session
  // stays alive as long as the browser tab is open — Mission Control is a
  // long-lived operations console. The session ends only on explicit Logout
  // or when the tab/browser is closed. The 401 fallback (setUnauthorizedHandler
  // above) still drops to login if the server ever genuinely kills the session.
  refreshTimer = setInterval(silentRefresh, REFRESH_INTERVAL_MS);
}
function stopRefreshLoop() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }
