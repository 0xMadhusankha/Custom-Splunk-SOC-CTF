/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — search API anti-automation guard
   ------------------------------------------------------------
   This is a hacking competition: players WILL find /api/search and
   may try to script/automate it (including via AI agents) instead
   of using the console. This is deliberately lightweight friction
   proportionate to a CTF threat model (fixed small dataset, known
   teams) — not a WAF, and NOT a substitute for the Splunk-side
   read-only/index-scoped service account, which remains the real
   backstop against destructive or expensive SPL. None of this ever
   throttles a player using the actual console normally.

   Layers:
     - originGuard   : reject requests whose Origin isn't the deployed
                       frontend (applied to both /api/search and
                       /api/search/anchor).
     - searchGuard   : SPL sanity checks + per-session/per-IP rate and
                       concurrency limits (applied to /api/search only).
   ============================================================ */

import crypto from 'node:crypto';

const SID_COOKIE = 'templar_sid';
const MAX_SPL_LENGTH = 10000;
const WINDOW_MS = 60000;
const SESSION_LIMIT = 20;   // searches per session per WINDOW_MS
const IP_LIMIT = 60;        // backstop if the session cookie is stripped
const CONCURRENCY_LIMIT = 2; // in-flight searches per session
const SWEEP_MS = 5 * 60000;

const sessionWindows = new Map(); // sid -> { count, windowStart }
const ipWindows = new Map();      // ip  -> { count, windowStart }
const inFlight = new Map();       // sid -> count
const loginWindows = new Map();   // ip  -> { count, windowStart } (auth brute-force)

function ensureSessionId(req, res) {
  let sid = req.cookies?.[SID_COOKIE];
  if (!sid) {
    sid = crypto.randomBytes(16).toString('hex');
    res.cookie(SID_COOKIE, sid, { httpOnly: true, secure: true, sameSite: 'lax' });
  }
  return sid;
}

function checkWindow(map, key, limit) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    map.set(key, entry);
  }
  entry.count++;
  return entry.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionWindows) if (now - v.windowStart > WINDOW_MS * 5) sessionWindows.delete(k);
  for (const [k, v] of ipWindows) if (now - v.windowStart > WINDOW_MS * 5) ipWindows.delete(k);
  for (const [k, v] of loginWindows) if (now - v.windowStart > WINDOW_MS * 15) loginWindows.delete(k);
}, SWEEP_MS);

/* ---- login brute-force limiter -----------------------------------------
   /api/auth/login and /api/player-auth/login are unauthenticated and back a
   single shared credential each — prime targets for automated password
   guessing. Cap attempts per client IP hard. bcrypt(cost 12) already makes
   each guess slow; this stops the volume. Applied in front of the login
   handlers, so it counts every attempt (success or fail). */
const LOGIN_LIMIT = 10;          // attempts per IP per minute
export function loginRateLimit(req, res, next) {
  if (!checkWindow(loginWindows, req.ip, LOGIN_LIMIT)) {
    return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many login attempts — wait a minute and try again.' });
  }
  next();
}

/* ---- SPL safety denylist ------------------------------------------------
   Players submit RAW SPL by design, and the primary backstop is the Splunk
   service account (read-only, scoped to the single investigation index). This
   is defense-in-depth at the proxy: reject SPL that invokes commands which
   have NO place in a read-only investigation — data exfiltration/writes
   (outputlookup, collect, summaryindex…), deletion, host/command execution
   (script, run, sendemail, sendalert), or server-side request forgery /
   internal enumeration (rest, dbxquery, crawl). None of these are search or
   analytics commands, so blocking them removes attack surface without
   constraining any legitimate log investigation. Checked per pipe segment,
   so it also catches the command inside a subsearch. */
const DENIED_COMMANDS = new Set([
  'outputlookup', 'outputcsv', 'outputtext', 'collect', 'mcollect', 'tscollect',
  'meventcollect', 'stash', 'summaryindex', 'delete', 'sendemail', 'sendalert',
  'script', 'runshellscript', 'run', 'rest', 'crawl', 'dbxquery', 'dbxlookup',
  'dump', 'loadjob', 'sistats', 'sitimechart', 'sichart', 'sitop', 'sirare',
]);
function deniedCommand(spl) {
  for (const seg of spl.split('|')) {
    const m = seg.match(/^\s*([a-zA-Z_][\w]*)/);
    if (m && DENIED_COMMANDS.has(m[1].toLowerCase())) return m[1].toLowerCase();
  }
  return null;
}

/** Reject any request whose Origin header isn't the deployed frontend.
    Unlike the relay's general originAllowlist (which lets no-Origin,
    non-browser calls through — a login/JWT problem, not this one's),
    the search API has no legitimate server-to-server caller, so a
    matching Origin is required outright. */
export function originGuard(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Request origin not allowed.' });
    }
    next();
  };
}

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

export function searchGuard(req, res, next) {
  const sid = ensureSessionId(req, res);
  const ip = req.ip;

  const spl = req.body?.spl;
  if (typeof spl !== 'string' || !spl.trim()) {
    return res.status(400).json({ error: 'SPL_ERROR', message: 'A search query is required.' });
  }
  if (spl.length > MAX_SPL_LENGTH) {
    return res.status(400).json({ error: 'SPL_ERROR', message: 'Search query is too long.' });
  }
  if (CONTROL_CHARS.test(spl)) {
    return res.status(400).json({ error: 'SPL_ERROR', message: 'Search query contains invalid characters.' });
  }
  const denied = deniedCommand(spl);
  if (denied) {
    return res.status(400).json({ error: 'SPL_ERROR', message: `The "${denied}" command is not permitted in this environment.` });
  }

  if ((inFlight.get(sid) || 0) >= CONCURRENCY_LIMIT) {
    return res.status(429).json({ error: 'RATE_LIMITED', message: 'A search is already running for this session — wait for it to finish.' });
  }
  if (!checkWindow(sessionWindows, sid, SESSION_LIMIT) || !checkWindow(ipWindows, ip, IP_LIMIT)) {
    return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many searches — slow down and try again in a moment.' });
  }

  inFlight.set(sid, (inFlight.get(sid) || 0) + 1);
  res.on('finish', () => {
    const n = (inFlight.get(sid) || 1) - 1;
    if (n <= 0) inFlight.delete(sid); else inFlight.set(sid, n);
  });
  next();
}
