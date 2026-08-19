/* AUDIO LIBRARY — dedicated audio management page. The existing Audio
   Console (enable/volume/ambient/cue tests) + Sound Library (upload/
   rename/default/delete) moved verbatim from the old right rail. */
import { useMissionControl } from '../MissionControlContext.jsx';
import AudioConsole from '../components/AudioConsole.jsx';
import SoundLibrary from '../components/SoundLibrary.jsx';

export default function AudioLibrary() {
  const {
    audio, sounds, defaultSoundId, uploadCat, setUploadCat,
    onUploadFiles, onDeleteSound, onSetDefaultSound, onRenameSound, onSetSoundCategory, onPushVoice,
  } = useMissionControl();

  return (
    <div className="mc">
      <div className="mc-scanbar" />

      <div className="surface-head mc-head">
        <div>
          <div className="meta-label gold">TEMPLAR ORDER // MISSION CONTROL</div>
          <h1 className="display-heading surface-title mc-title">AUDIO LIBRARY</h1>
          <div className="surface-sub">Notification sounds and the audio console for every operative session.</div>
        </div>
      </div>

      <div className="admin-two">
        <AudioConsole audio={audio} />
        <SoundLibrary
          audio={audio}
          sounds={sounds}
          defaultId={defaultSoundId}
          uploadCat={uploadCat}
          setUploadCat={setUploadCat}
          onUpload={onUploadFiles}
          onRename={onRenameSound}
          onDelete={onDeleteSound}
          onSetDefault={onSetDefaultSound}
          onSetCategory={onSetSoundCategory}
          onPushVoice={onPushVoice}
        />
      </div>
    </div>
  );
}
