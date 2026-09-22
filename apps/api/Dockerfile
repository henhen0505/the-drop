# Multi-stage build for @the-drop/api. Build context MUST be the monorepo
# root (see root docker-compose.yml / CI), since the package depends on
# the @the-drop/types workspace package via npm workspaces.

# ---- Stage 1: builder (compiles TS -> JS for both packages) -------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/types/package.json ./packages/types/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci
COPY packages/types ./packages/types
COPY apps/api ./apps/api
RUN npx turbo run build --filter=@the-drop/api

# ---- Stage 2: production dependencies only -------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --omit=dev

# ---- Stage 3: runtime ------------------------------------------------------
FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

USER appuser
WORKDIR /app/apps/api
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
