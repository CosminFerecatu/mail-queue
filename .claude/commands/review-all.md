# /review-all

Run all 6 review agents on the specified path.

## Usage

```
/review-all [path]
```

**Examples:**
- `/review-all packages/api/`
- `/review-all packages/worker/src/processors/`
- `/review-all packages/api/src/services/email.service.ts`

## Instructions

When this command is invoked, run all 6 agents sequentially:

1. **Security Agent** (`.claude/agents/security-reviewer.md`)
2. **Multi-Tenancy Agent** (`.claude/agents/multi-tenancy-reviewer.md`)
3. **Performance Agent** (`.claude/agents/performance-reviewer.md`)
4. **Architecture Agent** (`.claude/agents/architecture-reviewer.md`)
5. **API Design Agent** (`.claude/agents/api-design-reviewer.md`)
6. **Technical Patterns Agent** (`.claude/agents/technical-patterns-reviewer.md`)

## Output Format

Generate a consolidated report:

```markdown
# Comprehensive Code Review: [Path]
**Date:** [Date]
**Agents Run:** All (6)

## Summary Dashboard

| Agent | Critical | High | Medium | Low |
|-------|----------|------|--------|-----|
| Security | 0 | 1 | 2 | 3 |
| Multi-Tenancy | 0 | 0 | 1 | 0 |
| Performance | 1 | 2 | 1 | 0 |
| Architecture | 0 | 1 | 3 | 2 |
| API Design | 0 | 0 | 2 | 1 |
| Technical Patterns | 0 | 1 | 1 | 2 |
| **Total** | **1** | **5** | **10** | **8** |

## Critical Findings (Must Fix)
[List all critical issues from all agents]

## High Priority Findings
[List all high priority issues]

## Agent Reports

### Security
[Detailed security findings]

### Multi-Tenancy
[Detailed multi-tenancy findings]

### Performance
[Detailed performance findings]

### Architecture
[Detailed architecture findings]

### API Design
[Detailed API design findings]

### Technical Patterns
[Detailed technical patterns findings]

## Recommended Action Plan
1. [Priority 1 - from critical findings]
2. [Priority 2]
3. [Priority 3]
...
```

## When to Use

Use `/review-all` when:
- Reviewing a new feature before merge
- Preparing for a release
- Onboarding to understand code quality
- After major refactoring
