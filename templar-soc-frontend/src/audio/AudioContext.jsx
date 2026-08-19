/* ============================================================
   AudioProvider — React binding for the AudioEngine singleton.
   Exposes a stable hook, keeps component state in sync with the
   engine, and satisfies the browser autoplay policy by unlocking
   the AudioContext on the first user gesture anywhere in the app.
   ============================================================ */

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { audioEngine, CUES } from './AudioEngine.js';
import { getSoundArrayBuffer } from './soundLibrary.js';

const Ctx = createContext(null);
export const useAudio = () => useContext(Ctx);
export { CUES };

export function AudioProvider({ children }) {
  const [state, setState] = useState(audioEngine.getState());

  useEffect(() => audioEngine.subscribe(setState), []);

  // Autoplay policy: resume the context on the first real gesture.
  useEffect(() => {
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      audioEngine.unlock();
      setState(audioEngine.getState());
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const play = useCallback((cue) => audioEngine.play(cue), []);
  // Play a custom uploaded sound by library id through the master bus.
  const playSound = useCallback((id) => audioEngine.playSoundBuffer(id, () => getSoundArrayBuffer(id)), []);
  const setEnabled = useCallback((v) => audioEngine.setEnabled(v), []);
  const setVolume = useCallback((v) => audioEngine.setVolume(v), []);
  const setAmbient = useCallback((v) => audioEngine.setAmbient(v), []);

  const value = useMemo(() => ({
    ...state, play, playSound, setEnabled, setVolume, setAmbient, cues: CUES,
  }), [state, play, playSound, setEnabled, setVolume, setAmbient]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
