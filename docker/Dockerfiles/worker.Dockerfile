# Mail Queue Worker Dockerfile
# Multi-stage production build for BullMQ email processing workers
#
# Build: docker build -f docker/Dockerfiles/worker.Dockerfile -t mail-queue/worker .
# Run: docker run --env-file .env mail-queue/worker

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files for all packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/worker/package.json ./packages/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/worker/node_modules ./packages/worker/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy source files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/worker ./packages/worker
COPY packages/core ./packages/core
COPY packages/db ./packages/db

# Build packages
RUN pnpm turbo build --filter=@mail-queue/worker...

# Prune dev dependencies
RUN pnpm prune --prod

# =============================================================================
# Stage 3: Production Runtime
# =============================================================================
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mailqueue

WORKDIR /app

# Copy production dependencies and built code
COPY --from=builder --chown=mailqueue:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mailqueue:nodejs /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/worker/node_modules ./packages/worker/node_modules
COPY --from=builder --chown=mailqueue:nodejs /app/packages/worker/package.json ./packages/worker/
COPY --from=builder --chown=mailqueue:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=mailqueue:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/db/package.json ./packages/db/

# Copy package.json for workspace resolution
COPY --from=builder --chown=mailqueue:nodejs /app/package.json ./

# Set environment
ENV NODE_ENV=production
ENV METRICS_PORT=9090
ENV WORKER_CONCURRENCY=10

# Create tmp directory for read-only filesystem
RUN mkdir -p /tmp && chown mailqueue:nodejs /tmp

# Switch to non-root user
USER mailqueue

# Expose metrics port
EXPOSE 9090

# Health check via metrics endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:9090/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init as entrypoint for proper signal handling
# Important: Workers need proper SIGTERM handling for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]

# Start the worker
CMD ["node", "packages/worker/dist/index.js"]

# Labels
LABEL org.opencontainers.image.title="Mail Queue Worker"
LABEL org.opencontainers.image.description="BullMQ email processing worker for Mail Queue"
LABEL org.opencontainers.image.vendor="Mail Queue"
LABEL org.opencontainers.image.source="https://github.com/your-org/mail-queue"

# Note: Kubernetes should set terminationGracePeriodSeconds: 120
# to allow workers to complete in-flight jobs before shutdown
