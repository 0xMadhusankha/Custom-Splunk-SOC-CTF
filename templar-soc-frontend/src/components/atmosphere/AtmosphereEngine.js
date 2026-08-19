/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — ATMOSPHERE ENGINE
   ------------------------------------------------------------
   A single-canvas, GPU-composited environment behind the whole
   player UI. Built from independent, very slow layers so the SOC
   reads as ALIVE without ever competing with the investigation:

     CONTINUOUS drift
       · crimson embers rising            (depth-tiered, twinkling)
       · floating digital dust            (fine, cheap)
       · glowing intelligence nodes       (few, bright, anchored)
       · thin connecting network lines    (nodes ↔ embers ↔ nodes)
       · travelling data pulses           (along the links)

     EPISODIC events — what makes a 5s-apart screenshot differ
       · expanding telemetry pulses       (single quick rings)
       · expanding radar rings            (concentric, from a node)
       · slow holographic scan sweep      (band travels the field)
       · random classified data fragments (hex / coords / callsigns)
       · rare classified-system flickers  (glitch bars)

   Everything is the Templar/Animus crimson family. Motion is
   dt-integrated (identical across refresh rates) and deliberately
   restrained — nothing flashes, nothing harms readability. Counts
   are modest; immersion comes from layering, not particle spam.
   ============================================================ */

const CRIMSON = '255, 40, 66';
const CRIMSON_HOT = '255, 96, 116';
const CRIMSON_SOFT = '255, 64, 88';

const FRAGMENTS = [
  '0x7F3C9B02', 'SECTOR-07', 'CLASSIFIED', 'ERUDITO', 'ABSTERGO', 'SYNC 98.2%',
  'ANIMUS', 'NODE//ORACLE', 'TS//SCI', 'AES-256', 'UDR_SECTOR', 'ASSASSIN.LOCAL',
  'KEY 0xFF1A', 'MEM 0x4A1B', 'TEMPLAR//EYES', 'SIGINT', 'LAT 41.9028', 'LON 12.4964',
  'TRACE ACTIVE', 'ISU-DR', 'GRID 11-C', 'ENCRYPTED',
];

export class AtmosphereEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.density = opts.density ?? 46;
    this.reduced = !!opts.reduced;

    this.raf = 0;
    this.last = 0;
    this.w = 0; this.h = 0;

    this.dust = [];
    this.embers = [];
    this.nodes = [];      // glowing intelligence nodes
    this.rings = [];      // quick telemetry pulses
    this.radars = [];     // concentric radar rings from a node
    this.pulses = [];     // travelling data pulses
    this.frags = [];      // classified data fragments

    this.tRing = 1.2;
    this.tRadar = 3.0;
    this.tFrag = 2.4;
    this.tFlick = 5;
    this.flick = 0;
    this.flickBars = [];
    this.sweep = -0.15;

    this._loop = this._loop.bind(this);
  }

  /* ---- lifecycle ---- */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, this.w * dpr);
    this.canvas.height = Math.max(1, this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._seed();
  }

  start() {
    this.last = performance.now();
    if (this.reduced) { this._renderStatic(); return; }
    this.raf = requestAnimationFrame(this._loop);
  }

  stop() { cancelAnimationFrame(this.raf); }

  /* ---- population (velocities are px/second) ---- */
  _seed() {
    const { w, h } = this;
    const dustN = Math.round(this.density * 1.7);
    const emberN = this.density;
    const nodeN = 7;

    this.dust = Array.from({ length: dustN }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 0.9 + 0.3,
      vx: (Math.random() - 0.5) * 5,
      vy: -(Math.random() * 7 + 2),
      a: Math.random() * 0.28 + 0.05,
      tw: Math.random() * 6.28, tws: Math.random() * 1.6 + 0.5,
    }));

    this.embers = Array.from({ length: emberN }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.7 + 0.6,
      vx: (Math.random() - 0.5) * 8,
      vy: -(Math.random() * 15 + 6),
      a: Math.random() * 0.5 + 0.22,
      tw: Math.random() * 6.28, tws: Math.random() * 2 + 0.9,
      node: Math.random() < 0.5,
    }));

    // glowing intelligence nodes — few, bright, slow. They anchor the
    // network and occasionally emit a radar sweep.
    this.nodes = Array.from({ length: nodeN }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 2.2 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 2.4,
      vy: -(Math.random() * 2.4 + 0.6),
      pulse: Math.random() * 6.28, ps: 0.4 + Math.random() * 0.4,
    }));
  }

  _spawnRing() {
    this.rings.push({
      x: Math.random() * this.w,
      y: this.h * 0.08 + Math.random() * this.h * 0.84,
      life: 0, ttl: 2.2 + Math.random() * 1.4,
      max: 80 + Math.random() * 110,
      hot: Math.random() < 0.3,
    });
  }

  _spawnRadar() {
    if (!this.nodes.length) return;
    const n = this.nodes[(Math.random() * this.nodes.length) | 0];
    this.radars.push({ x: n.x, y: n.y, life: 0, ttl: 4.6 + Math.random() * 1.8, max: 150 + Math.random() * 90 });
  }

  _spawnPulse() {
    const nodes = this.embers.filter((e) => e.node);
    if (nodes.length < 2) return;
    const a = nodes[(Math.random() * nodes.length) | 0];
    const b = nodes[(Math.random() * nodes.length) | 0];
    if (a === b) return;
    this.pulses.push({ a, b, t: 0, speed: 0.35 + Math.random() * 0.5 });
  }

  _spawnFrag() {
    this.frags.push({
      x: Math.random() * this.w, y: this.h * 0.1 + Math.random() * this.h * 0.8,
      text: FRAGMENTS[(Math.random() * FRAGMENTS.length) | 0],
      life: 0, ttl: 4.5 + Math.random() * 3,
      vy: -(Math.random() * 5 + 2),
      a: 0.10 + Math.random() * 0.08,
    });
  }

  _triggerFlicker() {
    this.flick = 1;
    const bars = 1 + ((Math.random() * 2) | 0);
    this.flickBars = Array.from({ length: bars }, () => ({
      y: Math.random() * this.h, h: 1 + Math.random() * 2, off: (Math.random() - 0.5) * 26,
    }));
  }

  /* ---- main loop ---- */
  _loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this._step(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }

  _step(dt) {
    const { w, h } = this;

    for (const d of this.dust) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.tw += d.tws * dt;
      if (d.y < -4) { d.y = h + 4; d.x = Math.random() * w; }
      if (d.x < -4) d.x = w + 4; else if (d.x > w + 4) d.x = -4;
    }
    for (const e of this.embers) {
      e.x += e.vx * dt; e.y += e.vy * dt; e.tw += e.tws * dt;
      if (e.y < -6) { e.y = h + 6; e.x = Math.random() * w; }
      if (e.x < -6) e.x = w + 6; else if (e.x > w + 6) e.x = -6;
    }
    for (const n of this.nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt; n.pulse += n.ps * dt;
      if (n.y < -8) { n.y = h + 8; n.x = Math.random() * w; }
      if (n.x < -8) n.x = w + 8; else if (n.x > w + 8) n.x = -8;
    }

    // travelling data pulses
    if (Math.random() < dt * 0.9 && this.pulses.length < 4) this._spawnPulse();
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]; p.t += p.speed * dt; if (p.t >= 1) this.pulses.splice(i, 1);
    }

    // telemetry pulses (quick single rings)
    this.tRing -= dt;
    if (this.tRing <= 0) { this._spawnRing(); this.tRing = 1.4 + Math.random() * 1.8; }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life += dt; if (r.life >= r.ttl) this.rings.splice(i, 1);
    }

    // radar rings (concentric, slower, from a node)
    this.tRadar -= dt;
    if (this.tRadar <= 0) { this._spawnRadar(); this.tRadar = 4 + Math.random() * 4; }
    for (let i = this.radars.length - 1; i >= 0; i--) {
      const r = this.radars[i]; r.life += dt; if (r.life >= r.ttl) this.radars.splice(i, 1);
    }

    // classified data fragments
    this.tFrag -= dt;
    if (this.tFrag <= 0 && this.frags.length < 4) { this._spawnFrag(); this.tFrag = 2.6 + Math.random() * 3.5; }
    for (let i = this.frags.length - 1; i >= 0; i--) {
      const f = this.frags[i]; f.life += dt; f.y += f.vy * dt; if (f.life >= f.ttl) this.frags.splice(i, 1);
    }

    // scan sweep travels top→bottom
    this.sweep += dt / 7;
    if (this.sweep > 1.15) this.sweep = -0.15;

    // classified flickers (rare)
    this.tFlick -= dt;
    if (this.tFlick <= 0) { this._triggerFlicker(); this.tFlick = 6 + Math.random() * 7; }
    if (this.flick > 0) this.flick = Math.max(0, this.flick - dt * 6);
  }

  _draw() {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // --- digital dust (flat, cheap) ---
    for (const d of this.dust) {
      const a = d.a * (0.55 + Math.sin(d.tw) * 0.45);
      if (a <= 0.01) continue;
      ctx.fillStyle = `rgba(${CRIMSON}, ${a.toFixed(3)})`;
      ctx.fillRect(d.x, d.y, d.r, d.r);
    }

    // --- network : embers↔embers, and intelligence nodes↔nearby ---
    const LINK = 138, LINK2 = LINK * LINK;
    ctx.lineWidth = 1;
    const emb = this.embers;
    for (let i = 0; i < emb.length; i++) {
      const p = emb[i]; if (!p.node) continue;
      for (let j = i + 1; j < emb.length; j++) {
        const q = emb[j]; if (!q.node) continue;
        const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 > LINK2) continue;
        const a = (1 - d2 / LINK2) * 0.12;
        ctx.strokeStyle = `rgba(${CRIMSON}, ${a.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    // node links (slightly brighter — the intelligence backbone)
    const NLINK = 200, NLINK2 = NLINK * NLINK;
    for (const n of this.nodes) {
      for (const e of emb) {
        const dx = n.x - e.x, dy = n.y - e.y, d2 = dx * dx + dy * dy;
        if (d2 > LINK2) continue;
        const a = (1 - d2 / LINK2) * 0.16;
        ctx.strokeStyle = `rgba(${CRIMSON_SOFT}, ${a.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(e.x, e.y); ctx.stroke();
      }
    }
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a1 = this.nodes[i], b1 = this.nodes[j];
        const dx = a1.x - b1.x, dy = a1.y - b1.y, d2 = dx * dx + dy * dy;
        if (d2 > NLINK2) continue;
        const a = (1 - d2 / NLINK2) * 0.14;
        ctx.strokeStyle = `rgba(${CRIMSON_SOFT}, ${a.toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
      }
    }

    // --- travelling data pulses ---
    ctx.shadowColor = `rgba(${CRIMSON_HOT}, 0.9)`;
    for (const pl of this.pulses) {
      const x = pl.a.x + (pl.b.x - pl.a.x) * pl.t;
      const y = pl.a.y + (pl.b.y - pl.a.y) * pl.t;
      const fade = Math.sin(pl.t * Math.PI);
      ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.2832);
      ctx.fillStyle = `rgba(${CRIMSON_HOT}, ${(0.85 * fade).toFixed(3)})`;
      ctx.shadowBlur = 10; ctx.fill();
    }
    ctx.shadowBlur = 0;

    // --- crimson embers (glow) ---
    ctx.shadowColor = `rgba(${CRIMSON}, 0.55)`;
    for (const e of emb) {
      const a = e.a * (0.6 + Math.sin(e.tw) * 0.4);
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 6.2832);
      ctx.fillStyle = `rgba(${CRIMSON}, ${a.toFixed(3)})`;
      ctx.shadowBlur = 6; ctx.fill();
    }
    ctx.shadowBlur = 0;

    // --- glowing intelligence nodes (bright core + halo, gentle pulse) ---
    for (const n of this.nodes) {
      const p = 0.6 + Math.sin(n.pulse) * 0.4;
      const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 6);
      halo.addColorStop(0, `rgba(${CRIMSON_HOT}, ${(0.22 * p).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,40,66,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 6, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832);
      ctx.fillStyle = `rgba(${CRIMSON_HOT}, ${(0.5 + 0.4 * p).toFixed(3)})`;
      ctx.shadowBlur = 10; ctx.shadowColor = `rgba(${CRIMSON}, 0.9)`;
      ctx.fill(); ctx.shadowBlur = 0;
    }

    // --- concentric radar rings from a node ---
    for (const r of this.radars) {
      const k = r.life / r.ttl;
      const a = (1 - k) * 0.32;
      for (let ri = 0; ri < 2; ri++) {
        const kk = k - ri * 0.16;
        if (kk <= 0) continue;
        const radius = 2 + kk * r.max;
        ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, 6.2832);
        ctx.strokeStyle = `rgba(${CRIMSON}, ${(a * (1 - ri * 0.4)).toFixed(3)})`;
        ctx.lineWidth = 1.2; ctx.stroke();
      }
    }

    // --- quick telemetry pulses (glow) ---
    for (const r of this.rings) {
      const k = r.life / r.ttl;
      const radius = 2 + k * r.max;
      const a = (1 - k) * (1 - k) * 0.5;
      const col = r.hot ? CRIMSON_HOT : CRIMSON;
      ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, 6.2832);
      ctx.strokeStyle = `rgba(${col}, ${a.toFixed(3)})`;
      ctx.lineWidth = 1.5; ctx.shadowBlur = 8; ctx.shadowColor = `rgba(${col}, 0.8)`;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(r.x, r.y, 1.6, 0, 6.2832);
      ctx.fillStyle = `rgba(${col}, ${(a * 1.6).toFixed(3)})`; ctx.fill();
    }
    ctx.shadowBlur = 0;

    // --- classified data fragments (fade in/out) ---
    ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textBaseline = 'middle';
    for (const f of this.frags) {
      const k = f.life / f.ttl;
      const env = Math.sin(k * Math.PI);      // 0→1→0
      const a = f.a * env;
      if (a <= 0.005) continue;
      ctx.fillStyle = `rgba(${CRIMSON_SOFT}, ${a.toFixed(3)})`;
      ctx.fillText(f.text, f.x, f.y);
      // tiny leading marker
      ctx.fillStyle = `rgba(${CRIMSON_HOT}, ${(a * 1.4).toFixed(3)})`;
      ctx.fillRect(f.x - 6, f.y - 1, 2, 2);
    }

    // --- slow scan sweep ---
    const sy = this.sweep * h;
    if (sy > -60 && sy < h + 60) {
      const band = ctx.createLinearGradient(0, sy - 46, 0, sy + 46);
      band.addColorStop(0, 'rgba(255,40,66,0)');
      band.addColorStop(0.5, 'rgba(255,40,66,0.05)');
      band.addColorStop(1, 'rgba(255,40,66,0)');
      ctx.fillStyle = band; ctx.fillRect(0, sy - 46, w, 92);
      ctx.fillStyle = 'rgba(255,90,110,0.10)'; ctx.fillRect(0, sy, w, 1);
    }

    // --- classified-system flicker ---
    if (this.flick > 0) {
      const a = this.flick;
      for (const b of this.flickBars) {
        ctx.fillStyle = `rgba(${CRIMSON_HOT}, ${(0.18 * a).toFixed(3)})`;
        ctx.fillRect(b.off, b.y, w, b.h);
      }
      ctx.fillStyle = `rgba(${CRIMSON}, ${(0.02 * a).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* One representative frame for reduced-motion users. */
  _renderStatic() {
    this._seed();
    this.pulses = [];
    this.rings = [{ x: this.w * 0.7, y: this.h * 0.3, life: 0.6, ttl: 3, max: 120, hot: false }];
    this.radars = [{ x: this.nodes[0]?.x ?? this.w * 0.4, y: this.nodes[0]?.y ?? this.h * 0.5, life: 1.4, ttl: 5, max: 180 }];
    this._draw();
  }
}
