# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS build
WORKDIR /source

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json ./packages/domain/
COPY packages/application/package.json ./packages/application/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile --filter "@rei/api..."

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN pnpm --filter "@rei/api..." build \
 && pnpm deploy --filter "@rei/api" --prod --legacy /out

FROM node:24.19.0-alpine AS runtime
WORKDIR /app

# The PostgreSQL pool may hold ten connection attempts, and each one can block a libuv thread in
# getaddrinfo for the resolver timeout while the database host does not resolve. With the default
# four threads every other lookup queues behind them, so readiness reported a reachable broker as
# unavailable during a database outage. Keep this above the pool size in DatabaseConnection.
ENV NODE_ENV=production \
    UV_THREADPOOL_SIZE=16

COPY --from=build /out ./

EXPOSE 8200
USER node
CMD ["node", "-r", "./dist/otel.js", "dist/main.js"]
