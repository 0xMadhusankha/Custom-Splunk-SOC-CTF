/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — placeholder telemetry & content
   ------------------------------------------------------------
   All data here is MOCK. It reflects the Rogue Assassin intrusion
   scenario (domain: assassin.local) so the SOC feels alive during
   UI review. When wired to Splunk, MockSplunkService is swapped
   for a real SplunkService and these arrays disappear.
   ============================================================ */

export const DOMAIN = 'assassin.local';

export const HOSTS = [
  'WEBPUB-01', 'DC-01', 'FS-02', 'WKS-114', 'WKS-087', 'SQL-01', 'JUMP-01', 'PROXY-01'
];

export const SOURCETYPES = [
  'animus:web:access',
  'WinEventLog:Security',
  'WinEventLog:System',
  'WinEventLog:PowerShell/Operational',
  'Sysmon:Process',
  'Sysmon:Network',
  'stream:dns',
];

/* ---- Synthetic event corpus generator -------------------------------- */
const UA = '"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"';
const BASE = new Date('2026-06-24T21:59:05Z').getTime();

function pad(n) { return String(n).padStart(2, '0'); }
function fmtIso(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0000`;
}

/* Build a deterministic set of raw web-access events that mirror the
   mockup's Investigation Console (the C2 beacon to assets.windowslive-cdn.net). */
function buildWebEvents(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const ts = BASE - i * 46229; // ~46s apart, walking backwards
    const bytes = 150 + ((i * 37) % 90);
    rows.push({
      _time: ts,
      host: 'WEBPUB-01.assassin.local',
      source: '/var/log/animus/web/access.log',
      sourcetype: 'animus:web:access',
      src_ip: '10.20.10.10',
      dest_host: 'assets.windowslive-cdn.net',
      method: 'POST',
      uri_path: '/cdn/v2/asset-sync',
      status: 200,
      bytes_out: bytes,
      _raw: `10.20.10.10 - - [${fmtIso(ts)}] "POST /cdn/v2/asset-sync HTTP/1.1" 200 ${bytes} "https://assets.windowslive-cdn.net" ${UA}`,
    });
  }
  return rows;
}

/* Timeline histogram buckets that mirror the mockup (1 day per column) */
export const TIMELINE = [
  0.42, 0.78, 0.55, 0.83, 0.61, 0.90, 0.58, 0.72, 0.66, 0.80,
  0.63, 0.70, 0.64, 0.86, 0.60, 0.74, 0.68, 0.55, 0.62, 0.58,
  0.71, 0.94, 0.57, 0.52, 0.30, 0.12,
];

export const WEB_EVENTS = buildWebEvents(140);
export const TOTAL_EVENTS = 21040;

/* ---- Alerts (organizer-published; KV: templar_alerts) ---------------- */
export const SEED_ALERTS = [
  {
    _key: 'a1', timestamp: BASE - 1000 * 60 * 6, title: 'Beacon activity observed — WEBPUB-01',
    severity: 'critical', status: 'open', source: 'TEMPLAR_SENSOR_GRID',
    body: 'Recurring 46-second POST beacon from WEBPUB-01 (10.20.10.10) to assets.windowslive-cdn.net. Uniform payload size and interval consistent with automated C2 check-in. Origin traced to the public web tier. Investigation recommended.',
  },
  {
    _key: 'a2', timestamp: BASE - 1000 * 60 * 34, title: 'Suspicious PowerShell execution',
    severity: 'high', status: 'open', source: 'TEMPLAR_EDR',
    body: 'Encoded PowerShell (-enc) invoked under service context on WKS-114. Parent process spawned from a scheduled task with no signed publisher. Correlate with process creation 4688 and Sysmon EventCode 1.',
  },
  {
    _key: 'a3', timestamp: BASE - 1000 * 60 * 58, title: 'Lateral movement detected',
    severity: 'high', status: 'triage', source: 'TEMPLAR_SENSOR_GRID',
    body: 'Type-3 network logons from WEBPUB-01 to FS-02 and SQL-01 using a single privileged account within a 90-second window. Pattern indicates credential reuse consistent with pass-the-hash.',
  },
  {
    _key: 'a4', timestamp: BASE - 1000 * 60 * 120, title: 'Registry persistence detected',
    severity: 'medium', status: 'open', source: 'TEMPLAR_EDR',
    body: 'Run key written under HKLM\\...\\CurrentVersion\\Run referencing a binary in C:\\ProgramData. Autostart persistence established outside change-control window.',
  },
  {
    _key: 'a5', timestamp: BASE - 1000 * 60 * 190, title: 'Failed authentication burst',
    severity: 'low', status: 'closed', source: 'TEMPLAR_IDENTITY',
    body: '38 failed logons (4625) against the JUMP-01 host in under two minutes, followed by a single success. Low confidence — may be benign lockout, retained for correlation.',
  },
];

export const SEED_EMERGENCY = {
  _key: 'e1', timestamp: BASE - 1000 * 60 * 2, title: 'ROGUE PRESENCE CONFIRMED WITHIN SOC PERIMETER',
  severity: 'emergency', source: 'MISSION_CONTROL',
  body: 'The Order confirms an unauthorized faction operated inside this Security Operations Center prior to the current session. Their trail is intact in the historical telemetry. All analysts: reconstruct the intrusion. Do not alter live indexes.',
};

/* ---- Threat Intelligence (organizer-published; KV: templar_threat_intel) */
export const SEED_INTEL = [
  {
    _key: 'i1', timestamp: BASE - 1000 * 60 * 12, category: 'ioc', severity: 'critical',
    title: 'IOC UPDATE — C2 Infrastructure',
    classification: 'TEMPLAR // EYES ONLY',
    body: 'The domain assets.windowslive-cdn.net is a masquerading command-and-control channel. It impersonates a legitimate CDN to evade egress filtering. Any host resolving or beaconing to this domain is considered compromised. Associated beacon interval: ~46s. Pivot on sourcetype=animus:web:access dest_host="assets.windowslive-cdn.net".',
    iocs: [
      { type: 'domain', value: 'assets.windowslive-cdn.net' },
      { type: 'ip', value: '185.220.101.44' },
      { type: 'hash', value: 'e3b0c44298fc1c149afbf4c8996fb924' },
    ],
  },
  {
    _key: 'i2', timestamp: BASE - 1000 * 60 * 45, category: 'campaign', severity: 'high',
    title: 'CAMPAIGN INTELLIGENCE — Rogue Assassin Faction',
    classification: 'TEMPLAR // RESTRICTED',
    body: 'The faction operating within our perimeter favors living-off-the-land tradecraft: encoded PowerShell, scheduled-task persistence, and CDN-masquerade C2. They stage exfiltration through the public web tier to blend with normal traffic. Expect deliberate log-timestamp gaps where anti-forensics was applied.',
    iocs: [],
  },
  {
    _key: 'i3', timestamp: BASE - 1000 * 60 * 80, category: 'technique', severity: 'medium',
    title: 'ANALYST ADVISORY — Handling Recovered Telemetry',
    classification: 'TEMPLAR // RESTRICTED',
    body: 'Historical telemetry recovered from this incident should be treated as evidence, not narrative. Analysts are expected to independently reconstruct the timeline from raw events rather than rely on prior assumptions. Report findings through the standard Mission Control channel.',
    iocs: [],
  },
  {
    _key: 'i4', timestamp: BASE - 1000 * 60 * 150, category: 'infrastructure', severity: 'info',
    title: 'INFRASTRUCTURE OBSERVATION — Web Tier Exposure',
    classification: 'TEMPLAR // INTERNAL',
    body: 'WEBPUB-01 remains the only externally reachable node in the assassin.local estate. Treat it as the most probable initial-access vector for any historical intrusion under review.',
    iocs: [],
  },
];

/* ---- Session identity (mock; later from Splunk /authentication) ------ */
export const SESSION = {
  operator: 'FIELD_OPERATIVE',
  sessionId: 'AID-7F3C9B02',
  classification: 'TOP SECRET',
  clearance: 'ASSASSIN // CAPTURED CREDENTIALS',
  node: 'ERUDITO_NETWORK // UDR_SECTOR',
};
