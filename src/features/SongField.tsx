import { useState } from 'react';
import type { Track } from '../types';
import { formatClock, suggestionUrl, SUGGESTION_STYLES, type SuggestionKind, type SuggestionStyle } from '../lib';
import { TrackSearch } from './TrackSearch';
import { TimeInput } from './TimeInput';
import { loadSuggestStyle, saveSuggestStyle } from './settings';

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

export function SongField({ label, kind, track, startMs, cueMs, cueLabel, canSearch, hint, onChange, preview }: Props) {
  const [style, setStyle] = useState<SuggestionStyle>(loadSuggestStyle);
  const pickStyle = (s: SuggestionStyle) => { setStyle(s); saveSuggestStyle(s); };

  return (
    <div className="grid">
      <div>
        <label>{label}</label>
        {track && (
          <div className="grid" style={{ marginBottom: 8, gap: 8 }}>
            <div className="row">
              {track.albumArt && <img className="art" src={track.albumArt} alt="" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{track.name}</div>
                <div className="muted">{track.artist} · {formatClock(track.durationMs)}</div>
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button onClick={() => preview(track, startMs, cueMs || 15000)}>▶ Preview</button>
              <a className="btnlink" href={suggestionUrl(track, kind, cueMs, style)} target="_blank" rel="noopener noreferrer"
                title="Opens a Google search in a new tab">🔍 Suggested {kind}</a>
              <select style={{ width: 'auto' }} value={style} onChange={(e) => pickStyle(e.target.value as SuggestionStyle)}
                aria-label="Search wording" title="Search wording: try another if Google's answer isn't in seconds">
                {SUGGESTION_STYLES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <div className="spacer" />
              <button className="ghost danger" onClick={() => onChange({ track: undefined })}>Clear</button>
            </div>
          </div>
        )}
        {canSearch ? <TrackSearch onPick={(t) => onChange({ track: t })} />
          : <div className="muted">Connect Spotify (top right) to search for songs.</div>}
        {hint && <div className="muted" style={{ marginTop: 6 }}>{hint}</div>}
      </div>
      {track && (
        <div className="grid g2">
          <div><label>Song starts at (sec)</label>
            <TimeInput label="Song starts at" seconds={startMs / 1000} onCommit={(v) => onChange({ startMs: v * 1000 })} /></div>
          <div><label>{cueLabel}</label>
            <TimeInput label={cueLabel} seconds={cueMs / 1000} onCommit={(v) => onChange({ cueMs: v * 1000 })} /></div>
          <div className="muted" style={{ gridColumn: '1 / -1' }}>Type seconds (41) or minutes:seconds (0:41).</div>
        </div>
      )}
    </div>
  );
}
