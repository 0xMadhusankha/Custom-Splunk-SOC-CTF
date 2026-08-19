/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — realtime transport seam
   ------------------------------------------------------------
   This is the ONLY module that knows whether "tell every other
   connected browser" happens via BroadcastChannel (same machine,
   zero-config, today's default) or a real cross-network relay
   (VITE_REALTIME_WS/VITE_REALTIME_HTTP configured). Every consumer
   — mockSplunkService.js, soundLibrary.js — talks to the SAME
   subscribe(fn)/emit(kind, payload) shape either way, so wiring a
   live backend later (Splunk-sourced events, a different relay)
   never means touching those files' business logic again.

   Wire protocol with the relay (see realtime-server/server.js):
     client → server  {type:'hello', since}
     server → client  {type:'snapshot', seq, records, serverTime}
                       {type:'replay', events:[...], serverTime}
                       {type:'publish'|'update'|'delete', seq, uuid,
                        timestamp, serverTime, ...payload}
                       {type:'sound-changed'|'default-sound-changed', ...}

   Every snapshot/replay/live record is re-emitted to subscribers as
   a plain {kind:'publish'|'update'|'delete', ...} message — the EXACT
   shape mockSplunkService.js's applyRemote() already expects, so
   hydration reuses its existing per-record bucketing logic with zero
   new code there.
   ============================================================ */

const WS_URL = import.meta.env.VITE_REALTIME_WS || '';
const HTTP_URL = (import.meta.env.VITE_REALTIME_HTTP || '').replace(/\/$/, '');
const SEQ_KEY = 'templar.realtime.seq';

export function isRemote() { return !!WS_URL; }
export function remoteUrl(path) { return HTTP_URL + path; }

/* ---- auth token plumbing (admin build only; player never sets this) --- */
let tokenGetter = null;
export function setAuthTokenGetter(fn) { tokenGetter = fn; }

/* ---- server clock offset, for honest countdowns on skewed clients ---- */
let clockOffset = 0;
export function getServerNow() { return Date.now() + clockOffset; }
function noteServerTime(t) { if (typeof t === 'number') clockOffset = t - Date.now(); }

/* ---- REST helpers (used by mockSplunkService, soundLibrary, authClient) */
let onUnauthorized = null;
/** Admin build only: called whenever a REST call reveals the session has
    died (expired-by-inactivity, revoked) so the UI can drop back to login
    even mid-action, not just on next page load. */
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (tokenGetter) {
    const tok = tokenGetter();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(HTTP_URL + path, { ...opts, headers, credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    // Prefer the server's own message (e.g. Splunk timeout/unavailable text)
    // over a bare status code, when the error body gives us one.
    let message = `HTTP ${res.status}`;
    try {
      if ((res.headers.get('content-type') || '').includes('application/json')) {
        const body = await res.json();
        if (body?.message) message = body.message;
      }
    } catch { /* body unreadable/not JSON — keep the generic message */ }
    const err = new Error(message); err.status = res.status; throw err;
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res;
}
export const apiGet = (path) => request(path);
export const apiPost = (path, body) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiPatch = (path, body) => request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiDelete = (path) => request(path, { method: 'DELETE' });
export const apiUpload = (path, formData) => request(path, { method: 'POST', body: formData });

/* ============================================================
   Broadcast subscribe/emit — the seam mockSplunkService.js uses
   ============================================================ */
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function fire(msg) { listeners.forEach((fn) => { try { fn(msg); } catch {} }); }

const soundListeners = new Set();
export function subscribeSoundChanges(fn) { soundListeners.add(fn); return () => soundListeners.delete(fn); }
function fireSoundChange() { soundListeners.forEach((fn) => { try { fn(); } catch {} }); }

/* ---- voice transmissions — ephemeral live "play this now for everyone"
   events, separate from the persistent broadcast stream. */
const voiceListeners = new Set();
export function subscribeVoice(fn) { voiceListeners.add(fn); return () => voiceListeners.delete(fn); }
function fireVoice(payload) { voiceListeners.forEach((fn) => { try { fn(payload); } catch {} }); }

/** Organizer-only: push an uploaded voice to every connected operative. */
export async function emitVoice(soundId, title) {
  if (isRemote()) return apiPost('/api/voice', { soundId, title });
  if (localChannel) { try { localChannel.postMessage({ kind: 'voice', soundId, title }); } catch {} }
}

/* ---- local (BroadcastChannel) fallback — unchanged from today ---- */
const localChannel = (!WS_URL && typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('templar-soc-v1') : null;
if (localChannel) localChannel.onmessage = (e) => {
  if (e.data?.kind === 'voice') fireVoice(e.data);
  else fire(e.data);
};

/** Publish a broadcast-domain event to every other connected browser. */
export async function emit(kind, payload) {
  if (isRemote()) {
    if (kind === 'publish') return apiPost('/api/broadcasts', { record: payload.record });
    if (kind === 'update') return apiPatch(`/api/broadcasts/${payload.key}`, { patch: payload.patch });
    if (kind === 'delete') return apiDelete(`/api/broadcasts/${payload.key}`);
    return;
  }
  if (localChannel) { try { localChannel.postMessage({ kind, ...payload }); } catch {} }
}

/** Admin-only: queue a broadcast to fire later, server-side. */
export async function emitSchedule(record, whenMs) {
  if (!isRemote()) return null; // local mode has no server-side scheduler
  return apiPost('/api/broadcasts/schedule', { record, whenMs });
}

/* ============================================================
   WebSocket client — auto-reconnect, seq-tracked recovery
   ============================================================ */
let ws = null;
let backoffMs = 500;
let lastSeq = Number(sessionStorage.getItem(SEQ_KEY) || 0) || 0;

function noteSeq(seq) {
  if (typeof seq !== 'number' || seq <= lastSeq) return;
  lastSeq = seq;
  try { sessionStorage.setItem(SEQ_KEY, String(seq)); } catch {}
}

function applyLiveEvent(evt) {
  noteServerTime(evt.serverTime);
  // Voice transmissions are ephemeral and carry no seq — handle before the
  // seq-dedup below so they always fire (and never mutate broadcast state).
  if (evt.type === 'voice') { fireVoice({ soundId: evt.soundId, title: evt.title }); return; }
  if (evt.type === 'sound-changed' || evt.type === 'default-sound-changed') { fireSoundChange(); return; }
  if (typeof evt.seq === 'number' && evt.seq <= lastSeq) return; // dedup
  noteSeq(evt.seq);
  if (evt.type === 'publish') fire({ kind: 'publish', record: evt.record });
  else if (evt.type === 'update') fire({ kind: 'update', key: evt.key, patch: evt.patch });
  else if (evt.type === 'delete') fire({ kind: 'delete', key: evt.key });
}

function connectWs() {
  if (!WS_URL) return;
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    backoffMs = 500;
    ws.send(JSON.stringify({ type: 'hello', since: lastSeq }));
  };
  ws.onmessage = (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    noteServerTime(msg.serverTime);
    if (msg.type === 'snapshot') {
      noteSeq(msg.seq);
      fire({ kind: 'snapshot', records: msg.records || [] });
    } else if (msg.type === 'replay') {
      for (const evt of msg.events) applyLiveEvent(evt);
    } else {
      applyLiveEvent(msg);
    }
  };
  ws.onclose = () => {
    ws = null;
    setTimeout(connectWs, backoffMs);
    backoffMs = Math.min(backoffMs * 1.7, 15000);
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

if (WS_URL) connectWs();
