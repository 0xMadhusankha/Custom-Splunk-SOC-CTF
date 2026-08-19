/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — realtime relay
   ------------------------------------------------------------
   Pure transport layer: broadcast fan-out, sound file storage,
   single-organizer auth, and an activity log. NEVER investigation/
   Splunk business logic — the client (mockSplunkService.js) still
   owns every severity/category rule; this service just stores a
   fully-finalized record verbatim and relays it to everyone.

   WebSocket is public + read-only for everyone (players AND the
   organizer just subscribe — it never carries a mutation). Every
   broadcast REST POST/PATCH/DELETE requires the organizer's bearer
   token. Broadcast GET routes are public except the scheduled queue,
   which would spoil future content if players could read it. The
   Splunk search proxy requires a logged-in player (or organizer)
   session — see the PLAYER AUTH section below.
   ============================================================ */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

import {
  bootstrapAdmin, nextSeq, saveBroadcast, loadBroadcasts, deleteBroadcastRow,
  saveSound, loadSounds, deleteSoundRow, getSoundRow, getMeta, setMeta,
  audit, loadAudit, logSearch, SOUND_DIR,
} from './db.js';
import {
  verifyCredentials, issueAccessToken, issueRefreshToken, rotateRefreshToken,
  revokeRefreshToken, setRefreshCookie, clearRefreshCookie, requireAuth,
  auditFromReq, REFRESH_COOKIE,
  verifyPlayerCredentials, issuePlayerAccessToken, issuePlayerRefreshToken,
  rotatePlayerRefreshToken, revokePlayerRefreshToken, setPlayerRefreshCookie,
  clearPlayerRefreshCookie, requirePlayerAuth, PLAYER_REFRESH_COOKIE,
} from './auth.js';
import { runSearch, getLatestEventTime, isSplunkHealthy } from './splunk.js';
import { originGuard, searchGuard, loginRateLimit } from './searchGuard.js';

const PORT = process.env.PORT || 8787;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

bootstrapAdmin();

/* ---- in-memory mirrors, loaded from SQLite on boot ---- */
const broadcasts = new Map(); // key -> row {key,uuid,seq,btype,record,timestamp,scheduled,whenMs}
for (const row of loadBroadcasts()) {
  broadcasts.set(row.key, { key: row.key, uuid: row.uuid, seq: row.seq, btype: row.btype, record: row.record, timestamp: row.timestamp, scheduled: row.scheduled, whenMs: row.when_ms });
}
let currentSeq = parseInt(getMeta('seq_counter') || '0', 10);

function liveRecords() {
  return [...broadcasts.values()].filter((r) => !r.scheduled).sort((a, b) => a.seq - b.seq).map((r) => r.record);
}
function scheduledRecords() {
  return [...broadcasts.values()].filter((r) => r.scheduled).sort((a, b) => a.whenMs - b.whenMs)
    .map((r) => ({ key: r.key, uuid: r.uuid, btype: r.btype, record: r.record, whenMs: r.whenMs }));
}

/* ---- origin allowlist (defense-in-depth, separate from CORS headers) ----
   CORS only controls whether a BROWSER exposes a cross-origin response to
   JS — it does not stop any other client from calling the API. This
   middleware explicitly rejects browser requests carrying an Origin header
   we don't recognize. Requests with no Origin (server-to-server, curl) are
   a login/JWT problem, not an Origin-header problem — Origin is trivially
   spoofable by non-browser clients anyway. */
function originAllowlist(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'origin not allowed' });
  }
  next();
}

const app = express();
// Exactly ONE trusted proxy hop (nginx on localhost). NOT `true`/`all`:
// trusting all proxies makes req.ip the left-most X-Forwarded-For entry,
// which the client fully controls — letting anyone spoof their IP and slip
// every per-IP rate limit. With `1`, req.ip is the address nginx actually
// saw (its appended right-most XFF entry), i.e. the real client.
app.set('trust proxy', 1);
app.disable('x-powered-by'); // don't advertise the stack
app.use(originAllowlist);
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, seq: currentSeq }));

/* ============================================================
   AUTH
   ============================================================ */
app.post('/api/auth/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (!verifyCredentials(username, password)) {
    audit('login_failed', username, req.ip);
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const accessToken = issueAccessToken();
  const { token: refreshToken, expiresAt } = issueRefreshToken();
  setRefreshCookie(res, refreshToken, expiresAt);
  audit('login', username, req.ip);
  res.json({ token: accessToken });
});

app.post('/api/auth/refresh', (req, res) => {
  const old = req.cookies?.[REFRESH_COOKIE];
  const rotated = rotateRefreshToken(old);
  if (!rotated) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'session expired' });
  }
  setRefreshCookie(res, rotated.token, rotated.expiresAt);
  res.json({ token: issueAccessToken() });
});

app.post('/api/auth/logout', (req, res) => {
  revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  audit('logout', null, req.ip);
  res.json({ ok: true });
});

app.get('/api/auth/audit', requireAuth, (_req, res) => {
  res.json({ entries: loadAudit(100) });
});

/* ============================================================
   PLAYER AUTH — a single shared "recovered" operator credential
   gates the whole player app. Same JWT/refresh-cookie shape as
   organizer auth (see auth.js), separate cookie name/path so the
   two sessions never collide, and a much longer inactivity window
   since this is a multi-hour competition shared by many teams at
   once (each browser gets its own refresh-token row).
   ============================================================ */
app.post('/api/player-auth/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (!verifyPlayerCredentials(username, password)) {
    audit('player_login_failed', username, req.ip);
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const accessToken = issuePlayerAccessToken();
  const { token: refreshToken, expiresAt } = issuePlayerRefreshToken();
  setPlayerRefreshCookie(res, refreshToken, expiresAt);
  audit('player_login', username, req.ip);
  res.json({ token: accessToken });
});

app.post('/api/player-auth/refresh', (req, res) => {
  const old = req.cookies?.[PLAYER_REFRESH_COOKIE];
  const rotated = rotatePlayerRefreshToken(old);
  if (!rotated) {
    clearPlayerRefreshCookie(res);
    return res.status(401).json({ error: 'session expired' });
  }
  setPlayerRefreshCookie(res, rotated.token, rotated.expiresAt);
  res.json({ token: issuePlayerAccessToken() });
});

app.post('/api/player-auth/logout', (req, res) => {
  revokePlayerRefreshToken(req.cookies?.[PLAYER_REFRESH_COOKIE]);
  clearPlayerRefreshCookie(res);
  audit('player_logout', null, req.ip);
  res.json({ ok: true });
});

/* ============================================================
   SPLUNK SEARCH PROXY — requires a valid player (or organizer)
   session on top of the searchGuard's Origin/rate-limit checks.
   Generic pass-through — see splunk.js/searchGuard.js for the
   "why" behind the guard layer and the mode-detection rule.
   ============================================================ */
function safeLogSearch(row) {
  try { logSearch(row); } catch (e) { console.error('[templar-relay] search_log insert failed', e); }
}

app.get('/api/search/anchor', originGuard(ALLOWED_ORIGINS), requirePlayerAuth, async (_req, res) => {
  if (!isSplunkHealthy()) {
    return res.status(503).json({ error: 'SPLUNK_UNAVAILABLE', message: 'Splunk is currently unavailable — please try again shortly.' });
  }
  const latestEventTime = await getLatestEventTime();
  res.json({ latestEventTime });
});

app.post('/api/search', originGuard(ALLOWED_ORIGINS), requirePlayerAuth, searchGuard, async (req, res) => {
  const { spl, earliestMs, latestMs, timeRange } = req.body || {};

  if (!isSplunkHealthy()) {
    safeLogSearch({ spl, earliestMs, latestMs, status: 'unreachable', ip: req.ip });
    return res.status(503).json({ error: 'SPLUNK_UNAVAILABLE', message: 'Splunk is currently unavailable — please try again shortly.' });
  }

  try {
    const { result, durationMs } = await runSearch(spl, { earliestMs, latestMs, timeRangeLabel: timeRange });
    safeLogSearch({ spl, earliestMs, latestMs, status: 'ok', mode: result.mode, resultCount: result.meta?.total, durationMs, ip: req.ip });
    res.json(result);
  } catch (err) {
    const code = err.code || 'SPLUNK_UNREACHABLE';
    const status = code === 'SPL_ERROR' ? 400 : code === 'SPLUNK_TIMEOUT' ? 504 : 502;
    safeLogSearch({ spl, earliestMs, latestMs, status: code.toLowerCase(), ip: req.ip });
    res.status(status).json({ error: code, message: err.message });
  }
});

/* ============================================================
   BROADCASTS — the relay never inspects severity/category/etc.
   It stores whatever fully-finalized record the client sends and
   relays it verbatim.
   ============================================================ */
app.get('/api/broadcasts', (_req, res) => {
  res.json({ seq: currentSeq, serverTime: Date.now(), records: liveRecords() });
});

// admin-only: reading the scheduled queue would spoil future content
app.get('/api/broadcasts/scheduled', requireAuth, (_req, res) => {
  res.json({ scheduled: scheduledRecords() });
});

app.post('/api/broadcasts', requireAuth, (req, res) => {
  const record = req.body?.record;
  if (!record || !record._key) return res.status(400).json({ error: 'record._key required' });
  const seq = nextSeq(); currentSeq = seq;
  const uuid = crypto.randomUUID();
  const row = { key: record._key, uuid, seq, btype: record.btype || 'alert', record, timestamp: record.timestamp || Date.now(), scheduled: false, whenMs: null };
  broadcasts.set(row.key, row);
  saveBroadcast({ key: row.key, uuid, seq, btype: row.btype, record_json: JSON.stringify(record), timestamp: row.timestamp, scheduled: 0, when_ms: null, created_at: Date.now() });
  auditFromReq(req, 'publish', record.title);
  broadcast({ type: 'publish', seq, uuid, timestamp: row.timestamp, record });
  res.json({ ok: true, seq, uuid });
});

app.post('/api/broadcasts/schedule', requireAuth, (req, res) => {
  const { record, whenMs } = req.body || {};
  if (!record || !record._key || !whenMs) return res.status(400).json({ error: 'record and whenMs required' });
  const uuid = crypto.randomUUID();
  const row = { key: record._key, uuid, seq: 0, btype: record.btype || 'alert', record, timestamp: record.timestamp || Date.now(), scheduled: true, whenMs };
  broadcasts.set(row.key, row);
  saveBroadcast({ key: row.key, uuid, seq: 0, btype: row.btype, record_json: JSON.stringify(record), timestamp: row.timestamp, scheduled: 1, when_ms: whenMs, created_at: Date.now() });
  auditFromReq(req, 'schedule', `${record.title} @ ${new Date(whenMs).toISOString()}`);
  res.json({ ok: true, uuid });
});

app.patch('/api/broadcasts/:key', requireAuth, (req, res) => {
  const row = broadcasts.get(req.params.key);
  if (!row) return res.status(404).json({ error: 'not found' });
  const patch = req.body?.patch || {};
  row.record = { ...row.record, ...patch };
  if (patch.whenMs) row.whenMs = patch.whenMs;
  broadcasts.set(row.key, row);
  saveBroadcast({ key: row.key, uuid: row.uuid, seq: row.seq, btype: row.btype, record_json: JSON.stringify(row.record), timestamp: row.timestamp, scheduled: row.scheduled ? 1 : 0, when_ms: row.whenMs, created_at: Date.now() });
  auditFromReq(req, 'update_broadcast', row.key);
  if (!row.scheduled) {
    const seq = nextSeq(); currentSeq = seq;
    broadcast({ type: 'update', seq, uuid: crypto.randomUUID(), timestamp: Date.now(), key: row.key, patch });
  }
  res.json({ ok: true });
});

app.delete('/api/broadcasts/:key', requireAuth, (req, res) => {
  const row = broadcasts.get(req.params.key);
  broadcasts.delete(req.params.key);
  deleteBroadcastRow(req.params.key);
  auditFromReq(req, 'delete_broadcast', req.params.key);
  if (row && !row.scheduled) {
    const seq = nextSeq(); currentSeq = seq;
    broadcast({ type: 'delete', seq, uuid: crypto.randomUUID(), timestamp: Date.now(), key: req.params.key });
  }
  res.json({ ok: true });
});

/* server-side scheduler — fires even if the organizer's tab is closed */
setInterval(() => {
  const now = Date.now();
  for (const row of broadcasts.values()) {
    if (!row.scheduled || row.whenMs > now) continue;
    row.scheduled = false;
    row.record = { ...row.record, timestamp: now };
    row.timestamp = now;
    row.seq = nextSeq(); currentSeq = row.seq;
    broadcasts.set(row.key, row);
    saveBroadcast({ key: row.key, uuid: row.uuid, seq: row.seq, btype: row.btype, record_json: JSON.stringify(row.record), timestamp: now, scheduled: 0, when_ms: row.whenMs, created_at: Date.now() });
    audit('publish', `${row.record.title} (scheduled fire)`, null);
    broadcast({ type: 'publish', seq: row.seq, uuid: row.uuid, timestamp: now, record: row.record });
  }
}, 1000);

/* ============================================================
   SOUND LIBRARY
   ============================================================ */
const upload = multer({
  storage: multer.diskStorage({
    destination: SOUND_DIR,
    filename: (_req, file, cb) => {
      const id = 'snd-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase() || guessExt(file.mimetype);
      cb(null, `${id}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ok = /\.(mp3|wav|ogg)$/i.test(file.originalname) || /audio\/(mpeg|mp3|wav|x-wav|ogg)/.test(file.mimetype || '');
    cb(ok ? null : new Error('unsupported audio format'), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.get('/api/sounds', (_req, res) => {
  res.json({ sounds: loadSounds().map(stripFilename), defaultSoundId: getMeta('default_sound_id') || null });
});

/* ---- voice transmission (organizer pushes an uploaded voice to every
   connected operative to play in the background) --------------------------
   Deliberately EPHEMERAL: it is fanned out live over the WebSocket and never
   stored as a broadcast record. A transmission is a live event, like a PA
   announcement — a player who refreshes or connects afterward must NOT
   re-hear an old one, and it never appears on the Alerts/Intel surfaces. The
   sound bytes themselves are already served by /api/sounds/:id/file. */
app.post('/api/voice', requireAuth, (req, res) => {
  const soundId = req.body?.soundId;
  if (!soundId || !getSoundRow(soundId)) return res.status(400).json({ error: 'valid soundId required' });
  const title = (req.body?.title || '').toString().slice(0, 80) || null;
  auditFromReq(req, 'voice_push', title || soundId);
  broadcast({ type: 'voice', soundId, title });
  res.json({ ok: true });
});

app.post('/api/sounds', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const id = path.basename(req.file.filename, path.extname(req.file.filename));
  const row = {
    id, name: (req.body.name || req.file.originalname.replace(/\.[^.]+$/, '')).slice(0, 64),
    category: req.body.category || 'Custom', mime: req.file.mimetype || guessMime(req.file.filename),
    size: req.file.size, filename: req.file.filename, created_at: Date.now(),
  };
  saveSound(row);
  auditFromReq(req, 'upload_sound', `${row.name} (${row.category})`);
  broadcast({ type: 'sound-changed' });
  res.json({ ok: true, sound: stripFilename(row) });
});

app.patch('/api/sounds/:id', requireAuth, (req, res) => {
  const row = getSoundRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const name = req.body.name ?? row.name;
  const category = req.body.category ?? row.category;
  saveSound({ ...row, name, category });
  auditFromReq(req, 'rename_sound', `${req.params.id} -> ${name}`);
  broadcast({ type: 'sound-changed' });
  res.json({ ok: true });
});

app.delete('/api/sounds/:id', requireAuth, (req, res) => {
  const row = getSoundRow(req.params.id);
  if (row) { try { fs.unlinkSync(path.join(SOUND_DIR, row.filename)); } catch {} }
  deleteSoundRow(req.params.id);
  if (getMeta('default_sound_id') === req.params.id) setMeta('default_sound_id', '');
  auditFromReq(req, 'delete_sound', req.params.id);
  broadcast({ type: 'sound-changed' });
  res.json({ ok: true });
});

app.post('/api/sounds/default', requireAuth, (req, res) => {
  setMeta('default_sound_id', req.body?.id || '');
  auditFromReq(req, 'set_default_sound', req.body?.id || '(cleared)');
  broadcast({ type: 'default-sound-changed', defaultSoundId: req.body?.id || null });
  res.json({ ok: true });
});

app.get('/api/sounds/:id/file', (req, res) => {
  const row = getSoundRow(req.params.id);
  if (!row) return res.status(404).end();
  res.setHeader('Content-Type', row.mime || 'audio/mpeg');
  res.sendFile(path.join(SOUND_DIR, row.filename));
});

function stripFilename(row) { const { filename, ...rest } = row; return rest; }
function guessExt(mime) { if (/mp3|mpeg/.test(mime)) return '.mp3'; if (/wav/.test(mime)) return '.wav'; if (/ogg/.test(mime)) return '.ogg'; return '.bin'; }
function guessMime(name) { const n = name.toLowerCase(); if (n.endsWith('.mp3')) return 'audio/mpeg'; if (n.endsWith('.wav')) return 'audio/wav'; if (n.endsWith('.ogg')) return 'audio/ogg'; return 'audio/*'; }

/* ============================================================
   WEBSOCKET — public, read-only, heartbeated
   ============================================================ */
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/realtime' });
const clients = new Set();

function broadcast(evt) {
  const payload = JSON.stringify({ ...evt, serverTime: Date.now() });
  for (const ws of clients) { if (ws.readyState === ws.OPEN) ws.send(payload); }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'hello') return;
    const since = Number(msg.since) || 0;
    if (since > 0 && since < currentSeq) {
      const events = [...broadcasts.values()]
        .filter((r) => !r.scheduled && r.seq > since)
        .sort((a, b) => a.seq - b.seq)
        .map((r) => ({ type: 'publish', seq: r.seq, uuid: r.uuid, timestamp: r.timestamp, record: r.record }));
      ws.send(JSON.stringify({ type: 'replay', events, serverTime: Date.now() }));
    } else {
      ws.send(JSON.stringify({ type: 'snapshot', seq: currentSeq, records: liveRecords(), serverTime: Date.now() }));
    }
  });

  ws.on('close', () => clients.delete(ws));
});

// heartbeat: detect and clean up dead connections over a long event
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (ws.isAlive === false) { ws.terminate(); clients.delete(ws); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

// Bind to loopback only — the relay is never addressed directly; nginx
// reverse-proxies to it from the same host. This keeps 8787 off every
// external interface regardless of cloud firewall state (defense in depth).
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[templar-relay] listening on 127.0.0.1:${PORT} (WS at /realtime)`);
});
