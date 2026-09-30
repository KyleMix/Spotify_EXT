import { getAccessToken } from './auth';
import { playTrack, transferPlayback } from './api';
import type { Track } from '../types';

/* Minimal typings for the Web Playback SDK. */
interface SdkPlayer {
  connect(): Promise<boolean>; disconnect(): void; pause(): Promise<void>; resume(): Promise<void>;
  setVolume(v: number): Promise<void>; activateElement(): Promise<void>;
  addListener(ev: string, cb: (arg: any) => void): void;
}
declare global {
  interface Window {
    Spotify?: { Player: new (o: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number }) => SdkPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export type PlayerStatus = 'loading' | 'ready' | 'error';
type Listener = (s: PlayerStatus, msg?: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WalkUpPlayer {
  private player?: SdkPlayer;
  private deviceId?: string;
  private volume = 1;
  private fadeToken = 0;
  private cueTimer?: ReturnType<typeof setTimeout>;
  status: PlayerStatus = 'loading';

  constructor(private onStatus: Listener) {}

  private set(s: PlayerStatus, msg?: string) { this.status = s; this.onStatus(s, msg); }

  async init() {
    await new Promise<void>((resolve) => {
      if (window.Spotify) return resolve();
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const el = document.createElement('script');
      el.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(el);
    });
    const p = new window.Spotify!.Player({
      name: 'Walk-Up Show Runner',
      getOAuthToken: (cb) => { getAccessToken().then(cb).catch(() => this.set('error', 'Login expired')); },
      volume: 1,
    });
    p.addListener('ready', async ({ device_id }: { device_id: string }) => {
      this.deviceId = device_id;
      try { await transferPlayback(device_id); } catch { /* non-fatal */ }
      this.set('ready');
    });
    p.addListener('not_ready', () => this.set('loading', 'Device offline'));
    for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) {
      p.addListener(ev, ({ message }: { message: string }) => this.set('error', message));
    }
    this.player = p;
    await p.connect();
  }

  /** Must run from a user gesture the first time (browser autoplay policy). */
  async unlock() { await this.player?.activateElement(); }

  private async fade(to: number, ms: number) {
    const token = ++this.fadeToken;
    const from = this.volume;
    const steps = Math.max(1, Math.round(ms / 100));
    for (let i = 1; i <= steps; i++) {
      if (token !== this.fadeToken) return;
      this.volume = from + ((to - from) * i) / steps;
      await this.player?.setVolume(Math.min(1, Math.max(0, this.volume)));
      await sleep(ms / steps);
    }
  }

  async play(track: Track, startOffsetMs: number, cueLengthMs: number, fadeInMs = 800) {
    if (!this.deviceId) throw new Error('Player not ready');
    clearTimeout(this.cueTimer);
    this.fadeToken++;
    this.volume = 0;
    await this.player?.setVolume(0);
    await playTrack(this.deviceId, track.uri, startOffsetMs);
    void this.fade(1, fadeInMs);
    if (cueLengthMs > 0) this.cueTimer = setTimeout(() => void this.stop(2500), cueLengthMs);
  }

  async stop(fadeMs = 1500) {
    clearTimeout(this.cueTimer);
    await this.fade(0, fadeMs);
    await this.player?.pause();
  }

  /** Immediate cut, for emergencies. */
  async panic() {
    clearTimeout(this.cueTimer);
    this.fadeToken++;
    await this.player?.pause();
  }

  destroy() { clearTimeout(this.cueTimer); this.player?.disconnect(); }
}
