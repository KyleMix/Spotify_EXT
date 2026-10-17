export type SlotType = 'act' | 'host' | 'break';

export interface Track {
  uri: string;
  name: string;
  artist: string;
  albumArt?: string;
  durationMs: number;
}

export interface Slot {
  id: string;
  type: SlotType;
  performer: string;
  track?: Track;
  /** Where in the song the walk-up starts. */
  startOffsetMs: number;
  /** How long the walk-up plays before fading out (0 = until stopped). */
  cueLengthMs: number;
  /** Allotted stage time. */
  setLengthMin: number;
  /** Minutes remaining at which the light warning turns on. */
  warnAtMin: number;
  notes: string;
  backupTrack?: Track;
  /** Comedians only: plays when the set ends. Hosts and breaks never have one. */
  walkOffTrack?: Track;
  walkOffStartMs?: number;
  walkOffCueMs?: number;
}

/** Show-wide starting values applied to newly added comedian spots. */
export interface SlotDefaults {
  cueLengthMs: number;
  setLengthMin: number;
  warnAtMin: number;
}

export interface Show {
  id: string;
  name: string;
  date: string;
  venue: string;
  notes: string;
  slots: Slot[];
  /** Optional closing song played once the last slot is done. */
  closingTrack?: Track;
  closingStartMs?: number;
  /** 0 = play until faded out manually. */
  closingCueMs?: number;
  /**
   * Where the music comes from. 'spotify' (the default) plays walk-up songs; 'band' is for nights with a live band:
   * no Spotify at all, just the lineup and the set timer.
   */
  music?: MusicSource;
  /** Starting values for spots added later (optional). */
  defaults?: SlotDefaults;
  updatedAt: number;
}

export type MusicSource = 'spotify' | 'band';

export interface AppData {
  version: 1;
  shows: Show[];
  activeShowId?: string;
}
