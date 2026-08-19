/* ============================================================
   ANIMUS 1.0 — MISSION CONTROL — ADMIN application root.
   A COMPLETELY SEPARATE bundle from the player SOC. Served at the
   organizer domain (e.g. admin.templar.as) and never linked from
   the player app — players cannot discover it because its code is
   not part of their build.

   Login-gated when a realtime relay is configured (isRemote()):
   a single organizer credential, JWT session that stays alive while
   the tab is open, logout button, and an activity log — see
   src/admin/authClient.js and views/ActivityLog.jsx. With no relay
   configured (local dev / offline demo), the gate is skipped entirely
   and Mission Control opens directly, matching the original
   zero-config behavior.

   The console itself is a sidebar-driven, no-reload multi-view
   layout (HashRouter + AdminShell), mirroring the player SOC shell.
   Admins need clarity, not immersion: no cinematic atmosphere here.
   ============================================================ */

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
// Base stylesheets first so feature CSS (shell.css, admin-shell.css,
// MissionControl.css) layers on top of the shared primitives — e.g. the
// gold .mc-title must win over global.css's crimson .surface-title.
import './styles/global.css';
import './admin.css';
import { AudioProvider } from './audio/AudioContext.jsx';
import { isRemote } from './services/realtime.js';
import { silentRefresh, logout, subscribeAuth } from './admin/authClient.js';
import AdminLogin from './admin/AdminLogin.jsx';
import { MissionControlProvider } from './admin/MissionControlContext.jsx';
import AdminShell from './admin/AdminShell.jsx';
import Dashboard from './admin/views/Dashboard.jsx';
import MissionControlView from './admin/views/MissionControlView.jsx';
import AudioLibrary from './admin/views/AudioLibrary.jsx';
import ActivityLog from './admin/views/ActivityLog.jsx';
import Operatives from './admin/views/Operatives.jsx';
import SystemStatus from './admin/views/SystemStatus.jsx';
import Settings from './admin/views/Settings.jsx';

function AdminApp({ onLogout }) {
  return (
    <HashRouter>
      <MissionControlProvider>
        <Routes>
          <Route element={<AdminShell onLogout={onLogout} />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/mission-control" element={<MissionControlView />} />
            <Route path="/audio" element={<AudioLibrary />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/operatives" element={<Operatives />} />
            <Route path="/status" element={<SystemStatus />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </MissionControlProvider>
    </HashRouter>
  );
}

function AdminRoot() {
  const remote = isRemote();
  const [status, setStatus] = useState(remote ? 'checking' : 'authed'); // 'checking' | 'authed' | 'login'

  useEffect(() => {
    if (!remote) return;
    silentRefresh().then((ok) => setStatus(ok ? 'authed' : 'login'));
    return subscribeAuth((authed) => setStatus(authed ? 'authed' : 'login'));
  }, [remote]);

  async function handleLogout() {
    await logout();
    setStatus('login');
  }

  if (status === 'checking') {
    return (
      <div className="admin-root admin-root--checking">
        <span className="admin-checking-label">VALIDATING SESSION…</span>
      </div>
    );
  }
  if (status === 'login') {
    return <AdminLogin onAuthenticated={() => setStatus('authed')} />;
  }
  return <AdminApp onLogout={remote ? handleLogout : null} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AudioProvider>
      <AdminRoot />
    </AudioProvider>
  </React.StrictMode>
);
