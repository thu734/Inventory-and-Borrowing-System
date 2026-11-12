
import express, { type RequestHandler } from 'express';
import { z } from 'zod';

import { ApiError, type createApp } from '../../app.ts';
import type { CustodianStore } from './custodian.store.ts';

const id = z.uuid();

const querySchema = z.strictObject({
  status: z.enum(['PENDING', 'FULFILLED']).optional()
});

const emptyBody = z.strictObject({});

export function mountCustodianRoutes(
  auth: ReturnType<typeof createApp>,
  store: CustodianStore
) {
  const base = '/api/v1/custodian';

  const guards = [
    auth.authenticate,
    auth.requireRole('CUSTODIAN')
  ];

  const noQuery: RequestHandler = (req, _res, next) => {
    if (Object.keys(req.query).length > 0) {
      return next(
        new ApiError(
          400,
          'INVALID_INPUT',
          'Query parameters are not supported.'
        )
      );
    }

    next();
  };

  const json: RequestHandler = (req, _res, next) => {
    if (!req.is('application/json')) {
      return next(
        new ApiError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'Use application/json.'
        )
      );
    }

    next();
  };

  function custodianId(res: express.Response): string {
    return (
      res.locals.auth as {
        user: {
          id: string;
        };
      }
    ).user.id;
  }

  // GET /api/v1/custodian/borrow-requests
  auth.app.get(
    `${base}/borrow-requests`,
    ...guards,
    async (req, res, next) => {
      try {
        const parsed = querySchema.safeParse(req.query);

        if (!parsed.success) {
          throw new ApiError(
            400,
            'INVALID_INPUT',
            'Only status=PENDING or status=FULFILLED is supported.'
          );
        }

        const items = await store.requests(
          parsed.data.status
        );

        res.json({
          data: {
            items
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/v1/custodian/borrow-requests/:id
  auth.app.get(
    `${base}/borrow-requests/:id`,
    ...guards,
    noQuery,
    async (req, res, next) => {
      try {
        const parsed = id.safeParse(req.params.id);

        if (!parsed.success) {
          throw new ApiError(
            400,
            'INVALID_INPUT',
            'Use a valid request ID.'
          );
        }

        const record = await store.request(parsed.data);

        if (!record) {
          throw new ApiError(
            404,
            'NOT_FOUND',
            'Resource not found.'
          );
        }

        res.json({
          data: record
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // GET /api/v1/custodian/loans
  auth.app.get(
    `${base}/loans`,
    ...guards,
    noQuery,
    async (_req, res, next) => {
      try {
        const items = await store.loans();

        res.json({
          data: {
            items
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/v1/custodian/borrow-requests/:id/checkout
  auth.app.post(
    `${base}/borrow-requests/:id/checkout`,
    ...guards,
    auth.requireOrigin,
    auth.requireCsrf,
    noQuery,
    json,
    express.json({
      limit: '16kb',
      strict: true
    }),
    async (req, res, next) => {
      try {
        const parsedId = id.safeParse(req.params.id);
        const parsedBody = emptyBody.safeParse(req.body);

        if (!parsedId.success || !parsedBody.success) {
          throw new ApiError(
            400,
            'INVALID_INPUT',
            'A valid request ID and an empty JSON object are required.'
          );
        }

        const result = await store.checkout(
          parsedId.data,
          custodianId(res)
        );

        res
          .location(
            `${base}/borrow-requests/${result.request.id}`
          )
          .status(201)
          .json({
            data: result
          });
      } catch (error) {
        next(error);
      }
    }
  );
}
