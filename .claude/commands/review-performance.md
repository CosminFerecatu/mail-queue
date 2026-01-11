# /review-performance

Run a performance-focused code review on the specified path.

## Usage

```
/review-performance [path]
```

**Examples:**
- `/review-performance packages/api/src/services/`
- `/review-performance packages/worker/src/processors/email.processor.ts`
- `/review-performance packages/api/src/routes/`

## Instructions

When this command is invoked:

1. Read the agent definition from `.claude/agents/performance-reviewer.md`
2. Identify all relevant files in the specified path
3. For each file, check against the performance checklist
4. Generate a review report following the output template

## Focus Areas

- N+1 query detection
- Database query optimization
- Connection pooling
- Memory leak prevention
- Async/await patterns
- Batch processing
- Pagination on list endpoints

## Priority Files

If no path specified, review these critical files:
- `packages/api/src/services/*.ts` (database queries)
- `packages/worker/src/processors/*.ts` (job processing)
- `packages/worker/src/smtp/client.ts` (connection pooling)

## Output

Generate a markdown report with:
- Executive summary
- Performance impact assessment
- Findings by severity (Critical/Moderate/Minor)
- Performance metrics table
- Recommended optimizations

## Performance Targets

- API p99 latency: < 100ms
- Worker throughput: > 50 emails/sec
- Database query time: < 50ms
- Memory per process: < 512MB
