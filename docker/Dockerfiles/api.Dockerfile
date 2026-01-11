# Mail Queue API Dockerfile
# Multi-stage production build with security hardening
#
# Build: docker build -f docker/Dockerfiles/api.Dockerfile -t mail-queue/api .
# Run: docker run -p 3000:3000 --env-file .env mail-queue/api

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files for all packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
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
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy source files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/api ./packages/api
COPY packages/core ./packages/core
COPY packages/db ./packages/db

# Build packages
RUN pnpm turbo build --filter=@mail-queue/api...

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
COPY --from=builder --chown=mailqueue:nodejs /app/packages/api/dist ./packages/api/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder --chown=mailqueue:nodejs /app/packages/api/package.json ./packages/api/
COPY --from=builder --chown=mailqueue:nodejs /app/packages/core/dist ./packages/core/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/core/package.json ./packages/core/
COPY --from=builder --chown=mailqueue:nodejs /app/packages/db/dist ./packages/db/dist
COPY --from=builder --chown=mailqueue:nodejs /app/packages/db/package.json ./packages/db/

# Copy package.json for workspace resolution
COPY --from=builder --chown=mailqueue:nodejs /app/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create tmp directory for read-only filesystem
RUN mkdir -p /tmp && chown mailqueue:nodejs /tmp

# Switch to non-root user
USER mailqueue

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init as entrypoint for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the API server
CMD ["node", "packages/api/dist/index.js"]

# Labels
LABEL org.opencontainers.image.title="Mail Queue API"
LABEL org.opencontainers.image.description="REST API for Mail Queue email orchestration system"
LABEL org.opencontainers.image.vendor="Mail Queue"
LABEL org.opencontainers.image.source="https://github.com/your-org/mail-queue"
