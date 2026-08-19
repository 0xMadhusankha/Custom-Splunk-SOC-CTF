/* Small formatting helpers shared across surfaces. */

export function fmtClock(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-US', { hour12: true });
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
  const time = d.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${date} ${time}`;
}

export function relTime(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const SEV_ORDER = { emergency: 0, critical: 1, high: 2, medium: 3, low: 4, info: 5 };
