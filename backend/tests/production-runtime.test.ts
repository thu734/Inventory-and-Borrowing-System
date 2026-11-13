import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
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

  function createRuntime(frontendDist: string, ready?: () => Promise<unknown>) {
    const built = createApp({
      store: new MemoryAuthStore(),
      origin: 'http://localhost:5173',
      csrfSecret: 'test-only-secret-that-is-not-a-real-secret',
      secureCookies: false,
      ready,
    });
    mountFrontend(built.app, frontendDist);
    return finishApp(built.app);
  }

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
