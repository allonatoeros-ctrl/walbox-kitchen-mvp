# ANTIGRAVITY_DOCS_NOTES.md

## 1. Purpose

This file summarizes how Antigravity should be used for the **Walbox From Zero V2** project.

Walbox should not be developed by giving vague prompts such as:

```text
Improve everything.
Make the app better.
Build the whole platform.
```

Antigravity must be used as a controlled execution layer:

```text
ChatGPT = strategy, roadmap, product framing, prompts, quality control
Claude / Gemini inside Antigravity = code execution, analysis, review, implementation
Git = safety checkpoint
Docs = project memory
```

The current project is:

```text
walbox-from-zero-v2
```

Not the older `walrus-social-jukebox` project.

---

## 2. Current strategic context

Walbox started as a **social jukebox / live TV experience** for The Walrus Pub.

Original core idea:

- customer enters through QR;
- selects song / mood / dedication;
- manager moderates requests;
- TV poster screen creates atmosphere;
- the local gets live social content.

After the latest Walrus meeting, the project expanded.

The client wants Walbox to become a broader digital system for:

- jukebox digital experience;
- interactive menu;
- QR table orders;
- kitchen/staff order screen;
- phone notification/vibration/sound when the order is ready;
- combo promo panino + beer + fries;
- loyalty points;
- drink list and cocktail of the day/month;
- merchandising;
- events such as quizzone, Fantacalcio, Fantasanremo;
- website and booking in the future;
- social contests;
- possible bridge between bar and restaurant.

The immediate priority is not to build everything at once.

The immediate priority is:

```text
1. Finish the Poster Jukebox and make it activable.
2. Create a separate Kitchen MVP for QR menu/orders.
3. Later connect Jukebox and Kitchen through table, customer profile, points, promo, TV and social experience.
```

---

## 3. Product architecture

Walbox should be treated as a modular system.

### Walbox Jukebox

Purpose:

- social experience;
- music requests;
- moods/reactions/dedications;
- poster TV screen;
- manager moderation.

This is the “wow” layer.

### Walbox Kitchen

Purpose:

- QR table menu;
- customer order flow;
- staff/kitchen dashboard;
- order statuses;
- customer phone alert when ready.

This is the immediate operational layer for the new sandwich kitchen.

### Walbox Core

Purpose:

- table identity;
- nickname / lightweight profile;
- points;
- promo;
- rewards;
- bridge between modules.

### Walbox Events & Social

Purpose:

- quizzone;
- Fantacalcio;
- Fantasanremo;
- social contests;
- TV moments;
- content for Instagram / social media manager.

### Walbox Merch & Website

Future layer:

- merch catalog;
- stock-aware promo;
- online merch sales;
- website refresh;
- booking.

---

## 4. Development principles

### Do not build everything together

The client vision is broad, but implementation must be sequential.

Correct order:

```text
module -> build -> test -> commit -> demo -> next module
```

Wrong order:

```text
jukebox + kitchen + points + merch + website + booking + events all together
```

### Keep Jukebox and Kitchen separate at first

For the next phase, Jukebox and Kitchen should be separate modules.

They can share brand, table concept, customer nickname and future points.

They should not be tangled too early.

### Protect existing working flows

Do not break working Jukebox, TV, dashboard or app routing when adding Kitchen.

Do not refactor the whole app unless explicitly requested.

### Use demo/local state first when appropriate

For the first Kitchen MVP, it is acceptable to use demo data, localStorage or simple state.

Do not start with payments, full backend, fiscal systems, printer integrations or native apps.

---

## 5. Model usage

### Gemini Flash / Flash Medium

Use for:

- small UI edits;
- copy changes;
- spacing;
- styling;
- simple component polish;
- one-file changes.

### Gemini Pro / Pro High

Use for:

- architecture;
- module separation;
- multi-file planning;
- new feature design;
- data flow analysis;
- before implementing Kitchen MVP.

### Claude Sonnet Thinking

Use for:

- careful review;
- app structure analysis;
- checking if the plan makes sense;
- debugging when Gemini is too aggressive;
- comparing current app with strategy files.

Claude should first act as reviewer, not bulldozer.

---

## 6. Safe Antigravity workflow

Before any code change:

```bash
git status
```

If files are already modified:

```bash
git diff
```

Do not modify new files on top of unclear existing changes.

For review prompts:

```text
Do not modify code.
Do not create files.
Do not run implementation.
Return only analysis and recommended next step.
```

For implementation prompts:

```text
Modify only the listed files.
Do not touch other modules.
Do not change routing unless explicitly requested.
Do not add extra features.
At the end, list the modified files.
```

After each Antigravity change:

```bash
git status
git diff
npm run build
```

Commit only if the diff is clear and build passes.

Example commit:

```bash
git add <files>
git commit -m "Add Kitchen MVP planning docs"
```

If the change is wrong:

```bash
git restore <file>
```

---

## 7. What must remain untouched unless explicitly requested

During the next review/planning phase, do not modify:

- Jukebox working flow;
- Poster TV version;
- current app routing;
- dashboard logic;
- demo data structure;
- styling system;
- any Supabase/Spotify logic if present;
- package dependencies.

The first Claude/Antigravity pass should be **review only**.

---

## 8. First Claude / Antigravity init goal

The next Claude session should read:

```text
docs/walbox-strategy/WALBOX_FULL_VISION_AND_CLIENT_ALIGNMENT.md
docs/walbox-strategy/WALBOX_PROJECT_CONTEXT.md
docs/walbox-strategy/ANTIGRAVITY_WORKFLOW.md
docs/walbox-strategy/WALBOX_PROMPT_LIBRARY.md
docs/walbox-strategy/ANTIGRAVITY_DOCS_NOTES.md
```

And inspect the app structure only as needed.

It should not modify code.

Expected output:

1. what already exists and can be reused;
2. what should remain untouched;
3. recommended module separation;
4. safest first implementation step;
5. risks if too much is built at once;
6. which files should be inspected next before coding.

---

## 9. First implementation priority after review

Do not start with the full Kitchen system.

The recommended implementation order is:

```text
1. Finish / stabilize Poster Jukebox.
2. Create Kitchen MVP as a separate area.
3. Add customer order flow.
4. Add staff/kitchen order dashboard.
5. Add order statuses.
6. Add customer ready alert: popup + vibration + sound if browser allows.
7. Later connect table/profile/points/promo.
```

---

## 10. Final rule

Walbox must become a big system through small safe steps.

The client vision is broad, but the build process must stay narrow and controlled.

```text
Vision: full Walrus digital/social/operational OS.
Execution: one module at a time.
Immediate priority: Poster Jukebox + Kitchen MVP.
```
