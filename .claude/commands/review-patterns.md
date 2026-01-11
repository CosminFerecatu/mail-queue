# /review-patterns

Run a technical patterns review (TypeScript, Drizzle, BullMQ) on the specified path.

## Usage

```
/review-patterns [path]
```

**Examples:**
- `/review-patterns packages/db/src/schema/`
- `/review-patterns packages/worker/src/processors/`
- `/review-patterns packages/api/src/services/`

## Instructions

When this command is invoked:

1. Read the agent definition from `.claude/agents/technical-patterns-reviewer.md`
2. Identify all relevant files in the specified path
3. For each file, check against the technical patterns checklists
4. Generate a review report following the output template

## Focus Areas

### TypeScript
- Strict mode compliance
- No `any` types
- Proper type definitions
- Discriminated unions for state

### Drizzle ORM
- Transaction usage
- Schema definitions
- Query patterns
- Index strategy

### BullMQ
- Job configuration
- Worker setup
- Error handling
- Graceful shutdown

## Priority Files

If no path specified, review these critical files:
- `packages/*/tsconfig.json` (TypeScript config)
- `packages/db/src/schema/*.ts` (Drizzle schema)
- `packages/worker/src/processors/*.ts` (BullMQ workers)
- `packages/api/src/services/*.ts` (transactions)

## Output

Generate a markdown report with:
- Executive summary
- Findings organized by technology
- Pattern compliance checklist
- Recommended actions
