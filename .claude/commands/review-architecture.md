# /review-architecture

Run an architecture and clean code review on the specified path.

## Usage

```
/review-architecture [path]
```

**Examples:**
- `/review-architecture packages/api/src/`
- `/review-architecture packages/worker/src/processors/`
- `/review-architecture packages/api/src/services/email.service.ts`

## Instructions

When this command is invoked:

1. Read the agent definition from `.claude/agents/architecture-reviewer.md`
2. Identify all relevant files in the specified path
3. For each file, check against the architecture checklist
4. Generate a review report following the output template

## Focus Areas

- SOLID principles compliance
- Function and class design
- Proper layer separation (routes → services → repositories)
- Naming conventions
- Code duplication
- Error handling patterns
- Guard clauses vs nested conditionals

## Priority Files

If no path specified, review these critical files:
- `packages/api/src/routes/*.ts` (layer separation)
- `packages/api/src/services/*.ts` (business logic)
- `packages/worker/src/processors/*.ts` (job handling)

## Output

Generate a markdown report with:
- Executive summary
- Code health score
- Findings by severity
- Refactoring suggestions
- Recommended actions

## Key Metrics

- Function size (target: < 30 lines)
- Cyclomatic complexity
- Duplication percentage
- Layer violations
