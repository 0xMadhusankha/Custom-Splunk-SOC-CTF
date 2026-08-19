/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — realtime relay persistence
   ------------------------------------------------------------
   better-sqlite3, synchronous (no async complexity on the hot
   path). This is the durability layer under the in-memory state
   server.js keeps for fast snapshot assembly + WS fan-out — a
   crash or restart mid-event reloads exactly where it left off.

   Single-organizer auth only: no `admins` table, no multi-user.
   The one credential pair lives as two rows in `meta`.
   ============================================================ */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve to ABSOLUTE paths. DATA_DIR is often set relative (e.g. ./data)
// which is fine for fs/sqlite (resolved against CWD), but res.sendFile()
// in server.js REQUIRES an absolute path — a relative SOUND_DIR makes every
// /api/sounds/:id/file request throw "path must be absolute". Resolving here
// fixes sound/voice playback at the source without touching call sites.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.join(DATA_DIR, 'templar.db');
export const SOUND_DIR = path.resolve(process.env.SOUND_DIR || path.join(DATA_DIR, 'sounds'));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SOUND_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS broadcasts (
    key TEXT PRIMARY KEY,
    uuid TEXT NOT NULL,
    seq INTEGER NOT NULL,
    btype TEXT NOT NULL,
    record_json TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    scheduled INTEGER NOT NULL DEFAULT 0,
    when_ms INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    filename TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS search_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spl TEXT NOT NULL,
    earliest_ms INTEGER,
    latest_ms INTEGER,
    status TEXT NOT NULL,
    mode TEXT,
    result_count INTEGER,
    duration_ms INTEGER,
    ip TEXT,
    created_at INTEGER NOT NULL
  );
`);

/* ---- meta key/value helpers ---- */
const getMetaStmt = db.prepare('SELECT value FROM meta WHERE key = ?');
const setMetaStmt = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export function getMeta(key) {
  const row = getMetaStmt.get(key);
  return row ? row.value : null;
}
export function setMeta(key, value) { setMetaStmt.run(key, String(value)); }

/* ---- sequence counter (global, monotonic) ---- */
export function nextSeq() {
  const tx = db.transaction(() => {
    const cur = parseInt(getMeta('seq_counter') || '0', 10);
    const next = cur + 1;
    setMeta('seq_counter', next);
    return next;
  });
  return tx();
}

/* ---- single-organizer credential bootstrap ---- */
export function bootstrapAdmin() {
  if (getMeta('admin_password_hash')) return; // already configured
  const user = process.env.ADMIN_BOOTSTRAP_USER;
  const pass = process.env.ADMIN_BOOTSTRAP_PASS;
  if (!user || !pass) {
    console.warn('[templar-relay] No admin credential configured yet. Set ADMIN_BOOTSTRAP_USER/ADMIN_BOOTSTRAP_PASS, or run `npm run set-admin-credentials`.');
    return;
  }
  setMeta('admin_username', user);
  setMeta('admin_password_hash', bcrypt.hashSync(pass, 12));
  console.log(`[templar-relay] Bootstrapped organizer credential for "${user}".`);
}

/* ---- broadcasts ---- */
const upsertBroadcastStmt = db.prepare(`
  INSERT INTO broadcasts (key, uuid, seq, btype, record_json, timestamp, scheduled, when_ms, created_at)
  VALUES (@key, @uuid, @seq, @btype, @record_json, @timestamp, @scheduled, @when_ms, @created_at)
  ON CONFLICT(key) DO UPDATE SET
    uuid = excluded.uuid, seq = excluded.seq, btype = excluded.btype,
    record_json = excluded.record_json, timestamp = excluded.timestamp,
    scheduled = excluded.scheduled, when_ms = excluded.when_ms
`);
export function saveBroadcast(row) { upsertBroadcastStmt.run(row); }

export function loadBroadcasts() {
  return db.prepare('SELECT * FROM broadcasts ORDER BY seq ASC').all()
    .map((r) => ({ ...r, record: JSON.parse(r.record_json), scheduled: !!r.scheduled }));
}

export function deleteBroadcastRow(key) { db.prepare('DELETE FROM broadcasts WHERE key = ?').run(key); }

/* ---- sounds ---- */
const upsertSoundStmt = db.prepare(`
  INSERT INTO sounds (id, name, category, mime, size, filename, created_at)
  VALUES (@id, @name, @category, @mime, @size, @filename, @created_at)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category
`);
export function saveSound(row) { upsertSoundStmt.run(row); }
export function loadSounds() { return db.prepare('SELECT * FROM sounds ORDER BY created_at DESC').all(); }
export function deleteSoundRow(id) { db.prepare('DELETE FROM sounds WHERE id = ?').run(id); }
export function getSoundRow(id) { return db.prepare('SELECT * FROM sounds WHERE id = ?').get(id); }

/* ---- refresh tokens (session persistence + true inactivity expiry) ---- */
export function insertRefreshToken(token, expiresAt) {
  db.prepare('INSERT INTO refresh_tokens (token, created_at, expires_at) VALUES (?, ?, ?)').run(token, Date.now(), expiresAt);
}
export function getRefreshToken(token) { return db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token); }
export function deleteRefreshToken(token) { db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token); }
export function touchRefreshToken(token, expiresAt) { db.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token = ?').run(expiresAt, token); }
export function pruneExpiredRefreshTokens() { db.prepare('DELETE FROM refresh_tokens WHERE expires_at < ?').run(Date.now()); }

/* ---- audit log ---- */
const insertAuditStmt = db.prepare('INSERT INTO audit_log (action, detail, ip, at) VALUES (?, ?, ?, ?)');
export function audit(action, detail, ip) { insertAuditStmt.run(action, detail ?? null, ip ?? null, Date.now()); }
export function loadAudit(limit = 100) { return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit); }

/* ---- search log (organizer-only post-event record; never read by the app
   itself — not scoring, not gameplay, not rate-limiting) ---- */
const insertSearchLogStmt = db.prepare(`
  INSERT INTO search_log (spl, earliest_ms, latest_ms, status, mode, result_count, duration_ms, ip, created_at)
  VALUES (@spl, @earliest_ms, @latest_ms, @status, @mode, @result_count, @duration_ms, @ip, @created_at)
`);
export function logSearch(row) {
  insertSearchLogStmt.run({
    spl: row.spl ?? '',
    earliest_ms: row.earliestMs ?? null,
    latest_ms: row.latestMs ?? null,
    status: row.status,
    mode: row.mode ?? null,
    result_count: row.resultCount ?? null,
    duration_ms: row.durationMs ?? null,
    ip: row.ip ?? null,
    created_at: Date.now(),
  });
}
export function loadSearchLog(limit = 200) { return db.prepare('SELECT * FROM search_log ORDER BY id DESC LIMIT ?').all(limit); }
