import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError, type createApp } from '../../app.ts';
import type { BorrowingStore } from './borrowing.store.ts';

const id = z.uuid();
const body = z.strictObject({ assetId: id });
export function mountBorrowingRoutes(auth: ReturnType<typeof createApp>, store: BorrowingStore) {
  const base = '/api/v1';
  const guards = [auth.authenticate, auth.requireRole('BORROWER')];
  const noQuery: RequestHandler = (req, _res, next) => next(Object.keys(req.query).length
    ? new ApiError(400, 'INVALID_INPUT', 'Query parameters are not supported.') : undefined);
  const json: RequestHandler = (req, _res, next) => next(req.is('application/json')
    ? undefined : new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.'));
  const owner = (res: express.Response): string => (res.locals.auth as { user: { id: string } }).user.id;
  auth.app.post(`${base}/borrow-requests`, ...guards, auth.requireOrigin, auth.requireCsrf,
    noQuery, json, express.json({ limit: '16kb', strict: true }), async (req, res, next) => {
      try {
        const parsed = body.safeParse(req.body);
        if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Select a valid asset. Only assetId is accepted.');
        const saved = await store.create(owner(res), parsed.data.assetId);
        res.location(`${base}/me/borrow-requests/${saved.id}`).status(201).json({ data: saved });
      } catch (error) { next(error); }
    });
  for (const [path, list, detail] of [
    ['borrow-requests', store.requests.bind(store), store.request.bind(store)],
    ['loans', store.loans.bind(store), store.loan.bind(store)],
  ] as const) {
    auth.app.get(`${base}/me/${path}`, ...guards, noQuery, async (_req, res, next) => {
      try { res.json({ data: { items: await list(owner(res)) } }); } catch (error) { next(error); }
    });
    auth.app.get(`${base}/me/${path}/:id`, ...guards, noQuery, async (req, res, next) => {
      try {
        const parsed = id.safeParse(req.params.id);
        if (!parsed.success) throw new ApiError(400, 'INVALID_INPUT', 'Use a valid record ID.');
        const record = await detail(owner(res), parsed.data);
        if (!record) throw new ApiError(404, 'NOT_FOUND', 'Resource not found.');
        res.json({ data: record });
      } catch (error) { next(error); }
    });
  }
}
