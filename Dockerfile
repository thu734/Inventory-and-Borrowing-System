FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS base

RUN apt-get update \
    && apt-get install --no-install-recommends -y openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/tsconfig.json backend/tsconfig.build.json ./backend/
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./frontend/
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm ci

COPY backend/src ./backend/src
COPY frontend/src ./frontend/src
COPY prisma/migrations ./prisma/migrations
COPY prisma/seed.ts ./prisma/seed.ts

RUN npm run db:generate && npm run build
USER node

FROM base AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY prisma/schema.prisma ./prisma/schema.prisma

ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
# The optional @prisma/client peer installs the CLI, which is not needed at runtime.
RUN npm ci --omit=dev \
    && rm -rf node_modules/prisma node_modules/@prisma/config node_modules/deepmerge-ts

FROM base AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=build /app/backend/dist ./backend/dist
COPY --chown=node:node backend/package.json ./backend/package.json
COPY --chown=node:node --from=build /app/frontend/dist ./frontend/dist

USER node

EXPOSE 3000

CMD ["node", "backend/dist/server.js"]
