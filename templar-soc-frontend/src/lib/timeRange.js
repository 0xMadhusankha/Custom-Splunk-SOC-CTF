/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — time-range preset resolution
   ------------------------------------------------------------
   Maps the Investigation Console's time-range preset labels to
   {earliestMs, latestMs} relative to a given anchor timestamp —
   NOT wall-clock Date.now(). The dataset is frozen (generated
   before the event, no new logs during it), so presets like
   "Last 24 hours" must be relative to the dataset's own latest
   indexed event (see mockSplunkService.js's getTimeAnchor()),
   otherwise they'd silently return nothing once the event happens
   long after the data was generated.
   ============================================================ */

const OFFSETS_MS = {
  'Last 15 minutes': 15 * 60 * 1000,
  'Last 24 hours': 24 * 60 * 60 * 1000,
  'Last 7 days': 7 * 24 * 60 * 60 * 1000,
  'Last 30 days': 30 * 24 * 60 * 60 * 1000,
};

/** 'All time' (or any unrecognized label) means no bound. */
export function resolveTimeRange(label, anchorMs) {
  const offset = OFFSETS_MS[label];
  if (!offset) return { earliestMs: undefined, latestMs: undefined };
  return { earliestMs: anchorMs - offset, latestMs: anchorMs };
}
