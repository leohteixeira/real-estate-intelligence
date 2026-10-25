# syntax=docker/dockerfile:1
FROM node:24.19.0-alpine AS build
WORKDIR /source

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@rei/web..."

COPY apps/web/ ./apps/web/
COPY packages/contracts/ ./packages/contracts/
ARG VITE_PUBLIC_BASE="/"
ARG VITE_PRIVACY_CONTROLLER_NAME=""
ARG VITE_PRIVACY_CONTACT_EMAIL=""
ENV VITE_PUBLIC_BASE=$VITE_PUBLIC_BASE \
    VITE_PRIVACY_CONTROLLER_NAME=$VITE_PRIVACY_CONTROLLER_NAME \
    VITE_PRIVACY_CONTACT_EMAIL=$VITE_PRIVACY_CONTACT_EMAIL
RUN pnpm --filter "@rei/web..." build

COPY docker/web-nginx.conf /tmp/web-nginx.conf
RUN mkdir -p "/web-root${VITE_PUBLIC_BASE}" \
    && cp -R apps/web/dist/. "/web-root${VITE_PUBLIC_BASE}" \
    && sed "s|__PUBLIC_BASE__|${VITE_PUBLIC_BASE}|g" /tmp/web-nginx.conf > /tmp/default.conf

FROM nginx:1.29-alpine AS runtime

COPY --from=build /web-root /srv/rei
COPY --from=build /tmp/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 3200
