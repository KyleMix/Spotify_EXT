# Walk·Up — walk-up music & set timer for stand-up shows

A clean web app (installable PWA) for running a comedy show: build the lineup ahead of time,
attach a Spotify walk-up song to each comedian, and run the night in a full-screen Live mode
with a performance timer.

## Features
- **Edit mode:** drag-to-reorder lineup, host/break slots, Spotify song search, per-slot start point,
  walk-up length, set length, light-warning time, notes; duplicate shows for recurring nights.
- **Live mode:** Play walk-up → On stage (music fades, timer starts) → End set. Big colour-coded
  timer (green / amber warning / red overtime), progress bar, next-up card, show clock, set-time log.
- **Walk-off & closing song:** comedians can have a walk-off song that plays when you end their set
  (hosts and breaks never do). Each show can have an end-of-show song that plays on Next after the last act.
  Every song has its own start point and play length.
- **Suggested cue search:** each song has a 🔍 *Suggested walk-up / walk-off / end-of-show* button that opens a
  Google search in a new tab. The query asks for a start time in **seconds** and includes your actual clip length.
  A wording dropdown (*Seconds*, *Chorus / hook*, *Big moment*) lets you try another phrasing. Nothing is sent from
  the app; confirm by ear with Preview. Time fields accept `41` or `0:41`.
- **Audition nudges:** under each song's time fields, −5 / −1 / −0.5 / +0.5 / +1 / +5 s buttons move the start
  point and instantly replay from there; **■ Stop** ends the preview; **📍 Use current position** sets the
  start to wherever the song is playing right now (press Preview, wait for the moment you want, click it).
- **Automatic timer start:** the comedian's timer starts by itself when the walk-up music has stopped: when the
  play length is reached and the fade finishes, after *Fade out* or *Panic stop*, or when the song ends on its own.
  Works for comedians, hosts and breaks. Pressing Next during the walk-up still starts it immediately. Slots with no
  walk-up song stay manual. Turn it off with the checkbox in Live mode.
- **Fade length:** one slider in Live mode (0.5–10 s, default 4 s) controls every fade-out. Button presses
  take effect instantly; the music fades in the background.
- **Keyboard & Bluetooth clicker:** `Space`/`Enter`/`→`/`PgDn` next step · `Esc`/`←`/`PgUp` fade out ·
  `P`/`B`/`.` panic stop. Clickers and page-turners appear as ordinary keyboards: pair one in your OS
  Bluetooth settings, keep the tab focused, and use Live → *Bluetooth clicker* to reassign buttons
  (the "Last key" pill shows what the remote sends). Rapid double-presses of "next" are ignored so a
  double-click can't skip an act.
- **Multi-computer:** local-first storage, optional cloud sync keyed to your Spotify account,
  plus JSON export/import.

## Stage light (DMX)
Live mode can turn a DMX light **red at each act's light-warning time** (and keep it red through overtime; it is off
otherwise). It uses a USB-to-DMX cable with an FTDI chip (an "Open DMX" style cable, e.g. DSD TECH SH-RS09B) and
Chrome's Web Serial, so use **Chrome or Edge** (not Firefox/Safari), on `http://127.0.0.1:5173` or an HTTPS site.
1. Plug the cable into the PC and into the light's **DMX IN**. Set the light's DMX address (the `d001` on its display).
2. In Live mode, open **Stage light (DMX)**, click **Connect light** and pick the cable's serial port
   (usually named *USB Serial Port (COMx)*). Later visits reconnect automatically.
3. Set **Start address** to the light's address. Press **Test red / green / blue** and adjust the channel numbers until the
   colors match. If a test shows nothing, the light's mode may have a **dimmer** channel: enter its number.
4. If the light flickers on a long cable, add a 120 Ω DMX terminator plug in the light's **DMX OUT**.
Settings are saved per browser. If the cable is unplugged mid-show, the timer keeps working and the panel shows
"Light offline".

## Setup
1. Create an app at https://developer.spotify.com/dashboard. Add redirect URI
   `http://127.0.0.1:5173/` (dev) and your deployed URL with a trailing slash. Tick **Web Playback SDK**.
2. Copy `.env.example` to `.env.local` and set `VITE_SPOTIFY_CLIENT_ID`.
3. `npm install && npm run dev`, open http://127.0.0.1:5173.

**Spotify limits (Feb 2026 Development Mode rules):** the app owner needs Premium, and only 5 users
you add under *User Management* can log in. Playback requires Premium. Verify endpoint availability
against Spotify's current docs if something returns 403.

## Cloud sync (optional)
Deploy to Vercel and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. `api/sync.ts` stores one JSON
blob per Spotify user (identity verified with the user's token); the client merges by newest edit per show.
Without those variables the app simply stays local.

## Scripts
`npm run dev` · `npm test` · `npm run build`

## Prior art
Closest existing projects reviewed: I Can Run A Show (MIT, local audio), Ontime (GPL v3, rundown timers),
PlaySched / spotify-scheduler (playlist scheduling), Spicetify Queue Manager (queue snapshots).
