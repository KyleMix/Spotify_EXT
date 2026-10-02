import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../types';
import { getPlaylistsPage, getPlaylistTracksPage, type PlaylistInfo } from '../spotify/api';
import { hasScopes, login, PLAYLIST_SCOPES } from '../spotify/auth';
import { cacheClear, cacheGet, cacheSet, filterTracks, isFresh, loadRecent, tracksKey, type CachedTracks } from './bank';
import { formatClock } from '../lib';

export const TRACK_MIME = 'application/x-walkup-track';
const OPEN_KEY = 'walkup.bank.open';
const RECENT = '__recent__';
const PAGE = 100; // rows rendered at once; the rest appear with "Show more"

interface Props {
  connected: boolean;
  /** Name of the slot that "Set as" buttons will change, or undefined if none is selected. */
  slotLabel?: string;
  canSetWalkOff: boolean;
  onAssign: (kind: 'walk-up' | 'walk-off', t: Track) => void;
  onDragState: (dragging: boolean) => void;
  /** Bumps whenever a song is assigned elsewhere, so "Recently used" stays current. */
  recentVersion: number;
}

const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } };

export function SongBank({ connected, slotLabel, canSetWalkOff, onAssign, onDragState, recentVersion }: Props) {
  const [open, setOpen] = useState(readOpen);
  const [playlists, setPlaylists] = useState<PlaylistInfo[] | null>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plErr, setPlErr] = useState('');
  const [sel, setSel] = useState<string>(RECENT);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trLoading, setTrLoading] = useState(false);
  const [trErr, setTrErr] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState('');
  const [shown, setShown] = useState(PAGE);
  const run = useRef(0);

  const allowed = connected && hasScopes(PLAYLIST_SCOPES);
  const toggle = (v: boolean) => { setOpen(v); try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* ignore */ } };

  const loadPlaylists = useCallback(async (force: boolean) => {
    if (force) cacheClear();
    const cached = cacheGet<PlaylistInfo[]>('playlists');
    if (cached) { setPlaylists(cached); return; }
    setPlLoading(true); setPlErr('');
    try {
      const all: PlaylistInfo[] = [];
      let off: number | null = 0;
      while (off !== null) { const page = await getPlaylistsPage(off); all.push(...page.items); off = page.next; }
      cacheSet('playlists', all);
      setPlaylists(all);
    } catch (e) { setPlErr((e as Error).message); } finally { setPlLoading(false); }
  }, []);

  // Load the playlist list the first time the panel is open and allowed (cached after that).
  useEffect(() => { if (open && allowed && !playlists && !plLoading && !plErr) void loadPlaylists(false); }, [open, allowed, playlists, plLoading, plErr, loadPlaylists]);

  // Load songs for the chosen source, page by page, reusing the cache when the playlist hasn't changed.
  useEffect(() => {
    setFilter(''); setShown(PAGE); setTrErr('');
    const my = ++run.current;
    if (sel === RECENT) { setTracks(loadRecent()); setTrLoading(false); setProgress(null); return; }
    const pl = playlists?.find((p) => p.id === sel);
    if (!pl) { setTracks([]); return; }
    const cached = cacheGet<CachedTracks>(tracksKey(pl));
    if (isFresh(cached, pl)) { setTracks(cached!.tracks); setTrLoading(false); setProgress(null); return; }
    setTracks([]); setTrLoading(true);
    (async () => {
      const acc: Track[] = [];
      let off: number | null = 0;
      try {
        while (off !== null) {
          const page = await getPlaylistTracksPage(pl.id, off);
          if (run.current !== my) return; // user switched playlist
          acc.push(...page.tracks); off = page.next;
          setTracks([...acc]); setProgress({ done: off ?? acc.length, total: pl.total });
        }
        cacheSet(tracksKey(pl), { snapshotId: pl.snapshotId, tracks: acc, complete: true } satisfies CachedTracks);
      } catch (e) { if (run.current === my) setTrErr((e as Error).message); }
      finally { if (run.current === my) { setTrLoading(false); setProgress(null); } }
    })();
  }, [sel, playlists, sel === RECENT ? recentVersion : 0]);

  const visible = useMemo(() => filterTracks(tracks, filter), [tracks, filter]);

  if (!open) {
    return (
      <aside className="bank collapsed">
        <button onClick={() => toggle(true)} title="Open the song bank" aria-label="Open song bank" aria-expanded={false}>🎵<span className="vtext">Song bank</span></button>
      </aside>
    );
  }

  return (
    <aside className="bank card" aria-label="Song bank">
      <div className="row">
        <h2 className="m-0">Song bank</h2><div className="spacer" />
        {allowed && <button className="ghost mini" title="Reload playlists and songs from Spotify" onClick={() => { setPlaylists(null); setPlErr(''); void loadPlaylists(true); setSel(RECENT); }}>↻ Refresh</button>}
        <button className="ghost mini" aria-label="Collapse song bank" aria-expanded onClick={() => toggle(false)}>Hide ▸</button>
      </div>
      <p className="muted mt-2-mb-3">
        Pick a playlist, then drag a song onto the walk-up or walk-off box, or use the buttons.
      </p>

      {!connected && <div className="muted">Connect Spotify (top right) to browse your playlists.</div>}
      {connected && !allowed && (
        <div className="notice">
          <div>Playlist access needs one more Spotify permission. Reconnect once to allow it. Your shows are not affected.</div>
          <button className="primary mini mt-2" onClick={() => void login()}>Reconnect to allow playlists</button>
        </div>
      )}
      {plErr && <div className="muted text-danger" role="alert">{plErr} <button className="mini" onClick={() => { setPlErr(''); void loadPlaylists(true); }}>Try again</button></div>}
      {plLoading && <div className="muted" role="status">Loading your playlists…</div>}

      {connected && (
        <select aria-label="Choose a playlist" value={sel} onChange={(e) => setSel(e.target.value)} disabled={plLoading}>
          <option value={RECENT}>★ Recently used songs</option>
          {(playlists ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.total})</option>)}
        </select>
      )}
      {allowed && playlists && playlists.length === 0 && <div className="muted mt-2">No playlists found on this Spotify account.</div>}

      {connected && (
        <>
          <input type="search" className="mt-2" placeholder="Filter this list…" aria-label="Filter songs in this list" value={filter}
            onChange={(e) => { setFilter(e.target.value); setShown(PAGE); }} />
          <div className="muted my-2" role="status">
            {trLoading ? `Loading songs… ${progress ? `${Math.min(progress.done, progress.total)} of ${progress.total}` : ''}`
              : `${visible.length}${filter ? ` of ${tracks.length}` : ''} song${visible.length === 1 ? '' : 's'}`}
            {' · '}{slotLabel ? <>Setting for <b>{slotLabel}</b></> : 'Select a slot in the lineup to use the buttons'}
          </div>
          {trErr && <div className="muted text-danger" role="alert">{trErr}</div>}
          {!trLoading && !trErr && tracks.length === 0 && (
            <div className="muted">{sel === RECENT ? 'Songs you pick will show up here for quick reuse.' : 'This playlist has no playable songs.'}</div>
          )}
          {!trLoading && tracks.length > 0 && visible.length === 0 && <div className="muted">No songs match “{filter}”.</div>}
          <div className="bank-list">
            {visible.slice(0, shown).map((t) => (
              <div key={t.uri} className="bank-row" draggable
                onDragStart={(e) => { e.dataTransfer.setData(TRACK_MIME, JSON.stringify(t)); e.dataTransfer.setData('text/plain', `${t.name} — ${t.artist}`); e.dataTransfer.effectAllowed = 'copy'; onDragState(true); }}
                onDragEnd={() => onDragState(false)}>
                {t.albumArt ? <img className="art sm" src={t.albumArt} alt="" /> : <div className="art sm" />}
                <div className="grow">
                  <div className="ell" title={t.name}>{t.name}</div>
                  <div className="muted ell">{t.artist} · {formatClock(t.durationMs)}</div>
                </div>
                <div className="bank-btns">
                  <button className="mini" disabled={!slotLabel} title={slotLabel ? `Use as ${slotLabel}'s walk-up song` : 'Select a slot first'} onClick={() => onAssign('walk-up', t)}>Set as walk-up</button>
                  <button className="mini" disabled={!slotLabel || !canSetWalkOff} title={!slotLabel ? 'Select a slot first' : canSetWalkOff ? `Use as ${slotLabel}'s walk-off song` : 'Only comedians have a walk-off song'} onClick={() => onAssign('walk-off', t)}>Set as walk-off</button>
                </div>
              </div>
            ))}
          </div>
          {visible.length > shown && <button className="mt-2 w-full" onClick={() => setShown((n) => n + PAGE)}>Show more ({visible.length - shown} left)</button>}
        </>
      )}
    </aside>
  );
}
