# /review-api

Run an API design review on the specified path.

## Usage

```
/review-api [path]
```

**Examples:**
- `/review-api packages/api/src/routes/`
- `/review-api packages/api/src/routes/emails.ts`
- `/review-api packages/api/src/`

## Instructions

When this command is invoked:

1. Read the agent definition from `.claude/agents/api-design-reviewer.md`
2. Identify all route files in the specified path
3. For each endpoint, check against the API design checklist
4. Generate a review report following the output template

## Focus Areas

- HTTP method correctness
- Response format consistency
- Error handling and messages
- HTTP status codes
- Pagination patterns
- Rate limiting headers
- Input validation

## Priority Files

If no path specified, review these files:
- `packages/api/src/routes/*.ts` (all route files)
- `packages/api/src/app.ts` (error handlers)
- `packages/api/src/middleware/` (auth errors)

## Output

Generate a markdown report with:
- Executive summary
- API consistency matrix
- Findings by severity
- Standard compliance checklist
- Recommended actions

## Standard Response Formats

Success:
```json
{ "success": true, "data": {...} }
```

Error:
```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

List:
```json
{ "success": true, "data": [...], "cursor": "...", "has_more": true }
```
