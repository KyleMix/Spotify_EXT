/** Sound-to-light: turns what the microphone hears into a color for the stage lights. */
import type { LightColor } from './frame';

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

/** Slow color fade used when the microphone is off, so the stage lights still look alive between acts. */
export const idleColor = (nowMs: number): LightColor => hsvToRgb((nowMs / 20000) % 1, 1, 0.5);

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Turns band levels into a color, one frame at a time:
 * - each bass hit (a kick drum) jumps to a new color and flashes bright, then decays;
 * - overall loudness sets the brightness, so quiet rooms glow dimly and loud music pumps;
 * - bright treble washes the color toward white.
 */
export class SoundColorizer {
  hue = 0;
  private avgBass = 0;
  private env = 0;
  private flash = 0;
  private lastBeat = -Infinity;
  private lastT: number | null = null;

  /** `sensitivity` 1-10: higher reacts to quieter sound. */
  next(b: Bands, nowMs: number, sensitivity: number): LightColor {
    const dt = this.lastT === null ? 30 : Math.min(500, Math.max(0, nowMs - this.lastT));
    this.lastT = nowMs;
    const gain = 0.5 + clamp01((sensitivity - 1) / 9) * 2.5; // 0.5x to 3x
    const bass = clamp01(b.bass * gain), level = clamp01(b.level * gain), treble = clamp01(b.treble * gain);

    this.avgBass += (bass - this.avgBass) * Math.min(1, dt / 500);
    if (bass > 0.3 && bass > this.avgBass * 1.25 && nowMs - this.lastBeat > 250) {
      this.lastBeat = nowMs;
      this.hue = (this.hue + 0.17) % 1;
      this.flash = 1;
    }
    this.flash *= Math.exp(-dt / 250);
    this.hue = (this.hue + (dt / 1000) * 0.02) % 1; // gentle drift between beats
    this.env = level > this.env ? level : this.env + (level - this.env) * Math.min(1, dt / 400);

    const brightness = clamp01(0.06 + 0.6 * this.env + 0.4 * this.flash);
    return hsvToRgb(this.hue, 1 - 0.5 * treble, brightness);
  }
}

export type MicStatus = 'unsupported' | 'off' | 'starting' | 'on' | 'error';

const MIC_KEY = 'walkup.dmx.mic';

/** Listens to a microphone through Web Audio and hands out stage-light colors. */
export class SoundInput {
  status: MicStatus = typeof navigator !== 'undefined' && 'mediaDevices' in navigator ? 'off' : 'unsupported';
  message = '';
  deviceId: string = (() => { try { return localStorage.getItem(MIC_KEY) ?? ''; } catch { return ''; } })();

  private ctx?: AudioContext;
  private analyser?: AnalyserNode;
  private stream?: MediaStream;
  private data?: Uint8Array<ArrayBuffer>;
  private colorizer = new SoundColorizer();
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
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
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

  /** The stage-light color for this frame; a slow fade when the mic is off. */
  color(nowMs: number, sensitivity: number): LightColor {
    const b = this.levels();
    if (!b) return idleColor(nowMs);
    return this.colorizer.next(b, nowMs, sensitivity);
  }
}
