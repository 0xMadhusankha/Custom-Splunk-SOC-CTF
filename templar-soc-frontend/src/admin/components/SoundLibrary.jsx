/* Custom notification sound library — upload, preview, rename,
   set-default, delete, and organize by category. Playback reuses the
   AudioEngine master bus via audio.playSound().
   Extracted verbatim from the original MissionControl.jsx — logic unchanged. */
import { useRef, useState } from 'react';
import { SOUND_CATEGORIES, SOUND_ACCEPT } from '../../audio/soundLibrary.js';

export default function SoundLibrary({ audio, sounds, defaultId, uploadCat, setUploadCat, onUpload, onRename, onDelete, onSetDefault, onSetCategory, onPushVoice }) {
  const fileRef = useRef(null);
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [drag, setDrag] = useState(false);

  function pick() { fileRef.current?.click(); }
  function onFiles(e) { if (e.target.files?.length) onUpload(e.target.files); e.target.value = ''; }
  function onDrop(e) { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files); }
  function startEdit(s) { setEditId(s.id); setEditVal(s.name); }
  function commitEdit() { if (editId && editVal.trim()) onRename(editId, editVal.trim()); setEditId(null); }

  return (
    <div className="mc-panel panel mc-sound">
      <div className="panel-head">
        <span className="title">SOUND LIBRARY</span>
        <span className="mc-sound-count meta-label">{sounds.length} FILES</span>
      </div>
      <div
        className={'mc-sound-upload' + (drag ? ' is-drag' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <select className="select mc-sound-cat" value={uploadCat} onChange={(e) => setUploadCat(e.target.value)}>
          {SOUND_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn--sm mc-sound-add" onClick={pick}>＋ UPLOAD</button>
        <input ref={fileRef} type="file" accept={SOUND_ACCEPT} multiple hidden onChange={onFiles} />
      </div>
      <div className="mc-sound-hint meta-label">MP3 · WAV · OGG — drop or upload · ▶ previews for you only · 📡 PUSH transmits to every operative</div>

      <div className="mc-sound-list scroll-y">
        {sounds.length === 0 && <div className="mc-empty">No sounds uploaded yet.</div>}
        {sounds.map((s) => {
          const isDef = defaultId === s.id;
          return (
            <div key={s.id} className={'mc-snd' + (isDef ? ' is-default' : '')}>
              <button className={'mc-snd-star' + (isDef ? ' on' : '')} title={isDef ? 'Default sound' : 'Set as default'} onClick={() => onSetDefault(s.id)}>★</button>
              <div className="mc-snd-main">
                {editId === s.id ? (
                  <input
                    className="input mc-snd-edit" value={editVal} autoFocus
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null); }}
                  />
                ) : (
                  <div className="mc-snd-name" onDoubleClick={() => startEdit(s)} title="Double-click to rename">{s.name}</div>
                )}
                <div className="mc-snd-meta">
                  <select className="mc-snd-catsel" value={s.category} onChange={(e) => onSetCategory(s.id, e.target.value)}>
                    {SOUND_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <span className="mc-snd-size">{fmtSize(s.size)}</span>
                </div>
              </div>
              <div className="mc-snd-actions">
                <button className="mc-mini-btn" title="Preview (only you hear this)" onClick={() => audio?.playSound(s.id)}>▶</button>
                {onPushVoice && (
                  <button className="mc-mini-btn mc-mini-btn--go mc-snd-push" title="Transmit to ALL operatives — plays in their background" onClick={() => onPushVoice(s.id, s.name)}>📡 PUSH</button>
                )}
                <button className="mc-mini-btn" title="Rename" onClick={() => startEdit(s)}>✎</button>
                <button className="mc-mini-btn mc-mini-btn--danger" title="Delete" onClick={() => onDelete(s.id)}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtSize(b) { if (!b) return ''; if (b < 1024) return b + 'B'; if (b < 1048576) return (b / 1024).toFixed(0) + 'KB'; return (b / 1048576).toFixed(1) + 'MB'; }
