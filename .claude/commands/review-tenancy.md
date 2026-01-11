# /review-tenancy

Run a multi-tenancy isolation review on the specified path.

## Usage

```
/review-tenancy [path]
```

**Examples:**
- `/review-tenancy packages/api/src/services/`
- `/review-tenancy packages/api/src/routes/emails.ts`
- `/review-tenancy packages/worker/src/processors/`

## Instructions

When this command is invoked:

1. Read the agent definition from `.claude/agents/multi-tenancy-reviewer.md`
2. Identify all relevant files in the specified path
3. For each file, check against the multi-tenancy checklist
4. Generate a review report following the output template

## Focus Areas

- Database query filtering by appId
- Resource ownership validation
- Request context propagation
- Scope enforcement
- Cross-tenant data leakage prevention
- Error message information disclosure

## Priority Files

If no path specified, review these critical files:
- `packages/api/src/services/*.ts` (all service methods)
- `packages/api/src/routes/*.ts` (scope checks)
- `packages/worker/src/processors/*.ts` (job appId handling)

## Output

Generate a markdown report with:
- Executive summary
- Isolation risk assessment
- Findings by severity
- Isolation matrix (resources vs isolation status)
- Recommended actions

## Critical Checks

- Every SELECT includes appId filter
- Every UPDATE/DELETE filters by id AND appId
- Error messages don't leak tenant information
- Scopes validated on each endpoint
