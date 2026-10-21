# ── builder ──────────────────────────────────────────────────────────────────
# Pinned to immutable digest — update via Dependabot (docker ecosystem) or
# by running: docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine
# Multi-arch: buildx resolves the correct per-platform digest for linux/amd64 and linux/arm64.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force

# ── runner ───────────────────────────────────────────────────────────────────
# Image size target: <300MB
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
# Create a dedicated non-root app user (uid/gid 1001) per CIS Docker Benchmark
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 --ingroup app app
COPY --from=builder --chown=app:app /app/package*.json ./
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
# Ensure uploads and SQLite data directories are writable by the app user
RUN mkdir -p /app/uploads /app/data && chown -R app:app /app /app/uploads /app/data
USER app
EXPOSE 3001
CMD ["node", "dist/index.js"]

# ── runtime (compatibility alias) ─────────────────────────────────────────────
FROM runner AS runtime
