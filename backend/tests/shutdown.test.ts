import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../src/shutdown.ts';

describe('finite shutdown', () => {
  it.each(['success', 'rejection', 'stall'] as const)('handles database disconnect %s', async outcome => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const disconnect = vi.fn(() => outcome === 'stall' ? new Promise<void>(() => {})
      : outcome === 'rejection' ? Promise.reject(new Error('private details')) : Promise.resolve());
    let exited!: (code: number) => void;
    const completion = new Promise<number>(resolve => { exited = resolve; });
    const exit = vi.fn(exited);
    const stop = createShutdown(server, disconnect, { graceMs: 40, exit });
    const start = Date.now();
    stop(); stop();
    expect(await completion).toBe(outcome === 'success' ? 0 : 1);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(server.listening).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('stops accepting connections and force closes an active stalled request', async () => {
    let received!: () => void;
    const incoming = new Promise<void>(resolve => { received = resolve; });
    const server = createServer(() => received());
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const response = fetch(`http://127.0.0.1:${address.port}`).catch(() => null);
    await incoming;
    let exited!: (code: number) => void;
    const completion = new Promise<number>(resolve => { exited = resolve; });
    const disconnect = vi.fn(async () => {});
    const stop = createShutdown(server, disconnect, { graceMs: 40, exit: exited });
    stop();
    expect(server.listening).toBe(false);
    expect(await completion).toBe(1);
    expect(await response).toBe(null);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
