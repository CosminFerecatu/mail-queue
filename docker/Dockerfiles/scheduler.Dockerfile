# Mail Queue Scheduler Dockerfile
# Multi-stage production build for scheduled job processing
#
# Build: docker build -f docker/Dockerfiles/scheduler.Dockerfile -t mail-queue/scheduler .
# Run: docker run --env-file .env mail-queue/scheduler

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files for all packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/scheduler/package.json ./packages/scheduler/
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
COPY --from=deps /app/packages/scheduler/node_modules ./packages/scheduler/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy source files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/scheduler ./packages/scheduler
COPY packages/core ./packages/core
COPY packages/db ./packages/db

# Build packages
RUN pnpm turbo build --filter=@mail-queue/scheduler...

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
COPY --from=builder --chown=mailqueue:nodejs /app/packages/scheduler/dist ./packages/scheduler/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/scheduler/node_modules ./packages/scheduler/node_modules
COPY --from=builder --chown=mailqueue:nodejs /app/packages/scheduler/package.json ./packages/scheduler/
COPY --from=builder --chown=mailqueue:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=mailqueue:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/db/package.json ./packages/db/

# Copy package.json for workspace resolution
COPY --from=builder --chown=mailqueue:nodejs /app/package.json ./

# Set environment
ENV NODE_ENV=production

# Create tmp directory for read-only filesystem
RUN mkdir -p /tmp && chown mailqueue:nodejs /tmp

# Switch to non-root user
USER mailqueue

# Health check - scheduler should respond to basic check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "process.exit(0)"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the scheduler
CMD ["node", "packages/scheduler/dist/index.js"]

# Labels
LABEL org.opencontainers.image.title="Mail Queue Scheduler"
LABEL org.opencontainers.image.description="Cron-based job scheduler for Mail Queue"
LABEL org.opencontainers.image.vendor="Mail Queue"
LABEL org.opencontainers.image.source="https://github.com/your-org/mail-queue"

# Note: Scheduler should run as a singleton (1 replica)
# to prevent duplicate job execution
