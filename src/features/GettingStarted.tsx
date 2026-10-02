import { useState } from 'react';
import type { Show } from '../types';

const KEY = 'walkup.gettingStarted.dismissed';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

interface Props { show: Show; configured: boolean; connected: boolean; onConnect: () => void }

/** First-run checklist for the Edit screen. Hides itself once the basics are done, or when dismissed. */
export function GettingStarted({ show, configured, connected, onConnect }: Props) {
  const [hidden, setHidden] = useState(read);
  const named = show.slots.some((s) => s.performer.trim());
  const withSong = show.slots.some((s) => s.track);
  if (hidden || (connected && named && withSong)) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } setHidden(true); };

  const step = (done: boolean, text: React.ReactNode) => (
    <li><span aria-hidden>{done ? '✅' : '⬜'}</span><span>{text}</span></li>
  );
  return (
    <div className="card mb-5" role="region" aria-label="Getting started">
      <div className="row"><h2 className="m-0">Getting started</h2><div className="spacer" />
        <button className="ghost" onClick={dismiss} aria-label="Hide getting started">Hide</button></div>
      <ul className="check-list">
        {step(configured, configured ? 'Spotify app is set up.' : <>Set up Spotify: add your app's Client ID as <code>VITE_SPOTIFY_CLIENT_ID</code> in <code>.env.local</code>, then restart (see README, Setup).</>)}
        {step(connected, connected ? 'Spotify is connected.' : <>Connect Spotify to search for songs and play them.{' '}
          <button className="mini primary" disabled={!configured} onClick={onConnect}>Connect Spotify</button></>)}
        {step(named, <>Add comedians to the lineup: use <b>Spots</b> or <b>+ Spot</b>, then type each name on the right.</>)}
        {step(withSong, <>Give someone a walk-up song (search, preview it, and set where it starts).</>)}
        {step(false, <>When ready, switch to <b>Live</b> at the top and press <b>Play walk-up</b>.</>)}
      </ul>
    </div>
  );
}
