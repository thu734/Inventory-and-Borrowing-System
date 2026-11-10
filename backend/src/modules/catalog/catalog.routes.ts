
import { type RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError, type createApp } from '../../app.ts';
import type { CatalogStore } from './catalog.store.ts';

const id = z.uuid();

export function mountCatalogRoutes(
  auth: ReturnType<typeof createApp>,
  store: CatalogStore
) {
  const base = '/api/v1/assets';

  const guards = [auth.authenticate];

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

  auth.app.get(base, ...guards, noQuery, async (_req, res, next) => {
    try {
      const assets = await store.list();

      const sortedAssets = [...assets].sort((a, b) =>
        a.assetCode.localeCompare(b.assetCode)
      );

      res.status(200).json({
        data: {
          items: sortedAssets
        }
      });
    } catch (error) {
      next(error);
    }
  });

  auth.app.get(
    `${base}/:id`,
    ...guards,
    noQuery,
    async (req, res, next) => {
      try {
        const parsed = id.safeParse(req.params.id);

        if (!parsed.success) {
          throw new ApiError(
            400,
            'INVALID_INPUT',
            'Use a valid asset ID.'
          );
        }

        const asset = await store.detail(parsed.data);

        if (!asset) {
          throw new ApiError(
            404,
            'NOT_FOUND',
            'Asset not found.'
          );
        }

        res.status(200).json({
          data: asset
        });
      } catch (error) {
        next(error);
      }
    }
  );
}
