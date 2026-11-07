import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, finishApp } from '../src/app.ts';
import { csrfFor, hashPassword, newToken, tokenHash } from '../src/modules/auth/credentials.ts';
import { PrismaAuthStore, type PrismaAuthDatabase } from '../src/modules/auth/auth.store.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || process.env.SYS01_TEST_DATABASE !== 'true') {
  throw new Error('Real F-01 tests require DATABASE_URL and SYS01_TEST_DATABASE=true');
}
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!/^borrowbase_sys01(?:_|$)/.test(databaseName)) {
  throw new Error(`Refusing real F-01 tests against unsafe database "${databaseName}"`);
}

const prisma = new PrismaClient();
const origin = 'http://localhost:5173';
const csrfSecret = 'integration-test-secret-with-at-least-32-bytes';
const now = new Date('2026-11-07T00:00:00.000Z');
const db = prisma as unknown as PrismaAuthDatabase;
const auth = createApp({
  store: new PrismaAuthStore(db),
  origin,
  csrfSecret,
  secureCookies: false,
  now: () => now,
});
const app = auth.app;
app.get('/test/custodian', auth.authenticate, auth.requireRole('CUSTODIAN'), (_req, res) => {
  res.json({ ok: true });
});
finishApp(app);

function sessionCookie(response: request.Response) {
  const cookie = response.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('Expected a session cookie');
  return cookie;
}

function sessionToken(cookie: string) {
  const match = cookie.match(/cpe_session=([^;]+)/);
  if (!match?.[1]) throw new Error('Expected cpe_session cookie');
  return match[1];
}

describe('F-01 authentication against PostgreSQL', () => {
  let borrowerId: string;
  let custodianId: string;

  beforeAll(async () => {
    const borrower = await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'borrower@example.test' } });
    const custodian = await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'custodian@example.test' } });
    borrowerId = borrower.id;
    custodianId = custodian.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: [borrowerId, custodianId] } } });
    await prisma.user.updateMany({ where: { id: borrowerId }, data: { isActive: true } });
    await prisma.$disconnect();
  });

  it('authenticates seeded users and persists the session', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'borrower@example.test', password: 'local-borrower-password' });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ id: borrowerId, role: 'BORROWER' });
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.csrfToken).toBe(csrfFor(tokenHash(sessionToken(sessionCookie(response))), csrfSecret));
    expect(await prisma.session.count({ where: { userId: borrowerId, revokedAt: null } })).toBe(1);
  });

  it('restores identity from PostgreSQL and enforces the persisted role', async () => {
    const borrower = request.agent(app);
    const login = await borrower
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'borrower@example.test', password: 'local-borrower-password' });

    const me = await borrower.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user).toMatchObject({ id: borrowerId, role: 'BORROWER' });

    const denied = await borrower.get('/test/custodian');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect(login.body.data.csrfToken).not.toContain('password');
  });

  it('revokes a persisted session on logout and rejects it afterward', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'custodian@example.test', password: 'local-custodian-password' });

    const logout = await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', login.body.data.csrfToken)
      .send({});

    expect(logout.status).toBe(204);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: custodianId, revokedAt: { not: null } } })).toBeGreaterThan(0);
  });

  it('rejects invalid and inactive credentials with the same safe error', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'borrower@example.test', password: 'wrong-password' });
    const inactiveUser = await prisma.user.create({
      data: {
        normalizedEmail: 'inactive-f01-test@example.test',
        displayName: 'Inactive F-01 Test',
        passwordHash: await hashPassword('inactive-test-password'),
        role: 'BORROWER',
        isActive: false,
      },
    });
    try {
      const inactive = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email: inactiveUser.normalizedEmail, password: 'inactive-test-password' });

      expect(inactive.status).toBe(wrongPassword.status);
      expect(inactive.body.error.code).toBe(wrongPassword.body.error.code);
      expect(inactive.body.error.message).toBe(wrongPassword.body.error.message);
    } finally {
      await prisma.user.delete({ where: { id: inactiveUser.id } });
    }
  });

  it('rejects expired, revoked, invalid-origin, and invalid-CSRF sessions', async () => {
    const expiredToken = newToken();
    await prisma.session.create({
      data: {
        tokenHash: tokenHash(expiredToken),
        userId: borrowerId,
        createdAt: new Date(now.getTime() - 3_600_000),
        expiresAt: now,
      },
    });
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', `cpe_session=${expiredToken}`)).status).toBe(401);

    const revokedToken = newToken();
    await prisma.session.create({
      data: {
        tokenHash: tokenHash(revokedToken),
        userId: borrowerId,
        createdAt: new Date(now.getTime() - 1_000),
        expiresAt: new Date(now.getTime() + 3_600_000),
        revokedAt: now,
      },
    });
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', `cpe_session=${revokedToken}`)).status).toBe(401);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'borrower@example.test', password: 'local-borrower-password' });
    const agent = request.agent(app);
    const cookie = sessionCookie(login);
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', 'http://evil.example').set('X-CSRF-Token', login.body.data.csrfToken).send({})).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).set('X-CSRF-Token', 'invalid').send({})).status).toBe(403);
  });
});
