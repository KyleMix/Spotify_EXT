import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import { duplicateShow, newShow, resizeActs, validateImport } from './lib';
import { getMe } from './spotify/api';
import { handleRedirect, isConfigured, isLoggedIn, login, logout } from './spotify/auth';
import { WalkUpPlayer, type PlayerStatus } from './spotify/player';
import { Editor } from './features/Editor';
import type { Audition } from './features/SongField';
import { Live } from './features/Live';
import { GettingStarted } from './features/GettingStarted';
import type { Track } from './types';
import { DmxOutput } from './dmx/output';

export function App() {
  const store = useStore();
  const dmx = useMemo(() => new DmxOutput(), []);
  useEffect(() => { void dmx.autoConnect(); }, [dmx]);
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

  // If the player never reports ready, say so instead of showing "Connecting…" forever.
  useEffect(() => {
    if (!authed || pstatus !== 'loading') return;
    const t = setTimeout(() => setPmsg('Spotify is taking a long time to connect. Check your internet, make sure the account is Premium, then click Reconnect. Reloading the page also helps.'), 20_000);
    return () => clearTimeout(t);
  }, [authed, pstatus]);

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
    try {
      const imported = validateImport(JSON.parse(await f.text()));
      store.replaceAll(imported);
      setPmsg(`Imported ${imported.shows.length} show${imported.shows.length === 1 ? '' : 's'}. Shows with the same ID keep whichever copy was edited most recently.`);
    } catch (e) { setPmsg(e instanceof SyntaxError ? 'That file is not valid JSON. Choose a file you exported from Walk-Up.' : (e as Error).message); }
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
        <div className="seg" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'edit'} title="Build the lineup and pick songs" className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Edit</button>
          <button role="tab" aria-selected={mode === 'live'} title="Run the show: walk-up music and timer" className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Live</button>
        </div>
        <div className="spacer" />
        {authed && (
          <span className={`pill ${store.sync === 'error' ? 'err' : store.sync === 'idle' ? 'ok' : ''}`}
            title={store.sync === 'off' ? 'Cloud sync is not set up, so your shows are stored in this browser only. Use Export to back them up.' : 'Your shows sync to your Spotify account'}>
            {store.sync === 'syncing' ? 'Syncing…' : store.sync === 'error' ? 'Sync error' : store.sync === 'idle' ? 'Synced' : 'Saved on this device'}
          </span>
        )}
        <button className="ghost" title="Download all your shows as a backup file" onClick={exportJson}>Export</button>
        <button className="ghost" title="Load shows from a backup file (merged with your current shows)" onClick={() => fileRef.current?.click()}>Import</button>
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

      {user && !user.premium && <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>Spotify Premium is required for playback. Searching and the timer still work.</div>}
      {pmsg && (
        <div className="card row" role="alert" style={{ marginBottom: 16, borderColor: pstatus === 'error' ? 'var(--danger)' : 'var(--warn)' }}>
          <span style={{ flex: 1 }}>{pmsg}</span>
          {authed && <button onClick={() => void login()}>Reconnect</button>}
          <button className="ghost" aria-label="Dismiss message" onClick={() => setPmsg('')}>✕</button>
        </div>
      )}

      {!show ? <div className="hero"><h1>No shows yet</h1><button className="primary" onClick={() => store.addShow(newShow())}>Create a show</button></div>
        : mode === 'edit'
          ? <>
            <GettingStarted show={show} configured={isConfigured()} connected={authed} onConnect={() => void login()} />
            <Editor key={show.id} show={show} update={(fn) => store.updateShow(show.id, fn)} canSearch={authed} audition={audition} />
          </>
          : <Live key={show.id} show={show} player={player} ready={pstatus === 'ready'} dmx={dmx}
            resize={(n, keepFrom) => store.updateShow(show.id, (sh) => ({ ...sh, slots: resizeActs(sh.slots, n, keepFrom) }))} />}
    </div>
  );
}
