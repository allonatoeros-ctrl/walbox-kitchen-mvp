---
name: walbox-safe-ui-edit
description: Make safe Walbox/Walrus UI edits or run read-only audits before visual redesigns, with strict file scope and no backend/routing changes.
disable-model-invocation: true
---

# Walbox Safe UI Edit

## Mission

Protect the stable Walbox/Walrus app while preparing or applying UI changes.

This skill has two modes:

1. Read-only audit mode before UI redesign
2. Safe UI edit mode

Use read-only audit mode first when the UI is connected to logic, state, routing, alerts, localStorage, staff flow, or customer flow.

---

## Mode 1 — Read-only audit before UI redesign

### Use when

Use this mode before redesigning a screen or component such as:

* CustomerKitchenMenu
* CustomerOrderStatus
* KitchenStaffDashboard
* CustomerEntry
* Live TV / Poster TV
* request flow
* status timeline
* cart / drawer / CTA blocks

### Goal

Understand what logic must be preserved before visual redesign.

### Hard rules

* Read only the files explicitly listed by the user.
* Do not modify app code.
* Do not create files.
* Do not edit CSS.
* Do not run broad repo searches.
* Do not inspect unrelated files.
* Do not run Figma MCP.
* Do not run build unless explicitly requested.
* If another file is strictly required, stop and ask before reading it.
* Keep output concise and operational.

### Audit output

Return only:

1. Logic to preserve
2. Current data/state selection
3. How current state/status is computed or displayed
4. Purely visual blocks safe to redesign
5. Behavior-connected UI blocks to preserve carefully
6. Exact state keys / status keys if present
7. Side effects, alerts, vibration, CTA, navigation, bridge behavior
8. Minimal safe file list for future redesign
9. Risks to avoid
10. Recommended safe redesign approach without changing logic

### Do not

* Do not propose implementation yet.
* Do not rewrite components.
* Do not edit CSS.
* Do not change JSX.
* Do not stage.
* Do not commit.

---

## Mode 2 — Safe UI edit

### Use when

Use this mode for:

* UI polish
* layout fix
* spacing/color/font adjustment
* mobile visual fix
* component-level visual improvement
* Figma-spec implementation after audit

### Do not use when

Do not use this mode for:

* backend/API work
* routing changes
* Supabase/Spotify work
* state/localStorage logic changes
* feature expansion
* refactor
* database/schema changes
* package/dependency changes

### Required input

The user must provide:

* target file(s)
* specific visual goal
* test path / route
* mode: read-only audit OR safe UI edit

If target files are not provided, ask for them or do a very small read-only file-location check.

### Hard rules

* Start with git status.
* Modify only the allowed file(s).
* No repo-wide scan unless explicitly approved.
* No refactor.
* No new dependencies.
* No backend/API/env changes.
* No routing changes.
* Stop if another file seems necessary.
* Preserve existing behavior unless the user explicitly approves logic changes.

### Default do not touch

* src/App.jsx
* routes
* hooks
* data files
* backend/API
* localStorage logic
* package.json
* .env
* Supabase/Spotify legacy core

### Safe UI edit output

1. Short plan
2. Changed files
3. What changed
4. What was not touched
5. Test steps
6. Residual risks
7. Recommended checkpoint

---

## Recommended workflow

1. read-only audit
2. visual plan
3. safe UI edit
4. build / preview
5. client-grade QA
6. checkpoint
