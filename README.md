# Mail Queue - Enterprise Email Orchestration System

[![CI](https://github.com/your-org/mail-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/mail-queue/actions/workflows/ci.yml)

## Overview

A multi-tenant email queue orchestration system designed for enterprise scale (1M+ emails/day). Provides both an embeddable TypeScript SDK and a standalone service with REST API.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/mail-queue.git
cd mail-queue

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MailHog)
docker compose -f docker/docker-compose.yml up -d

# Run database migrations
pnpm db:migrate

# Seed development data (optional)
pnpm db:seed

# Start all services in development mode
pnpm dev
```

### Available Scripts

```bash
pnpm build          # Build all packages
pnpm dev            # Start all services in dev mode
pnpm lint           # Run Biome linter
pnpm lint:fix       # Fix linting issues
pnpm format         # Format code with Biome
pnpm test           # Run all tests
pnpm test:coverage  # Run tests with coverage
pnpm typecheck      # TypeScript type checking
pnpm clean          # Clean all build artifacts

# Database commands
pnpm db:migrate     # Run migrations
pnpm db:generate    # Generate new migrations
pnpm db:studio      # Open Drizzle Studio GUI
pnpm db:seed        # Seed database
```

### Service Ports

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | REST API |
| Dashboard | 3001 | Admin UI |
| MailHog | 8025 | Email testing UI |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Queue backend |

## Requirements Summary

| Aspect | Choice |
|--------|--------|
| Architecture | Library + Standalone Service |
| Queue Backend | Redis Cluster + BullMQ |
| Email Provider | SMTP (Generic) |
| Database | PostgreSQL |
| Auth | API Keys (scoped) + JWT |
| Scale Target | 1M+ emails/day |
| Deployment | Docker Compose → Kubernetes |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         External Applications                            │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐             │
│   │  App A  │    │  App B  │    │  App C  │    │  App N  │             │
│   │  (SDK)  │    │  (SDK)  │    │  (SDK)  │    │  (HTTP) │             │
│   └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘             │
└────────┼──────────────┼──────────────┼──────────────┼───────────────────┘
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                                │
                    ┌───────────▼───────────┐
                    │      API Gateway      │
                    │  (Rate Limit, Auth)   │
                    └───────────┬───────────┘
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │              │            │            │              │
┌───▼───┐   ┌─────▼─────┐  ┌───▼───┐  ┌─────▼─────┐  ┌─────▼─────┐
│  API  │   │  Admin    │  │Webhook│  │ Tracking  │  │  Inbound  │
│Service│   │ Dashboard │  │Service│  │  Service  │  │  Email    │
└───┬───┘   └─────┬─────┘  └───┬───┘  └─────┬─────┘  └─────┬─────┘
    │             │            │            │              │
    └─────────────┴────────────┼────────────┴──────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    Redis Cluster    │
                    │   (BullMQ Queues)   │
                    │   6 nodes minimum   │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│  Worker Pool    │  │  Scheduler      │  │  Bounce         │
│  (Email Send)   │  │  (Cron Jobs)    │  │  Processor      │
│  10-50 workers  │  │  2-3 replicas   │  │                 │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
   ┌──────────▼──────┐  ┌─────▼─────┐  ┌─────▼─────┐
   │   PostgreSQL    │  │Prometheus │  │  Grafana  │
   │ (Primary + RR)  │  │ (Metrics) │  │(Dashboard)│
   └─────────────────┘  └───────────┘  └───────────┘
```

### New Services Added:

**Tracking Service:**
- Serves 1x1 tracking pixel for open tracking
- Handles link redirects for click tracking
- Records events to PostgreSQL via queue
- CDN-cacheable for performance

**Inbound Email Service:**
- Receives bounce/DSN emails from SMTP servers
- Parses bounce notifications
- Routes to Bounce Processor queue

---

## Core Components

### 1. API Service
- REST API for email submission, status queries, queue management
- Endpoints: `/v1/emails`, `/v1/queues`, `/v1/apps`, `/v1/analytics`
- Request validation (HTML, spam score, blocklist check)
- Rate limiting (hierarchical: global → app → queue)

### 2. Worker Pool (Email Consumers)
- BullMQ workers processing email jobs
- SMTP connection pooling
- Smart retry with exponential backoff
- Circuit breaker per SMTP server
- Priority queue processing

### 3. Scheduler Service
- Scheduled email sends (specific datetime)
- Recurring emails (cron-based)
- Timezone handling
- Batch window optimization

### 4. Bounce Processor
- Parse bounce notifications from SMTP
- Categorize: hard bounce, soft bounce, complaint
- Auto-update suppression lists
- Calculate reputation scores per app
- Trigger throttling for high-bounce apps

### 5. Webhook Service
- Outbound webhook delivery
- Event types: queued, sent, delivered, bounced, complained, opened, clicked
- Retry with exponential backoff
- Webhook signature verification

### 6. Admin Dashboard
- React/Next.js web application
- Real-time queue monitoring
- Analytics dashboards
- App/queue management
- Manual email inspection/retry

---

## Data Models

### PostgreSQL Schema

```sql
-- Multi-tenant apps
apps
├── id (UUID, PK)
├── name (VARCHAR, NOT NULL)
├── description (TEXT)
├── is_active (BOOLEAN, DEFAULT true)
├── sandbox_mode (BOOLEAN, DEFAULT false)
├── webhook_url (VARCHAR)
├── webhook_secret (VARCHAR, encrypted)
├── daily_limit (INTEGER) -- NULL = unlimited
├── monthly_limit (INTEGER)
├── settings (JSONB) -- flexible config
├── created_at, updated_at
└── INDEXES: is_active

-- Separate API keys table (multiple keys per app)
api_keys
├── id (UUID, PK)
├── app_id (FK → apps)
├── name (VARCHAR) -- "Production Key", "Staging Key"
├── key_prefix (VARCHAR(8)) -- "mq_live_" for display
├── key_hash (VARCHAR, NOT NULL) -- bcrypt hash
├── scopes (JSONB: ['email:send', 'email:read', 'queue:manage', 'admin'])
├── rate_limit (INTEGER) -- per-key override
├── ip_allowlist (JSONB) -- ['192.168.1.0/24']
├── last_used_at (TIMESTAMP)
├── expires_at (TIMESTAMP) -- NULL = never
├── is_active (BOOLEAN, DEFAULT true)
├── created_at, updated_at
└── INDEXES: key_hash (unique), app_id, is_active

-- Queues per app
queues
├── id (UUID, PK)
├── app_id (FK → apps)
├── name (VARCHAR) -- 'newsletter', 'transactional'
├── priority (SMALLINT, 1-10, DEFAULT 5)
├── rate_limit (INTEGER) -- emails per minute
├── max_retries (SMALLINT, DEFAULT 5)
├── retry_delay (JSONB) -- [30, 120, 600, 3600] seconds
├── smtp_config_id (FK → smtp_configs)
├── is_paused (BOOLEAN, DEFAULT false)
├── settings (JSONB)
├── created_at, updated_at
└── INDEXES: app_id, name (unique per app)

-- Emails (partitioned by month for scale)
emails (PARTITIONED BY RANGE (created_at))
├── id (UUID, PK)
├── app_id (FK → apps)
├── queue_id (FK → queues)
├── idempotency_key (VARCHAR) -- prevent duplicates
├── message_id (VARCHAR) -- SMTP Message-ID
├── from_address (VARCHAR, NOT NULL)
├── from_name (VARCHAR)
├── to_addresses (JSONB, NOT NULL) -- [{email, name}]
├── cc (JSONB)
├── bcc (JSONB)
├── reply_to (VARCHAR)
├── subject (VARCHAR, NOT NULL)
├── html_body (TEXT, compressed) -- gzip compressed
├── text_body (TEXT)
├── headers (JSONB)
├── personalization_data (JSONB)
├── metadata (JSONB) -- app-provided metadata
├── status (ENUM: queued, processing, sent, delivered, bounced, failed, cancelled)
├── retry_count (SMALLINT, DEFAULT 0)
├── last_error (TEXT)
├── scheduled_at (TIMESTAMP WITH TIME ZONE)
├── sent_at (TIMESTAMP WITH TIME ZONE)
├── delivered_at (TIMESTAMP WITH TIME ZONE)
├── created_at (TIMESTAMP WITH TIME ZONE, NOT NULL)
└── INDEXES: app_id, queue_id, status, scheduled_at, idempotency_key (unique per app), message_id

-- Email events (partitioned by month)
email_events (PARTITIONED BY RANGE (created_at))
├── id (UUID, PK)
├── email_id (FK → emails)
├── event_type (ENUM: queued, processing, sent, delivered, opened, clicked, bounced, complained, unsubscribed)
├── event_data (JSONB) -- {link_url, user_agent, ip, etc}
├── created_at (TIMESTAMP WITH TIME ZONE, NOT NULL)
└── INDEXES: (email_id, created_at), event_type

-- Suppression lists
suppression_list
├── id (UUID, PK)
├── app_id (FK → apps, NULL for global)
├── email_address (VARCHAR, NOT NULL)
├── reason (ENUM: hard_bounce, soft_bounce, complaint, unsubscribe, manual)
├── source_email_id (FK → emails) -- which email caused this
├── expires_at (TIMESTAMP) -- NULL = permanent
├── created_at
└── INDEXES: (app_id, email_address) unique, email_address (for global lookup)

-- SMTP configurations
smtp_configs
├── id (UUID, PK)
├── app_id (FK → apps)
├── name (VARCHAR)
├── host (VARCHAR, NOT NULL)
├── port (INTEGER, NOT NULL)
├── username (VARCHAR)
├── password (VARCHAR, encrypted with AES-256-GCM)
├── encryption (ENUM: tls, starttls, none)
├── pool_size (INTEGER, DEFAULT 5)
├── timeout_ms (INTEGER, DEFAULT 30000)
├── is_active (BOOLEAN, DEFAULT true)
├── created_at, updated_at
└── INDEXES: app_id

-- Webhook delivery tracking
webhook_deliveries
├── id (UUID, PK)
├── app_id (FK → apps)
├── email_id (FK → emails, nullable)
├── event_type (VARCHAR)
├── payload (JSONB)
├── status (ENUM: pending, delivered, failed)
├── attempts (SMALLINT, DEFAULT 0)
├── last_error (TEXT)
├── next_retry_at (TIMESTAMP)
├── delivered_at (TIMESTAMP)
├── created_at
└── INDEXES: app_id, status, next_retry_at

-- Scheduled/recurring jobs
scheduled_jobs
├── id (UUID, PK)
├── app_id (FK → apps)
├── queue_id (FK → queues)
├── name (VARCHAR)
├── cron_expression (VARCHAR) -- "0 9 * * MON"
├── timezone (VARCHAR, DEFAULT 'UTC')
├── email_template (JSONB) -- the email payload
├── is_active (BOOLEAN, DEFAULT true)
├── last_run_at (TIMESTAMP)
├── next_run_at (TIMESTAMP)
├── created_at, updated_at
└── INDEXES: next_run_at, is_active

-- Click tracking links
tracking_links
├── id (UUID, PK)
├── email_id (FK → emails)
├── short_code (VARCHAR(12), unique)
├── original_url (TEXT, NOT NULL)
├── click_count (INTEGER, DEFAULT 0)
├── created_at
└── INDEXES: short_code (unique), email_id

-- Admin users
users
├── id (UUID, PK)
├── email (VARCHAR, unique)
├── password_hash (VARCHAR)
├── name (VARCHAR)
├── role (ENUM: super_admin, admin, viewer)
├── mfa_secret (VARCHAR, encrypted)
├── last_login_at (TIMESTAMP)
├── is_active (BOOLEAN, DEFAULT true)
├── created_at, updated_at
└── INDEXES: email (unique)

-- Audit logs (append-only)
audit_logs (PARTITIONED BY RANGE (created_at))
├── id (UUID, PK)
├── actor_type (ENUM: user, app, system)
├── actor_id (UUID) -- user_id or app_id
├── action (VARCHAR) -- 'email.create', 'queue.delete', etc
├── resource_type (VARCHAR)
├── resource_id (UUID)
├── changes (JSONB) -- {before: {}, after: {}}
├── ip_address (INET)
├── user_agent (VARCHAR)
├── created_at (TIMESTAMP, NOT NULL)
└── INDEXES: actor_id, resource_id, created_at

-- App reputation scores (for throttling)
app_reputation
├── id (UUID, PK)
├── app_id (FK → apps, unique)
├── bounce_rate_24h (DECIMAL)
├── complaint_rate_24h (DECIMAL)
├── reputation_score (DECIMAL, 0-100)
├── is_throttled (BOOLEAN, DEFAULT false)
├── throttle_reason (TEXT)
├── updated_at
└── INDEXES: app_id (unique)
```

### Data Retention Policy

```
emails:        90 days (configurable per app)
email_events:  90 days
audit_logs:    1 year (compliance requirement)
tracking_links: 30 days after last click

Archival: Move to cold storage (S3/GCS) after retention
Deletion: Hard delete after archive retention (1 year)
```

---

## Key Features

### Multi-Tenancy
- Each app has isolated queues, configs, and analytics
- API keys with scopes for granular permissions
- Per-app SMTP configurations
- Separate suppression lists per app

### Rate Limiting (Hierarchical)
```
Global Limit: 10,000/minute
    └── App A Limit: 5,000/minute
            └── Queue A1 (newsletter): 1,000/minute
            └── Queue A2 (transactional): 4,000/minute
    └── App B Limit: 3,000/minute
            └── Queue B1: 3,000/minute
```

### Priority System
- Queues have configurable priority levels (1-10)
- Higher priority queues processed first
- Preemption: critical emails jump the queue
- Example: `system-alerts (10) > transactional (7) > marketing (3)`

### Smart Retry Strategy
```
Attempt 1: Immediate
Attempt 2: 30 seconds delay
Attempt 3: 2 minutes delay
Attempt 4: 10 minutes delay
Attempt 5: 1 hour delay
Attempt 6: Move to Dead Letter Queue

Circuit Breaker:
- Opens after 5 consecutive failures to same SMTP
- Half-open after 30 seconds
- Closes after 3 successful sends
```

### Full Analytics
- Delivery rate per app/queue
- Bounce rate tracking
- Open rate (via tracking pixel)
- Click rate (via link rewriting)
- Complaint rate
- Time-series data for dashboards

### Compliance Features
- GDPR: Data export and deletion endpoints
- Unsubscribe: List-Unsubscribe header support
- Suppression: Global and per-app suppression lists
- Audit: Full audit logging of all actions

### Sandbox Mode
- Per-app toggle
- Emails logged but not sent
- Full event simulation
- Email preview rendering

### Personalization
- Variable substitution: `Hello {{first_name}}`
- Supports nested objects: `{{user.address.city}}`
- Default values: `{{name|'Customer'}}`
- Conditional blocks (future)

### Bulk/Batch Sending
- Single API call for thousands of recipients
- Efficient job batching
- Per-recipient personalization
- Progress tracking

---

## Security

### API Key Security
- Keys generated with cryptographically secure random bytes (32 bytes)
- Stored as bcrypt hash (cost factor 12)
- Only shown once at creation time
- Prefix identifies key type: `mq_live_` (production) or `mq_test_` (sandbox)
- Support key rotation without downtime (grace period for old key)
- Optional expiration dates

### Secret Encryption
- SMTP passwords encrypted with AES-256-GCM
- Encryption key stored in environment variable or Vault
- Per-app webhook secrets for signature verification

### IP Allowlisting
```json
{
  "ip_allowlist": [
    "192.168.1.0/24",
    "10.0.0.0/8",
    "2001:db8::/32"
  ]
}
```

### Request Signing (Webhooks)
```
X-Webhook-Signature: sha256=abc123...
X-Webhook-Timestamp: 1704067200

signature = HMAC-SHA256(webhook_secret, timestamp + "." + payload)
```

### Rate Limiting Implementation
- Token bucket algorithm per API key
- Sliding window for queue rate limits
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 response with `Retry-After` header

### Input Validation
- Email addresses validated (RFC 5322)
- HTML sanitized for XSS (but stored as-is, sanitized only for preview)
- Maximum payload sizes enforced
- SQL injection prevented via parameterized queries

### CORS (Dashboard only)
```
Access-Control-Allow-Origin: https://dashboard.mailqueue.com
Access-Control-Allow-Credentials: true
```

### TLS
- All external traffic over TLS 1.3
- Internal service-to-service: mTLS optional for high-security deployments

---

## API Design

### Authentication
```
# API Key in header
Authorization: Bearer mq_live_abc123...

# JWT for dashboard (cookie-based, HttpOnly, Secure)
Cookie: mq_session=eyJhbGc...

# JWT Structure
{
  "sub": "user-uuid",
  "role": "admin",
  "exp": 1704070800,  // 15 min
  "iat": 1704067200
}
```

### Scopes
| Scope | Permissions |
|-------|-------------|
| `email:send` | Queue emails |
| `email:read` | Read email status and events |
| `queue:manage` | Create/update/delete queues |
| `smtp:manage` | Manage SMTP configurations |
| `analytics:read` | Access analytics endpoints |
| `suppression:manage` | Manage suppression lists |
| `admin` | All permissions |

### Key Endpoints

```
# Email Operations
POST   /v1/emails                    # Queue single email
POST   /v1/emails/batch              # Queue batch emails (up to 10K recipients)
GET    /v1/emails/:id                # Get email status
GET    /v1/emails/:id/events         # Get email events
DELETE /v1/emails/:id                # Cancel scheduled email (if not yet sent)
POST   /v1/emails/:id/retry          # Retry failed email

# Queue Management
POST   /v1/queues                    # Create queue
GET    /v1/queues                    # List queues (paginated)
GET    /v1/queues/:id                # Get queue details
PATCH  /v1/queues/:id                # Update queue config
DELETE /v1/queues/:id                # Delete queue
GET    /v1/queues/:id/stats          # Queue statistics
POST   /v1/queues/:id/pause          # Pause queue processing
POST   /v1/queues/:id/resume         # Resume queue processing
POST   /v1/queues/:id/drain          # Drain queue (process remaining, reject new)

# SMTP Configuration
POST   /v1/smtp-configs              # Create SMTP config
GET    /v1/smtp-configs              # List SMTP configs
PATCH  /v1/smtp-configs/:id          # Update SMTP config
DELETE /v1/smtp-configs/:id          # Delete SMTP config
POST   /v1/smtp-configs/:id/test     # Test SMTP connection

# API Keys (app self-management)
POST   /v1/api-keys                  # Create new API key
GET    /v1/api-keys                  # List API keys (masked)
DELETE /v1/api-keys/:id              # Revoke API key
POST   /v1/api-keys/:id/rotate       # Rotate key (returns new key)

# Suppression List
POST   /v1/suppression               # Add to suppression list
GET    /v1/suppression               # List suppressed emails (paginated)
DELETE /v1/suppression/:email        # Remove from list

# Scheduled Jobs (recurring emails)
POST   /v1/scheduled-jobs            # Create recurring job
GET    /v1/scheduled-jobs            # List scheduled jobs
GET    /v1/scheduled-jobs/:id        # Get job details
PATCH  /v1/scheduled-jobs/:id        # Update job
DELETE /v1/scheduled-jobs/:id        # Delete job
POST   /v1/scheduled-jobs/:id/run    # Trigger immediate run

# Analytics
GET    /v1/analytics/overview        # Dashboard overview
GET    /v1/analytics/delivery        # Delivery metrics (time-series)
GET    /v1/analytics/engagement      # Opens/clicks (time-series)
GET    /v1/analytics/bounces         # Bounce breakdown
GET    /v1/analytics/reputation      # Reputation score

# GDPR Compliance
GET    /v1/gdpr/export/:email        # Export all data for email address
DELETE /v1/gdpr/:email               # Delete all data for email address
GET    /v1/gdpr/requests             # List pending GDPR requests

# Webhooks
GET    /v1/webhooks/logs             # Recent webhook deliveries
POST   /v1/webhooks/:id/retry        # Retry failed webhook

# Health & Metadata
GET    /v1/health                    # Health check
GET    /v1/health/detailed           # Detailed health (Redis, PG, SMTP)
GET    /v1/info                      # API version info

# Tracking (public, no auth)
GET    /t/:trackingId.gif            # Open tracking pixel
GET    /c/:shortCode                 # Click redirect
```

### Pagination
All list endpoints support cursor-based pagination:
```
GET /v1/emails?limit=50&cursor=eyJpZCI6IjEyMyJ9
Response: { data: [...], cursor: "nextCursor", has_more: true }
```

### Idempotency
All POST endpoints accept `Idempotency-Key` header to prevent duplicates:
```
POST /v1/emails
Idempotency-Key: unique-request-id-123
```

### Email Payload Example
```json
{
  "queue": "transactional",
  "from": {
    "email": "noreply@example.com",
    "name": "Example App"
  },
  "to": [
    {"email": "user@domain.com", "name": "John Doe"}
  ],
  "subject": "Welcome, {{first_name}}!",
  "html": "<h1>Hello {{first_name}}</h1><p>Welcome to our service.</p>",
  "text": "Hello {{first_name}}, Welcome to our service.",
  "personalizations": {
    "first_name": "John"
  },
  "headers": {
    "X-Custom-Header": "value"
  },
  "scheduled_at": "2024-01-15T10:00:00Z",
  "metadata": {
    "user_id": "12345",
    "campaign": "onboarding"
  }
}
```

---

## SDK Design (TypeScript)

```typescript
import { MailQueue } from '@mail-queue/sdk';

// Initialize
const mq = new MailQueue({
  apiKey: 'mq_live_abc123...',
  baseUrl: 'https://mail-queue.example.com', // optional
});

// Send single email
const result = await mq.emails.send({
  queue: 'transactional',
  from: { email: 'noreply@app.com', name: 'My App' },
  to: [{ email: 'user@example.com' }],
  subject: 'Welcome!',
  html: '<h1>Welcome</h1>',
});

// Send batch
const batchResult = await mq.emails.sendBatch({
  queue: 'newsletter',
  from: { email: 'newsletter@app.com' },
  emails: [
    { to: 'user1@example.com', personalizations: { name: 'User 1' } },
    { to: 'user2@example.com', personalizations: { name: 'User 2' } },
  ],
  subject: 'Newsletter for {{name}}',
  html: '<p>Hello {{name}}</p>',
});

// Check status
const status = await mq.emails.get('email-id-123');

// Manage queues
const queue = await mq.queues.create({
  name: 'marketing',
  priority: 3,
  rateLimit: 100, // per minute
});

// Analytics
const stats = await mq.analytics.getDeliveryStats({
  queue: 'transactional',
  from: '2024-01-01',
  to: '2024-01-31',
});
```

---

## Project Structure

```
mail-queue/
├── packages/
│   ├── core/                      # Shared logic & types
│   │   ├── src/
│   │   │   ├── models/            # TypeScript interfaces & Zod schemas
│   │   │   ├── validation/        # Email validation logic
│   │   │   ├── encryption/        # AES-256-GCM helpers
│   │   │   ├── errors/            # Custom error classes
│   │   │   ├── queue/             # BullMQ queue definitions
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── db/                        # Database layer
│   │   ├── src/
│   │   │   ├── schema/            # Drizzle schema definitions
│   │   │   └── index.ts
│   │   ├── drizzle/               # Generated migrations
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── api/                       # REST API Service
│   │   ├── src/
│   │   │   ├── routes/            # Fastify routes (15+ modules)
│   │   │   ├── middleware/        # Auth, audit logging
│   │   │   ├── services/          # Business logic (13 services)
│   │   │   ├── plugins/           # Fastify plugins
│   │   │   └── lib/               # Utilities (rate limiting, redis, tracing)
│   │   └── package.json
│   │
│   ├── worker/                    # BullMQ job processors
│   │   ├── src/
│   │   │   ├── processors/        # Email, webhook, bounce, analytics processors
│   │   │   ├── smtp/              # SMTP client for email delivery
│   │   │   ├── lib/               # Logger, metrics, privacy, SSRF protection
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── dashboard/                 # Admin UI (Next.js 15 / React 19)
│   │   ├── src/
│   │   │   ├── app/               # Next.js app router
│   │   │   ├── components/        # React components (shadcn/ui)
│   │   │   ├── hooks/             # React hooks
│   │   │   └── lib/               # API client, utils
│   │   └── package.json
│   │
│   └── sdk-js/                    # TypeScript SDK
│       ├── src/
│       │   ├── client.ts          # Main client class
│       │   ├── http-client.ts     # HTTP transport layer
│       │   ├── resources/         # Emails, Queues, Analytics, etc.
│       │   ├── errors.ts          # SDK error handling
│       │   ├── types.ts           # Exported types
│       │   └── index.ts
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml         # Development infrastructure
│   └── init-db.sql                # Initial DB setup
│
├── .github/
│   └── workflows/
│       └── ci.yml                 # Lint, typecheck, test, build
│
├── turbo.json                     # Turborepo config
├── package.json                   # Root package.json
├── pnpm-workspace.yaml            # pnpm workspace config
├── biome.json                     # Linting/formatting (Biome)
├── .env.example                   # Environment template
└── README.md
```

---

## Implemented Features

### Core Infrastructure
- [x] Monorepo with Turborepo + pnpm
- [x] TypeScript 5+ with strict mode
- [x] Biome for linting and formatting
- [x] GitHub Actions CI pipeline

### `@mail-queue/core`
- [x] TypeScript interfaces and Zod schemas
- [x] Email validation (RFC 5322)
- [x] Encryption helpers (AES-256-GCM)
- [x] BullMQ queue definitions
- [x] Custom error classes

### `@mail-queue/db`
- [x] Drizzle ORM schema for all tables
- [x] Migration system
- [x] Seed scripts for development

### `@mail-queue/api`
- [x] Fastify REST API
- [x] Email submission (POST /v1/emails)
- [x] Batch sending (POST /v1/emails/batch)
- [x] Queue management endpoints
- [x] SMTP configuration endpoints
- [x] API key management
- [x] App management
- [x] Suppression list management
- [x] GDPR compliance endpoints
- [x] Webhook management
- [x] Analytics endpoints
- [x] Scheduled jobs endpoints
- [x] Health check endpoints
- [x] Rate limiting with token bucket
- [x] JWT + API key authentication
- [x] OpenTelemetry tracing
- [x] Prometheus metrics

### `@mail-queue/worker`
- [x] BullMQ job processors
- [x] Email sending via SMTP
- [x] Webhook delivery processor
- [x] Bounce handling processor
- [x] Analytics processor
- [x] Tracking processor
- [x] Scheduler processor
- [x] SSRF protection
- [x] Privacy utilities

### `@mail-queue/dashboard`
- [x] Next.js 15 / React 19 admin UI
- [x] Authentication (login/logout)
- [x] App management pages
- [x] Queue management pages
- [x] Email browser
- [x] Analytics dashboards
- [x] Suppression list management
- [x] User management
- [x] Settings configuration
- [x] Dark mode support
- [x] Responsive design

### `@mail-queue/sdk-js`
- [x] TypeScript SDK client
- [x] HTTP client with retry logic
- [x] Resource modules (emails, queues, analytics, etc.)
- [x] Type-safe API
- [x] Error handling

### Docker Infrastructure
- [x] PostgreSQL 16
- [x] Redis 7
- [x] MailHog (development SMTP)
- [x] Optional monitoring stack (Prometheus, Grafana, Jaeger)

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ / TypeScript 5+ |
| API Framework | Fastify (faster than Express) |
| Queue | BullMQ + Redis Cluster |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM (better TypeScript support) |
| Dashboard | Next.js 15 / React 19 |
| Testing | Vitest |
| Monorepo | Turborepo + pnpm |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Logging | Pino (structured JSON) |
| Metrics | Prometheus + Grafana |
| Tracing | OpenTelemetry |
| Secrets | HashiCorp Vault / AWS Secrets Manager |

---

## Observability

### Logging (Pino)
```typescript
// Structured JSON logs
{
  "level": "info",
  "time": 1704067200000,
  "service": "worker",
  "traceId": "abc123",
  "appId": "app-uuid",
  "emailId": "email-uuid",
  "msg": "Email sent successfully",
  "duration_ms": 245
}
```

Log levels:
- `error`: Failures requiring attention
- `warn`: Degraded performance, retries
- `info`: Business events (email sent, queued)
- `debug`: Detailed debugging (disabled in prod)

### Metrics (Prometheus)

```
# Email metrics
mailqueue_emails_queued_total{app_id, queue}
mailqueue_emails_sent_total{app_id, queue, status}
mailqueue_emails_failed_total{app_id, queue, error_type}

# Queue metrics
mailqueue_queue_depth{app_id, queue, priority}
mailqueue_queue_latency_seconds{app_id, queue, quantile}

# SMTP metrics
mailqueue_smtp_connections_active{host}
mailqueue_smtp_send_duration_seconds{host, quantile}
mailqueue_smtp_errors_total{host, error_type}

# Rate limiting
mailqueue_rate_limit_hits_total{app_id, queue}

# System
mailqueue_worker_active{instance}
mailqueue_db_connections_active
mailqueue_redis_connections_active
```

### Tracing (OpenTelemetry)
```
Trace: email.send
├── span: api.validate (2ms)
├── span: db.check_suppression (5ms)
├── span: redis.enqueue (3ms)
├── span: worker.process (200ms)
│   ├── span: smtp.connect (50ms)
│   ├── span: smtp.send (140ms)
│   └── span: db.update_status (10ms)
└── span: webhook.dispatch (async)
```

### Alerting Rules (Grafana)
```yaml
- alert: HighBounceRate
  expr: rate(mailqueue_emails_failed_total{error_type="bounce"}[5m]) > 0.05
  for: 5m
  labels: { severity: warning }

- alert: QueueBacklog
  expr: mailqueue_queue_depth > 100000
  for: 10m
  labels: { severity: critical }

- alert: SMTPDown
  expr: up{job="smtp"} == 0
  for: 1m
  labels: { severity: critical }

- alert: HighAPILatency
  expr: histogram_quantile(0.99, mailqueue_api_latency_seconds) > 1
  for: 5m
  labels: { severity: warning }
```

### Health Checks

```json
GET /v1/health/detailed

{
  "status": "healthy",
  "version": "1.2.3",
  "uptime_seconds": 86400,
  "checks": {
    "postgresql": { "status": "healthy", "latency_ms": 2 },
    "redis": { "status": "healthy", "latency_ms": 1 },
    "smtp_primary": { "status": "healthy", "latency_ms": 45 },
    "workers": { "active": 10, "idle": 5 }
  },
  "queues": {
    "total_pending": 1523,
    "total_processing": 42
  }
}
```

---

## Verification Plan

### Local Development Testing
```bash
# 1. Start infrastructure
docker-compose up -d postgres redis mailhog

# 2. Run migrations
pnpm db:migrate

# 3. Start services (in separate terminals or use docker-compose)
pnpm --filter @mail-queue/api dev
pnpm --filter @mail-queue/worker dev
pnpm --filter @mail-queue/dashboard dev

# 4. Create test app and get API key
curl -X POST http://localhost:3000/v1/apps \
  -H "Authorization: Bearer ADMIN_SECRET" \
  -d '{"name": "Test App"}'

# 5. Create queue
curl -X POST http://localhost:3000/v1/queues \
  -H "Authorization: Bearer mq_test_xxx" \
  -d '{"name": "transactional", "priority": 7}'

# 6. Send test email
curl -X POST http://localhost:3000/v1/emails \
  -H "Authorization: Bearer mq_test_xxx" \
  -d '{
    "queue": "transactional",
    "from": {"email": "test@example.com"},
    "to": [{"email": "user@example.com"}],
    "subject": "Test",
    "html": "<p>Hello</p>"
  }'

# 7. Check email in MailHog
open http://localhost:8025

# 8. Check email status
curl http://localhost:3000/v1/emails/{email_id}
```

### Unit Tests
```bash
pnpm test              # Run all tests
pnpm test:coverage     # With coverage report
```

Coverage targets:
- Core: 90%
- API: 85%
- Worker: 85%
- SDK: 90%

### Integration Tests
```bash
pnpm test:integration
```

Test scenarios:
- [ ] Full email flow (queue → process → send)
- [ ] Retry on SMTP failure
- [ ] Rate limiting enforcement
- [ ] Suppression list blocking
- [ ] Webhook delivery
- [ ] Scheduled email processing
- [ ] Batch sending
- [ ] Circuit breaker activation

### Load Testing (k6)
```bash
# Target: 700 emails/second (1M/day + headroom)
./scripts/load-test.sh

# k6 test scenarios:
# - Sustained load: 500 emails/sec for 10 minutes
# - Spike test: 0 → 1000 emails/sec in 1 minute
# - Soak test: 200 emails/sec for 1 hour
```

Performance targets:
- API p99 latency: < 100ms
- Worker throughput: > 50 emails/sec per worker
- Queue depth: < 10,000 with 20 workers at full load

### Chaos Testing
- Redis node failure recovery
- PostgreSQL failover
- Worker crash recovery
- SMTP timeout handling

### Security Testing
- [ ] API key authentication
- [ ] Rate limiting bypass attempts
- [ ] SQL injection (via sqlmap)
- [ ] XSS in email preview
- [ ] Webhook signature verification

### Staging Environment
```bash
# Deploy to staging
kubectl apply -f docker/k8s/ -n staging

# Run smoke tests
./scripts/smoke-test.sh staging
```

---

## Design Decisions

| Question | Decision |
|----------|----------|
| Templates? | No - apps send rendered HTML |
| Attachments? | No - not supported |
| SDK mode? | HTTP client only |
| Deployment? | Docker Compose for dev, K8s-ready for production |
| ORM? | Drizzle ORM (TypeScript-first) |
| Linter? | Biome (faster than ESLint) |

---

## Not Implemented Yet

The following features are planned but not yet implemented:

### Standalone Service Packages

These services are currently handled within the worker package but are planned as separate microservices for better scalability:

```
├── scheduler/                 # Scheduling service
│   ├── src/
│   │   ├── cron/              # Cron job runner
│   │   ├── recurring/         # Recurring email logic
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
│
├── webhook/                   # Outbound webhooks service
│   ├── src/
│   │   ├── dispatcher/        # Webhook delivery with retry
│   │   ├── signing/           # HMAC signature generation
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
│
├── tracking/                  # Open/click tracking service
│   ├── src/
│   │   ├── pixel/             # 1x1 GIF serving
│   │   ├── redirect/          # Link redirect handler
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
│
├── inbound/                   # Inbound email (bounce) processor
│   ├── src/
│   │   ├── smtp-server/       # SMTP server for receiving bounces
│   │   ├── parser/            # DSN/bounce parsing
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
```

### Worker Enhancements

```
├── worker/
│   ├── src/
│   │   ├── circuit-breaker/   # Circuit breaker implementation
│   │   │   └── index.ts       # Per-SMTP server circuit breaker
```

**Circuit Breaker Pattern (Planned):**
```
- Opens after 5 consecutive failures to same SMTP
- Half-open after 30 seconds
- Closes after 3 successful sends
```

### Infrastructure & DevOps

```
├── database/
│   ├── migrations/                # Drizzle migrations (versioned)
│   ├── seeds/                     # Test data seeds
│   └── partitions/                # Partition management scripts
│
├── scripts/
│   ├── setup.sh                   # Development setup
│   ├── migrate.sh                 # Run migrations
│   ├── partition-manager.sh       # Create monthly partitions
│   └── load-test.sh               # Run k6 load tests
│
├── tests/
│   ├── e2e/                       # End-to-end tests
│   ├── load/                      # k6 load test scripts
│   └── fixtures/                  # Test data
│
├── docs/
│   ├── api.md                     # API documentation
│   ├── sdk.md                     # SDK documentation
│   ├── deployment.md              # Deployment guide
│   └── architecture.md            # Architecture decisions
│
├── docker/
│   ├── docker-compose.prod.yml    # Production simulation
│   └── k8s/                       # Kubernetes manifests
│       ├── namespace.yaml
│       ├── configmap.yaml
│       ├── secrets.yaml
│       ├── api/
│       ├── worker/
│       ├── redis/
│       └── postgres/
```

### CI/CD Workflows

```
├── .github/
│   └── workflows/
│       ├── release.yml            # Version and publish
│       └── deploy.yml             # Deploy to staging/prod
```

### Planned Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Circuit Breaker | Per-SMTP server failure isolation | High |
| Table Partitioning | Monthly partitions for emails/events tables | High |
| Redis Cluster | Multi-node Redis for production | Medium |
| MFA Support | Multi-factor authentication for dashboard | Medium |
| Real-time Updates | WebSocket for dashboard live updates | Medium |
| Email Preview | Render email HTML in dashboard | Low |
| Data Archival | Move old data to cold storage (S3/GCS) | Low |
| Load Testing | k6 scripts for performance validation | Medium |
| Chaos Testing | Redis/PostgreSQL failover testing | Low |
| E2E Tests | Full integration test suite | High |
| SMTP Connection Pooling | Reuse SMTP connections for performance | Medium |

### Known Issues
See [CLAUDE.md](.claude/CLAUDE.md) for known issues identified during code reviews.

---

## License

MIT
