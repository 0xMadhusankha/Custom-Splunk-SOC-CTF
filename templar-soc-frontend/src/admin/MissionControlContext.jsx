/* ============================================================
   MISSION CONTROL — shared state layer
   ------------------------------------------------------------
   Holds the composer/history/roster/sound state and handlers that
   used to live inside the single MissionControl.jsx component body.
   Lifted verbatim so the business logic is unchanged; extracting it
   into a provider lets the new multi-view console (Dashboard, Mission
   Control, Audio Library, Activity Log, Operatives, …) share one live
   state that survives route changes with zero reloads.
   ============================================================ */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { service } from '../services/index.js';
import { fmtDateTime } from '../lib/format.js';
import { getServerNow } from '../services/realtime.js';
import { BROADCAST_TYPES, cueFor } from '../lib/broadcast.js';
import { useAudio } from '../audio/AudioContext.jsx';
import {
  listSounds, addSound, renameSound, deleteSound, setSoundCategory,
  getDefaultSound, setDefaultSound, subscribeLibrary, isSupportedFile,
} from '../audio/soundLibrary.js';

const BLANK = {
  title: '', body: '', severity: 'high', source: 'TEMPLAR_SENSOR_GRID',
  classification: 'TEMPLAR // RESTRICTED', iocs: [],
};

const Ctx = createContext(null);
export function useMissionControl() { return useContext(Ctx); }

export function MissionControlProvider({ children }) {
  const audio = useAudio();
  const navigate = useNavigate();

  const [type, setType] = useState('alert');
  const [form, setForm] = useState({ ...BLANK });
  const [editKey, setEditKey] = useState(null);
  const [mode, setMode] = useState('now');     // 'now' | 'schedule'
  const [whenLocal, setWhenLocal] = useState(defaultWhen());
  const [confirmEmerg, setConfirmEmerg] = useState(false);
  const [flash, setFlash] = useState(null);

  const [history, setHistory] = useState([]);
  const [players, setPlayers] = useState([]);

  // custom notification sound library
  const [sounds, setSounds] = useState([]);
  const [defaultSoundId, setDefaultSoundId] = useState(getDefaultSound());
  const [uploadCat, setUploadCat] = useState('Custom');
  const [attachSound, setAttachSound] = useState('');

  const [lastSync, setLastSync] = useState(null);

  const meta = BROADCAST_TYPES[type];
  const isEmergency = type === 'emergency';
  const isIntel = meta.channel === 'intel';

  /* ---- live data ---- */
  async function refresh() {
    const [h, p] = await Promise.all([service.getBroadcasts(), service.getConnectedPlayers()]);
    setHistory(h); setPlayers(p); setLastSync(Date.now());
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const id = setInterval(refresh, 4000);
    const unsub = service.subscribe ? service.subscribe(refresh) : undefined;
    return () => { clearInterval(id); unsub && unsub(); };
  }, []);

  /* ---- sound library ---- */
  const loadSounds = useCallback(async () => {
    setSounds(await listSounds());
    setDefaultSoundId(getDefaultSound());
  }, []);
  useEffect(() => { loadSounds(); return subscribeLibrary(loadSounds); }, [loadSounds]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function buildRec() {
    const rec = { title: form.title.trim(), body: form.body.trim() };
    if (meta.channel === 'alert') {
      rec.severity = isEmergency ? 'emergency' : form.severity;
      rec.source = form.source;
    } else {
      rec.severity = form.severity;
      rec.classification = form.classification;
      if (type === 'ioc') rec.iocs = form.iocs.filter((i) => i.value.trim());
    }
    if (attachSound) rec.soundId = attachSound; // custom sound rides the record
    return rec;
  }

  function reset() {
    setForm({ ...BLANK });
    setEditKey(null); setConfirmEmerg(false); setMode('now'); setAttachSound('');
  }

  function toast(msg, tone = 'ok') { setFlash({ msg, tone }); setTimeout(() => setFlash(null), 3000); }

  async function submit(e) {
    e?.preventDefault();
    if (!form.title.trim()) { toast('TITLE REQUIRED', 'warn'); return; }
    if (isEmergency && !editKey && !confirmEmerg) { setConfirmEmerg(true); return; }

    const rec = buildRec();

    if (editKey) {
      await service.updateBroadcast(editKey, rec);
      toast(`UPDATED — ${rec.title}`);
      audio?.play('ui');
      reset(); refresh();
      return;
    }

    if (mode === 'schedule') {
      const when = new Date(whenLocal).getTime();
      if (!when || when < getServerNow()) { toast('PICK A FUTURE TIME', 'warn'); return; }
      await service.scheduleBroadcast(type, rec, when);
      toast(`SCHEDULED — ${rec.title} · ${fmtDateTime(when)}`);
      audio?.play('ui');
    } else {
      await service.publishBroadcast(type, rec);
      toast(`PUBLISHED — ${meta.short}: ${rec.title} · ALL SESSIONS`);
      // audition exactly what operatives will hear
      if (rec.soundId) audio?.playSound(rec.soundId);
      else audio?.play(cueFor({ ...rec, btype: type }));
    }
    reset(); refresh();
  }

  /* ---- history actions ---- */
  function editItem(item) {
    setType(item.btype);
    setForm({
      ...BLANK,
      title: item.title || '', body: item.body || '',
      severity: item.severity || 'high',
      classification: item.classification || BLANK.classification,
    });
    setEditKey(item._key);
    setMode('now');
    setAttachSound('');
    // In the multi-view console, editing routes to the composer surface
    // (previously this scrolled to the in-page composer section).
    navigate('/mission-control');
  }
  async function delItem(item) {
    await service.deleteBroadcast(item._key);
    if (editKey === item._key) reset();
    toast(`DELETED — ${item.title}`, 'warn');
    audio?.play('ui'); refresh();
  }
  async function pushNow(item) {
    // fire a scheduled item immediately
    await service.deleteBroadcast(item._key);
    await service.publishBroadcast(item.btype, { title: item.title, body: item.body, severity: item.severity, classification: item.classification });
    toast(`PUSHED — ${item.title} · ALL SESSIONS`);
    audio?.play(cueFor({ btype: item.btype, severity: item.severity })); refresh();
  }

  /* ---- bulk clear (post-test cleanup) ---------------------------- */
  const [confirmClear, setConfirmClear] = useState(null); // null | 'alert' | 'intel' | 'all'

  function clearScopeItems(scope) {
    if (scope === 'all') return history;
    return history.filter((h) => (BROADCAST_TYPES[h.btype] || BROADCAST_TYPES.alert).channel === scope);
  }
  function clearScopeCount(scope) { return clearScopeItems(scope).length; }

  function requestClear(scope) { setConfirmClear(scope); }
  function cancelClear() { setConfirmClear(null); }

  async function runClear() {
    const scope = confirmClear;
    setConfirmClear(null);
    if (!scope) return;
    const targets = clearScopeItems(scope);
    if (!targets.length) return;
    await Promise.all(targets.map((item) => service.deleteBroadcast(item._key)));
    if (editKey && targets.some((t) => t._key === editKey)) reset();
    const label = scope === 'all' ? 'BROADCASTS' : scope === 'alert' ? 'ALERTS' : 'INTEL ITEMS';
    toast(`CLEARED ${targets.length} ${label}`, 'warn');
    audio?.play('ui');
    refresh();
  }

  /* ---- sound library actions ---- */
  async function onUploadFiles(fileList) {
    let ok = 0;
    for (const f of [...fileList]) {
      if (isSupportedFile(f)) { await addSound(f, { category: uploadCat }); ok++; }
      else toast(`UNSUPPORTED: ${f.name}`, 'warn');
    }
    if (ok) { toast(`${ok} SOUND${ok > 1 ? 'S' : ''} ADDED · ${uploadCat.toUpperCase()}`); audio?.play('ui'); }
    loadSounds();
  }
  async function onDeleteSound(id) {
    await deleteSound(id);
    if (attachSound === id) setAttachSound('');
    toast('SOUND DELETED', 'warn');
    loadSounds();
  }
  function onSetDefaultSound(id) { setDefaultSound(defaultSoundId === id ? null : id); loadSounds(); }
  function onRenameSound(id, name) { renameSound(id, name).then(loadSounds); }
  function onSetSoundCategory(id, cat) { setSoundCategory(id, cat).then(loadSounds); }

  /* Push a voice to every connected operative for background playback.
     Ephemeral live transmission — not a broadcast, not stored. */
  async function onPushVoice(id, name) {
    await service.pushVoice(id, name || null);
    toast(`TRANSMITTED — ${name || 'VOICE'} · ALL SESSIONS`);
    audio?.play('ui');
  }

  const onlineCount = players.filter((p) => p.online).length;

  const value = {
    audio,
    // composer state
    type, setType, form, setForm, set, editKey, mode, setMode,
    whenLocal, setWhenLocal, confirmEmerg, setConfirmEmerg, flash,
    meta, isEmergency, isIntel, plusMinutes,
    // data
    history, players, onlineCount, lastSync, refresh,
    // handlers
    submit, buildRec, reset, toast, editItem, delItem, pushNow,
    // bulk clear
    confirmClear, requestClear, cancelClear, runClear, clearScopeCount,
    // sound library
    sounds, defaultSoundId, uploadCat, setUploadCat, attachSound, setAttachSound,
    loadSounds, onUploadFiles, onDeleteSound, onSetDefaultSound, onRenameSound, onSetSoundCategory,
    onPushVoice,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ============================================================
   helpers (moved verbatim from MissionControl.jsx)
   ============================================================ */
function defaultWhen() { return plusMinutes(5); }
function plusMinutes(m) {
  const d = new Date(getServerNow() + m * 60000 - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
