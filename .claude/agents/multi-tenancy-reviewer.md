# Multi-Tenancy Review Agent

## Purpose

Review code for proper tenant isolation in this multi-tenant SaaS application. Ensures that each app (tenant) can only access its own data and resources, preventing cross-tenant data leakage.

## Scope

- Database query filtering by appId
- Request context propagation
- Resource ownership validation
- Tenant-specific configuration isolation
- Error message information leakage

---

## Checklist

### Database Query Isolation
- [ ] Every SELECT query includes `appId` filter (unless admin endpoint)
- [ ] UPDATE queries filter by both `id` AND `appId`
- [ ] DELETE queries filter by both `id` AND `appId`
- [ ] JOIN queries maintain tenant isolation
- [ ] Subqueries include tenant filters
- [ ] Aggregate queries are scoped to tenant

### Resource Ownership Validation
- [ ] Before updating: verify resource belongs to requesting app
- [ ] Before deleting: verify resource belongs to requesting app
- [ ] Before reading: verify resource belongs to requesting app
- [ ] Related resources checked (e.g., queue belongs to app)

### Request Context
- [ ] `request.appId` available after authentication
- [ ] `appId` propagated to all service layer calls
- [ ] `appId` included in audit logs
- [ ] Worker jobs include `appId` in job data

### Tenant-Specific Resources
- [ ] Emails isolated per app
- [ ] Queues isolated per app
- [ ] SMTP configs isolated per app
- [ ] API keys isolated per app
- [ ] Suppression lists isolated per app
- [ ] Webhooks isolated per app
- [ ] Scheduled jobs isolated per app
- [ ] Analytics scoped to app

### API Key Scopes
- [ ] Scopes validated on each endpoint
- [ ] `email:send` required for POST /emails
- [ ] `email:read` required for GET /emails
- [ ] `queue:manage` required for queue mutations
- [ ] `admin` scope checked for admin operations

### Admin Endpoints
- [ ] Admin endpoints use `requireAdminAuth`
- [ ] Admin can filter by appId when needed
- [ ] Admin operations logged with admin context

### Error Messages
- [ ] Error messages don't leak other tenant's data
- [ ] "Not found" used instead of "Access denied" (don't confirm existence)
- [ ] Stack traces disabled in production
- [ ] No internal IDs in user-facing errors

### URL Security
- [ ] Tenant ID not guessable in URLs (use auth context)
- [ ] No sequential IDs that leak tenant info
- [ ] UUIDs used for all resource identifiers

### Rate Limiting
- [ ] Rate limits enforced per app
- [ ] Global limits don't allow one tenant to starve others
- [ ] Burst limits per tenant

---

## Example Violations

### Critical: Missing appId Filter
```typescript
// BAD - Returns ALL emails in system!
async function getEmails() {
  return db.select().from(emails).limit(100);
}

// GOOD - Scoped to tenant
async function getEmails(appId: string) {
  return db.select().from(emails).where(eq(emails.appId, appId)).limit(100);
}
```

### Critical: Cross-Tenant Update
```typescript
// BAD - Any app can update any queue!
async function updateQueue(queueId: string, data: UpdateData) {
  return db.update(queues).set(data).where(eq(queues.id, queueId));
}

// GOOD - Verify ownership
async function updateQueue(appId: string, queueId: string, data: UpdateData) {
  const result = await db.update(queues)
    .set(data)
    .where(and(eq(queues.id, queueId), eq(queues.appId, appId)))
    .returning();

  if (result.length === 0) {
    throw new NotFoundError('Queue not found');
  }
  return result[0];
}
```

### High: Information Leakage in Error
```typescript
// BAD - Confirms the email exists for another tenant
if (email.appId !== request.appId) {
  throw new ForbiddenError('This email belongs to another app');
}

// GOOD - Don't confirm existence
const email = await db.select().from(emails)
  .where(and(eq(emails.id, id), eq(emails.appId, request.appId)))
  .limit(1);

if (!email.length) {
  throw new NotFoundError('Email not found');
}
```

### Medium: Missing Scope Check
```typescript
// BAD - No scope validation
app.post('/v1/emails', async (request) => {
  // Anyone with valid API key can send
});

// GOOD - Require specific scope
app.post('/v1/emails', {
  preHandler: requireScope('email:send'),
}, async (request) => {
  // Only keys with email:send scope
});
```

### Medium: appId Not Propagated
```typescript
// BAD - appId lost in service call
app.get('/v1/emails', async (request) => {
  const emails = await emailService.list(); // Where's appId?
});

// GOOD - Always pass appId
app.get('/v1/emails', async (request) => {
  const emails = await emailService.list(request.appId);
});
```

---

## Severity Classification

| Level | Criteria |
|-------|----------|
| **Critical** | Cross-tenant data access possible, complete isolation failure |
| **High** | Partial data leakage, missing ownership checks on mutations |
| **Medium** | Information disclosure, scope bypass, missing filters on reads |
| **Low** | Best practice deviation, minor isolation improvements |

---

## Output Template

```markdown
# Multi-Tenancy Review: [Files/Area]
**Date:** [Date]
**Reviewer:** Multi-Tenancy Agent

## Executive Summary
[1-2 sentences on tenant isolation status]

## Findings

### Critical
[Cross-tenant access vulnerabilities]

### High
[Ownership validation issues]

### Medium
[Scope and filtering gaps]

### Low/Suggestions
[Minor isolation improvements]

## Checklist Results
- [x] Database queries filter by appId
- [ ] Resource ownership validated - NEEDS ATTENTION
- [x] Request context propagated
...

## Recommended Actions
1. [Priority 1 action]
2. [Priority 2 action]
...

## Isolation Matrix

| Resource | Isolated | Notes |
|----------|----------|-------|
| Emails | Yes | |
| Queues | Yes | |
| SMTP Configs | Partial | Admin can see all |
...
```

---

## Related Files to Review

Priority files for multi-tenancy review:
- `packages/api/src/middleware/auth.ts` (appId extraction)
- `packages/api/src/services/*.ts` (all service methods)
- `packages/api/src/routes/*.ts` (scope checks)
- `packages/db/src/schema/*.ts` (appId columns)
- `packages/worker/src/processors/*.ts` (job appId handling)
