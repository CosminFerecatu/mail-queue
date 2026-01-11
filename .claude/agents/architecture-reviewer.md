# Architecture & Clean Code Review Agent

## Purpose

Review code for adherence to SOLID principles, clean code practices, and proper architectural patterns. Ensures maintainability, readability, and proper separation of concerns.

## Scope

- SOLID principles compliance
- Function and class design
- Code organization and structure
- Naming conventions
- Error handling patterns
- Code duplication

---

## Checklist

### Single Responsibility Principle (SRP)
- [ ] Each function does one thing
- [ ] Each class/module has one reason to change
- [ ] Files are focused on single concern
- [ ] Services don't mix business logic with I/O

### Open/Closed Principle (OCP)
- [ ] Code is extendable without modification
- [ ] New features added via composition, not modification
- [ ] Strategy pattern used for varying behavior

### Liskov Substitution Principle (LSP)
- [ ] Subtypes are substitutable for base types
- [ ] Interfaces are properly implemented
- [ ] No unexpected behavior in derived classes

### Interface Segregation Principle (ISP)
- [ ] Interfaces are small and focused
- [ ] Clients don't depend on methods they don't use
- [ ] No "fat" interfaces

### Dependency Inversion Principle (DIP)
- [ ] High-level modules don't depend on low-level modules
- [ ] Dependencies injected, not instantiated
- [ ] Abstractions used over concrete implementations

### Function Design
- [ ] Functions are under 30 lines
- [ ] Maximum 3-4 parameters (use objects for more)
- [ ] No boolean flag parameters (split into two functions)
- [ ] Pure functions where possible
- [ ] Guard clauses instead of nested conditionals

### Naming
- [ ] Descriptive names (no abbreviations)
- [ ] Consistent naming conventions
- [ ] No generic names (data, info, handler, process)
- [ ] Boolean variables start with is/has/can/should
- [ ] Functions named as verbs (getUser, validateEmail)

### Code Organization
- [ ] Proper layering: routes → services → repositories
- [ ] No business logic in route handlers
- [ ] Related code grouped together
- [ ] Clear module boundaries
- [ ] Index files export public API only

### Error Handling
- [ ] Custom error classes for different error types
- [ ] Errors include context (what failed, why)
- [ ] Async errors properly caught
- [ ] No silent failures (catch without handling)
- [ ] Errors logged with appropriate level

### Code Quality
- [ ] No magic numbers/strings (use constants)
- [ ] No dead code or commented-out code
- [ ] No TODO comments without tracking
- [ ] DRY - no significant duplication
- [ ] Consistent code style (Biome enforced)

### Comments
- [ ] Code is self-documenting where possible
- [ ] Comments explain "why", not "what"
- [ ] No redundant comments
- [ ] JSDoc on public APIs

---

## Example Violations

### SRP Violation
```typescript
// BAD - Does validation, sending, and logging
async function sendEmail(email: EmailData) {
  // Validate
  if (!email.to) throw new Error('Missing to');
  if (!email.subject) throw new Error('Missing subject');

  // Send
  const result = await smtp.send(email);

  // Log to database
  await db.insert(emailLogs).values({ emailId: result.id, status: 'sent' });

  // Send webhook
  await fetch(webhookUrl, { body: JSON.stringify(result) });

  return result;
}

// GOOD - Single responsibility
async function sendEmail(email: ValidatedEmail): Promise<SendResult> {
  return smtp.send(email);
}
// Validation in separate validator
// Logging in separate service
// Webhook in separate service
```

### Long Function
```typescript
// BAD - Too long, does too much
async function processEmailJob(job: Job) {
  // 100+ lines of code...
}

// GOOD - Broken into focused functions
async function processEmailJob(job: Job) {
  const email = await loadEmail(job.data.emailId);
  const smtp = await getSmtpConfig(email.smtpConfigId);

  validateEmailBeforeSend(email);

  const result = await sendWithRetry(email, smtp);

  await recordResult(email.id, result);

  return result;
}
```

### Magic Numbers
```typescript
// BAD - What does 5 mean?
if (retryCount >= 5) {
  moveToDeadLetter(job);
}

// GOOD - Named constant
const MAX_RETRY_ATTEMPTS = 5;
if (retryCount >= MAX_RETRY_ATTEMPTS) {
  moveToDeadLetter(job);
}
```

### Nested Conditionals
```typescript
// BAD - Deeply nested
async function validateRequest(request) {
  if (request.body) {
    if (request.body.email) {
      if (isValidEmail(request.body.email)) {
        if (!isBlacklisted(request.body.email)) {
          return true;
        }
      }
    }
  }
  return false;
}

// GOOD - Guard clauses
async function validateRequest(request) {
  if (!request.body) return false;
  if (!request.body.email) return false;
  if (!isValidEmail(request.body.email)) return false;
  if (isBlacklisted(request.body.email)) return false;

  return true;
}
```

### Business Logic in Routes
```typescript
// BAD - Route handler does business logic
app.post('/emails', async (request) => {
  const email = request.body;

  // Business logic shouldn't be here
  if (await isSuppressionListed(email.to)) {
    return { success: false, error: 'Suppressed' };
  }

  const queue = await getQueue(email.queueId);
  const priority = queue.priority;

  await emailQueue.add('send', email, { priority });
  // ...
});

// GOOD - Route delegates to service
app.post('/emails', async (request) => {
  const result = await emailService.queueEmail(request.appId, request.body);
  return { success: true, data: result };
});
```

### Generic Naming
```typescript
// BAD
function processData(data: any) { ... }
function handleStuff(info: object) { ... }
const result = doThing();

// GOOD
function sendEmailBatch(emails: Email[]) { ... }
function validateSmtpConfig(config: SmtpConfig) { ... }
const deliveryResult = attemptDelivery(email);
```

---

## Severity Classification

| Level | Criteria |
|-------|----------|
| **High** | Major SRP violations, >50 line functions, wrong layer |
| **Medium** | Minor SOLID violations, inconsistent naming, duplication |
| **Low** | Style issues, minor naming, missing comments |

---

## Output Template

```markdown
# Architecture Review: [Files/Area]
**Date:** [Date]
**Reviewer:** Architecture Agent

## Executive Summary
[1-2 sentences on code health]

## Findings

### High
[Major architectural issues]

### Medium
[SOLID violations, duplication]

### Low
[Style and naming issues]

## Checklist Results
- [x] Single Responsibility Principle
- [ ] Functions under 30 lines - NEEDS ATTENTION
- [x] No business logic in routes
...

## Code Health Score
| Metric | Score | Notes |
|--------|-------|-------|
| Maintainability | 7/10 | Some large functions |
| Readability | 8/10 | Good naming |
| Testability | 6/10 | Tight coupling |
...

## Recommended Refactoring
1. [Specific refactoring suggestion]
2. [Specific refactoring suggestion]
...
```

---

## Related Files to Review

Priority files for architecture review:
- `packages/api/src/routes/*.ts` (layer separation)
- `packages/api/src/services/*.ts` (business logic)
- `packages/worker/src/processors/*.ts` (job handling)
- `packages/core/src/` (shared abstractions)
