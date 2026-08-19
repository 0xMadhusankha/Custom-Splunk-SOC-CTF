/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — single-organizer authentication
   ------------------------------------------------------------
   Exactly one account, ever. Mission Control is used by one
   organizer during the event; this exists to stop a player who
   finds the admin URL from getting in — not to manage identities.
   No registration, no forgot-password, no user management.

   Short-lived access JWT (Authorization: Bearer) + a rotating,
   HttpOnly refresh-token cookie for silent session restore and
   TRUE inactivity expiration: every refresh call slides the
   refresh token's expiry forward; no refresh within the window
   means the row expires and the next attempt forces a re-login.
   ============================================================ */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {
  getMeta, insertRefreshToken, getRefreshToken, deleteRefreshToken,
  touchRefreshToken, pruneExpiredRefreshTokens, audit,
} from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

const ACCESS_TTL_MIN = parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '20', 10);
const REFRESH_TTL_MIN = parseInt(process.env.REFRESH_INACTIVITY_TTL_MIN || '60', 10);
export const REFRESH_COOKIE = 'templar_rt';

// Player session: a single shared "recovered" operator credential gates the
// whole player app (Login.jsx is the only entry point). Long inactivity
// window by design — this is a multi-hour competition, not a quick admin
// task, and many teams share the one credential concurrently (each gets its
// own refresh token row, same as today's organizer sessions already do).
const PLAYER_ACCESS_TTL_MIN = parseInt(process.env.PLAYER_ACCESS_TOKEN_TTL_MIN || '20', 10);
const PLAYER_REFRESH_TTL_MIN = parseInt(process.env.PLAYER_REFRESH_INACTIVITY_TTL_MIN || '480', 10);
export const PLAYER_REFRESH_COOKIE = 'templar_prt';

export function verifyCredentials(username, password) {
  const storedUser = getMeta('admin_username');
  const storedHash = getMeta('admin_password_hash');
  if (!storedUser || !storedHash) return false;
  // constant-time-ish: always run bcrypt.compare even on username mismatch
  // so response timing doesn't leak which check failed.
  const userOk = username === storedUser;
  const passOk = bcrypt.compareSync(password || '', storedHash);
  return userOk && passOk;
}

export function verifyPlayerCredentials(username, password) {
  const storedUser = getMeta('player_username');
  const storedHash = getMeta('player_password_hash');
  if (!storedUser || !storedHash) return false;
  const userOk = username === storedUser;
  const passOk = bcrypt.compareSync(password || '', storedHash);
  return userOk && passOk;
}

export function issueAccessToken() {
  return jwt.sign({ role: 'organizer' }, JWT_SECRET, { expiresIn: `${ACCESS_TTL_MIN}m` });
}

export function issuePlayerAccessToken() {
  return jwt.sign({ role: 'player' }, JWT_SECRET, { expiresIn: `${PLAYER_ACCESS_TTL_MIN}m` });
}

export function issueRefreshToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + REFRESH_TTL_MIN * 60 * 1000;
  insertRefreshToken(token, expiresAt);
  return { token, expiresAt };
}

export function issuePlayerRefreshToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + PLAYER_REFRESH_TTL_MIN * 60 * 1000;
  insertRefreshToken(token, expiresAt); // same table — tokens are opaque, no collision risk
  return { token, expiresAt };
}

/** Rotate a refresh token: validate, delete old, issue new (sliding window). */
export function rotateRefreshToken(oldToken) {
  pruneExpiredRefreshTokens();
  if (!oldToken) return null;
  const row = getRefreshToken(oldToken);
  if (!row || row.expires_at < Date.now()) return null;
  deleteRefreshToken(oldToken);
  return issueRefreshToken();
}

export function rotatePlayerRefreshToken(oldToken) {
  pruneExpiredRefreshTokens();
  if (!oldToken) return null;
  const row = getRefreshToken(oldToken);
  if (!row || row.expires_at < Date.now()) return null;
  deleteRefreshToken(oldToken);
  return issuePlayerRefreshToken();
}

export function revokeRefreshToken(token) { if (token) deleteRefreshToken(token); }
export function revokePlayerRefreshToken(token) { if (token) deleteRefreshToken(token); }

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/api/auth',
  });
}
export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/auth' });
}

export function setPlayerRefreshCookie(res, token, expiresAt) {
  res.cookie(PLAYER_REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/api/player-auth',
  });
}
export function clearPlayerRefreshCookie(res) {
  res.clearCookie(PLAYER_REFRESH_COOKIE, { httpOnly: true, secure: true, sameSite: 'none', path: '/api/player-auth' });
}

/** Express middleware: require a valid ORGANIZER access JWT. Explicitly
    checks role (not just "is this any valid JWT") so a player session token
    can never satisfy an organizer-only route. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'organizer') return res.status(401).json({ error: 'unauthorized' });
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

/** Express middleware: require a valid PLAYER (or organizer) access JWT.
    Organizer sessions are accepted too so the organizer can exercise the
    search API without a separate login. */
export function requirePlayerAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'player' && decoded.role !== 'organizer') return res.status(401).json({ error: 'unauthorized' });
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export function auditFromReq(req, action, detail) {
  audit(action, detail, req.ip);
}
