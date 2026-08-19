/* ============================================================
   ATMOSPHERE — the player SOC is never frozen. A layered,
   GPU-composited environment behind the interface:
     · CSS layers  — animated grid, drifting fog, breathing
       crimson glow, faint noise, holographic + fine scan lines
     · Canvas engine — crimson embers, digital dust, live node
       network, travelling data pulses, expanding telemetry
       rings, a slow scan sweep, and rare classified flickers
   The canvas engine (AtmosphereEngine) owns all per-frame motion
   so the background visibly changes second to second. Honors
   prefers-reduced-motion by rendering a single static frame.
   ============================================================ */

import { useEffect, useRef } from 'react';
import { AtmosphereEngine } from './AtmosphereEngine.js';
import './Atmosphere.css';

export default function Atmosphere({ density = 46 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const engine = new AtmosphereEngine(canvasRef.current, { density, reduced });
    engine.resize();
    engine.start();
    // dev-only debug handle (stripped from production builds)
    if (import.meta.env.DEV) window.__atmosphere = engine;

    // pause when the tab is hidden — no wasted frames in the background
    const onVis = () => {
      if (document.hidden) engine.stop();
      else if (!reduced) { engine.last = performance.now(); engine.start(); }
    };
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      engine.stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [density]);

  return (
    <div className="atmosphere" aria-hidden="true">
      <div className="atmo-grid" />
      <div className="atmo-fog" />
      <div className="atmo-glow" />
      <div className="atmo-noise" />
      <div className="atmo-vignette" />
      <canvas ref={canvasRef} className="atmo-particles" />
      <div className="atmo-holo" />
      <div className="atmo-scan" />
    </div>
  );
}
