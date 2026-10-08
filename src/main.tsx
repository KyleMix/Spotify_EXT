import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TimerWindow } from './features/TimerWindow';
import './styles.css';

// `?timer=1` is the pop-out comedian timer: no Spotify, no editor, just the clock.
const popout = new URLSearchParams(location.search).has('timer');

createRoot(document.getElementById('root')!).render(<React.StrictMode>{popout ? <TimerWindow /> : <App />}</React.StrictMode>);
