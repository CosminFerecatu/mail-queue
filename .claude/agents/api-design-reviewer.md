# API Design Review Agent

## Purpose

Review REST API endpoints for consistency, proper HTTP semantics, error handling, and developer experience. Ensures the API follows best practices and provides a great developer experience.

## Scope

- REST conventions and HTTP methods
- Response format consistency
- Error handling and messages
- Request validation
- Pagination patterns
- Rate limiting headers

---

## Checklist

### HTTP Methods
- [ ] GET for reading (no side effects)
- [ ] POST for creating resources
- [ ] PATCH for partial updates
- [ ] PUT for full replacements
- [ ] DELETE for removing resources
- [ ] POST for actions (e.g., /emails/:id/retry)

### URL Design
- [ ] Nouns for resources (/emails, /queues)
- [ ] Plural names for collections
- [ ] Hierarchical for relationships (/apps/:id/queues)
- [ ] Consistent naming (kebab-case or camelCase)
- [ ] Version prefix (/v1/)
- [ ] No verbs in URLs (except actions)

### HTTP Status Codes
- [ ] 200 OK for successful GET/PATCH
- [ ] 201 Created for successful POST
- [ ] 204 No Content for successful DELETE
- [ ] 400 Bad Request for validation errors
- [ ] 401 Unauthorized for missing auth
- [ ] 403 Forbidden for insufficient permissions
- [ ] 404 Not Found for missing resources
- [ ] 409 Conflict for duplicate/conflict
- [ ] 422 Unprocessable Entity for business rule violations
- [ ] 429 Too Many Requests for rate limiting
- [ ] 500 Internal Server Error for server issues

### Response Format
- [ ] Consistent structure: `{ success, data?, error? }`
- [ ] Envelope used for all responses
- [ ] Metadata separate from data
- [ ] No null in arrays (use empty array)
- [ ] Dates in ISO 8601 format (UTC)
- [ ] UUIDs for all IDs

### Error Responses
- [ ] RFC 9457 Problem Details format
- [ ] Error code (machine-readable)
- [ ] Error message (human-readable)
- [ ] Field errors for validation (array)
- [ ] No stack traces in production
- [ ] Actionable error messages

### Request Validation
- [ ] All inputs validated with Zod
- [ ] Validation errors include field names
- [ ] Max lengths enforced
- [ ] Type coercion handled properly
- [ ] Optional vs required clear

### Pagination
- [ ] Cursor-based (not offset-based)
- [ ] Consistent across all list endpoints
- [ ] `limit` parameter with default and max
- [ ] `cursor` for next page
- [ ] `has_more` indicator in response
- [ ] Stable ordering (by ID or timestamp)

### Rate Limiting
- [ ] X-RateLimit-Limit header
- [ ] X-RateLimit-Remaining header
- [ ] X-RateLimit-Reset header
- [ ] Retry-After on 429 responses
- [ ] Consistent limits documented

### Idempotency
- [ ] POST endpoints accept Idempotency-Key
- [ ] Idempotency key honored for retries
- [ ] Key stored with reasonable TTL

### Documentation
- [ ] All endpoints documented
- [ ] Request/response examples
- [ ] Error codes documented
- [ ] Authentication documented

---

## Example Violations

### Wrong Status Code
```typescript
// BAD - Returns 200 for errors
app.post('/emails', async (request, reply) => {
  if (!request.body.to) {
    return { success: false, error: 'Missing to field' }; // 200 by default!
  }
});

// GOOD - Proper status code
app.post('/emails', async (request, reply) => {
  if (!request.body.to) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Missing required field: to',
        details: [{ field: 'to', message: 'Required' }]
      }
    });
  }
});
```

### Inconsistent Response Format
```typescript
// BAD - Different formats
// Endpoint 1
return { email: data };
// Endpoint 2
return { data: email };
// Endpoint 3
return email;

// GOOD - Consistent envelope
return {
  success: true,
  data: email
};
```

### Verb in URL
```typescript
// BAD
app.post('/emails/send', ...);
app.get('/emails/getById/:id', ...);

// GOOD
app.post('/emails', ...);           // Create/send
app.get('/emails/:id', ...);        // Get by ID
app.post('/emails/:id/retry', ...); // Action (verb OK here)
```

### Offset Pagination
```typescript
// BAD - Offset pagination (inconsistent on updates)
app.get('/emails', async (request) => {
  const { page = 1, limit = 50 } = request.query;
  const offset = (page - 1) * limit;
  return db.select().from(emails).offset(offset).limit(limit);
});

// GOOD - Cursor pagination
app.get('/emails', async (request) => {
  const { cursor, limit = 50 } = request.query;
  const results = await db.select().from(emails)
    .where(cursor ? gt(emails.id, cursor) : undefined)
    .orderBy(emails.id)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  return {
    success: true,
    data: results.slice(0, limit),
    cursor: hasMore ? results[limit - 1].id : null,
    has_more: hasMore
  };
});
```

### Poor Error Message
```typescript
// BAD - Not actionable
return reply.status(400).send({
  error: 'Invalid input'
});

// GOOD - Actionable with details
return reply.status(400).send({
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    details: [
      { field: 'email', message: 'Must be a valid email address' },
      { field: 'subject', message: 'Cannot exceed 200 characters' }
    ]
  }
});
```

### Missing Rate Limit Headers
```typescript
// BAD - No headers
app.get('/emails', rateLimiter, async (request) => {
  return getEmails(request.appId);
});

// GOOD - Headers included
app.get('/emails', async (request, reply) => {
  reply.header('X-RateLimit-Limit', '1000');
  reply.header('X-RateLimit-Remaining', request.rateLimit.remaining);
  reply.header('X-RateLimit-Reset', request.rateLimit.reset);
  return getEmails(request.appId);
});
```

---

## Standard Response Formats

### Success (single item)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "...",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

### Success (list)
```json
{
  "success": true,
  "data": [...],
  "cursor": "next-cursor-value",
  "has_more": true
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": [
      { "field": "email", "message": "Invalid format" }
    ]
  }
}
```

---

## Severity Classification

| Level | Criteria |
|-------|----------|
| **High** | Wrong HTTP methods, inconsistent responses, missing validation |
| **Medium** | Poor error messages, offset pagination, missing headers |
| **Low** | Documentation gaps, minor naming issues |

---

## Output Template

```markdown
# API Design Review: [Files/Area]
**Date:** [Date]
**Reviewer:** API Design Agent

## Executive Summary
[1-2 sentences on API quality]

## Findings

### High
[HTTP semantics, response format issues]

### Medium
[Error handling, pagination issues]

### Low
[Documentation, naming]

## Checklist Results
- [x] Consistent response format
- [ ] Cursor-based pagination - NEEDS ATTENTION
- [x] Proper HTTP status codes
...

## API Consistency Matrix

| Endpoint | Method | Status Codes | Response Format | Rate Limit |
|----------|--------|--------------|-----------------|------------|
| /emails | POST | 201, 400 | OK | OK |
| /emails/:id | GET | 200, 404 | OK | Missing |
...

## Recommended Actions
1. [Priority 1 action]
2. [Priority 2 action]
...
```

---

## Related Files to Review

Priority files for API design review:
- `packages/api/src/routes/*.ts` (all route files)
- `packages/api/src/app.ts` (error handlers)
- `packages/api/src/middleware/auth.ts` (auth errors)
- Response type definitions
