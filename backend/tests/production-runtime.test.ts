import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, finishApp, mountFrontend } from '../src/app.ts';
import { MemoryAuthStore } from './helpers/memory-auth-store.ts';

describe('production runtime', () => {
  const origins = new Set<string>();

  afterEach(async () => {
    await Promise.all([...origins].map(path => rm(path, { recursive: true, force: true })));
    origins.clear();
  });

  async function createFrontendFixture() {
    const root = await mkdtemp(join(tmpdir(), 'borrowbase-runtime-'));
    origins.add(root);
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<!doctype html><html><body>BorrowBase</body></html>');
    await writeFile(join(root, 'assets', 'app.js'), 'console.log("BorrowBase");');
    return root;
  }

  function createRuntime(frontendDist: string, ready?: () => Promise<unknown>, readyTimeoutMs?: number) {
    const built = createApp({
      store: new MemoryAuthStore(),
      origin: 'http://localhost:5173',
      csrfSecret: 'test-only-secret-that-is-not-a-real-secret',
      secureCookies: false,
      ready,
      readyTimeoutMs,
    });
    mountFrontend(built.app, frontendDist);
    return finishApp(built.app);
  }

  it('reports public liveness as minimal JSON without authentication or a readiness callback', async () => {
    const app = createRuntime(await createFrontendFixture());
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('keeps liveness independent of database failures and leaves readiness responsible for probing', async () => {
    const ready = vi.fn().mockRejectedValue(new Error('private database connection details'));
    const app = createRuntime(await createFrontendFixture(), ready);

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
    expect(ready).not.toHaveBeenCalled();

    const readiness = await request(app).get('/api/ready');
    expect(readiness.status).toBe(503);
    expect(readiness.body).toEqual({ status: 'not_ready' });
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('reports database readiness without exposing connection details', async () => {
    const app = createRuntime(await createFrontendFixture(), async () => {});

    const response = await request(app).get('/api/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('returns 503 when the readiness query fails', async () => {
    const app = createRuntime(await createFrontendFixture(), async () => {
      throw new Error('database connection details must not escape');
    });

    const response = await request(app).get('/api/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
    expect(JSON.stringify(response.body)).not.toContain('database connection');
  });

  it('bounds stalled probes and shares one operation across repeated requests', async () => {
    const ready = vi.fn(() => new Promise<never>(() => {}));
    const app = createRuntime(await createFrontendFixture(), ready, 30);
    const started = Date.now();
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(app).get('/api/ready')));
    responses.push(await request(app).get('/api/ready'));
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ status: 'not_ready' });
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(Date.now() - started).toBeLessThan(1000);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('handles late %s and permits a fresh probe', async outcome => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const ready = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    const app = createRuntime(await createFrontendFixture(), ready, 30);
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
    if (outcome === 'resolve') resolve();
    else reject(new Error('private database details must never escape'));
    await new Promise<void>(done => setImmediate(done));
    expect((await request(app).get('/api/ready')).status).toBe(200);
    expect(ready).toHaveBeenCalledTimes(2);
  });

  it('serves the frontend and preserves JSON API 404 responses', async () => {
    const app = createRuntime(await createFrontendFixture());

    const home = await request(app).get('/').set('Accept', 'text/html');
    const deepLink = await request(app).get('/borrower/records').set('Accept', 'text/html');
    const asset = await request(app).get('/assets/app.js');
    const apiMiss = await request(app).get('/api/v1/not-found').set('Accept', 'text/html');
    const missingAsset = await request(app).get('/assets/missing.js');

    expect(home.status).toBe(200);
    expect(home.text).toContain('BorrowBase');
    expect(deepLink.status).toBe(200);
    expect(deepLink.text).toContain('BorrowBase');
    expect(asset.status).toBe(200);
    expect(asset.text).toContain('console.log');
    expect(apiMiss.status).toBe(404);
    expect(apiMiss.body.error.code).toBe('NOT_FOUND');
    expect(apiMiss.type).toBe('application/json');
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.type).toBe('application/json');
  });
});
