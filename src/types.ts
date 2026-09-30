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
  updatedAt: number;
}

export interface AppData {
  version: 1;
  shows: Show[];
  activeShowId?: string;
}
