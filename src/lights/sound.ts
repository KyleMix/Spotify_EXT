/** Sound-to-light: turns what the microphone hears into a color for the stage lights. */
import type { LightColor } from './color';

/** Loudness per frequency band, 0-1. */
export interface Bands { bass: number; mid: number; treble: number; level: number }

/** Average the analyser's frequency bins (0-255 each) into bass, mid and treble levels. */
export function bandLevels(data: Uint8Array, sampleRate: number): Bands {
  const binHz = sampleRate / 2 / Math.max(1, data.length);
  const avg = (loHz: number, hiHz: number) => {
    const lo = Math.max(1, Math.floor(loHz / binHz) + 1); // +1: bands never share a bin
    const hi = Math.min(data.length - 1, Math.floor(hiHz / binHz));
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += data[i];
    return hi >= lo ? sum / (hi - lo + 1) / 255 : 0;
  };
  const bass = avg(30, 150), mid = avg(150, 2000), treble = avg(2000, 8000);
  return { bass, mid, treble, level: Math.max(bass, mid, treble) };
}

/** h, s, v in 0-1. */
export function hsvToRgb(h: number, s: number, v: number): LightColor {
  const i = Math.floor(((h % 1) + 1) % 1 * 6);
  const f = ((h % 1) + 1) % 1 * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/** What the music is doing this frame, after gain. Sound effects read only this, so they stay pure and testable. */
export interface AudioFeatures {
  /** Loudness 0-1: overall, and per band. Rise instantly, fall smoothly. */
  level: number;
  bass: number;
  mid: number;
  treble: number;
  /** A beat (bass hit) started this frame. */
  beat: boolean;
  /** Beats so far, and when the last one hit. */
  beatCount: number;
  lastBeatMs: number;
  /** 1 at a beat, fading to 0 over about a quarter second. */
  flash: number;
  /** Beat color, 0-1 around the color wheel: jumps on every beat, drifts slowly between. */
  hue: number;
  /** False when there is no microphone: the features are a slow idle pattern instead. */
  live: boolean;
}

export interface AnalyzerSettings {
  /** 1-10: higher reacts to quieter sound. */
  sensitivity: number;
  /** Keep quiet and loud rooms reacting alike by following the recent peak level. */
  autoGain: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Sensitivity 5 = x1, each step either way about x1.3 (1 = x0.33, 10 = x4). */
export const sensitivityGain = (s: number) => 2 ** ((Math.min(10, Math.max(1, s)) - 5) / 2.5);

/** Raw level below this is treated as silence, so room noise never flickers the lights. */
export const NOISE_GATE = 0.03;
/** Auto-gain aims the recent peak at this level... */
const AUTO_TARGET = 0.85;
/** ...but never amplifies more than this would allow (a quiet room stays quiet). */
const AUTO_MIN_PEAK = 0.15;
/** How fast the remembered peak falls when the music gets quieter. */
const PEAK_HALF_LIFE_MS = 6000;
/** Gain without auto-gain, at sensitivity 5 (what the earlier version used). */
const MANUAL_GAIN = 1.6;
const IDLE_BEAT_MS = 2000;

/**
 * Turns raw band levels into AudioFeatures, one frame at a time: gain (manual or automatic), a noise gate,
 * smooth envelopes and beat detection (a bass hit well above the recent bass average, at most 4 per second).
 */
export class AudioAnalyzer {
  private peak = AUTO_MIN_PEAK;
  private avgBass = 0;
  private env = { level: 0, bass: 0, mid: 0, treble: 0 };
  private hue = 0;
  private beatCount = 0;
  private lastBeatMs = -Infinity;
  private lastT: number | null = null;

  /** Current overall gain (for the meter's readout). */
  gain = MANUAL_GAIN;

  next(raw: Bands | null, nowMs: number, s: AnalyzerSettings): AudioFeatures {
    const dt = this.lastT === null ? 25 : Math.min(500, Math.max(0, nowMs - this.lastT));
    this.lastT = nowMs;
    if (!raw) return this.idle(nowMs);

    const gated = raw.level < NOISE_GATE;
    if (s.autoGain && !gated) this.peak = Math.max(raw.level, this.peak * 0.5 ** (dt / PEAK_HALF_LIFE_MS), AUTO_MIN_PEAK);
    this.gain = (s.autoGain ? AUTO_TARGET / this.peak : MANUAL_GAIN) * sensitivityGain(s.sensitivity);
    const g = (v: number) => (gated ? 0 : clamp01(v * this.gain));
    const now = { level: g(raw.level), bass: g(raw.bass), mid: g(raw.mid), treble: g(raw.treble) };

    // Beat: bass well above its recent average, with a quarter-second minimum between beats.
    this.avgBass += (now.bass - this.avgBass) * Math.min(1, dt / 500);
    const beat = now.bass > 0.3 && now.bass > this.avgBass * 1.25 + 0.03 && nowMs - this.lastBeatMs > 250;
    if (beat) { this.lastBeatMs = nowMs; this.beatCount++; this.hue = (this.hue + 0.17) % 1; }
    this.hue = (this.hue + (dt / 1000) * 0.02) % 1;

    // Envelopes: rise at once, fall over a few hundred ms so the lights don't flicker.
    const fall = (cur: number, v: number, ms: number) => (v > cur ? v : cur + (v - cur) * Math.min(1, dt / ms));
    this.env = {
      level: fall(this.env.level, now.level, 400), bass: fall(this.env.bass, now.bass, 200),
      mid: fall(this.env.mid, now.mid, 200), treble: fall(this.env.treble, now.treble, 200),
    };
    return {
      ...this.env, beat, beatCount: this.beatCount, lastBeatMs: this.lastBeatMs,
      flash: Math.exp(-(nowMs - this.lastBeatMs) / 250), hue: this.hue, live: true,
    };
  }

  /** No microphone: a slow, steady pattern (a "beat" every 2 s, color drifting) so sound looks never sit dark. */
  private idle(nowMs: number): AudioFeatures {
    const beatCount = Math.floor(nowMs / IDLE_BEAT_MS);
    return {
      level: 0.5, bass: 0.5, mid: 0.5, treble: 0.5, beat: false, beatCount, lastBeatMs: beatCount * IDLE_BEAT_MS,
      flash: 0, hue: (nowMs / 20000) % 1, live: false,
    };
  }
}

export type MicStatus = 'unsupported' | 'off' | 'starting' | 'on' | 'error';

const MIC_KEY = 'walkup.dmx.mic';

/** Listens to a microphone through Web Audio and turns it into AudioFeatures for the sound effects. */
export class SoundInput {
  status: MicStatus = typeof navigator !== 'undefined' && 'mediaDevices' in navigator ? 'off' : 'unsupported';
  message = '';
  deviceId: string = (() => { try { return localStorage.getItem(MIC_KEY) ?? ''; } catch { return ''; } })();

  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;
  private data?: Uint8Array<ArrayBuffer>;
  readonly analyzer = new AudioAnalyzer();
  private listeners = new Set<() => void>();

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private set(status: MicStatus, message = '') { this.status = status; this.message = message; this.listeners.forEach((f) => f()); }

  /** Start listening. Call from a click so the browser lets the audio run. */
  async start(deviceId = this.deviceId) {
    if (this.status === 'unsupported') return;
    this.stop();
    this.set('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Raw room sound: the processing meant for calls would flatten the music.
        audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;              // ~23 Hz per bin: enough resolution to separate kick drums from bass lines
      analyser.smoothingTimeConstant = 0.4; // light smoothing keeps beats sharp
      ctx.createMediaStreamSource(stream).connect(analyser);
      await ctx.resume();
      this.stream = stream; this.ctx = ctx; this.analyser = analyser;
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.deviceId = deviceId;
      try { localStorage.setItem(MIC_KEY, deviceId); } catch { /* storage unavailable */ }
      stream.getAudioTracks()[0]?.addEventListener('ended', () => { this.stop(); this.set('error', 'Microphone disconnected'); });
      this.set('on');
    } catch (e) {
      const err = e as Error;
      this.set('error', err.name === 'NotAllowedError' ? 'Microphone permission was blocked. Allow it in the address bar and try again.' : err.message);
    }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => { /* already closed */ });
    this.stream = undefined; this.ctx = undefined; this.analyser = undefined; this.data = undefined;
    if (this.status === 'on' || this.status === 'starting') this.set('off');
  }

  /** Microphones the browser can see (names appear once permission has been given). */
  async devices(): Promise<{ id: string; label: string }[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    } catch { return []; }
  }

  /** Current loudness per band, or null when the mic is off. */
  levels(): Bands | null {
    if (!this.analyser || !this.data || !this.ctx) return null;
    this.analyser.getByteFrequencyData(this.data);
    return bandLevels(this.data, this.ctx.sampleRate);
  }

  /** This frame's audio features (an idle pattern when the mic is off). Call once per frame. */
  features(nowMs: number, settings: AnalyzerSettings): AudioFeatures {
    return this.analyzer.next(this.levels(), nowMs, settings);
  }
}
