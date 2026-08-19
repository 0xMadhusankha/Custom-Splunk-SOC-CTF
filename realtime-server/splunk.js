/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — Splunk search proxy
   ------------------------------------------------------------
   Fully generic SPL executor: forwards whatever query the player
   submitted to Splunk's job-based search REST API verbatim — no
   sourcetype/field-name knowledge anywhere in this file. The only
   shaping happens AFTER Splunk answers, and it's driven purely by
   which keys are present on the returned rows (does the first row
   have `_time`?), never by what those keys/values mean. A query
   against a log source that doesn't exist yet just comes back with
   zero rows, exactly like any other empty search — never a special
   case here.

   Talks to Splunk's management API (8089) over classic `https`
   (not global fetch) so a self-signed local cert can be accepted
   via a custom Agent without adding a dependency.
   ============================================================ */

import https from 'node:https';
import { URLSearchParams } from 'node:url';

const SPLUNK_HOST = process.env.SPLUNK_HOST || '127.0.0.1';
const SPLUNK_MGMT_PORT = parseInt(process.env.SPLUNK_MGMT_PORT || '8089', 10);
const SPLUNK_USERNAME = process.env.SPLUNK_USERNAME;
const SPLUNK_PASSWORD = process.env.SPLUNK_PASSWORD;
const SPLUNK_VERIFY_TLS = process.env.SPLUNK_VERIFY_TLS === 'true';
export const SPLUNK_INDEX = process.env.SPLUNK_INDEX || 'templar_investigation';
const SEARCH_TIMEOUT_MS = parseInt(process.env.SPLUNK_SEARCH_TIMEOUT_MS || '45000', 10);
const MAX_RESULTS = parseInt(process.env.SPLUNK_MAX_RESULTS || '5000', 10);
const HEALTH_INTERVAL_MS = 20000;

if (!SPLUNK_USERNAME || !SPLUNK_PASSWORD) {
  throw new Error('SPLUNK_USERNAME and SPLUNK_PASSWORD are required');
}

const authHeader = 'Basic ' + Buffer.from(`${SPLUNK_USERNAME}:${SPLUNK_PASSWORD}`).toString('base64');
const agent = new https.Agent({ rejectUnauthorized: SPLUNK_VERIFY_TLS });

function splunkRequest(pathname, { method = 'GET', form } = {}) {
  return new Promise((resolve, reject) => {
    const body = form ? new URLSearchParams(form).toString() : null;
    const req = https.request({
      host: SPLUNK_HOST,
      port: SPLUNK_MGMT_PORT,
      path: pathname,
      method,
      agent,
      headers: {
        Authorization: authHeader,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : {}; } catch { /* non-JSON body, leave null */ }
        resolve({ status: res.statusCode, json, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function splunkError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function extractMessages(json) {
  const msgs = json?.messages;
  if (!Array.isArray(msgs) || !msgs.length) return null;
  return msgs.map((m) => m.text).filter(Boolean).join('; ') || null;
}

/** Splunk's search/jobs endpoint requires the string to start with
    "search" or "|" — this is a REST-API syntax requirement, not a
    log-source assumption, so it applies identically to any query. */
function normalizeSearch(spl) {
  const s = (spl || '').trim();
  if (/^\|/.test(s) || /^search\b/i.test(s)) return s;
  return `search ${s}`;
}

async function createJob(spl, { earliestMs, latestMs } = {}) {
  const form = { search: normalizeSearch(spl), output_mode: 'json', exec_mode: 'normal' };
  if (earliestMs != null) form.earliest_time = String(earliestMs / 1000);
  if (latestMs != null) form.latest_time = String(latestMs / 1000);
  const { status, json } = await splunkRequest('/services/search/jobs', { method: 'POST', form });
  if (status >= 400 || !json?.sid) {
    throw splunkError('SPL_ERROR', extractMessages(json) || `Splunk rejected the search (HTTP ${status}).`);
  }
  return json.sid;
}

async function waitForJob(sid, deadline) {
  for (;;) {
    if (Date.now() > deadline) {
      throw splunkError('SPLUNK_TIMEOUT', 'Search exceeded the maximum execution time. Try narrowing the search.');
    }
    const { json } = await splunkRequest(`/services/search/jobs/${sid}?output_mode=json`);
    const content = json?.entry?.[0]?.content;
    if (!content) { await sleep(400); continue; }
    if (content.dispatchState === 'FAILED') {
      const { json: resultsJson } = await splunkRequest(`/services/search/jobs/${sid}/results?output_mode=json`);
      throw splunkError('SPL_ERROR', extractMessages(resultsJson) || 'Search failed.');
    }
    if (content.dispatchState === 'DONE') return content;
    await sleep(400);
  }
}

async function fetchResults(sid) {
  const { json } = await splunkRequest(`/services/search/jobs/${sid}/results?output_mode=json&count=${MAX_RESULTS}&offset=0`);
  return json?.results || [];
}

/** Best-effort cleanup so job objects don't accumulate on the indexer over
    a long event — never allowed to affect the response to the player. */
async function discardJob(sid) {
  try { await splunkRequest(`/services/search/jobs/${sid}`, { method: 'DELETE' }); } catch { /* ignore */ }
}

function castCell(v) {
  if (typeof v !== 'string') return v;
  return /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v) ? Number(v) : v;
}

function normalizeEventRow(row) {
  const time = typeof row._time === 'number' ? row._time : Date.parse(row._time);
  return { ...row, _time: time };
}

function buildTimeline(events, bucketCount = 30) {
  const times = events.map((e) => e._time).filter((t) => Number.isFinite(t));
  if (!times.length) return [];
  const min = Math.min(...times), max = Math.max(...times);
  const span = Math.max(max - min, 1);
  const buckets = new Array(bucketCount).fill(0);
  for (const t of times) {
    let idx = Math.floor(((t - min) / span) * bucketCount);
    if (idx >= bucketCount) idx = bucketCount - 1;
    if (idx < 0) idx = 0;
    buckets[idx]++;
  }
  return buckets;
}

/** Mode is decided purely by whether the first returned row has a `_time`
    key — true for raw events AND for `| table _time ...` projections that
    drop `_raw`; false for pure aggregations (`| stats ...`). No knowledge
    of sourcetypes or field semantics is used. */
function shapeResults(rows, jobContent, spl, timeRangeLabel) {
  const total = jobContent.resultCount != null ? Number(jobContent.resultCount) : rows.length;
  const dispatched = Date.now();
  const meta = { total, scanned: total, spl, timeRange: timeRangeLabel, dispatched };

  if (rows.length && Object.prototype.hasOwnProperty.call(rows[0], '_time')) {
    const events = rows.map(normalizeEventRow);
    return { mode: 'events', events, timeline: buildTimeline(events), meta };
  }

  const columns = rows.length ? Object.keys(rows[0]) : [];
  return {
    mode: 'stats',
    columns,
    rows: rows.map((r) => columns.map((c) => castCell(r[c]))),
    timeline: [],
    meta,
  };
}

export async function runSearch(spl, { earliestMs, latestMs, timeRangeLabel } = {}) {
  const started = Date.now();
  const deadline = started + SEARCH_TIMEOUT_MS;
  const sid = await createJob(spl, { earliestMs, latestMs });
  try {
    const content = await waitForJob(sid, deadline);
    const rows = await fetchResults(sid);
    const result = shapeResults(rows, content, spl, timeRangeLabel);
    return { result, durationMs: Date.now() - started };
  } finally {
    discardJob(sid);
  }
}

/* ---- time-anchor: frozen dataset, so cache the answer for the process's
   lifetime once a lookup succeeds ---- */
let anchorCache = null;
export async function getLatestEventTime() {
  if (anchorCache != null) return anchorCache;
  try {
    const sid = await createJob(`| tstats latest(_time) as latest where index=${SPLUNK_INDEX}`, {});
    const deadline = Date.now() + SEARCH_TIMEOUT_MS;
    try {
      await waitForJob(sid, deadline);
      const rows = await fetchResults(sid);
      const raw = rows?.[0]?.latest;
      anchorCache = raw != null ? Math.round(Number(raw) * 1000) : Date.now();
    } finally {
      discardJob(sid);
    }
    return anchorCache;
  } catch {
    return Date.now(); // don't cache a failure — try again next call
  }
}

/* ---- background health check ---- */
let health = { healthy: true, checkedAt: 0 };
async function pingSplunk() {
  try {
    await splunkRequest('/services/server/info?output_mode=json');
    health = { healthy: true, checkedAt: Date.now() };
  } catch {
    health = { healthy: false, checkedAt: Date.now() };
  }
}
export function isSplunkHealthy() {
  if (Date.now() - health.checkedAt > HEALTH_INTERVAL_MS * 2) pingSplunk(); // opportunistic re-check
  return health.healthy;
}
pingSplunk();
setInterval(pingSplunk, HEALTH_INTERVAL_MS);
