/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — MockSplunkService
   In-memory implementation of the SplunkService contract. Adds
   artificial latency so the UI exercises real loading/streaming
   states exactly as it will against Splunk's async search jobs.

   Mission Control operations (publish / schedule / edit / delete /
   connected sessions) are modelled here so the control room is
   fully live against mock data. Each maps 1:1 to a Splunk KV-store
   operation documented in splunkService.js.

   Realtime transport is delegated entirely to services/realtime.js
   (BroadcastChannel locally, a real relay when configured) — this
   file never touches WebSocket/BroadcastChannel directly, and its
   own severity/category/commit business logic never changes based
   on which transport is active.
   ============================================================ */

import { SplunkService } from './splunkService.js';
import {
  WEB_EVENTS, TIMELINE, TOTAL_EVENTS, SEED_ALERTS, SEED_EMERGENCY,
  SEED_INTEL, SESSION,
} from './mockData.js';
import { BROADCAST_TYPES, resolveType } from '../lib/broadcast.js';
import { resolveTimeRange } from '../lib/timeRange.js';
import {
  subscribe as rtSubscribe, emit as rtEmit, emitSchedule as rtEmitSchedule,
  emitVoice as rtEmitVoice, isRemote, apiGet, apiPost,
} from './realtime.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));

// Live, mutable copies so Mission Control publishes are reflected app-wide.
// In remote mode, start EMPTY rather than seeded — a live event shouldn't
// briefly flash fake demo fixtures before the relay's snapshot arrives.
// Local/no-relay mode keeps the seed fixtures for a good offline demo.
let alerts = isRemote() ? [] : clone(SEED_ALERTS);
let emergency = isRemote() ? null : clone(SEED_EMERGENCY);
let intel = isRemote() ? [] : clone(SEED_INTEL);
let scheduled = []; // local-mode-only queue awaiting fire time (see scheduleBroadcast)
let seq = 1000;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

/* Shape a finalized broadcast record — pure, no side effects. Used both
   for immediate publish (commit()) and for scheduling, where the relay
   needs an already-finalized record it can hold and re-broadcast verbatim
   without ever needing to know what a "campaign update" is. */
function shapeRecord(btype, rec) {
  const meta = BROADCAST_TYPES[btype] || BROADCAST_TYPES.alert;
  const base = { _key: rec._key || `pub-${++seq}`, timestamp: rec.timestamp || Date.now(), btype, source: 'MISSION_CONTROL' };
  if (meta.channel === 'alert') {
    const severity = btype === 'emergency' ? 'emergency' : (rec.severity || 'high');
    return { ...base, status: 'open', severity, ...stripMeta(rec), btype, severity };
  }
  return {
    ...base, category: meta.category, classification: rec.classification || 'TEMPLAR // RESTRICTED',
    severity: rec.severity || 'high', iocs: rec.iocs || [], ...stripMeta(rec), btype, category: meta.category,
  };
}
// keep control-only fields out of the stored record
function stripMeta(rec) { const { _key, timestamp, btype, ...rest } = rec; return rest; }

/* Make a finalized record LIVE in the appropriate local collection. */
function applyPublish(record) {
  const meta = BROADCAST_TYPES[resolveType(record)] || BROADCAST_TYPES.alert;
  if (meta.channel === 'alert') {
    if (record.severity === 'emergency') emergency = record;
    else alerts = [record, ...alerts.filter((a) => a._key !== record._key)];
  } else {
    intel = [record, ...intel.filter((i) => i._key !== record._key)];
  }
}

/* commit(): shape + make live + return — used for immediate publish. */
function commit(btype, rec) {
  const record = shapeRecord(btype, rec);
  applyPublish(record);
  return record;
}

/* ---- realtime bridge: apply an incoming transport message -----------
   Same shape whether it arrived over BroadcastChannel (local) or the
   relay's WebSocket (remote) — see services/realtime.js. */
function hasKey(key) { return [emergency, ...alerts, ...intel].some((x) => x && x._key === key); }

function applyRemote(msg) {
  if (!msg) return;
  if (msg.kind === 'snapshot') {
    // full-state hydration: replace local mirrors with the relay's truth
    // instead of only ever showing the bundled seed fixtures.
    alerts = []; intel = []; emergency = null;
    for (const record of msg.records || []) applyPublish(record);
    notify();
    return;
  }
  if (msg.kind === 'publish') {
    const r = msg.record;
    if (!r || hasKey(r._key)) return;
    applyPublish(r);
    notify();
  } else if (msg.kind === 'update') {
    const apply = (x) => (x && x._key === msg.key ? { ...x, ...msg.patch } : x);
    alerts = alerts.map(apply); intel = intel.map(apply);
    if (emergency && emergency._key === msg.key) emergency = { ...emergency, ...msg.patch };
    notify();
  } else if (msg.kind === 'delete') {
    alerts = alerts.filter((x) => x._key !== msg.key);
    intel = intel.filter((x) => x._key !== msg.key);
    if (emergency && emergency._key === msg.key) emergency = null;
    notify();
  }
}
rtSubscribe(applyRemote);

/* ---- Connected operative sessions (mock presence) ------------------- */
const CODENAMES = [
  'HORUS', 'RAVEN', 'OSIRIS', 'VESPER', 'ATLAS', 'CIPHER', 'NOMAD', 'ORACLE',
  'PHANTOM', 'SABLE', 'WRAITH', 'HALCYON', 'ONYX', 'KESTREL', 'VANGUARD',
];
let players = CODENAMES.map((cn, i) => ({
  id: `AID-${(0x7f3c00 + i * 977).toString(16).toUpperCase()}`,
  codename: cn,
  node: i % 3 === 0 ? 'UDR_SECTOR' : i % 3 === 1 ? 'ERUDITO_NET' : 'ABSTERGO_LNK',
  surface: ['console', 'alerts', 'intel'][i % 3],
  latencyMs: 20 + ((i * 13) % 90),
  online: i < 14, // one seat empty for texture
  since: Date.now() - (i * 137000),
}));

/* Local-mode-only scheduler: fires scheduled items on a client timer.
   In remote mode the RELAY owns scheduling (server.js's own setInterval)
   so it survives the organizer's tab closing — this local timer would
   otherwise double-fire the same broadcast, so it only runs locally. */
function flushScheduled() {
  const now = Date.now();
  const due = scheduled.filter((s) => s.whenMs <= now);
  if (!due.length) return;
  scheduled = scheduled.filter((s) => s.whenMs > now);
  for (const s of due) {
    const record = commit(s.btype, { ...s.rec, timestamp: now });
    rtEmit('publish', { record });
  }
  notify();
}
if (!isRemote()) setInterval(flushScheduled, 1000);

/** Map the relay's scheduled-queue shape onto today's local shape. */
function mapRemoteScheduled(list) {
  return list.map((r) => ({ _key: r.key, btype: r.btype, whenMs: r.whenMs, ...r.record, status: 'scheduled' }));
}

/* ---- time anchor for real search(): the dataset is frozen, so the
   relay's answer (its latest indexed _time) is cached for the session
   once it succeeds — never touched in local/demo mode. */
let anchorPromise = null;
async function getTimeAnchor() {
  if (!isRemote()) return Date.now();
  if (!anchorPromise) {
    anchorPromise = apiGet('/api/search/anchor')
      .then((r) => r.latestEventTime)
      .catch((e) => { anchorPromise = null; throw e; });
  }
  try { return await anchorPromise; } catch { return Date.now(); }
}

export class MockSplunkService extends SplunkService {
  /** Subscribe to publish events (used by the notification poller). */
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  async search(spl, timeRange) {
    if (isRemote()) {
      const anchor = await getTimeAnchor();
      const { earliestMs, latestMs } = resolveTimeRange(timeRange, anchor);
      return apiPost('/api/search', { spl, earliestMs, latestMs, timeRange });
    }

    await delay(650 + Math.random() * 500);
    const q = (spl || '').toLowerCase();
    let events = WEB_EVENTS;
    if (q.includes('stats') || q.includes('| stats')) {
      const stats = [
        { field: 'assets.windowslive-cdn.net', count: 1841 },
        { field: 'update.microsoft-telemetry.net', count: 212 },
        { field: 'ocsp.templar-pki.local', count: 96 },
      ];
      return {
        mode: 'stats',
        columns: ['dest_host', 'count'],
        rows: stats.map((s) => [s.field, s.count]),
        timeline: TIMELINE,
        meta: { total: TOTAL_EVENTS, spl, timeRange, dispatched: Date.now() },
      };
    }
    return {
      mode: 'events',
      events: clone(events),
      timeline: TIMELINE,
      meta: {
        total: TOTAL_EVENTS, scanned: TOTAL_EVENTS, spl, timeRange,
        dispatched: Date.now(), before: '6/25/26 10:12:52.000 AM',
      },
    };
  }

  async getAlerts()      { await delay(280); return clone({ alerts, emergency }); }
  async getThreatIntel() { await delay(280); return clone(intel); }

  /* ---- publishing ------------------------------------------------ */

  async publishAlert(rec) {
    await delay(320);
    const btype = rec.severity === 'emergency' ? 'emergency' : 'alert';
    const record = commit(btype, rec);
    notify(); rtEmit('publish', { record });
    return clone(record);
  }

  async publishIntel(rec) {
    await delay(320);
    const btype = resolveType({ category: rec.category });
    const record = commit(btype, rec);
    notify(); rtEmit('publish', { record });
    return clone(record);
  }

  /** Generic Mission Control publish, dispatched by broadcast type. */
  async publishBroadcast(btype, rec) {
    await delay(320);
    const record = commit(btype, rec);
    notify(); rtEmit('publish', { record });
    return clone(record);
  }

  /* ---- scheduling ------------------------------------------------ */

  async scheduleBroadcast(btype, rec, whenMs) {
    await delay(200);
    if (isRemote()) {
      // relay owns firing this — survives the organizer's tab closing
      const record = shapeRecord(btype, rec);
      await rtEmitSchedule(record, whenMs);
      return clone({ ...record, whenMs, status: 'scheduled' });
    }
    const item = { _key: `sch-${++seq}`, btype, rec: stripMeta(rec), whenMs };
    scheduled = [...scheduled, item];
    notify();
    return clone({ ...item, status: 'scheduled' });
  }

  async getScheduled() {
    if (isRemote()) {
      try { const { scheduled: remote } = await apiGet('/api/broadcasts/scheduled'); return clone(mapRemoteScheduled(remote)); }
      catch { /* not authenticated (player build) or relay unreachable — no queue to show */ return []; }
    }
    await delay(120);
    return clone(scheduled.map((s) => ({ _key: s._key, btype: s.btype, whenMs: s.whenMs, ...s.rec, status: 'scheduled' })));
  }

  /* ---- unified broadcast history + edit/delete ------------------- */

  /** Normalized view across both collections + the scheduled queue. */
  async getBroadcasts() {
    await delay(200);
    const live = [emergency, ...alerts, ...intel].filter(Boolean).map((r) => ({
      _key: r._key,
      btype: resolveType(r),
      title: r.title,
      body: r.body,
      severity: r.severity,
      category: r.category ?? null,
      classification: r.classification ?? null,
      timestamp: r.timestamp,
      status: r.status || 'published',
      scheduled: false,
    }));
    let queued;
    if (isRemote()) {
      try { const { scheduled: remote } = await apiGet('/api/broadcasts/scheduled'); queued = mapRemoteScheduled(remote).map((q) => ({ ...q, scheduled: true })); }
      catch { queued = []; }
    } else {
      queued = scheduled.map((s) => ({
        _key: s._key, btype: s.btype, title: s.rec.title, body: s.rec.body,
        severity: s.rec.severity ?? null, category: BROADCAST_TYPES[s.btype]?.category ?? null,
        classification: s.rec.classification ?? null, timestamp: s.whenMs,
        status: 'scheduled', scheduled: true,
      }));
    }
    return clone([...queued, ...live].sort((a, b) => b.timestamp - a.timestamp));
  }

  async updateBroadcast(key, patch) {
    await delay(220);
    const apply = (r) => (r && r._key === key ? { ...r, ...patch } : r);
    alerts = alerts.map(apply);
    intel = intel.map(apply);
    if (emergency && emergency._key === key) emergency = { ...emergency, ...patch };
    scheduled = scheduled.map((s) => (s._key === key ? { ...s, rec: { ...s.rec, ...patch }, whenMs: patch.whenMs ?? s.whenMs } : s));
    notify(); rtEmit('update', { key, patch });
    return clone({ _key: key, ...patch });
  }

  async deleteBroadcast(key) {
    await delay(200);
    alerts = alerts.filter((r) => r._key !== key);
    intel = intel.filter((r) => r._key !== key);
    scheduled = scheduled.filter((s) => s._key !== key);
    if (emergency && emergency._key === key) emergency = null;
    notify(); rtEmit('delete', { key });
    return { ok: true, _key: key };
  }

  /* ---- connected operatives -------------------------------------- */

  async getConnectedPlayers() {
    await delay(160);
    // light churn so the roster feels live
    players = players.map((p) => ({ ...p, latencyMs: Math.max(14, p.latencyMs + Math.round((Math.random() - 0.5) * 16)) }));
    return clone(players);
  }

  /* ---- notification poller feed ---------------------------------- */

  async pollLatest() {
    const newestAlert = [emergency, ...alerts].filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)[0];
    const newestIntel = [...intel].sort((a, b) => b.timestamp - a.timestamp)[0];
    return clone({
      alert: newestAlert ? { _key: newestAlert._key, timestamp: newestAlert.timestamp, severity: newestAlert.severity, title: newestAlert.title, btype: resolveType(newestAlert), soundId: newestAlert.soundId ?? null } : null,
      intel: newestIntel ? { _key: newestIntel._key, timestamp: newestIntel.timestamp, severity: newestIntel.severity, title: newestIntel.title, category: newestIntel.category, btype: resolveType(newestIntel), soundId: newestIntel.soundId ?? null } : null,
    });
  }

  async getSession() { await delay(120); return clone(SESSION); }

  /* ---- voice transmission (organizer → all operatives, background play) --
     Fire-and-forget: reaches players over the same realtime transport as
     broadcasts, but as an ephemeral event that plays a sound only. */
  async pushVoice(soundId, title) {
    if (!soundId) return { ok: false };
    await rtEmitVoice(soundId, title);
    return { ok: true };
  }
}
