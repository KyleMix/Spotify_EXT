import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { duplicateShow, newShow, validateImport } from './lib';
import { getMe } from './spotify/api';
import { handleRedirect, isConfigured, isLoggedIn, login, logout } from './spotify/auth';
import { WalkUpPlayer, type PlayerStatus } from './spotify/player';
import { Editor } from './features/Editor';
import type { Audition } from './features/SongField';
import { Live } from './features/Live';
import type { Track } from './types';

export function App() {
  const store = useStore();
  const [mode, setMode] = useState<'edit' | 'live'>('edit');
  const [authed, setAuthed] = useState(isLoggedIn());
  const [user, setUser] = useState<{ name: string; premium: boolean } | null>(null);
  const [pstatus, setPstatus] = useState<PlayerStatus>('loading');
  const [pmsg, setPmsg] = useState('');
  const [player, setPlayer] = useState<WalkUpPlayer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    handleRedirect().then(() => setAuthed(isLoggedIn())).catch((e: Error) => setPmsg(e.message));
  }, []);

  useEffect(() => {
    if (!authed) return;
    let p: WalkUpPlayer | null = null;
    getMe().then((m) => setUser({ name: m.display_name, premium: m.product === 'premium' })).catch((e: Error) => setPmsg(e.message));
    p = new WalkUpPlayer((s, m) => { setPstatus(s); setPmsg(m ?? ''); });
    setPlayer(p);
    p.init().catch((e: Error) => { setPstatus('error'); setPmsg(e.message); });
    return () => p?.destroy();
  }, [authed]);

  const { data } = store;
  const show = data.shows.find((s) => s.id === data.activeShowId) ?? data.shows[0];

  const audition: Audition = {
    play: (track: Track, startMs: number, cueMs: number) => {
      if (!player) return;
      player.unlock().then(() => player.play(track, startMs, cueMs)).catch((e: Error) => setPmsg(e.message));
    },
    stop: () => { player?.stop(400).catch((e: Error) => setPmsg(e.message)); },
    position: async () => (player ? player.getPositionMs() : null),
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'walkup-shows.json'; a.click(); URL.revokeObjectURL(url);
  };
  const importJson = async (f: File) => {
    try { store.replaceAll(validateImport(JSON.parse(await f.text()))); } catch (e) { setPmsg((e as Error).message); }
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Walk<span>·</span>Up</div>
        {show && (
          <select style={{ width: 220 }} value={show.id} onChange={(e) => store.setActive(e.target.value)} aria-label="Select show">
            {data.shows.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.date}</option>)}
          </select>
        )}
        <button onClick={() => store.addShow(newShow())}>+ New</button>
        {show && <button onClick={() => store.addShow(duplicateShow(show))}>Duplicate</button>}
        {show && data.shows.length > 1 && (
          <button className="ghost danger" onClick={() => { if (confirm(`Delete "${show.name}"?`)) store.deleteShow(show.id); }}>Delete</button>
        )}
        <div className="spacer" />
        <div className="seg" role="tablist">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit</button>
          <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Live</button>
        </div>
        <div className="spacer" />
        {authed && store.sync !== 'off' && (
          <span className={`pill ${store.sync === 'error' ? 'err' : store.sync === 'idle' ? 'ok' : ''}`}>
            {store.sync === 'syncing' ? 'Syncing…' : store.sync === 'error' ? 'Sync error' : 'Synced'}
          </span>
        )}
        <button className="ghost" onClick={exportJson}>Export</button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
        {authed ? (
          <>
            <span className={`pill ${pstatus === 'ready' ? 'ok' : pstatus === 'error' ? 'err' : ''}`}>
              {pstatus === 'ready' ? `Spotify ready${user ? ` · ${user.name}` : ''}` : pstatus === 'error' ? 'Spotify error' : 'Connecting…'}
            </span>
            <button className="ghost" onClick={() => { logout(); location.reload(); }}>Disconnect</button>
          </>
        ) : (
          <button className="primary" disabled={!isConfigured()} title={isConfigured() ? '' : 'Set VITE_SPOTIFY_CLIENT_ID'} onClick={() => void login()}>
            Connect Spotify
          </button>
        )}
      </header>

      {user && !user.premium && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>Spotify Premium is required for playback.</div>}
      {pmsg && pstatus === 'error' && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--danger)' }}>{pmsg}</div>}

      {!show ? <div className="hero"><h1>No shows yet</h1><button className="primary" onClick={() => store.addShow(newShow())}>Create a show</button></div>
        : mode === 'edit'
          ? <Editor key={show.id} show={show} update={(fn) => store.updateShow(show.id, fn)} canSearch={authed} audition={audition} />
          : <Live key={show.id} show={show} player={player} ready={pstatus === 'ready'} />}
    </div>
  );
}
