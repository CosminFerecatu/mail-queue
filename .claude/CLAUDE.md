# Mail Queue - Project Context for Code Reviews

## Project Overview

Mail Queue is a multi-tenant email orchestration system designed for enterprise scale (1M+ emails/day). It provides both a REST API and TypeScript SDK for email delivery with features including:

- Multi-tenant isolation (apps, queues, SMTP configs per tenant)
- BullMQ-based job processing with Redis
- PostgreSQL for persistence with Drizzle ORM
- GDPR compliance (data export, deletion, audit logging)
- Open/click tracking
- Webhook delivery for events

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ / TypeScript 5+ |
| API Framework | Fastify |
| Queue | BullMQ + Redis |
| Database | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Dashboard | Next.js 15 / React 19 |
| Linting | Biome |
| Monorepo | Turborepo + pnpm |

## Project Structure

```
packages/
├── api/          # REST API (Fastify)
├── worker/       # Email sending workers (BullMQ)
├── core/         # Shared types, validation, encryption
├── db/           # Database schema (Drizzle)
├── dashboard/    # Admin UI (Next.js)
├── sdk-js/       # TypeScript SDK
├── tracking/     # Open/click tracking service
├── inbound/      # Bounce email processor
├── webhook/      # Outbound webhook delivery
└── scheduler/    # Cron/scheduled jobs
```

## Code Review Agents

This project includes 6 specialized code review agents. Each agent focuses on a specific aspect of code quality:

### Available Agents

| Agent | File | Focus |
|-------|------|-------|
| Security | `agents/security-reviewer.md` | OWASP, auth, encryption, injection |
| Multi-Tenancy | `agents/multi-tenancy-reviewer.md` | Tenant isolation, data leakage |
| Performance | `agents/performance-reviewer.md` | Throughput, latency, memory |
| Architecture | `agents/architecture-reviewer.md` | SOLID, clean code, structure |
| API Design | `agents/api-design-reviewer.md` | REST best practices, validation |
| Technical Patterns | `agents/technical-patterns-reviewer.md` | TS, Drizzle, BullMQ patterns |

### Invoking Reviews

**Option 1: Slash Commands**
```
/review-security packages/api/src/services/
/review-tenancy packages/api/src/routes/
/review-performance packages/worker/
/review-architecture packages/api/
/review-api packages/api/src/routes/
/review-patterns packages/db/
/review-all packages/api/          # Run all agents
/review-full                       # Full codebase review
```

**Option 2: On-Demand Prompts**
- "Run security review on packages/api/src/services/"
- "Check this file for performance issues"
- "Review multi-tenancy isolation in the auth middleware"

### Review Output Format

All reviews follow this structure:

```markdown
# Code Review: [Area/Files]
**Date:** [Date]
**Reviewer:** [Agent Name]

## Executive Summary
Brief overview of findings.

## Findings

### Critical
[Issues requiring immediate attention]

### High
[Significant issues to address soon]

### Medium
[Improvements recommended]

### Low/Suggestions
[Nice-to-have improvements]

## Checklist Results
- [x] Item passed
- [ ] Item needs attention

## Recommended Actions
1. Priority action items
```

## Coding Standards

### TypeScript
- Strict mode enabled
- No `any` types (use `unknown` if needed)
- Prefer interfaces over types for objects
- Use discriminated unions for state

### API Patterns
- All routes use Zod validation
- Response format: `{ success: boolean, data?: T, error?: Error }`
- Use proper HTTP status codes
- Cursor-based pagination

### Database
- All queries filter by `appId` for tenant isolation
- Use transactions for multi-table mutations
- Indexes on frequently queried columns

### Security
- Secrets encrypted with AES-256-GCM
- API keys validated with SHA-256 (not bcrypt for performance)
- Rate limiting on all endpoints
- Input validation on all user input

## Known Issues (from Gemini Review)

1. **Critical**: API key validation uses bcrypt (too slow) - should use SHA-256
2. **Moderate**: Worker status updates need transactions
3. **Low**: IP allowlist needs CIDR support

## References

- [OWASP Node.js Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)
- [Clean Code TypeScript](https://github.com/labs42io/clean-code-typescript)
- [Fastify Best Practices](https://fastify.dev/docs/latest/Guides/Recommendations/)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [BullMQ Documentation](https://docs.bullmq.io/)
