/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — player session client
   ------------------------------------------------------------
   Mirrors src/admin/authClient.js exactly, for the single shared
   "recovered" operator credential that gates the whole player app.
   Access token lives in memory only (module-level var, lost on a
   hard refresh by design; restored via silentRefresh() using the
   relay's HttpOnly player refresh cookie). Only ever used when a
   relay is configured (isRemote()) — with no relay, App.jsx skips
   this module entirely and the console opens directly, matching
   local/dev/offline-demo behavior.
   ============================================================ */

import { remoteUrl, setAuthTokenGetter, setUnauthorizedHandler } from './services/realtime.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // well inside the access TTL

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
  const res = await call('/api/player-auth/login', {
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
    const res = await call('/api/player-auth/refresh', { method: 'POST' });
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
  try { await call('/api/player-auth/logout', { method: 'POST' }); } catch {}
  accessToken = null;
  stopRefreshLoop();
  emit();
}

function startRefreshLoop() {
  stopRefreshLoop();
  // Runs continuously while the tab is open, same rationale as the
  // organizer session — a competition is a long-lived, active console,
  // not a quick task. Session ends on explicit logout, tab close, or the
  // server's own inactivity window lapsing (401 fallback above).
  refreshTimer = setInterval(silentRefresh, REFRESH_INTERVAL_MS);
}
function stopRefreshLoop() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }
