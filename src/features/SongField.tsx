import type { Track } from '../types';
import { formatClock, suggestionUrl, type SuggestionKind } from '../lib';
import { TrackSearch } from './TrackSearch';

interface Props {
  label: string;
  /** Which cue this field is for; used to word the Google search. */
  kind: SuggestionKind;
  track?: Track;
  startMs: number;
  cueMs: number;
  cueLabel: string;
  canSearch: boolean;
  hint?: string;
  onChange: (p: { track?: Track; startMs?: number; cueMs?: number }) => void;
  preview: (track: Track, startMs: number, cueMs: number) => void;
}

const num = (v: string) => (Number.isFinite(parseFloat(v)) ? Math.max(0, parseFloat(v)) : 0);

export function SongField({ label, kind, track, startMs, cueMs, cueLabel, canSearch, hint, onChange, preview }: Props) {
  return (
    <div className="grid">
      <div>
        <label>{label}</label>
        {track && (
          <div className="row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
            {track.albumArt && <img className="art" src={track.albumArt} alt="" />}
            <div className="grow" style={{ flex: 1, minWidth: 0 }}>
              <div>{track.name}</div>
              <div className="muted">{track.artist} · {formatClock(track.durationMs)}</div>
            </div>
            <button onClick={() => preview(track, startMs, cueMs || 15000)}>▶ Preview</button>
            <a className="btnlink" href={suggestionUrl(track, kind)} target="_blank" rel="noopener noreferrer"
              title="Opens a Google search in a new tab">🔍 Suggested {kind}</a>
            <button className="ghost danger" onClick={() => onChange({ track: undefined })}>Clear</button>
          </div>
        )}
        {canSearch ? <TrackSearch onPick={(t) => onChange({ track: t })} />
          : <div className="muted">Connect Spotify (top right) to search for songs.</div>}
        {hint && <div className="muted" style={{ marginTop: 6 }}>{hint}</div>}
      </div>
      {track && (
        <div className="grid g2">
          <div><label>Song starts at (sec)</label>
            <input type="number" min={0} value={startMs / 1000} onChange={(e) => onChange({ startMs: num(e.target.value) * 1000 })} /></div>
          <div><label>{cueLabel}</label>
            <input type="number" min={0} value={cueMs / 1000} onChange={(e) => onChange({ cueMs: num(e.target.value) * 1000 })} /></div>
        </div>
      )}
    </div>
  );
}
