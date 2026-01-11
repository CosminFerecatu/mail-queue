# Technical Patterns Review Agent

## Purpose

Review code for proper use of TypeScript, Drizzle ORM, and BullMQ patterns. Ensures type safety, database best practices, and proper queue handling.

## Scope

- TypeScript strict mode compliance
- Drizzle ORM patterns
- BullMQ job processing
- Error handling patterns
- Async patterns

---

## TypeScript Checklist

### Type Safety
- [ ] Strict mode enabled in tsconfig
- [ ] No `any` types (use `unknown` if needed)
- [ ] No type assertions (`as`) without validation
- [ ] Explicit return types on public functions
- [ ] Proper null/undefined handling

### Type Patterns
- [ ] Use interfaces for objects, types for unions
- [ ] Discriminated unions for state machines
- [ ] Generic types for reusable code
- [ ] Proper type exports from packages
- [ ] Avoid enums (use const objects or unions)

### Type Inference
- [ ] Let TypeScript infer when obvious
- [ ] Don't over-annotate local variables
- [ ] Use `satisfies` for type checking without widening
- [ ] Proper inference in callbacks

### Async Types
- [ ] Proper Promise typing
- [ ] Async function return types correct
- [ ] No floating promises (unhandled)
- [ ] Proper error types in try/catch

---

## Drizzle ORM Checklist

### Schema Definition
- [ ] All tables have proper TypeScript types
- [ ] Foreign keys properly defined
- [ ] Indexes on frequently queried columns
- [ ] Enums used for fixed value sets
- [ ] JSONB columns have type assertions

### Queries
- [ ] Use Drizzle query builder (not raw SQL)
- [ ] Proper type inference on selects
- [ ] Relations properly defined
- [ ] Prepared statements for frequent queries

### Transactions
- [ ] Multi-table mutations wrapped in transactions
- [ ] Transaction isolation level appropriate
- [ ] Rollback on error
- [ ] Avoid long-running transactions

### Migrations
- [ ] Migrations are reversible
- [ ] No data loss in migrations
- [ ] Proper column defaults
- [ ] Index creation is concurrent-safe

---

## BullMQ Checklist

### Job Definition
- [ ] Job data is typed
- [ ] Job names are constants
- [ ] Job options configured (attempts, backoff)
- [ ] Progress updates for long jobs

### Worker Configuration
- [ ] Concurrency set appropriately
- [ ] Connection reuse configured
- [ ] maxRetriesPerRequest set for persistence
- [ ] Graceful shutdown implemented

### Error Handling
- [ ] Retryable vs non-retryable errors distinguished
- [ ] Dead letter queue configured
- [ ] Job failures logged with context
- [ ] Circuit breaker for external services

### Queue Management
- [ ] Queue cleanup strategy
- [ ] Stalled job handling
- [ ] Job prioritization
- [ ] Rate limiting per queue

---

## Example Violations

### TypeScript: Using `any`
```typescript
// BAD
function processData(data: any) {
  return data.value;
}

// GOOD
function processData(data: unknown) {
  if (isValidData(data)) {
    return data.value;
  }
  throw new Error('Invalid data');
}

// Or with proper typing
interface DataPayload {
  value: string;
}
function processData(data: DataPayload) {
  return data.value;
}
```

### TypeScript: Floating Promise
```typescript
// BAD - Promise ignored
async function handleRequest() {
  sendNotification(); // Returns Promise but not awaited!
  return { success: true };
}

// GOOD - Explicitly handled
async function handleRequest() {
  await sendNotification();
  return { success: true };
}

// Or if intentionally fire-and-forget
async function handleRequest() {
  sendNotification().catch(err => logger.error(err));
  return { success: true };
}
```

### TypeScript: Discriminated Union
```typescript
// BAD - Hard to handle all cases
interface EmailStatus {
  status: string;
  sentAt?: Date;
  error?: string;
  deliveredAt?: Date;
}

// GOOD - Discriminated union
type EmailStatus =
  | { status: 'queued' }
  | { status: 'sent'; sentAt: Date }
  | { status: 'delivered'; sentAt: Date; deliveredAt: Date }
  | { status: 'failed'; error: string };

// TypeScript ensures all cases handled
function handleStatus(status: EmailStatus) {
  switch (status.status) {
    case 'queued': return 'Waiting';
    case 'sent': return `Sent at ${status.sentAt}`;
    case 'delivered': return `Delivered at ${status.deliveredAt}`;
    case 'failed': return `Failed: ${status.error}`;
  }
}
```

### Drizzle: Missing Transaction
```typescript
// BAD - Not atomic
async function sendEmail(emailId: string) {
  await db.update(emails).set({ status: 'sent' }).where(eq(emails.id, emailId));
  await db.insert(emailEvents).values({ emailId, type: 'sent' });
  // If second query fails, we have inconsistent state!
}

// GOOD - Transaction
async function sendEmail(emailId: string) {
  await db.transaction(async (tx) => {
    await tx.update(emails).set({ status: 'sent' }).where(eq(emails.id, emailId));
    await tx.insert(emailEvents).values({ emailId, type: 'sent' });
  });
}
```

### Drizzle: JSONB Typing
```typescript
// BAD - No type safety on JSONB
const app = await db.select().from(apps).where(eq(apps.id, id));
const setting = app.settings.retentionDays; // Type error or any

// GOOD - Type assertion with validation
interface AppSettings {
  retentionDays?: number;
  webhookUrl?: string;
}

const app = await db.select().from(apps).where(eq(apps.id, id));
const settings = app.settings as AppSettings;
const retentionDays = settings?.retentionDays ?? 90;
```

### BullMQ: Missing Graceful Shutdown
```typescript
// BAD - Worker dies mid-job
const worker = new Worker('email', processEmail);

// GOOD - Graceful shutdown
const worker = new Worker('email', processEmail);

async function shutdown() {
  await worker.close(); // Waits for current job to finish
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

### BullMQ: No Retry Distinction
```typescript
// BAD - Retries everything
async function processEmail(job: Job) {
  try {
    await sendEmail(job.data);
  } catch (error) {
    throw error; // Will retry even permanent failures
  }
}

// GOOD - Distinguish retryable errors
async function processEmail(job: Job) {
  try {
    await sendEmail(job.data);
  } catch (error) {
    if (error instanceof PermanentError) {
      // Don't retry - move to failed
      throw new UnrecoverableError(error.message);
    }
    // Transient error - will retry
    throw error;
  }
}
```

---

## Severity Classification

| Level | Criteria |
|-------|----------|
| **High** | `any` types, missing transactions, no shutdown handling |
| **Medium** | Type assertions, missing indexes, suboptimal patterns |
| **Low** | Over-annotation, style preferences, minor optimizations |

---

## Output Template

```markdown
# Technical Patterns Review: [Files/Area]
**Date:** [Date]
**Reviewer:** Technical Patterns Agent

## Executive Summary
[1-2 sentences on technical quality]

## TypeScript Findings
### High
[any types, unsafe assertions]

### Medium
[Type improvements]

## Drizzle ORM Findings
### High
[Missing transactions]

### Medium
[Query optimizations]

## BullMQ Findings
### High
[Shutdown, error handling]

### Medium
[Configuration improvements]

## Checklist Results
- [x] Strict mode enabled
- [ ] No any types - NEEDS ATTENTION
- [x] Transactions used for multi-table ops
...

## Recommended Actions
1. [Priority 1 action]
2. [Priority 2 action]
...
```

---

## Related Files to Review

Priority files for technical patterns review:
- `packages/*/tsconfig.json` (TypeScript config)
- `packages/db/src/schema/*.ts` (Drizzle schema)
- `packages/worker/src/processors/*.ts` (BullMQ workers)
- `packages/api/src/services/*.ts` (transactions)
- `packages/core/src/` (shared types)
