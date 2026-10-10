import { describe, expect, it } from 'vitest';
import { enttecPacket, openDmxFrame, transmitMs } from './drivers';

const universe = () => { const u = new Uint8Array(513); u[1] = 10; u[27] = 99; return u; };

describe('Open DMX frames', () => {
  it('sends the start code and the used channels, at least 24', () => {
    expect(openDmxFrame(universe(), 27)).toHaveLength(28);
    expect(openDmxFrame(universe(), 3)).toHaveLength(25);
    expect(openDmxFrame(universe(), 999)).toHaveLength(513);
    expect(openDmxFrame(universe(), 27)[27]).toBe(99);
  });
  it('waits long enough for a frame to leave the cable before the next BREAK', () => {
    expect(transmitMs(25)).toBe(3);
    expect(transmitMs(513)).toBe(24);
  });
});

describe('ENTTEC Pro packets', () => {
  it('wraps the frame as label 6 with length and end marker', () => {
    const p = enttecPacket(universe(), 27);
    expect(Array.from(p.slice(0, 4))).toEqual([0x7e, 6, 28, 0]);
    expect(p[4]).toBe(0);
    expect(p[5]).toBe(10);
    expect(p[p.length - 1]).toBe(0xe7);
    expect(p).toHaveLength(28 + 5);
  });
  it('encodes lengths over 255 across two bytes', () => {
    const p = enttecPacket(new Uint8Array(513), 512);
    expect([p[2], p[3]]).toEqual([513 & 0xff, 513 >> 8]);
  });
});
