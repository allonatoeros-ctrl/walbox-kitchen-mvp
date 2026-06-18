---
name: walbox-safe-ui-edit
description: Make a small, safe Walbox/Walrus UI edit with strict file scope and no backend/routing changes.
disable-model-invocation: true
---

# Walbox Safe UI Edit

## Mission

Apply a small UI-only change while protecting the stable Walbox/Walrus core.

## Use when

- UI polish
- layout fix
- spacing/color/font adjustment
- mobile visual fix
- component-level visual improvement

## Do not use when

- backend/API work
- routing changes
- Supabase/Spotify work
- state/localStorage logic changes
- feature expansion
- refactor

## Required input

The user must provide:

```text
target file(s)
specific visual goal
test path / route
```

If target files are not provided, ask for them or do a very small read-only file-location check.

## Hard rules

- Start with `git status`.
- Modify only the allowed file(s).
- No repo-wide scan unless explicitly approved.
- No refactor.
- No new dependencies.
- No backend/API/env changes.
- No routing changes.
- Stop if another file seems necessary.

## Default do not touch

```text
src/App.jsx
routes
hooks
data files
backend/API
localStorage logic
package.json
.env
Supabase/Spotify legacy core
```

## Output

1. Short plan
2. Changed files
3. What changed
4. What was not touched
5. Test steps
6. Residual risks
7. Recommended checkpoint
