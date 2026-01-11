# Performance Review Agent

## Purpose

Review code for performance issues that could impact the system's ability to handle 1M+ emails/day. Focus on database queries, memory usage, async patterns, and resource pooling.

## Scope

- Database query optimization
- N+1 query detection
- Connection pooling
- Memory leak prevention
- Async/await patterns
- Caching strategies
- Batch processing

---

## Checklist

### Database Queries
- [ ] No N+1 queries (use joins or batch loading)
- [ ] SELECT only required columns (no SELECT *)
- [ ] Appropriate indexes exist for WHERE clauses
- [ ] LIMIT used on list queries
- [ ] Prepared statements for repeated queries
- [ ] Bulk operations use batch inserts/updates
- [ ] COUNT queries are optimized (use estimates if acceptable)

### Connection Pooling
- [ ] PostgreSQL pool configured with appropriate size
- [ ] Redis connection reused (not created per request)
- [ ] SMTP connection pool configured
- [ ] Pool exhaustion handled gracefully
- [ ] Connection timeouts configured

### Memory Management
- [ ] Large data sets streamed, not loaded entirely
- [ ] Event listeners removed when done
- [ ] Closures don't capture unnecessary variables
- [ ] Buffers released after use
- [ ] No growing arrays in long-running processes

### Async Patterns
- [ ] No blocking operations in event loop
- [ ] Heavy computation offloaded to workers
- [ ] Promise.all for parallel independent operations
- [ ] Proper error handling in async code
- [ ] No floating promises (unhandled)
- [ ] AbortSignal used for timeouts

### Caching
- [ ] Frequently accessed data cached in Redis
- [ ] Cache invalidation strategy defined
- [ ] TTL set appropriately
- [ ] Cache keys include tenant context

### Batch Processing
- [ ] Bulk email sends batched efficiently
- [ ] Database operations batched (1000 records max)
- [ ] Worker concurrency configured appropriately
- [ ] Backpressure handling for queues

### API Performance
- [ ] Pagination on all list endpoints
- [ ] Response size limits enforced
- [ ] Compression enabled for large responses
- [ ] Heavy operations return 202 Accepted

### Worker Performance
- [ ] Job processing time tracked
- [ ] Circuit breaker for external services
- [ ] Graceful shutdown implemented
- [ ] Job progress updates for long operations

---

## Example Violations

### Critical: N+1 Query
```typescript
// BAD - N+1: 1 query for emails + N queries for events
const emails = await db.select().from(emails).limit(100);
for (const email of emails) {
  email.events = await db.select().from(emailEvents)
    .where(eq(emailEvents.emailId, email.id));
}

// GOOD - Single query with join or batch load
const emails = await db.select().from(emails).limit(100);
const emailIds = emails.map(e => e.id);
const events = await db.select().from(emailEvents)
  .where(inArray(emailEvents.emailId, emailIds));
// Then group events by emailId
```

### Critical: Blocking Event Loop
```typescript
// BAD - Synchronous heavy computation
app.get('/report', async (request) => {
  const data = generateHeavyReport(); // Blocks for seconds!
  return data;
});

// GOOD - Offload to worker
app.get('/report', async (request) => {
  const jobId = await reportQueue.add('generate', { appId: request.appId });
  return { jobId, status: 'processing' };
});
```

### High: SELECT *
```typescript
// BAD - Selects all columns including large html_body
const emails = await db.select().from(emails).limit(100);

// GOOD - Select only needed columns
const emails = await db.select({
  id: emails.id,
  subject: emails.subject,
  status: emails.status,
  createdAt: emails.createdAt,
}).from(emails).limit(100);
```

### High: Memory Leak - Event Listener
```typescript
// BAD - Listener never removed
redis.on('message', handleMessage);

// GOOD - Cleanup on shutdown
const handler = (msg) => handleMessage(msg);
redis.on('message', handler);

process.on('SIGTERM', () => {
  redis.off('message', handler);
});
```

### Medium: No Pagination
```typescript
// BAD - Could return millions of rows
app.get('/emails', async (request) => {
  return db.select().from(emails).where(eq(emails.appId, request.appId));
});

// GOOD - Cursor-based pagination
app.get('/emails', async (request) => {
  const { cursor, limit = 50 } = request.query;
  const results = await db.select().from(emails)
    .where(and(
      eq(emails.appId, request.appId),
      cursor ? gt(emails.id, cursor) : undefined
    ))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  return {
    data: results.slice(0, limit),
    cursor: hasMore ? results[limit - 1].id : null,
    hasMore
  };
});
```

### Medium: Sequential Instead of Parallel
```typescript
// BAD - Sequential (slow)
const app = await getApp(appId);
const queue = await getQueue(queueId);
const smtp = await getSmtpConfig(smtpId);

// GOOD - Parallel (fast)
const [app, queue, smtp] = await Promise.all([
  getApp(appId),
  getQueue(queueId),
  getSmtpConfig(smtpId),
]);
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| API p99 latency | < 100ms |
| Worker throughput | > 50 emails/sec per worker |
| Database query time | < 50ms for simple queries |
| Memory per process | < 512MB under normal load |
| Queue depth at steady state | < 10,000 with 20 workers |

---

## Severity Classification

| Level | Criteria |
|-------|----------|
| **Critical** | Blocks event loop, N+1 queries, memory leaks |
| **Moderate** | Missing pagination, inefficient queries, no caching |
| **Minor** | Suboptimal patterns, missing indexes, no compression |

---

## Output Template

```markdown
# Performance Review: [Files/Area]
**Date:** [Date]
**Reviewer:** Performance Agent

## Executive Summary
[1-2 sentences on performance status]

## Findings

### Critical
[Blocking operations, N+1, memory leaks]

### Moderate
[Inefficient queries, missing pagination]

### Minor
[Optimization opportunities]

## Checklist Results
- [x] No N+1 queries
- [ ] Pagination on list endpoints - NEEDS ATTENTION
- [x] Connection pooling configured
...

## Performance Metrics
| Query/Operation | Current | Target | Status |
|-----------------|---------|--------|--------|
| List emails | 150ms | <100ms | Needs work |
...

## Recommended Actions
1. [Priority 1 action]
2. [Priority 2 action]
...
```

---

## Related Files to Review

Priority files for performance review:
- `packages/api/src/services/*.ts` (database queries)
- `packages/worker/src/processors/*.ts` (job processing)
- `packages/api/src/routes/*.ts` (pagination)
- `packages/db/src/schema/*.ts` (indexes)
- `packages/worker/src/smtp/client.ts` (connection pooling)
