# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS build
WORKDIR /source

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json ./packages/domain/
COPY packages/application/package.json ./packages/application/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile --filter "@rei/worker..."

COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN pnpm --filter "@rei/worker..." build \
 && pnpm deploy --filter "@rei/worker" --prod --legacy /out

FROM node:24.19.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /out ./

USER node
CMD ["node", "-r", "./dist/otel.js", "dist/main.js"]
