# /review-security

Run a security-focused code review on the specified path.

## Usage

```
/review-security [path]
```

**Examples:**
- `/review-security packages/api/src/services/`
- `/review-security packages/api/src/middleware/auth.ts`
- `/review-security packages/worker/`

## Instructions

When this command is invoked:

1. Read the agent definition from `.claude/agents/security-reviewer.md`
2. Identify all relevant files in the specified path
3. For each file, check against the security checklist
4. Generate a review report following the output template

## Focus Areas

- Input validation and sanitization
- Authentication and authorization
- Encryption and secret management
- Injection prevention (SQL, XSS, command)
- Rate limiting
- Security headers
- Dependency vulnerabilities

## Priority Files

If no path specified, review these critical files:
- `packages/api/src/middleware/auth.ts`
- `packages/api/src/services/apikey.service.ts`
- `packages/core/src/encryption/`
- Any file handling user input

## Output

Generate a markdown report with:
- Executive summary
- Findings by severity (Critical/High/Medium/Low)
- Checklist results
- Recommended actions

## Known Issues to Flag

- API key validation using bcrypt (should use SHA-256)
- Any hardcoded secrets
- Missing input validation
