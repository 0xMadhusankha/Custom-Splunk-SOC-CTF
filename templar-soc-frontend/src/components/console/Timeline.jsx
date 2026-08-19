/* Timeline histogram — mirrors Splunk's event-volume bars.
   Hover reveals a bucket readout; bars use the crimson family. */

import { useState } from 'react';
import './Timeline.css';

export default function Timeline({ buckets }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...buckets, 0.001);
  return (
    <div className="timeline">
      <div className="timeline-controls">
        <span className="tl-label meta-label">EVENT VOLUME</span>
      </div>
      <div className="timeline-chart">
        {buckets.map((b, i) => (
          <div
            key={i}
            className={'tl-bar tl-bar--rise' + (hover === i ? ' is-hover' : '')}
            style={{ height: `${(b / max) * 100}%`, animationDelay: `${i * 22}ms` }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="tl-tip mono">
                <span className="crimson">{Math.round(b).toLocaleString()}</span> events
              </div>
            )}
          </div>
        ))}
        <div className="timeline-baseline" />
      </div>
    </div>
  );
}
