import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp, finishApp } from '../src/app.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { MemoryAuthStore } from './helpers/memory-auth-store.ts';

// These are Express API behavior tests with a test store, NOT PostgreSQL tests.
describe('F-01 Express API behavior (test-double store)', () => {
  const origin = 'http://localhost:5173';
  let encoded: string; let time: Date; let store: MemoryAuthStore;
  let app: ReturnType<typeof finishApp>;
  beforeAll(async () => { encoded = await hashPassword('local-test-password'); });
  beforeEach(() => {
    time = new Date('2026-11-06T12:00:00Z'); store = new MemoryAuthStore();
    store.users.set('borrower-1', { id: 'borrower-1', normalizedEmail: 'borrower@example.test',
      displayName: 'Demo Borrower', passwordHash: encoded, role: 'BORROWER', isActive: true });
    store.users.set('custodian-1', { id: 'custodian-1', normalizedEmail: 'custodian@example.test',
      displayName: 'Demo Custodian', passwordHash: encoded, role: 'CUSTODIAN', isActive: true });
    const built = createApp({ store, origin, csrfSecret: 'test-only-secret-that-is-not-a-real-secret', secureCookies: false, now: () => time });
    // An isolated guard harness, not a simulated domain checkout endpoint.
    built.app.get('/test/role-guard', built.authenticate, built.requireRole('CUSTODIAN'), (_req, res) => res.json({ data: 'allowed' }));
    app = finishApp(built.app);
  });
  const login = (email = 'borrower@example.test', password = 'local-test-password') =>
    request(app).post('/api/v1/auth/login').set('Origin', origin).send({ email, password });
  const cookie = (result: { headers: Record<string, unknown> }) => String((result.headers['set-cookie'] as string[])[0]).split(';')[0]!;

  it('TEST-F01-01 logs in and retrieves only safe identity', async () => {
    const result = await login(' BORROWER@EXAMPLE.TEST ');
    expect(result.status).toBe(200); expect(result.body.data.user).toEqual({ id: 'borrower-1', displayName: 'Demo Borrower', role: 'BORROWER' });
    expect(Object.keys(result.body.data).sort()).toEqual(['csrfToken', 'user']);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(String(result.headers['set-cookie'])).toContain('HttpOnly'); expect(String(result.headers['set-cookie'])).toContain('SameSite=Lax');
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(result))).body.data).toEqual(result.body.data);
    expect([...store.sessions.values()][0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.body)).not.toContain(encoded);
  });
  it('TEST-F01-01 supports the Custodian identity', async () => {
    const result = await login('custodian@example.test'); expect(result.body.data.user.role).toBe('CUSTODIAN');
    expect((await request(app).get('/test/role-guard').set('Cookie', cookie(result))).status).toBe(200);
  });
  it('TEST-F01-02 rejects wrong, unknown and inactive credentials uniformly', async () => {
    const wrong = await login(undefined, 'wrong'); const missing = await login('missing@example.test');
    store.users.get('borrower-1')!.isActive = false;
    const inactive = await login();
    for (const result of [wrong, missing, inactive]) {
      expect(result.status).toBe(401); expect(result.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(result.body.error.message).toBe(wrong.body.error.message);
    }
    expect(store.sessions.size).toBe(0);
  });
  it.each([undefined, 'cpe_session=malformed', `cpe_session=${'x'.repeat(43)}`])('TEST-F01-03 rejects absent/random credentials (%s)', async value => {
    const call = request(app).get('/api/v1/auth/me'); if (value) call.set('Cookie', value);
    expect((await call).status).toBe(401);
  });
  it('TEST-F01-03 rejects expiry equality and newly inactive user', async () => {
    const result = await login(); const header = cookie(result);
    store.users.get('borrower-1')!.isActive = false;
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', header)).status).toBe(401);
    store.users.get('borrower-1')!.isActive = true;
    time = new Date(time.getTime() + 8 * 3600000);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', header)).status).toBe(401);
  });
  it('TEST-F01-04 logout invalidates replay, preserves other session and clears cookie', async () => {
    const first = await login(); const second = await login();
    const result = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie(first)).set('Origin', origin)
      .set('X-CSRF-Token', first.body.data.csrfToken).send({});
    expect(result.status).toBe(204); expect(String(result.headers['set-cookie'])).toContain('Expires=Thu, 01 Jan 1970');
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(first))).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(second))).status).toBe(200);
  });
  it('rotates a presented session at successful re-login', async () => {
    const first = await login();
    const second = await request(app).post('/api/v1/auth/login').set('Cookie', cookie(first)).set('Origin', origin)
      .send({ email: 'borrower@example.test', password: 'local-test-password' });
    expect(second.status).toBe(200); expect(cookie(first)).not.toBe(cookie(second));
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(first))).status).toBe(401);
  });
  it('TEST-F01-05 derives role from identity and rejects Borrower access in guard harness', async () => {
    const result = await login();
    expect((await request(app).get('/test/role-guard').set('Cookie', cookie(result))).status).toBe(403);
    expect((await request(app).get('/test/role-guard')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'borrower@example.test', password: 'local-test-password', role: 'CUSTODIAN' })).status).toBe(400);
  });
  it('TEST-F01-07 anonymous logout returns 401 before Origin/CSRF checks', async () => {
    expect((await request(app).post('/api/v1/auth/logout').send({})).status).toBe(401);
  });
  it('TEST-F01-07 blocks foreign origins and mismatched/missing CSRF without revoking', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'a@b.test', password: 'p' })).status).toBe(403);
    const result = await login();
    for (const csrf of ['', 'wrong']) {
      expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie(result)).set('Origin', origin).set('X-CSRF-Token', csrf).send({})).status).toBe(403);
    }
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie(result)).set('Origin', 'https://foreign.test').set('X-CSRF-Token', result.body.data.csrfToken).send({})).status).toBe(403);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie(result))).status).toBe(200);
  });
  it.each([{}, { email: 'invalid', password: 'p' }, { email: 'a@b.test', password: '' }, { email: 'a@b.test', password: 'p', userId: 'forged' }, []])('TEST-F01-07 rejects invalid body %j', async body => {
    expect((await request(app).post('/api/v1/auth/login').set('Origin', origin).send(body)).status).toBe(400);
    expect(store.sessions.size).toBe(0);
  });
  it('TEST-F01-07 handles malformed JSON, oversized bodies and content type safely', async () => {
    const malformed = await request(app).post('/api/v1/auth/login').set('Origin', origin).set('Content-Type', 'application/json').send('{');
    expect(malformed.status).toBe(400); expect(malformed.body.error.code).toBe('INVALID_JSON');
    expect((await request(app).post('/api/v1/auth/login').set('Origin', origin).send('text')).status).toBe(415);
    expect((await request(app).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'a@b.test', password: 'x'.repeat(17000) })).status).toBe(413);
  });
  it('TEST-F01-08 blocks the eleventh attempt and recovers after window expiry', async () => {
    for (let i = 0; i < 10; i++) expect((await login(undefined, 'wrong')).status).toBe(401);
    const blocked = await login(); expect(blocked.status).toBe(429); expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    time = new Date(time.getTime() + 15 * 60000);
    expect((await login()).status).toBe(200);
  });
  it('never exposes DB errors or reports success when persistence fails', async () => {
    vi.spyOn(store, 'rotateSession').mockRejectedValue(new Error('SQL secret password=do-not-leak'));
    const result = await login(); expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('SQL'); expect(result.headers['set-cookie']).toBeUndefined();
  });
});
