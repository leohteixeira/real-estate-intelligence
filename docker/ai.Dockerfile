# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS build
WORKDIR /source

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/ai/package.json ./apps/ai/
RUN pnpm install --frozen-lockfile --filter "@rei/ai..."

COPY apps/ai/ ./apps/ai/
RUN pnpm --filter "@rei/ai" bundle

FROM node:24.19.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# The Mastra runtime holds no database or object storage credential: it reaches
# domain capabilities only through the API's versioned HTTP contract.
COPY --from=build /source/apps/ai/.mastra/output ./

EXPOSE 4111
USER node
CMD ["node", "index.mjs"]
