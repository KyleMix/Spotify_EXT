import { useState } from 'react';
import type { Track } from '../types';
import { formatClock, nudgeStart, suggestionUrl, SUGGESTION_STYLES, type SuggestionKind, type SuggestionStyle } from '../lib';
import { TrackSearch } from './TrackSearch';
import { TimeInput } from './TimeInput';
import { loadSuggestStyle, saveSuggestStyle } from './settings';
import { TRACK_MIME } from './SongBank';

/** Lets the editor hear a song and read where playback is, so cue points can be set by ear. */
export interface Audition {
  play: (track: Track, startMs: number, cueMs: number) => void;
  stop: () => void;
  position: () => Promise<number | null>;
  /** False until Spotify is connected and the player is ready. */
  available: boolean;
}

const NUDGES = [-5, -1, -0.5, 0.5, 1, 5];

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
  audition: Audition;
  /** Song-bank drag in progress: show this field as a drop target. Omit for fields that don't accept drops. */
  dropActive?: boolean;
}

export function SongField({ label, kind, track, startMs, cueMs, cueLabel, canSearch, hint, onChange, audition, dropActive }: Props) {
  const [over, setOver] = useState(false);
  const [style, setStyle] = useState<SuggestionStyle>(loadSuggestStyle);
  const [note, setNote] = useState('');
  const pickStyle = (s: SuggestionStyle) => { setStyle(s); saveSuggestStyle(s); };

  const dropProps = dropActive ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(TRACK_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); },
    onDrop: (e: React.DragEvent) => {
      setOver(false);
      const raw = e.dataTransfer.getData(TRACK_MIME);
      if (!raw) return;
      e.preventDefault();
      try { onChange({ track: JSON.parse(raw) as Track }); } catch { /* ignore a malformed drop */ }
    },
  } : {};

  return (
    <div className={dropActive ? 'dz-wrap' : undefined} {...dropProps}>
    <div className={`grid ${dropActive ? `dropzone${over ? ' over' : ''}` : ''}`}>
      {dropActive && <div className="dz-label" aria-hidden>⬇ Drop here to set the {kind} song</div>}
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
              <button disabled={!audition.available} title={audition.available ? 'Play from the start point' : 'Connect Spotify and wait for "Spotify ready" to preview'}
                onClick={() => audition.play(track, startMs, cueMs || 15000)}>▶ Preview</button>
              <a className="btnlink" href={suggestionUrl(track, kind, cueMs, style)} target="_blank" rel="noopener noreferrer"
                title="Opens a Google search in a new tab">🔍 Suggested {kind}</a>
              <select style={{ width: 'auto' }} value={style} onChange={(e) => pickStyle(e.target.value as SuggestionStyle)}
                aria-label="Search wording" title="Search wording: try another if Google's answer isn't in seconds">
                {SUGGESTION_STYLES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <div className="spacer" />
              <button className="ghost danger" title="Remove this song" onClick={() => onChange({ track: undefined })}>Remove song</button>
            </div>
          </div>
        )}
        {canSearch ? <TrackSearch onPick={(t) => onChange({ track: t })} />
          : <div className="muted">Connect Spotify (top right) to search for songs and hear previews.</div>}
        {hint && <div className="muted" style={{ marginTop: 6 }}>{hint}</div>}
      </div>
      {track && (
        <div className="grid g2">
          <div><label>Start point (seconds into the song)</label>
            <TimeInput label="Song starts at" seconds={startMs / 1000} onCommit={(v) => onChange({ startMs: v * 1000 })} /></div>
          <div><label>{cueLabel}</label>
            <TimeInput label={cueLabel} seconds={cueMs / 1000} onCommit={(v) => onChange({ cueMs: v * 1000 })} /></div>
          <div className="muted" style={{ gridColumn: '1 / -1' }}>Type seconds (41) or minutes:seconds (0:41). Press Enter or click away to save.</div>
          <details style={{ gridColumn: '1 / -1' }}>
            <summary style={{ cursor: 'pointer' }}>Fine-tune the start point by ear</summary>
            <label style={{ marginTop: 8 }}>Nudge the start point and hear it</label>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {NUDGES.map((d) => (
                <button key={d} className="mini" disabled={!audition.available} aria-label={`Move start ${d > 0 ? 'later' : 'earlier'} by ${Math.abs(d)} seconds`}
                  onClick={() => {
                    const next = nudgeStart(startMs, d, track.durationMs);
                    onChange({ startMs: next });
                    audition.play(track, next, cueMs || 15000);
                    setNote('');
                  }}>{d > 0 ? '+' : '−'}{Math.abs(d)}s</button>
              ))}
              <button className="mini" disabled={!audition.available} onClick={() => audition.stop()}>■ Stop</button>
              <button className="mini primary" disabled={!audition.available} title="While the song is playing, set the start to where it is right now"
                onClick={async () => {
                  const pos = await audition.position();
                  if (pos === null) { setNote('Nothing is playing. Press Preview or a nudge first.'); return; }
                  onChange({ startMs: Math.round(pos / 100) * 100 });
                  setNote(`Start set to ${(Math.round(pos / 100) / 10).toFixed(1)}s`);
                }}>📍 Use current position</button>
            </div>
            {note && <div className="muted" style={{ marginTop: 6 }} role="status">{note}</div>}
          </details>
        </div>
      )}
    </div>
    </div>
  );
}
