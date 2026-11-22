import type { Server } from 'node:http';

// One total budget for HTTP draining and Prisma disconnection.
export function createShutdown(
  server: Server,
  disconnect: () => Promise<void>,
  { graceMs = 5000, exit = (code: number) => process.exit(code) }: { graceMs?: number; exit?: (code: number) => void } = {},
) {
  let started = false;
  let finished = false;
  let disconnection: Promise<void> | undefined;
  function disconnectOnce() {
    if (!disconnection) {
      try { disconnection = Promise.resolve(disconnect()); }
      catch { disconnection = Promise.reject(new Error('Database disconnection failed')); }
      // Also handle rejection if the deadline exits before normal cleanup finishes.
      void disconnection.catch(() => {});
    }
    return disconnection;
  }
  return () => {
    if (started) return;
    started = true;
    const finish = (code: number) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      exit(code);
    };
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      void disconnectOnce();
      finish(1);
    }, graceMs);
    server.close(() => {
      void disconnectOnce().then(() => finish(0), () => finish(1));
    });
  };
}
