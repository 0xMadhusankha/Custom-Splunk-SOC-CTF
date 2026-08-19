/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — Custom Sound Library
   ------------------------------------------------------------
   Persistent, organizer-managed library of uploaded notification
   sounds (mp3 / wav / ogg).

   Two backends, same public API (every exported function keeps an
   IDENTICAL signature either way, so MissionControl.jsx's UI and
   AudioEngine.playSoundBuffer never need to change):

     · Local (no relay configured): IndexedDB, same-browser only.
       Uploads survive reloads; a fresh player device never sees
       them — fine for local dev/offline demos, not for the live
       event.
     · Remote (VITE_REALTIME_HTTP configured): the relay's
       /api/sounds* routes. Any connected device can fetch the
       actual bytes by URL, and the default sound becomes
       server-authoritative so every player actually learns what
       it is (local mode leaves that stuck in the admin's own
       localStorage).

   getDefaultSound()/listSounds() stay SYNCHRONOUS-looking (or
   already-cached) even in remote mode: a small in-memory cache is
   refreshed asynchronously and changes are announced through the
   same subscribeLibrary() mechanism the UI already listens to —
   so a mutation or an incoming realtime event just re-renders the
   existing UI with fresh data, no new plumbing in the component.
   ============================================================ */

import { isRemote, apiGet, apiPost, apiPatch, apiDelete, apiUpload, subscribeSoundChanges, remoteUrl } from '../services/realtime.js';

const DB_NAME = 'templar-sound-lib';
const STORE = 'sounds';
const VERSION = 1;
const DEFAULT_KEY = 'templar.sound.default';
const REMOTE = isRemote();

export const SOUND_CATEGORIES = [
  'Mission Control', 'Story', 'Assassin Broadcast', 'Threat Intel',
  'Warning', 'Emergency', 'Ambient', 'Success', 'Failure', 'Custom',
];

export const SOUND_ACCEPT = '.mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg';
const OK_EXT = /\.(mp3|wav|ogg)$/i;

/* ---- change notification (in-tab + cross-tab locally; realtime remotely) */
const listeners = new Set();
const localChan = (!REMOTE && typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('templar-sound-lib') : null;
if (localChan) localChan.onmessage = () => listeners.forEach((f) => f());
function changed() { listeners.forEach((f) => f()); if (localChan) { try { localChan.postMessage('changed'); } catch {} } }
export function subscribeLibrary(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function isSupportedFile(file) {
  return OK_EXT.test(file.name) || /audio\/(mpeg|mp3|wav|x-wav|ogg)/.test(file.type || '');
}

/* ============================================================
   REMOTE backend
   ============================================================ */
let remoteSounds = [];
let remoteDefaultId = null;

async function refreshRemote() {
  try {
    const { sounds, defaultSoundId } = await apiGet('/api/sounds');
    remoteSounds = sounds;
    remoteDefaultId = defaultSoundId || null;
  } catch { /* relay unreachable — keep last-known cache */ }
  changed();
}
if (REMOTE) {
  refreshRemote(); // initial hydration
  subscribeSoundChanges(refreshRemote); // another client (or our own echo) changed something
}

/* ============================================================
   LOCAL (IndexedDB) backend
   ============================================================ */
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
function store(mode) { return open().then((db) => db.transaction(STORE, mode).objectStore(STORE)); }
function reqP(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

function guessMime(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  if (n.endsWith('.wav')) return 'audio/wav';
  if (n.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/*';
}

/* ============================================================
   Public API
   ============================================================ */

export async function listSounds() {
  if (REMOTE) return remoteSounds;
  const s = await store('readonly');
  const all = await reqP(s.getAll());
  return all.map(({ blob, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addSound(file, { name, category } = {}) {
  if (REMOTE) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', name || file.name.replace(/\.[^.]+$/, ''));
    fd.append('category', category || 'Custom');
    const { sound } = await apiUpload('/api/sounds', fd);
    await refreshRemote();
    return sound;
  }
  const id = 'snd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const rec = {
    id,
    name: (name || file.name.replace(/\.[^.]+$/, '')).slice(0, 64),
    category: category || 'Custom',
    mime: file.type || guessMime(file.name),
    size: file.size,
    createdAt: Date.now(),
    blob: file,
  };
  const s = await store('readwrite');
  await reqP(s.put(rec));
  changed();
  const { blob, ...meta } = rec;
  return meta;
}

export async function renameSound(id, name) {
  if (REMOTE) { await apiPatch(`/api/sounds/${id}`, { name: String(name).slice(0, 64) }); await refreshRemote(); return; }
  const s = await store('readwrite');
  const rec = await reqP(s.get(id));
  if (!rec) return;
  rec.name = String(name).slice(0, 64);
  await reqP(s.put(rec));
  changed();
}

export async function setSoundCategory(id, category) {
  if (REMOTE) { await apiPatch(`/api/sounds/${id}`, { category }); await refreshRemote(); return; }
  const s = await store('readwrite');
  const rec = await reqP(s.get(id));
  if (!rec) return;
  rec.category = category;
  await reqP(s.put(rec));
  changed();
}

export async function deleteSound(id) {
  if (REMOTE) { await apiDelete(`/api/sounds/${id}`); await refreshRemote(); return; }
  const s = await store('readwrite');
  await reqP(s.delete(id));
  if (getDefaultSound() === id) setDefaultSound(null);
  changed();
}

/** ArrayBuffer for decoding/playback (used by the AudioEngine). */
export async function getSoundArrayBuffer(id) {
  if (!id) return null;
  if (REMOTE) {
    const res = await apiGet(`/api/sounds/${id}/file`);
    return res instanceof Response ? res.arrayBuffer() : null;
  }
  const s = await store('readonly');
  const rec = await reqP(s.get(id));
  if (!rec || !rec.blob) return null;
  return rec.blob.arrayBuffer();
}

/** A playable URL for a lightweight <audio> preview, if ever needed. */
export async function getSoundUrl(id) {
  if (REMOTE) return remoteUrl(`/api/sounds/${id}/file`);
  const s = await store('readonly');
  const rec = await reqP(s.get(id));
  return rec ? URL.createObjectURL(rec.blob) : null;
}

/* ---- default notification sound ---- */
export function getDefaultSound() {
  if (REMOTE) return remoteDefaultId;
  try { return localStorage.getItem(DEFAULT_KEY) || null; } catch { return null; }
}
export function setDefaultSound(id) {
  if (REMOTE) { apiPost('/api/sounds/default', { id: id || null }).then(refreshRemote); return; }
  try { if (id) localStorage.setItem(DEFAULT_KEY, id); else localStorage.removeItem(DEFAULT_KEY); } catch {}
  changed();
}
