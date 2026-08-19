/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — service interface (integration seam)
   ------------------------------------------------------------
   This module defines the CONTRACT the UI depends on. Today it is
   backed by MockSplunkService. To go live, implement the same
   methods against Splunk's REST API and swap the export in
   ./index.js — no screen needs to change.

   Splunk mapping reference (Splunk Enterprise 10.4 REST):

     search(spl, timeRange)   -> POST /services/search/v2/jobs        (create job)
                                 GET  /services/search/v2/jobs/{sid}/results
     getAlerts()              -> GET  /servicesNS/nobody/templar_soc/
                                        storage/collections/data/templar_alerts
     getThreatIntel()         -> GET  .../storage/collections/data/templar_threat_intel
     publishAlert(rec)        -> POST .../storage/collections/data/templar_alerts   (admin only)
     publishIntel(rec)        -> POST .../storage/collections/data/templar_threat_intel
     publishBroadcast(t,rec)  -> POST .../data/<coll for type t>                     (admin only)
     scheduleBroadcast(...)   -> POST .../data/templar_scheduled  (server scheduler flushes → collection)
     getScheduled()           -> GET  .../data/templar_scheduled?sort=whenMs
     getBroadcasts()          -> GET  both collections, merged + normalized client-side
     updateBroadcast(k,patch) -> POST .../data/<coll>/{k}                            (admin only)
     deleteBroadcast(k)       -> DELETE .../data/<coll>/{k}                          (admin only)
     getConnectedPlayers()    -> GET  /services/authentication/httpauth-tokens  (or a presence lookup)
     pollLatest()             -> GET  .../data/<coll>?sort=-timestamp&limit=1
     getSession()             -> GET  /services/authentication/current-context

   RBAC: player role is read-only; publish/schedule/update/delete calls
   require the admin (Mission Control) role and 403 for players —
   enforced server-side, never by hiding UI.
   ============================================================ */

/**
 * @typedef {Object} SplunkEvent
 * @property {number} _time      epoch ms
 * @property {string} _raw       raw event line
 * @property {string} host
 * @property {string} source
 * @property {string} sourcetype
 * ...plus extracted fields
 */

/** Abstract shape — documented for implementers. All methods return Promises. */
export class SplunkService {
  /** Run an SPL search. Returns { events, stats, timeline, meta }. */
  async search(/* spl, timeRange */) { throw new Error('not implemented'); }
  /** KV Store: templar_alerts. */
  async getAlerts() { throw new Error('not implemented'); }
  /** KV Store: templar_threat_intel. */
  async getThreatIntel() { throw new Error('not implemented'); }
  /** Admin only. Write one record to templar_alerts. */
  async publishAlert(/* record */) { throw new Error('not implemented'); }
  /** Admin only. Write one record to templar_threat_intel. */
  async publishIntel(/* record */) { throw new Error('not implemented'); }
  /** Admin only. Generic publish dispatched by broadcast type. */
  async publishBroadcast(/* btype, record */) { throw new Error('not implemented'); }
  /** Admin only. Queue a broadcast to fire at whenMs (epoch). */
  async scheduleBroadcast(/* btype, record, whenMs */) { throw new Error('not implemented'); }
  /** Pending scheduled broadcasts. */
  async getScheduled() { throw new Error('not implemented'); }
  /** Normalized history across both collections + the scheduled queue. */
  async getBroadcasts() { throw new Error('not implemented'); }
  /** Admin only. Patch a published or scheduled broadcast. */
  async updateBroadcast(/* key, patch */) { throw new Error('not implemented'); }
  /** Admin only. Remove a published or scheduled broadcast. */
  async deleteBroadcast(/* key */) { throw new Error('not implemented'); }
  /** Connected operative sessions (presence roster). */
  async getConnectedPlayers() { throw new Error('not implemented'); }
  /** Latest record across both collections, for the notification poller. */
  async pollLatest() { throw new Error('not implemented'); }
  /** Current authenticated context (operator, session id, clearance). */
  async getSession() { throw new Error('not implemented'); }
  /** Admin only. Push an uploaded voice to every operative for background
      playback (ephemeral — not stored, not a broadcast record). */
  async pushVoice(/* soundId, title */) { throw new Error('not implemented'); }
}
