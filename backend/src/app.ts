import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { z } from 'zod';
import type { AuthStore, AuthUser, Role, SessionRecord } from './modules/auth/auth.store.ts';
import { csrfFor, hashPassword, newToken, tokenHash, validCsrf, verifyPassword } from './modules/auth/credentials.ts';
import { isSessionActive } from './modules/auth/session-policy.ts';
import { LoginLimiter } from './modules/auth/login-limiter.ts';

export interface AppOptions {
  store: AuthStore; origin: string; csrfSecret: string; secureCookies: boolean;
  ready?: () => Promise<unknown>;
  readyTimeoutMs?: number;
  now?: () => Date;
}
export class ApiError extends Error {
  readonly status: number; readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
const credentials = z.strictObject({ email: z.email().max(254), password: z.string().min(1).max(128) });
const empty = z.strictObject({});
const lifetime = 8 * 60 * 60 * 1000;
const identity = (user: AuthUser) => ({ id: user.id, displayName: user.displayName, role: user.role });
const denied = () => new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
type Context = { user: AuthUser; session: SessionRecord };

export function createApp(options: AppOptions) {
  const app = express();
  const now = options.now ?? (() => new Date());
  const limiter = new LoginLimiter();
  // Created once, with the same hashing work as real credentials; never logged.
  const dummyHash = hashPassword(newToken());
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader('X-Request-ID', res.locals.requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(cookieParser());
  // Keep at most one probe in flight, including after an HTTP deadline expires.
  // A stalled driver operation cannot create an ever-growing query backlog.
  let probe: Promise<boolean> | undefined;
  const readyTimeoutMs = options.readyTimeoutMs ?? 2000;
  if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0) throw new Error('Invalid readiness deadline');
  app.get('/api/ready', async (_req, res) => {
    if (!options.ready) {
      res.status(503).json({ status: 'not_ready' });
      return;
    }

    if (!probe) {
      // Share the HTTP result as well as the query. Once timed out, later probes
      // return 503 immediately without attaching more handlers to a stuck query.
      probe = new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), readyTimeoutMs);
        const settled = (ready: boolean) => {
          clearTimeout(timer);
          probe = undefined;
          resolve(ready);
        };
        void Promise.resolve().then(options.ready).then(() => settled(true), () => settled(false));
      });
    }
    const ready = await probe;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });
  const cookie = { httpOnly: true, secure: options.secureCookies, sameSite: 'lax' as const, path: '/' };
  const readToken = (req: Request): string | undefined => {
    const value: unknown = req.cookies?.cpe_session;
    return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  };
  const authenticate: RequestHandler = async (req, res, next) => {
    try {
      const value = readToken(req);
      if (!value) throw denied();
      const session = await options.store.findSession(tokenHash(value));
      if (!session || !session.user.isActive || !isSessionActive(session, now())) throw denied();
      res.locals.auth = { user: session.user, session } satisfies Context;
      next();
    } catch (error) { next(error); }
  };
  const requireRole = (role: Role): RequestHandler => (_req, res, next) => {
    const auth = res.locals.auth as Context | undefined;
    if (!auth) return next(denied());
    if (auth.user.role !== role) return next(new ApiError(403, 'FORBIDDEN', 'You do not have permission for this operation.'));
    next();
  };
  const requireOrigin: RequestHandler = (req, _res, next) => {
    next(req.get('Origin') === options.origin ? undefined : new ApiError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not permitted.'));
  };
  const requireCsrf: RequestHandler = (req, res, next) => {
    const auth = res.locals.auth as Context | undefined;
    if (!auth) return next(denied());
    next(validCsrf(req.get('X-CSRF-Token'), csrfFor(auth.session.tokenHash, options.csrfSecret))
      ? undefined : new ApiError(403, 'CSRF_FORBIDDEN', 'Refresh the page and try again.'));
  };
  const requireJson: RequestHandler = (req, _res, next) => next(req.is('application/json')
    ? undefined : new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.'));
  const json = express.json({ limit: '16kb', strict: true });
  const respond = (res: Response, user: AuthUser, hash: string) => res.json({ data: {
    user: identity(user), csrfToken: csrfFor(hash, options.csrfSecret),
  } });

  app.post('/api/v1/auth/login', requireOrigin, requireJson, json, async (req, res, next) => {
    try {
      const input = credentials.safeParse({ ...req.body, ...(typeof req.body?.email === 'string' ? { email: req.body.email.trim().toLowerCase() } : {}) });
      if (!input.success) throw new ApiError(400, 'INVALID_INPUT', 'Enter a valid email and password.');
      const key = `${req.ip}:${input.data.email}`;
      const retry = limiter.retryAfter(key, now().getTime());
      if (retry) { res.setHeader('Retry-After', retry); throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again later.'); }
      const user = await options.store.findUser(input.data.email);
      const verified = await verifyPassword(user?.passwordHash ?? await dummyHash, input.data.password);
      if (!user || !verified || !user.isActive) {
        limiter.fail(key, now().getTime());
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      const token = newToken(); const hash = tokenHash(token); const time = now();
      const old = readToken(req);
      await options.store.rotateSession({ id: randomUUID(), tokenHash: hash, userId: user.id,
        createdAt: time, expiresAt: new Date(time.getTime() + lifetime), revokedAt: null }, old ? tokenHash(old) : undefined);
      limiter.clear(key);
      res.cookie('cpe_session', token, { ...cookie, maxAge: lifetime });
      respond(res, user, hash);
    } catch (error) { next(error); }
  });
  app.get('/api/v1/auth/me', authenticate, (_req, res) => {
    const auth = res.locals.auth as Context;
    respond(res, auth.user, auth.session.tokenHash);
  });
  app.post('/api/v1/auth/logout', authenticate, requireOrigin, requireCsrf, requireJson, json, async (req, res, next) => {
    try {
      if (!empty.safeParse(req.body).success) throw new ApiError(400, 'INVALID_INPUT', 'Use an empty object.');
      const auth = res.locals.auth as Context;
      await options.store.revokeSession(auth.session.tokenHash, now());
      res.clearCookie('cpe_session', cookie); res.status(204).end();
    } catch (error) { next(error); }
  });

  // Member 2 mounts real catalog/checkout routes using these guards before
  // finishApp(). There are no pretend protected domain endpoints.
  return { app, authenticate, requireRole, requireOrigin, requireCsrf };
}

export function mountFrontend(app: express.Express, frontendDist: string) {
  app.use(express.static(frontendDist, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (extname(req.path) || !req.accepts('html')) {
      next();
      return;
    }
    res.sendFile('index.html', { root: frontendDist }, error => {
      if (error) next(error);
    });
  });
}

export function finishApp(app: express.Express) {
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Resource not found.')));
  const handler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const parsing = error as { type?: string };
    const known = error instanceof ApiError ? error : parsing?.type === 'entity.parse.failed'
      ? new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.')
      : parsing?.type === 'entity.too.large' ? new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')
      : new ApiError(500, 'INTERNAL_ERROR', 'Unable to complete the request. Try again later.');
    res.status(known.status).json({ error: { code: known.code, message: known.message, requestId: res.locals.requestId } });
  };
  app.use(handler);
  return app;
}
