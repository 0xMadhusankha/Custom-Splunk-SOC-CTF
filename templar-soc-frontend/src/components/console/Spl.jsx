/* SPL editor — a textarea with a syntax-highlighted overlay.
   Lightweight tokenizer (commands, functions, operators, strings,
   fields) purely for feel; the real SPL executes in Splunk. */

import { useMemo } from 'react';
import './Spl.css';

const COMMANDS = ['search', 'table', 'sort', 'stats', 'eval', 'where', 'rename', 'fields', 'dedup', 'head', 'tail', 'top', 'rare', 'timechart', 'chart', 'bucket', 'inputlookup', 'outputlookup', 'rex', 'transaction', 'lookup', 'makeresults', 'join', 'append'];
const OPERATORS = ['OR', 'AND', 'NOT', 'BY', 'AS', 'by', 'as'];

function highlight(text) {
  const lines = text.split('\n');
  return lines.map((line, li) => {
    // tokenize preserving whitespace & strings
    const parts = [];
    const re = /("[^"]*"|\|)|([A-Za-z_][A-Za-z0-9_]*)|(=|<|>|-)|(\s+)|(.)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const [tok] = m;
      if (m[1] === '|') parts.push(<span key={m.index} className="spl-pipe">|</span>);
      else if (m[1]) parts.push(<span key={m.index} className="spl-string">{tok}</span>);
      else if (m[2]) {
        const w = tok;
        if (COMMANDS.includes(w.toLowerCase())) parts.push(<span key={m.index} className="spl-cmd">{w}</span>);
        else if (OPERATORS.includes(w)) parts.push(<span key={m.index} className="spl-op">{w}</span>);
        else parts.push(<span key={m.index} className="spl-field">{w}</span>);
      } else if (m[3]) parts.push(<span key={m.index} className="spl-eq">{tok}</span>);
      else parts.push(<span key={m.index}>{tok}</span>);
    }
    return <div key={li} className="spl-line">{parts.length ? parts : <span>&nbsp;</span>}</div>;
  });
}

export default function Spl({ value, onChange, onRun }) {
  const overlay = useMemo(() => highlight(value), [value]);
  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onRun?.(); }
    if (e.key === 'Tab') { e.preventDefault(); const t = e.target; const s = t.selectionStart; const nv = value.slice(0, s) + '  ' + value.slice(t.selectionEnd); onChange(nv); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
  }
  return (
    <div className="spl">
      <div className="spl-gutter" aria-hidden="true">
        {value.split('\n').map((_, i) => <div key={i} className="spl-lineno">{i + 1}</div>)}
      </div>
      <div className="spl-editor">
        <pre className="spl-overlay" aria-hidden="true">{overlay}</pre>
        <textarea
          className="spl-input"
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
        />
      </div>
      <div className="spl-hint meta-label">⌘/CTRL + ↵ TO RUN</div>
    </div>
  );
}
