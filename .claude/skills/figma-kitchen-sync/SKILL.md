---
name: figma-kitchen-sync
description: Read one Figma frame for Walbox Kitchen, extract a compact design spec, then implement only after context reset. Use for Figma-to-code work on Kitchen UI.
disable-model-invocation: true
---

# Figma Kitchen Sync — Walbox Safe Workflow

You are working on Walbox / Walrus Kitchen.

## Mission

Convert one selected Figma frame into high-fidelity code without wasting context or touching unrelated files.

## Hard rules

- Use Figma MCP only during Phase 1.
- Do not inspect the full repository during Phase 1.
- Do not edit code during Phase 1.
- Do not read sibling Figma frames or unrelated pages.
- Do not output raw Figma JSON or long layer dumps.
- After Phase 1, stop and tell the user to run `/clear` or `/compact`.
- Never continue directly from Figma extraction to code implementation in the same context unless the user explicitly overrides this.
- If the selected Figma node is ambiguous, stop and ask.

## Arguments

Use the URL or node passed by the user as the only Figma source.

If the argument contains `implement`, skip Phase 1 and run Phase 2 only.

---

# Phase 1 — Design Spec Extraction

Read only the linked Figma frame/node.

Create or update:

```text
docs/design/FIGMA_KITCHEN_CURRENT_SPEC.md
```

The spec must be compact and implementation-ready.

Include:

1. Frame name and purpose
2. Visual hierarchy
3. Layout structure
4. Typography tokens
5. Color tokens
6. Spacing, radius, shadow tokens
7. Components to implement
8. Assets/images/icons needed
9. Animations/interactions
10. Mapping to existing Walbox Kitchen files
11. Uncertainties / missing assets

Limits:

- Max 140 lines
- No raw Figma JSON
- No exhaustive layer dump
- No code changes
- No repo-wide scan

At the end of Phase 1, output exactly:

```text
PHASE 1 COMPLETE.
Saved design spec to docs/design/FIGMA_KITCHEN_CURRENT_SPEC.md.

STOP NOW.
Run /clear or /compact, then invoke:

/figma-kitchen-sync implement
```

---

# Phase 2 — Implementation From Local Spec

Only run this phase if the user argument contains `implement`.

Read only:

```text
docs/design/FIGMA_KITCHEN_CURRENT_SPEC.md
src/components/kitchen/CustomerKitchenMenu.jsx
src/components/kitchen/CustomerKitchenMenu.css
```

If the current spec targets another Kitchen screen, read only the matching pair of files explicitly named in the spec, then stop if uncertain.

## Task

Update only the target Kitchen page/component to match the design spec with maximum visual fidelity.

## Default allowed files

```text
src/components/kitchen/CustomerKitchenMenu.jsx
src/components/kitchen/CustomerKitchenMenu.css
```

## Possible allowed files only if named in the spec

```text
src/pages/CustomerOrderStatus.jsx
src/pages/CustomerOrderStatus.css
src/components/kitchen/KitchenStaffDashboard.jsx
src/components/kitchen/KitchenStaffDashboard.css
```

## Do not touch

```text
src/App.jsx
routes
hooks
data files
backend/API
localStorage logic
status page unless it is the explicit target
staff dashboard unless it is the explicit target
package.json
unrelated CSS
Supabase/Spotify legacy core
```

If another file is required, stop and ask.

## After implementation

Output:

1. Changed files
2. What changed
3. What was not touched
4. Exact manual test steps
5. Build result if build was run
6. Recommended micro-checkpoint

## Micro-checkpoint format

```text
FIGMA_SYNC_CHECKPOINT
- Frame read:
- Spec saved:
- File target:
- Files changed:
- Do not touch:
- Test:
- Next command:
```
