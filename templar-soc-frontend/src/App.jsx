/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — PLAYER application root.
   This bundle is the operative-facing SOC served at the player
   domain (e.g. soc.templar.as). It contains ONLY the three
   operational modules. Mission Control does not exist in this
   build — its code is never shipped here, so players cannot
   discover it. The organizer control room is a completely
   separate application (admin.html → admin.templar.as).

   Login-gated when a realtime relay is configured (isRemote()):
   the single shared operator credential, JWT session that stays
   alive while the tab is open — see playerAuthClient.js. With no
   relay configured (local dev / offline demo), the gate is skipped
   entirely and the console opens directly, matching the original
   zero-config behavior.
   ============================================================ */

import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Atmosphere from './components/atmosphere/Atmosphere.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Login from './pages/Login.jsx';
import InvestigationConsole from './pages/InvestigationConsole.jsx';
import Alerts from './pages/Alerts.jsx';
import ThreatIntel from './pages/ThreatIntel.jsx';
import { isRemote } from './services/realtime.js';
import { silentRefresh, subscribeAuth } from './playerAuthClient.js';

export default function App() {
  const remote = isRemote();
  const [status, setStatus] = useState(remote ? 'checking' : 'authed'); // 'checking' | 'authed' | 'login'

  useEffect(() => {
    if (!remote) return;
    silentRefresh().then((ok) => setStatus(ok ? 'authed' : 'login'));
    return subscribeAuth((authed) => setStatus(authed ? 'authed' : 'login'));
  }, [remote]);

  if (status === 'checking') {
    return (
      <>
        <Atmosphere density={60} />
        <div className="login"><span className="meta-label">VALIDATING SESSION…</span></div>
      </>
    );
  }
  if (status === 'login') {
    return (
      <>
        <Atmosphere density={60} />
        <Login onAuthenticated={() => setStatus('authed')} />
      </>
    );
  }
  return <AuthedApp />;
}

function AuthedApp() {
  const location = useLocation();
  const isLanding = location.pathname === '/' || location.pathname === '/login';
  return (
    <>
      {/* cinematic atmosphere is a player-only immersion layer */}
      <Atmosphere density={isLanding ? 60 : 40} />
      <Routes>
        <Route path="/" element={<Navigate to="/console" replace />} />
        <Route path="/login" element={<Navigate to="/console" replace />} />
        <Route element={<AppShell />}>
          <Route path="/console" element={<InvestigationConsole />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/intel" element={<ThreatIntel />} />
        </Route>
        <Route path="*" element={<Navigate to="/console" replace />} />
      </Routes>
    </>
  );
}
