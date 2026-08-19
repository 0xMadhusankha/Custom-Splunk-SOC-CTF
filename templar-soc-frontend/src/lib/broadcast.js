/* ============================================================
   Broadcast taxonomy — the single source of truth for the seven
   things Mission Control can publish. Notifications, the audio
   engine, and Mission Control all read from this map so a type is
   defined exactly once.

   Splunk-ready by design: every type resolves to ONE of the two
   live KV collections (templar_alerts | templar_threat_intel) via
   `channel`, and carries the `category` written into the record.
   Adding a live backend means implementing publishAlert/publishIntel
   against Splunk — this taxonomy does not change.
   ============================================================ */

export const BROADCAST_TYPES = {
  alert: {
    key: 'alert', label: 'OPERATIONAL ALERT', short: 'ALERT',
    cue: 'alert', channel: 'alert', category: null, tone: 'crimson',
    blurb: 'A detection or incident raised to every operative.',
    collection: 'templar_alerts',
  },
  emergency: {
    key: 'emergency', label: 'EMERGENCY BROADCAST', short: 'EMERGENCY',
    cue: 'emergency', channel: 'alert', category: null, tone: 'crimson',
    blurb: 'Full-width crimson override to every session. Use sparingly.',
    collection: 'templar_alerts',
  },
  intel: {
    key: 'intel', label: 'CLASSIFIED INTEL', short: 'INTEL',
    cue: 'intel', channel: 'intel', category: 'advisory', tone: 'gold',
    blurb: 'A classified assessment for the Threat Intelligence surface.',
    collection: 'templar_threat_intel',
  },
  ioc: {
    key: 'ioc', label: 'IOC UPDATE', short: 'IOC',
    cue: 'ioc', channel: 'intel', category: 'ioc', tone: 'crimson',
    blurb: 'New indicators of compromise pushed to the hunt grid.',
    collection: 'templar_threat_intel',
  },
  campaign: {
    key: 'campaign', label: 'CAMPAIGN UPDATE', short: 'CAMPAIGN',
    cue: 'campaign', channel: 'intel', category: 'campaign', tone: 'gold',
    blurb: 'Adversary campaign context and tradecraft.',
    collection: 'templar_threat_intel',
  },
  tactical: {
    key: 'tactical', label: 'TACTICAL GUIDANCE', short: 'TACTICAL',
    cue: 'tactical', channel: 'intel', category: 'technique', tone: 'steel',
    blurb: 'Direct guidance to steer operatives mid-operation.',
    collection: 'templar_threat_intel',
  },
  infrastructure: {
    key: 'infrastructure', label: 'INFRASTRUCTURE CHANGE', short: 'INFRA',
    cue: 'infrastructure', channel: 'intel', category: 'infrastructure', tone: 'steel',
    blurb: 'Changes to the estate operatives are working against.',
    collection: 'templar_threat_intel',
  },
};

export const BROADCAST_ORDER = ['alert', 'emergency', 'intel', 'ioc', 'campaign', 'tactical', 'infrastructure'];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

/** Normalize any stored record → a broadcast type key. */
export function resolveType(rec) {
  if (!rec) return 'alert';
  if (rec.btype && BROADCAST_TYPES[rec.btype]) return rec.btype;
  if (rec.severity === 'emergency') return 'emergency';
  // Intel records carry a category; alert records do not.
  if (rec.category) {
    if (rec.category === 'ioc') return 'ioc';
    if (rec.category === 'campaign') return 'campaign';
    if (rec.category === 'technique' || rec.category === 'tactical') return 'tactical';
    if (rec.category === 'infrastructure') return 'infrastructure';
    return 'intel';
  }
  return 'alert';
}

export function typeMeta(rec) { return BROADCAST_TYPES[resolveType(rec)]; }

/** Pick the audio cue for a record, sharpening by severity for alerts. */
export function cueFor(rec) {
  const t = resolveType(rec);
  if (t === 'alert') {
    if (rec.severity === 'critical') return 'critical';
    if (rec.severity === 'high') return 'high';
    return 'alert';
  }
  return BROADCAST_TYPES[t].cue;
}
