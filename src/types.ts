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
}

export interface Show {
  id: string;
  name: string;
  date: string;
  venue: string;
  notes: string;
  slots: Slot[];
  updatedAt: number;
}

export interface AppData {
  version: 1;
  shows: Show[];
  activeShowId?: string;
}
