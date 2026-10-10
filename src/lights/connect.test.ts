import { afterEach, describe, expect, it, vi } from 'vitest';
import { RED } from './color';
import { LightEngine } from './engine';

/** A fake serial port that behaves like real hardware: refuses a second open, can't write while closed. */
function strictPort() {
  const state = { open: false, opening: false, opens: 0, refused: 0, frames: [] as number[][], locked: false };
  const port = {
    async open() {
      if (state.open || state.opening) { state.refused++; throw Object.assign(new Error('The port is already open.'), { name: 'InvalidStateError' }); }
      state.opening = true; await new Promise((r) => setTimeout(r, 20)); state.opening = false; state.open = true; state.opens++;
    },
    async close() { if (state.locked) throw new Error('writer locked'); state.open = false; },
    async setSignals() { if (!state.open) throw new Error('closed'); },
    getInfo: () => ({ usbVendorId: 0x0403, usbProductId: 0x6001 }),
    get writable() {
      return state.open ? { getWriter: () => {
        if (state.locked) throw new Error('locked'); state.locked = true;
        return { write: async (b: Uint8Array) => { if (!state.open) throw new Error('closed'); state.frames.push(Array.from(b)); }, releaseLock: () => { state.locked = false; } };
      } } : null;
    },
  };
  return { port, state };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => { vi.unstubAllGlobals(); });

describe('connecting to the cable', () => {
  it('auto-connect started twice at once (React StrictMode) opens the cable once and the lights get frames', async () => {
    const { port, state } = strictPort();
    vi.stubGlobal('navigator', { serial: { requestPort: async () => port, getPorts: async () => [port], addEventListener: () => {} } });
    const e = new LightEngine();
    e.setRig({ fixtures: [], customProfiles: [] });
    e.addFixture('generic-rgb', '3ch', 'Bar');
    e.start();
    await Promise.all([e.autoConnect(), e.autoConnect()]);
    e.test(RED);
    await wait(200);
    expect(e.status).toBe('connected');
    expect(state.opens).toBe(1);
    expect(state.refused).toBe(0);
    expect(state.frames.at(-1)!.slice(1, 4)).toEqual([255, 0, 0]);
    e.test({ r: 0, g: 0, b: 0 });
    await e.disconnect();
    e.stop();
    expect(state.open).toBe(false);
    expect(e.status).toBe('disconnected');
  });
  it('disconnect then reconnect never overlaps', async () => {
    const { port, state } = strictPort();
    vi.stubGlobal('navigator', { serial: { requestPort: async () => port, getPorts: async () => [port], addEventListener: () => {} } });
    const e = new LightEngine();
    e.setRig({ fixtures: [], customProfiles: [] });
    e.addFixture('generic-rgb', '3ch');
    e.start();
    await e.connect();
    void e.disconnect();
    await e.connect();
    await wait(150);
    expect(state.refused).toBe(0);
    expect(e.status).toBe('connected');
    expect(state.frames.length).toBeGreaterThan(2);
    await e.disconnect();
    e.stop();
  });
  it('sends from the page by default (the background worker is opt-in)', () => {
    vi.stubGlobal('navigator', { serial: { requestPort: async () => null, getPorts: async () => [], addEventListener: () => {} } });
    expect(new LightEngine().useWorker).toBe(false);
  });
});
