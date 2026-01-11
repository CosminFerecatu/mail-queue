# Mail Queue Dashboard Dockerfile
# Multi-stage production build for Next.js dashboard
#
# Build: docker build -f docker/Dockerfiles/dashboard.Dockerfile -t mail-queue/dashboard .
# Run: docker run -p 3000:3000 --env-file .env mail-queue/dashboard

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/dashboard/package.json ./packages/dashboard/

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
COPY --from=deps /app/packages/dashboard/node_modules ./packages/dashboard/node_modules

# Copy source files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/dashboard ./packages/dashboard

# Set Next.js to output standalone build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the dashboard
RUN pnpm turbo build --filter=@mail-queue/dashboard

# =============================================================================
# Stage 3: Production Runtime
# =============================================================================
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy public assets
COPY --from=builder --chown=nextjs:nodejs /app/packages/dashboard/public ./public

# Copy Next.js standalone build
COPY --from=builder --chown=nextjs:nodejs /app/packages/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/dashboard/.next/static ./packages/dashboard/.next/static

# Create cache directory for Next.js
RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init as entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start Next.js server
CMD ["node", "packages/dashboard/server.js"]

# Labels
LABEL org.opencontainers.image.title="Mail Queue Dashboard"
LABEL org.opencontainers.image.description="Next.js admin dashboard for Mail Queue"
LABEL org.opencontainers.image.vendor="Mail Queue"
LABEL org.opencontainers.image.source="https://github.com/your-org/mail-queue"
