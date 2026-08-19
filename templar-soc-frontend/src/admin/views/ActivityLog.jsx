/* ACTIVITY LOG — dedicated monitoring page. The organizer session
   audit (AuditPanel, reused as-is) plus the full editable broadcast
   history. EDIT on a row routes back to Mission Control (handled by
   the shared editItem()). */
import AuditPanel from '../AuditPanel.jsx';
import BroadcastHistory from '../components/BroadcastHistory.jsx';

export default function ActivityLog() {
  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // MISSION CONTROL</div>
          <h1 className="display-heading surface-title mc-title">ACTIVITY LOG</h1>
          <div className="surface-sub">Broadcast history and organizer session activity.</div>
        </div>
      </div>

      <BroadcastHistory />
      <AuditPanel />
    </div>
  );
}
