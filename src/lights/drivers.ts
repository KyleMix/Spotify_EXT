/**
 * USB-to-DMX output drivers. The same loop runs in a Web Worker (preferred: page rendering can't stall it) or on
 * the main thread when the browser has no Web Serial in workers.
 */

export type DriverId = 'opendmx' | 'enttec';

export const DRIVERS: { id: DriverId; label: string; hint: string }[] = [
  { id: 'opendmx', label: 'Open DMX (FTDI) cable', hint: 'Plain USB-DMX cables with an FTDI chip, e.g. DSD TECH SH-RS09B, ENTTEC Open DMX USB.' },
  { id: 'enttec', label: 'DMX USB Pro-style interface', hint: 'Interfaces with their own processor, e.g. ENTTEC DMX USB Pro, DMXking ultraDMX Pro.' },
];

/* Minimal Web Serial typings (not in TypeScript's DOM lib). */
export interface SerialPortLike {
  open(o: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; flowControl?: string; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  setSignals(s: { break?: boolean }): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  writable: { getWriter(): { write(b: Uint8Array): Promise<void>; releaseLock(): void } } | null;
}
export interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener(ev: string, cb: () => void): void;
}
export const serialApi = (): SerialLike | undefined =>
  (globalThis.navigator as unknown as { serial?: SerialLike } | undefined)?.serial;

export interface PortInfo { usbVendorId?: number; usbProductId?: number }

export const samePort = (a: PortInfo, b: PortInfo | null | undefined) =>
  !!b && a.usbVendorId === b.usbVendorId && a.usbProductId === b.usbProductId;

/** Bytes for one Open DMX frame: start code + channels 1..slots (the BREAK is sent separately). */
export function openDmxFrame(universe: Uint8Array, slots: number): Uint8Array {
  return universe.slice(0, Math.min(512, Math.max(24, slots)) + 1);
}

/** ENTTEC Pro "Output Only Send DMX Packet" (label 6): 0x7E, label, length LSB/MSB, start code + channels, 0xE7. */
export function enttecPacket(universe: Uint8Array, slots: number): Uint8Array {
  const data = openDmxFrame(universe, slots);
  const out = new Uint8Array(data.length + 5);
  out[0] = 0x7e; out[1] = 6; out[2] = data.length & 0xff; out[3] = data.length >> 8;
  out.set(data, 4);
  out[out.length - 1] = 0xe7;
  return out;
}

export const portOptions = (driver: DriverId) => driver === 'enttec'
  ? { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' }
  : { baudRate: 250000, dataBits: 8, stopBits: 2, parity: 'none', flowControl: 'none', bufferSize: 1024 };

export const FRAME_INTERVAL_MS = 30; // about 30 frames per second: the timing proven with Open DMX cables

/** Time a frame takes on the wire: 11 bits per byte (start, 8 data, 2 stop) at 250 kbit/s = 44 µs, plus 1 ms margin. */
export const transmitMs = (bytes: number) => Math.ceil(bytes * 0.044) + 1;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LoopHooks {
  /** Latest universe and how many channels to send. */
  frame(): { universe: Uint8Array; slots: number };
  running(): boolean;
  /** Called about once a second with frames actually sent. */
  stats(fps: number): void;
}

/**
 * Keep the DMX line refreshed until `running()` turns false or the port fails (throws).
 * Open DMX: BREAK (line held low), mark-after-break, then the frame. Pro-style: one packet per frame.
 */
export async function runOutputLoop(port: SerialPortLike, driver: DriverId, hooks: LoopHooks): Promise<void> {
  const writer = port.writable?.getWriter();
  if (!writer) throw new Error('Serial port is not writable');
  let sent = 0, windowStart = Date.now();
  try {
    while (hooks.running()) {
      const t0 = Date.now();
      const { universe, slots } = hooks.frame();
      let txMs = 0;
      if (driver === 'enttec') {
        await writer.write(enttecPacket(universe, slots));
      } else {
        const frame = openDmxFrame(universe, slots);
        // Same timing as the original single-light version, which is proven on the DSD TECH SH-RS09B.
        await port.setSignals({ break: true });   // BREAK: line held low (at least 88 microseconds; 2 ms here)
        await sleep(2);
        await port.setSignals({ break: false });  // mark-after-break
        await sleep(1);
        await writer.write(frame);
        // write() can resolve while bytes are still going out; the next BREAK must not cut this frame short.
        txMs = transmitMs(frame.length);
      }
      sent++;
      const now = Date.now();
      if (now - windowStart >= 1000) { hooks.stats(Math.round((sent * 1000) / (now - windowStart))); sent = 0; windowStart = now; }
      await sleep(Math.max(txMs, FRAME_INTERVAL_MS - (now - t0)));
    }
  } finally {
    try { writer.releaseLock(); } catch { /* already released */ }
  }
}
