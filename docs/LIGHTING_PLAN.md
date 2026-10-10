# Lighting-first rework: deep dive and plan

Goal: make DMX lighting the core of the app. It should be reliable, precise and testable on its own, so the show
flow and Spotify can be built around it afterwards. Nothing here changes Spotify or the timer yet. Phase 4 plugs
them back in as *sources of events* that the lighting reacts to.

---

## 1. What we know about the hardware

### USB-to-DMX interface
The current code assumes an **FTDI "Open DMX"-style cable** (e.g. DSD TECH SH-RS09B). With that kind of cable the
computer generates the DMX signal itself: 250,000 baud, 8N2, a BREAK before every frame, then the 513 bytes. The
cable has no brain, so **any hiccup in the browser shows up as flicker or dropouts**.

The other common kind is an **ENTTEC DMX USB Pro-style widget**. It has its own processor: we send it a packet and
it keeps the DMX line refreshed with perfect timing. Same price range and far more forgiving. The rework puts
output behind a *driver* interface so either can be used.

> **To confirm:** the exact make/model of your USB-DMX cable.

### Chauvet 4BAR Flex
Two DMX personalities ([manual Rev. 7][4bar-um]):

| Mode | Ch | Function | Values |
|---|---|---|---|
| **3-CH** | 1 | Red, all pods | 0–255 |
| | 2 | Green, all pods | 0–255 |
| | 3 | Blue, all pods | 0–255 |
| **15-CH** | 1 | Control / operating mode | **000–009 RGB color mixing (DMX control)**, 010–249 auto programs, 250–255 sound active |
| | 2 | Dimmer | ~009–255 = 1–100% (start value unclear in the copies found) |
| | 3 | Strobe | unverified (likely 000–009 off, then slow → fast) |
| | 4–6 | Pod 1 red, green, blue | 0–255 |
| | 7–9 | Pod 2 red, green, blue | 0–255 |
| | 10–12 | Pod 3 red, green, blue | 0–255 |
| | 13–15 | Pod 4 red, green, blue | 0–255 |

**Why this matters:**
- **15-CH mode gives each of the 4 pods its own color.** That allows chases, splits and per-pod sound effects. 3-CH
  can only ever show one color.
- In 15-CH mode, **channel 1 must be held at 0** and **channel 2 (dimmer) must be held high**. If a test pushes
  every channel to full, channel 1 reaches 250–255 and the bar switches itself into *sound-active* mode. The
  current app has no idea these control channels exist; it leaves them at 0, which turns the 15-CH dimmer off.
- **Recommendation:** run the 4BAR Flex in **15-CH mode** with a proper profile that holds ch1 = 0, ch2 = 255 and
  ch3 = 0.

### Irradiant / Neo-Neon Neo-Slim Par Bar TC/48 (NPRO-PAR-SL-BAR-48)
- Retail listings say it has **12- and 17-channel modes** ([listing][neo-amazon]). No channel chart was found online.
- A related Neo-Slim manual sets the **DMX address with DIP switches** in binary ([manual][neo-manual]).
- **Observed on 10 Oct:** with the bar at d001 and channels 1–12 at full, pars 1–2 were white and pars 3–4 were
  green. No 12-channel layout produces that from channels that are all at full. So either the bar isn't in the
  mode or address we think, or pars 3–4 have a cable or connector fault (red and blue missing). This has to be
  settled on the hardware with a per-channel tester (Phase 1) before any profile is trusted.

### The "first" light
The app's original single light (d001, a 4-channel mode with `MODE`/`SETUP` buttons) is still unidentified. Your
latest panel had a third entry at d001 with red/green/blue on 5/6/7 overlapping the Neo-Slim.

> **To confirm:** do you still use a third light (a separate red warning light), or is the rig just the two bars?

---

## 2. What's wrong with the current lighting code
1. **A fixture is "red/green/blue (+ dimmer) channel numbers" and nothing else.** No profiles, no modes, no
   control channels with required values, no per-pod color. That's why the 4BAR's 15-CH mode can't be driven
   correctly and the Neo-Slim's layout had to be guessed.
2. **One color per role.** All warning lights show one color and all stage lights show another, so there's no way
   to have pod 1 blue and pod 4 red, or to run a chase.
3. **Output runs on the page's main thread** with `setTimeout`. React re-renders, Spotify's player and background-tab
   timer throttling can all stall it, and stalls become flicker on an Open DMX cable.
4. **Lighting is bolted onto Live mode.** Looks are hard-coded in `Live.tsx` (`white` / `sound` / red). There's
   no place to design a look, save it, preview it or fire it by hand.
5. **Little visibility.** You can't see what's actually being sent (the 512 channel values), the frame rate, or
   whether a light's address range is right, apart from the overlap warning.
6. **Testing is blunt.** *Test white* writes full on every mapped channel at once, and the channel finder lights one
   channel at a time but can't hold control channels while it does. Diagnosing the Neo-Slim was harder than it
   should be.

---

## 3. Target architecture
Six layers, each pure and unit-tested where possible. Data flows top to bottom every frame:

```
 Show events (later: Spotify, timer, hotkeys)     Manual console / Stream Deck
                 │                                         │
                 ▼                                         ▼
          ┌──────────────── Cue engine ─────────────────────┐
          │ active look + crossfade + priority stack        │
          └───────────────────────┬─────────────────────────┘
                                  ▼
          ┌──────────── Effects engine ─────────────────────┐
          │ sound-reactive, chase, rainbow, pulse, strobe   │  ← mic levels
          └───────────────────────┬─────────────────────────┘
                                  ▼
          ┌──────── Fixture model (patch + profiles) ───────┐
          │ per-fixture/pod attributes → channel values     │
          └───────────────────────┬─────────────────────────┘
                                  ▼
               512-byte universe buffer (+ overrides)
                                  ▼
          ┌──────── Output driver (in a Web Worker) ────────┐
          │ Open DMX (FTDI) │ ENTTEC Pro-style │ (Art-Net)  │
          └─────────────────────────────────────────────────┘
```

### 3.1 Fixture profiles (library)
A profile describes one model and its modes, channel by channel:

```ts
{ id: 'chauvet-4bar-flex', name: 'Chauvet 4BAR Flex',
  modes: [{ id: '15ch', name: '15-CH', channels: [
    { type: 'control', label: 'Operating mode', home: 0 },           // 0–9 = DMX color mixing
    { type: 'intensity', label: 'Dimmer', home: 255 },
    { type: 'strobe', label: 'Strobe', home: 0 },
    { type: 'red', pixel: 1 }, { type: 'green', pixel: 1 }, { type: 'blue', pixel: 1 },
    /* … pixels 2–4 … */ ] }] }
```
- **Channel types:** red, green, blue, white, amber, intensity (master dimmer), strobe, control/macro (held at
  `home`), pan/tilt later if needed.
- **Pixels** (pods/pars) are first-class: a bar is one fixture with 4 independently colorable pixels.
- **`home` values** are what the channel sits at when nothing is asking for it. This is how the 4BAR keeps ch1 = 0
  and ch2 = 255.
- **Built-in profiles:** 4BAR Flex (3-CH, 15-CH), generic RGB / dimmer + RGB, and the Neo-Slim once verified.
- **Custom profiles from the browser** via a *Profile builder* that wraps the channel finder: step through
  channels, say what each one does ("pod 3 blue", "mode – keep at 0"), save. This is how unknown lights like the
  Neo-Slim get a correct profile in five minutes, with no manual needed.

### 3.2 Patch
The list of lights in the rig: profile + mode + start address + name + groups (e.g. *Stage*, *Warning*,
*Back wall*).
- **Validation:** overlaps, running past channel 512, and duplicates.
- **"How to set this on the light":** a d001-style readout for display-based lights, and a **DIP switch picture**
  for DIP lights. For example, address 4 = switch 3 on; address 16 = switch 5 on.
- **Address suggestion:** packs lights in cable order with no gaps or overlaps.

### 3.3 Looks (cues)
A look is a saved lighting state with a fade time:
- per group or per fixture: color (or per-pixel colors), intensity, and an optional effect;
- **default looks** for the show: *Pre-show*, *Walk-up*, *On stage* (white), *Light warning* (red flash on the
  warning group), *Time's up*, *Walk-off*, *Intermission*, *Closing*, *Blackout*;
- **crossfades** between looks (e.g. 0.5 s into *On stage*, an instant snap into the red warning).

### 3.4 Effects engine
Pure functions `(time, audio levels, pixel index, params) → color`, so they're deterministic and testable:
- **Sound-reactive** (the existing one, extended per pixel: bass hits ripple across pods, a split
  bass/mid/treble bar layout);
- **Chase** (one pod lit, moving across bars), **rainbow** (spread over pixels), **pulse/breathe**,
  **strobe** (capped at a safe rate, with a photosensitivity warning).

### 3.5 Priority stack (who wins)
From highest to lowest: **Blackout** → **Tester / channel finder** (it owns only the light being tested; every
other light keeps running) → **manual console override** → **active look + effects** → **profile `home` values**.

### 3.6 Output driver
- Runs in a **Dedicated Web Worker**. Web Serial is available in dedicated workers ([MDN][mdn-worker-serial]), so
  React rendering can't stall frames. The main thread posts a universe snapshot whenever it changes; the worker
  keeps refreshing at a fixed ~30–40 Hz.
- **Background tabs:** Chrome throttles timers in background tabs unless the tab is playing audible audio
  ([Chrome blog][chrome-bg]). Workers and audible tabs fare far better. A dropped-frame counter will tell us
  whether this is a real problem in practice.
- **Drivers:** `OpenDmxSerial` (today's cable: BREAK via `setSignals`, then the frame) and `EnttecProSerial`
  (one packet; the widget refreshes on its own).
- **Health:** frames per second, last error, auto-reconnect; blackout on disconnect.

### 3.7 Tools (the attention-to-detail part)
- **Universe monitor:** a live 512-cell grid of what's being sent, colored by which fixture owns each channel.
- **Fixture tester:** sliders for every channel of one light. Control channels are held at their `home` values
  while the others are tested.
- **Profile builder** (above), **DIP switch helper**, and a **rig check** that steps each fixture through red, green,
  blue and white, pixel by pixel, so you can confirm the whole rig in under a minute before doors open.

---

## 4. UI restructure
**Lights** becomes the main screen, with four tabs:
1. **Rig:** patch, profiles, address and DIP helpers, overlap checks.
2. **Looks:** build and preview looks and effects.
3. **Console:** big buttons to fire looks live, a master dimmer, blackout, the mic, and Stream Deck hotkeys.
4. **Tools:** universe monitor, fixture tester, rig check, connection health.

The show screens (lineup, timer, Spotify) come back in Phase 4. Each moment of the show then just *fires a look*.

---

## 5. Phases and acceptance criteria

### Phase 0: Hardware facts (with you, about 30 minutes)
- Identify the USB-DMX cable model.
- For each light: the mode it's in and its address, as read on the light itself.
- With the Phase 1 tester, map every channel of the Neo-Slim, and settle whether pars 3–4 are a hardware fault.

### Phase 1: Engine core, Rig tab and Tools ✅ built (needs confirming on the real rig)
Profiles, patch, universe buffer, worker output driver, universe monitor, fixture tester, rig check. Existing
saved lights migrate into the new patch.
**Done when:** both bars can be addressed with no overlap, every pod of each can be set to any color from the
tester, and the universe monitor matches what the lights show.

### Phase 2: Looks, effects and Console ✅ built (needs confirming on the real rig)
Looks with fades, per-pixel effects, priority stack, console with hotkeys.
**Done when:** you can build *Walk-up*, *On stage* and *Time's up* looks and fire them from the console or Stream
Deck, with smooth fades and no flicker for 30 minutes straight.

### Phase 3: Sound ✅ built (needs confirming in the room)
Mic input moved onto the effects engine, sound effects per pixel, sensitivity and auto-gain, a meter.
**Done when:** the sound look visibly follows a song's beat on both bars in the room.

### Phase 4: Show and Spotify reintegration
Show events (walk-up starts, on stage, warning, time's up, walk-off, closing) fire looks. The lineup, timer and
Spotify move to sit around the lighting screens.

---

## 6. Status
- **Answered:** the rig is just the two bars; the 4BAR Flex runs in 15-CH mode; the cable is a DSD TECH SH-RS09B
  (FTDI Open DMX, the default driver); the time warning flashes the bars themselves (Light warning / Time's up looks).
- **Phase 2 is in `src/lights/`:** `effects.ts` (solid, pulse, chase, rainbow, strobe, sound), `looks.ts` (looks, show
  cues, `showMoment`), engine crossfades/master/hand-fired looks/keys, and the Console, Looks and Show tabs. Light roles
  are gone: per-light layers in a look replace them.
- **Phase 1 is in `src/lights/`:** `profiles.ts` (light library), `patch.ts` (rig, checks, DIP helper, migration),
  `render.ts` (looks → channel values, rig check), `drivers.ts` / `session.ts` / `dmx.worker.ts` / `link.ts` (output
  with worker and page fallback), `engine.ts` (priorities, tester, rig check, show hooks), `ui/` (Lights screen).
- **Phase 3 is in `src/lights/`:** `sound.ts` `AudioAnalyzer` (auto-gain with a 6 s peak memory, noise gate, band
  envelopes, beat detection with a 250 ms minimum gap, idle pattern without a mic) and six music effects in `effects.ts`
  (beat colors, beat chase, ripple, music meter, bass/mid/treble, color to music), all pure and tested. Checked end to end
  with a synthetic 120 BPM kick-drum track fed in as the microphone: 10 beats per 5 s, beat chase stepping one pod per beat
  across both bars.
- **Still open:** question 5 below, and the Neo-Slim's real channel layout (run the channel tester on it).

## 7. Open questions
1. Which USB-DMX cable is it (brand/model)?
2. Is there a third light (a red warning light), or just the two bars?
3. OK to run the 4BAR Flex in **15-CH** mode for per-pod control?
4. How should the warning work now? Red on a dedicated light, or the bars themselves flash red at the warning?
5. Keep it a browser app (Chrome/Edge, no install), or move to a small desktop app (more reliable timing,
   needs an install)? The recommendation is to **stay in the browser with the worker-based output** and only
   reconsider if Phase 1 measurements show dropped frames.

[4bar-um]: https://www.chauvetdj.com/wp-content/uploads/2015/12/4BAR_Flex_UM_Rev7_WO-1.pdf
[neo-amazon]: https://www.amazon.com/Irradiant-NPROPARSLBAR48-Complete-Fixture-System/dp/B00K7VPHA0
[neo-manual]: https://manualzz.com/doc/73496629/neo-neon-neo-slim-rgbw-user-manual
[mdn-worker-serial]: https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/serial
[chrome-bg]: https://developer.chrome.com/blog/background_tabs
