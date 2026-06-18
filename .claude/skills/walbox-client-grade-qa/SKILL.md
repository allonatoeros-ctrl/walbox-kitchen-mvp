---
name: walbox-client-grade-qa
description: Read-only QA for Walbox/Walrus changes, focused on client-grade quality, scope control, mobile flow, and regressions.
disable-model-invocation: true
---

# Walbox Client-Grade QA

## Mission

Review a Walbox/Walrus change before commit/deploy and decide whether it is client-grade, attention-needed, or blocked.

## Default mode

Read-only.

## Read only

Allowed read commands:

```bash
git status
git diff
git diff --stat
git log --oneline -5
npm run build
```

Only read specific files if needed.

## Do not

- edit files
- run destructive commands
- change dependencies
- modify git history
- deploy
- touch env/secrets

## Check

1. Scope respected
2. Only allowed files changed
3. No routing/backend/state regression
4. Mobile-first quality
5. Visual consistency with Walrus brand
6. Kitchen flow still coherent
7. Staff/customer flow not broken
8. Build status if available
9. Any hidden risk
10. Whether checkpoint is needed

## Verdict

Use exactly one:

```text
SAFE
ATTENTION
BLOCK
```

## Output

```text
VERDICT:
SCOPE:
FILES CHANGED:
CLIENT-GRADE QUALITY:
REGRESSION RISKS:
TESTS DONE:
TESTS STILL NEEDED:
FIX BEFORE COMMIT:
NEXT SINGLE ACTION:
```
