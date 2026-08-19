/* Audio console — enable, volume, ambient bed, and cue auditioning.
   Extracted verbatim from the original MissionControl.jsx — logic unchanged. */
export default function AudioConsole({ audio }) {
  if (!audio) return null;
  const { enabled, volume, ambient, ready, setEnabled, setVolume, setAmbient, play, cues } = audio;
  const testCues = ['alert', 'emergency', 'intel', 'ioc', 'campaign', 'tactical', 'infrastructure', 'critical', 'complete', 'warning'];
  return (
    <div className="mc-panel panel mc-audio">
      <div className="panel-head">
        <span className="title">AUDIO CONSOLE</span>
        <span className={'mc-audio-state' + (ready ? ' is-ready' : '')}>{ready ? '● ARMED' : '○ IDLE'}</span>
      </div>
      <div className="mc-audio-body">
        <div className="mc-audio-controls">
          <button className={'mc-toggle' + (enabled ? ' is-on' : '')} onClick={() => setEnabled(!enabled)}>
            <span className="mc-toggle-knob" />{enabled ? 'SOUND ON' : 'SOUND OFF'}
          </button>
          <button className={'mc-toggle' + (ambient ? ' is-on' : '')} onClick={() => setAmbient(!ambient)} disabled={!enabled}>
            <span className="mc-toggle-knob" />AMBIENT BED
          </button>
        </div>
        <div className="mc-vol">
          <span className="meta-label">VOLUME</span>
          <input className="mc-slider" type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} disabled={!enabled} />
          <span className="mc-vol-n mono">{Math.round(volume * 100)}</span>
        </div>
        <div className="mc-audio-tests">
          <div className="meta-label mc-audio-testlabel">AUDITION CUES</div>
          <div className="mc-cuegrid">
            {testCues.map((c) => (
              <button key={c} className="mc-cuebtn" onClick={() => play(c)} disabled={!enabled} title={cues[c]?.label}>{cues[c]?.label || c}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
