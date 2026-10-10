# Walk·Up — walk-up music & set timer for stand-up shows

A clean web app (installable PWA) for running a comedy show: build the lineup ahead of time,
attach a Spotify walk-up song to each comedian, and run the night in a full-screen Live mode
with a performance timer.

## Features
- **Edit mode:** drag-to-reorder lineup, host/break slots, Spotify song search, per-slot start point,
  walk-up length, set length, light-warning time, notes; duplicate shows for recurring nights.
- **Live mode:** Play walk-up → On stage (music fades, timer starts) → End set. Big colour-coded
  timer (green / amber warning / red overtime), progress bar, next-up card, show clock, set-time log.
- **Pop-out comedian timer (no light):** Live → Setup → *Time warning* → **Pop-out timer** turns off the DMX stage
  light and adds an *Open comedian timer window* button. The window shows nothing but a big clock of how long the comedian has
  been on stage, counting up from 0:00, on a black background that never changes colour: the numbers are white, turn
  yellow at the light-warning time, and turn red (still counting up) once their set length is reached. Drag it to the screen facing the stage
  and double-click it for full screen. It mirrors Live mode in the same browser, so keep the main window open.
- **Walk-off & closing song:** comedians can have a walk-off song that plays when you end their set
  (hosts and breaks never do). Each show can have an end-of-show song that plays on Next after the last act.
  Every song has its own start point and play length.
- **Suggested cue search:** each song has a 🔍 *Suggested walk-up / walk-off / end-of-show* button that opens a
  Google search in a new tab. The query asks for a start time in **seconds** and includes your actual clip length.
  A wording dropdown (*Seconds*, *Chorus / hook*, *Big moment*) lets you try another phrasing. Nothing is sent from
  the app; confirm by ear with Preview. Time fields accept `41` or `0:41`.
- **Stream Deck / extra controls:** besides Next, Fade out and Panic stop, you can assign buttons to **Skip act,
  Back one act, Play closing song, Stage light red (test) and Stage light off**. They start unassigned. In a Stream
  Deck, add a *Hotkey* action set to a spare key (F13–F24), then in Live mode click *Add button* next to the action
  and press the Stream Deck key. Hotkeys only reach the window in front, so keep the Walk-Up tab active. Existing
  button assignments are kept when the app updates.
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

- **Quick lineup size:** the *Spots* menu in Edit mode sets how many comedian spots the list has (blank spots are added or removed
  from the end); *− Spot* / *+ Spot* adjust it by one. The same buttons are in Live mode (*Lineup length*) for open mics where the
  turnout changes mid-show. The act on stage and earlier acts are never removed. *Defaults for new spots* (under the show details)
  sets the set length, warning time and walk-up length for spots you add later.
- **Song bank:** the side panel in Edit mode lists your Spotify playlists. Pick one, filter it, then drag a song onto the walk-up or
  walk-off box (or use *Set as walk-up / walk-off*) for the selected slot. Songs load page by page and are cached for the session
  (*↻ Refresh* reloads them). *Recently used songs* works without playlist access. Collapse the panel with *Hide*.
  A comedian's walk-off can be copied to everyone with *Use this walk-off for all comedians*.
  Playlists need the `playlist-read-private` and `playlist-read-collaborative` scopes. If you linked Spotify before these existed,
  the panel shows *Reconnect to allow playlists* (one click; your shows are untouched).

- **Test run (Live mode, before the show):** *Play all* (or *Start at the first song*) plays each walk-up in lineup order, up to
  15 seconds each, with *Previous* / *Next song* / *Stop test*. It doesn't touch the timer, the set log or the stage light, and the
  real show controls are locked until you stop it (Fade out and Panic stop also end the test).
- **Check songs are playable:** in Edit mode, one click asks Spotify whether each chosen song can be played in your country.
  Unavailable songs are marked ⚠ in the lineup and the end-of-show box, and the Live ready check counts them. Run it again after changing songs.
- **Print run sheet:** the *Print run sheet* button prints a one-page lineup (planned start times, set lengths, each walk-up and
  walk-off with start point and length, notes, end-of-show song). Use your browser's print dialog to save it as a PDF.
- **Theme:** the top-bar button cycles Dark → Light → Auto (follows your device). Search results have a *Show more results* button.

## Stage light (DMX)
Live mode can drive a DMX light: it **flashes red for a few seconds at each act's light-warning time** (3 seconds by
default; change it with *Warning flash*, or set 0 to stay on), goes off, then **turns red when time is up and stays on until
the next comedian**. It is off the rest of the time. It uses a USB-to-DMX cable with an FTDI chip (an "Open DMX" style cable, e.g. DSD TECH SH-RS09B) and
Chrome's Web Serial, so use **Chrome or Edge** (not Firefox/Safari), on `http://127.0.0.1:5173` or an HTTPS site.
1. Plug the cable into the PC and into the light's **DMX IN**. Set the light's DMX address (the `d001` on its display).
2. In Live mode, open **Stage light (DMX)**, click **Connect light** and pick the cable's serial port
   (usually named *USB Serial Port (COMx)*). Later visits reconnect automatically.
3. Set **Start address** to the light's address. Press **Test red / green / blue** and adjust the channel numbers until the
   colors match. If a test shows nothing, the light's mode may have a **dimmer** channel: enter its number.
   **Wrong color or nothing for some colors?** Use the **Channel finder** in the same card: it lights one channel at a time
   from your start address. When a channel makes red, press *This channel is: Red* (same for green, blue and a dimmer
   if the mode has one). Press `SETUP` on the light to see its channel mode (like `Ch.04`), and press `MODE` to a
   built-in static color to check that the light's red and green LEDs work at all.
4. **More lights (daisy chain):** run a DMX cable from the first light's **DMX OUT** into the next light's **DMX IN**.
   In the panel, pick the light type and press **Add light to chain**: it gets the first free address after the lights
   already on the chain (shown as e.g. `d004`). Set that address on the light itself. Every light turns red together.
   Each light has its own channel numbers and its own **Find channels** button; the panel warns if two lights' channels overlap.
   - **Chauvet 4BAR Flex:** choose *Chauvet 4BAR Flex (3-CH mode)*, then on the bar's menu set the DMX personality to
     **3-CH** (all four pars together: 1 red, 2 green, 3 blue) and its address to the one the panel shows. Its 15-CH mode
     also works if you set the channels yourself (*Channels in mode* 15, and use *Find channels*).
5. If the lights flicker on a long cable, add a 120 Ω DMX terminator plug in the **DMX OUT** of the last light on the chain.
Settings (including older single-light settings, which become the first light on the chain) are saved per browser. If the cable is unplugged mid-show, the timer keeps working and the panel shows
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
