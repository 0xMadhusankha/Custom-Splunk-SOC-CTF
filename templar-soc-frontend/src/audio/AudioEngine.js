/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — Audio Engine
   ------------------------------------------------------------
   An application-wide, ASSET-FREE audio engine. Every cue is
   SYNTHESIZED at runtime with the Web Audio API — no .mp3/.wav
   files to ship, decode, or 404. This keeps the presentation
   layer self-contained and lets the same engine run unchanged
   whether the trigger comes from a mock publish or a live
   Splunk KV-store record.

   Design language of the sound: restrained, cinematic, military.
   Low sine/triangle bodies, brief filtered-noise transients,
   short envelopes. No arcade blips. Cues are keyed to the same
   broadcast taxonomy Mission Control publishes.

   Public surface (stable — the UI depends only on this):
     engine.unlock()               resume ctx on a user gesture
     engine.play(cueKey)           fire a one-shot cue
     engine.setEnabled(bool)       master mute
     engine.setVolume(0..1)        master volume
     engine.setAmbient(bool)       start/stop the command-center bed
     engine.getState()             { enabled, volume, ambient, ready }
   ============================================================ */

const LS_KEY = 'templar.audio.v1';

/* Cue catalogue — one entry per broadcast type Mission Control can
   publish, plus UI feedback cues. Each is a tiny synth "score". */
export const CUES = {
  alert:            { label: 'New Alert' },
  emergency:        { label: 'Emergency Broadcast' },
  intel:            { label: 'Classified Intel' },
  ioc:              { label: 'IOC Update' },
  campaign:         { label: 'Campaign Update' },
  tactical:         { label: 'Tactical Guidance' },
  infrastructure:   { label: 'Infrastructure Change' },
  high:             { label: 'High Priority Incident' },
  critical:         { label: 'Critical Detection' },
  complete:         { label: 'Mission Complete' },
  warning:          { label: 'Warning' },
  ui:               { label: 'Interface Tick' },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientNodes = null;
    const saved = readSettings();
    this.enabled = saved.enabled;
    this.volume = saved.volume;
    this.ambient = saved.ambient;
    this._subs = new Set();
    this._buffers = new Map(); // decoded custom sounds, keyed by soundId
  }

  /* ---- lifecycle ---- */

  _ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.ctx.destination);
  }

  /** Must be called from a user gesture at least once (autoplay policy). */
  unlock() {
    this._ensureCtx();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ambient) this.setAmbient(true);
    this._emit();
  }

  getState() {
    return {
      enabled: this.enabled,
      volume: this.volume,
      ambient: this.ambient,
      ready: !!this.ctx && this.ctx.state === 'running',
    };
  }

  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }
  _emit() { const s = this.getState(); this._subs.forEach((fn) => fn(s)); }

  /* ---- settings ---- */

  setEnabled(on) {
    this.enabled = on;
    this._ensureCtx();
    if (this.master) rampTo(this.master.gain, on ? this.volume : 0, this.ctx, 0.08);
    if (!on) this.setAmbient(false);
    else if (this.ambient) this.setAmbient(true);
    persist(this);
    this._emit();
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    this._ensureCtx();
    if (this.master && this.enabled) rampTo(this.master.gain, this.volume, this.ctx, 0.06);
    persist(this);
    this._emit();
  }

  /* ---- ambient command-center bed ---- */

  setAmbient(on) {
    this.ambient = on;
    persist(this);
    if (!on) {
      if (this.ambientNodes) {
        const { gain, stop } = this.ambientNodes;
        try { rampTo(gain.gain, 0, this.ctx, 0.6); } catch {}
        setTimeout(stop, 700);
        this.ambientNodes = null;
      }
      this._emit();
      return;
    }
    this._ensureCtx();
    if (!this.ctx || this.ambientNodes || !this.enabled) { this._emit(); return; }

    const now = this.ctx.currentTime;
    const bed = this.ctx.createGain();
    bed.gain.value = 0;
    bed.connect(this.master);

    // Two detuned low drones + a slow filtered-noise "air" layer.
    const oscs = [];
    [55, 55.4, 82.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = i === 2 ? 0.05 : 0.12;
      o.connect(g); g.connect(bed); o.start();
      oscs.push(o);
    });

    // Slow LFO on the bed gain → gentle "breathing" of the room tone.
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain); lfoGain.connect(bed.gain); lfo.start();

    // Filtered noise "air".
    const noise = makeNoise(this.ctx);
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 320; nf.Q.value = 0.6;
    const ng = this.ctx.createGain(); ng.gain.value = 0.015;
    noise.connect(nf); nf.connect(ng); ng.connect(bed);
    noise.start();

    rampTo(bed.gain, 0.14, this.ctx, 1.4, now);

    this.ambientNodes = {
      gain: bed,
      stop: () => { oscs.forEach((o) => safeStop(o)); safeStop(lfo); safeStop(noise); try { bed.disconnect(); } catch {} },
    };
    this._emit();
  }

  /* ---- one-shot cues ---- */

  play(cueKey) {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const fn = SCORES[cueKey] || SCORES.alert;
    try { fn(this.ctx, this.master); } catch {}
  }

  /* ---- custom uploaded sounds (played through the SAME master bus) ----
     `getArrayBuffer` is a lazy async provider (so the caller can fetch
     the blob from the sound library only on first play). Decoded buffers
     are cached by key for instant repeat playback. */
  async playSoundBuffer(key, getArrayBuffer) {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    let buf = this._buffers.get(key);
    if (!buf) {
      try {
        const ab = typeof getArrayBuffer === 'function' ? await getArrayBuffer() : getArrayBuffer;
        if (!ab) return;
        buf = await this.ctx.decodeAudioData(ab.slice ? ab.slice(0) : ab);
        this._buffers.set(key, buf);
      } catch { return; }
    }
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master);
      src.start();
    } catch {}
  }

  /** Drop a cached decoded buffer (call when a sound is deleted/replaced). */
  forgetBuffer(key) { this._buffers.delete(key); }
}

/* ============================================================
   Synthesis helpers
   ============================================================ */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function safeStop(node) { try { node.stop(); } catch {} }

function rampTo(param, value, ctx, time = 0.05, at) {
  const t = at ?? ctx.currentTime;
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + time);
}

/** A reusable white-noise buffer source. */
function makeNoise(ctx) {
  const len = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.loop = true;
  return src;
}

/** Schedule one enveloped tone. */
function tone(ctx, out, { type = 'sine', freq = 440, freqTo, t0 = 0, dur = 0.2, peak = 0.3, attack = 0.01, curve = 'exp' }) {
  const now = ctx.currentTime + t0;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  else g.gain.linearRampToValueAtTime(0.0001, now + dur);
  osc.connect(g); g.connect(out);
  osc.start(now); osc.stop(now + dur + 0.02);
}

/** A short filtered-noise transient (impact / air). */
function hit(ctx, out, { t0 = 0, dur = 0.12, peak = 0.14, freq = 1400, type = 'highpass', q = 0.7 }) {
  const now = ctx.currentTime + t0;
  const src = makeNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(now); src.stop(now + dur + 0.02);
}

/* ============================================================
   Cue scores — the sonic identity of each broadcast type.
   Kept short (<1s) and low-fatigue for repeat plays.
   ============================================================ */
const SCORES = {
  // Clean two-note "attention" — the default new-broadcast cue.
  alert(ctx, out) {
    hit(ctx, out, { t0: 0, freq: 2600, peak: 0.06, dur: 0.05 });
    tone(ctx, out, { type: 'triangle', freq: 784, t0: 0.0,  dur: 0.16, peak: 0.22 });
    tone(ctx, out, { type: 'triangle', freq: 1046, t0: 0.14, dur: 0.22, peak: 0.20 });
  },

  // Emergency — urgent, three descending saw pulses with sub weight.
  emergency(ctx, out) {
    [0, 0.22, 0.44].forEach((t) => {
      tone(ctx, out, { type: 'sawtooth', freq: 340, freqTo: 300, t0: t, dur: 0.18, peak: 0.26 });
      tone(ctx, out, { type: 'sine', freq: 70, t0: t, dur: 0.2, peak: 0.28 });
      hit(ctx, out, { t0: t, freq: 900, type: 'bandpass', q: 1.2, peak: 0.1, dur: 0.14 });
    });
  },

  // Classified intel — soft, prestigious rising minor chime.
  intel(ctx, out) {
    tone(ctx, out, { type: 'sine', freq: 523, t0: 0,    dur: 0.5, peak: 0.16 });
    tone(ctx, out, { type: 'sine', freq: 659, t0: 0.09, dur: 0.5, peak: 0.14 });
    tone(ctx, out, { type: 'sine', freq: 784, t0: 0.18, dur: 0.6, peak: 0.12 });
  },

  // IOC update — two crisp data "pings".
  ioc(ctx, out) {
    tone(ctx, out, { type: 'square', freq: 1320, t0: 0,    dur: 0.08, peak: 0.1 });
    tone(ctx, out, { type: 'square', freq: 1760, t0: 0.11, dur: 0.1,  peak: 0.1 });
  },

  // Campaign update — warm ascending triad (situational, informative).
  campaign(ctx, out) {
    tone(ctx, out, { type: 'triangle', freq: 440, t0: 0,   dur: 0.28, peak: 0.16 });
    tone(ctx, out, { type: 'triangle', freq: 554, t0: 0.1, dur: 0.3,  peak: 0.15 });
  },

  // Tactical guidance — a measured single mid tone with a soft tail.
  tactical(ctx, out) {
    tone(ctx, out, { type: 'sine', freq: 660, t0: 0, dur: 0.34, peak: 0.18 });
    tone(ctx, out, { type: 'sine', freq: 990, t0: 0.12, dur: 0.26, peak: 0.1 });
  },

  // Infrastructure change — low mechanical "thunk".
  infrastructure(ctx, out) {
    tone(ctx, out, { type: 'sawtooth', freq: 180, freqTo: 90, t0: 0, dur: 0.24, peak: 0.2 });
    hit(ctx, out, { t0: 0, freq: 500, type: 'lowpass', peak: 0.12, dur: 0.14 });
  },

  // High priority — sharp double blip.
  high(ctx, out) {
    tone(ctx, out, { type: 'triangle', freq: 880, t0: 0,    dur: 0.1, peak: 0.2 });
    tone(ctx, out, { type: 'triangle', freq: 880, t0: 0.14, dur: 0.12, peak: 0.2 });
  },

  // Critical detection — dissonant cluster with a stab.
  critical(ctx, out) {
    tone(ctx, out, { type: 'sawtooth', freq: 415, t0: 0, dur: 0.3, peak: 0.18 });
    tone(ctx, out, { type: 'sawtooth', freq: 440, t0: 0, dur: 0.3, peak: 0.14 });
    tone(ctx, out, { type: 'sine', freq: 62, t0: 0, dur: 0.34, peak: 0.24 });
    hit(ctx, out, { t0: 0, freq: 2200, peak: 0.1, dur: 0.09 });
  },

  // Mission complete — clean ascending major arpeggio, resolved.
  complete(ctx, out) {
    tone(ctx, out, { type: 'triangle', freq: 523, t0: 0,    dur: 0.16, peak: 0.18 });
    tone(ctx, out, { type: 'triangle', freq: 659, t0: 0.12, dur: 0.16, peak: 0.18 });
    tone(ctx, out, { type: 'triangle', freq: 784, t0: 0.24, dur: 0.16, peak: 0.18 });
    tone(ctx, out, { type: 'triangle', freq: 1046, t0: 0.36, dur: 0.4, peak: 0.2 });
  },

  // Warning — a hollow, cautionary two-tone.
  warning(ctx, out) {
    tone(ctx, out, { type: 'triangle', freq: 466, t0: 0,   dur: 0.2, peak: 0.2 });
    tone(ctx, out, { type: 'triangle', freq: 392, t0: 0.2, dur: 0.28, peak: 0.2 });
  },

  // UI tick — barely-there interface feedback.
  ui(ctx, out) {
    tone(ctx, out, { type: 'square', freq: 2000, t0: 0, dur: 0.03, peak: 0.04 });
  },
};

/* ============================================================
   Persistence
   ============================================================ */
function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return {
      enabled: raw.enabled ?? true,
      volume: typeof raw.volume === 'number' ? raw.volume : 0.6,
      ambient: raw.ambient ?? false,
    };
  } catch {
    return { enabled: true, volume: 0.6, ambient: false };
  }
}
function persist(e) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ enabled: e.enabled, volume: e.volume, ambient: e.ambient })); } catch {}
}

/* One engine per document. */
export const audioEngine = new AudioEngine();
