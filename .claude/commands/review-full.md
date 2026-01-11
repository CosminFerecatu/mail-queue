# /review-full

Run a comprehensive review of the entire codebase using all 6 agents.

## Usage

```
/review-full
```

No path argument needed - reviews the entire project.

## Instructions

When this command is invoked:

1. Review each package with all 6 agents:
   - `packages/api/`
   - `packages/worker/`
   - `packages/core/`
   - `packages/db/`
   - `packages/dashboard/`
   - `packages/sdk-js/`
   - `packages/tracking/`
   - `packages/inbound/`
   - `packages/webhook/`
   - `packages/scheduler/`

2. Compile findings into a comprehensive report

3. Save report to `reviews/[YYYY-MM-DD]-full-review.md`

## Output Format

Generate a full codebase review report:

```markdown
# Full Codebase Review: Mail Queue
**Date:** [Date]
**Reviewer:** Claude Code Review Agents

## Executive Summary
[Overall assessment of codebase health]

## Dashboard

### Overall Health Score: X/10

### Findings by Severity
| Severity | Count |
|----------|-------|
| Critical | X |
| High | X |
| Medium | X |
| Low | X |

### Findings by Agent
| Agent | Issues | Top Concern |
|-------|--------|-------------|
| Security | X | [Brief description] |
| Multi-Tenancy | X | [Brief description] |
| Performance | X | [Brief description] |
| Architecture | X | [Brief description] |
| API Design | X | [Brief description] |
| Technical Patterns | X | [Brief description] |

### Findings by Package
| Package | Critical | High | Medium | Low |
|---------|----------|------|--------|-----|
| api | X | X | X | X |
| worker | X | X | X | X |
| ... | | | | |

## Critical Issues (Immediate Action Required)
[Detailed list with file:line references]

## High Priority Issues
[Detailed list]

## Package-by-Package Review

### packages/api
[Detailed findings]

### packages/worker
[Detailed findings]

[... continue for each package ...]

## Recommendations

### Immediate Actions (This Sprint)
1. [Action item]
2. [Action item]

### Short-term (This Month)
1. [Action item]
2. [Action item]

### Long-term (Backlog)
1. [Action item]
2. [Action item]

## Comparison to Previous Review
[If previous review exists, compare findings]

## Appendix: Full Checklists
[All checklist results from all agents]
```

## When to Use

Use `/review-full` for:
- Quarterly codebase health checks
- Before major releases
- After significant architectural changes
- New team member onboarding
- Preparing for security audits

## Notes

- This is a comprehensive review and may take significant time
- Results are saved to `reviews/` directory for tracking
- Compare with previous reviews to track improvement
