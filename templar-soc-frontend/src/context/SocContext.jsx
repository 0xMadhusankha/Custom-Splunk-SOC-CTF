/* ============================================================
   SocContext — session identity, role, live notification poller.
   The poller mirrors the production design: poll the "latest
   record" endpoint on an interval (and react instantly to
   in-process publishes) and raise a themed broadcast whenever
   Mission Control publishes something new. It is the single point
   where a new broadcast becomes a notification, a sound, and a
   counter increment — so every surface reacts consistently.
   ============================================================ */

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { service } from '../services/index.js';
import { cueFor, resolveType } from '../lib/broadcast.js';
import { subscribeVoice } from '../services/realtime.js';
import { useAudio } from '../audio/AudioContext.jsx';

const SocContext = createContext(null);
export const useSoc = () => useContext(SocContext);

const POLL_MS = 6000; // fast for demo; production doc uses ~18s

export function SocProvider({ children }) {
  const audio = useAudio();
  const [session, setSession] = useState(null);
  const [notification, setNotification] = useState(null);
  const [unread, setUnread] = useState(0);
  const [lastBroadcast, setLastBroadcast] = useState(null);
  const lastSeen = useRef({ alert: null, intel: null });
  const primed = useRef(false);

  useEffect(() => {
    service.getSession().then(setSession);
  }, []);

  const raise = useCallback((kind, rec) => {
    const btype = resolveType(rec);
    const note = { kind, btype, ...rec, at: Date.now() };
    setNotification(note);
    setLastBroadcast(note);
    setUnread((n) => n + 1);
    // A broadcast may carry a custom uploaded sound chosen by Mission
    // Control — it plays for every operative alongside the notification.
    // Otherwise fall back to the themed synthesized cue.
    if (rec.soundId) {
      audio?.playSound(rec.soundId);
    } else {
      audio?.play(cueFor(rec));
      if (btype === 'emergency') setTimeout(() => audio?.play('emergency'), 620);
    }
  }, [audio]);

  const check = useCallback(async () => {
    const latest = await service.pollLatest();
    if (!primed.current) {
      lastSeen.current = { alert: latest.alert?._key ?? null, intel: latest.intel?._key ?? null };
      primed.current = true;
      return;
    }
    if (latest.alert && latest.alert._key !== lastSeen.current.alert) {
      lastSeen.current.alert = latest.alert._key;
      raise('alert', latest.alert);
    } else if (latest.intel && latest.intel._key !== lastSeen.current.intel) {
      lastSeen.current.intel = latest.intel._key;
      raise('intel', latest.intel);
    }
  }, [raise]);

  useEffect(() => {
    const id = setInterval(check, POLL_MS);
    // Also react instantly to in-process publishes from Mission Control.
    const unsub = service.subscribe ? service.subscribe(check) : undefined;
    return () => { clearInterval(id); unsub && unsub(); };
  }, [check]);

  // Voice transmissions: the organizer pushes an uploaded voice to play in
  // the background for every operative. Deliberately audio-only — no
  // notification card, no unread increment — so it feels like an ambient
  // in-world transmission rather than another alert to triage.
  useEffect(() => subscribeVoice(({ soundId }) => {
    if (soundId) audio?.playSound(soundId);
  }), [audio]);

  const dismiss = useCallback(() => setNotification(null), []);
  const clearUnread = useCallback(() => setUnread(0), []);

  const value = useMemo(() => ({
    session, notification, dismiss,
    unread, clearUnread, lastBroadcast,
  }), [session, notification, dismiss, unread, clearUnread, lastBroadcast]);

  return <SocContext.Provider value={value}>{children}</SocContext.Provider>;
}
