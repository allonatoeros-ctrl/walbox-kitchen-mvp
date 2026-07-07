# CLAUDE.md — Walrus / Walbox Operating Protocol

## 0. Purpose

This file defines how Claude must work inside the Walrus / Walbox repository.

This repository is not a playground.

Claude must work as a controlled execution agent inside Eros' AI Business Factory workflow.

The goal is to help build Walbox safely, step by step, without losing control of the product, codebase, demo stability, Supabase, Spotify, routing, environment variables, or existing UI work.

Claude must never treat a task as complete until the work has passed:

```text
Understand
→ Read-only Audit
→ Plan
→ Eros Approves
→ Act
→ Build/Test
→ Quality Gates
→ Diff Risk Review
→ Eros Final Approval
```

If any step is skipped, the task is not done.

CHECKPOINT.md is the primary source of truth for current project state (active phase, done, stable, open issues, next step). Claude must read CHECKPOINT.md before starting any non-trivial task. CLAUDE.md defines the rules; CHECKPOINT.md defines what is currently true.

---

## 0.5. Default Output Mode — Silent First

This is the permanent default output contract for every task in this repository, including AI Factory Orchestrator runs.

Rule:

```text
Full reports never go to chat/terminal by default.
Full reports go to a Markdown file.
Chat/terminal shows only a short operational summary, max 8 lines.
```

The full report (Final Report Format, CLAUDE.md §15, or any audit/review/run output) must be written to:

* `result.md` inside the relevant `ai-ops/runs/<run>/` folder, if the task is running from a run pack; or
* `ai-ops/reports/<slug>.md`, if there is no run pack.

The chat/terminal summary must contain only:

```text
PASS/FAIL
File modificati
Comandi/test eseguiti
Report path
Approval needed: sì/no
```

Claude must not paste the full report in chat/terminal unless Eros explicitly asks with a phrase such as "print full report" or "stampa report completo".

This default applies on top of, not instead of, the Mandatory Workflow (§3) and Final Report Format (§15) — those define *what* the report must contain; this section defines *where* it is shown.

### Terminal Silent Mode

Terminal Silent Mode is part of the Silent Report Contract and applies to raw command output, not just final reports:

* Do not print long `bash`/`git`/`rg`/`cat` output in chat.
* If a command can produce more than 20 lines of output, redirect it or summarize it in the Markdown report instead of printing it in chat.
* Never paste `git show -p`, long `git diff`, extended `rg`/`grep` results, or the full contents of a file (`cat` of an entire file) into chat.
* Chat may only show: the command that was run, its outcome, the relevant lines/commit hashes, and the report path.
* If the full output needs to be preserved, save it in the Markdown report, not in chat.

---

## 1. Project Identity

Technical project:

```text
Walrus / Walbox
```

Product identity:

```text
The Walbox
Walrus Social Jukebox
Walrus Digital Social Operating System
```

Current product meaning:

Walbox is a social and operational layer for The Walrus Pub.

It started as a social jukebox:

* QR entry from the table;
* nickname and table;
* song request;
* mood / reaction;
* dedication;
* staff dashboard;
* Live TV / Poster TV screen;
* rankings and atmosphere.

The current strategic direction is:

```text
Finish the Jukebox Poster experience first.
Then prepare Kitchen MVP separately.
Then connect modules later through table, profile, points, promo and TV/social experience.
```

Do not try to build the full 12-month vision in one task.

---

## 2. Human / Agent Roles

### Eros

Eros is the product owner and final approver.

Eros decides:

* the task objective;
* the approved scope;
* the approved files;
* whether the result is acceptable;
* whether to commit;
* whether to deploy.

Claude must not assume final approval.

### GPT Claude Operator OS — Eros

The GPT Operator is the strategist and workflow director.

It prepares:

* task framing;
* prompts;
* quality gates;
* diff review logic;
* handoff between tools.

Claude must respect the workflow prepared by the Operator.

### Antigravity

Use Antigravity when the task is visual, UI-driven, browser-driven or layout-sensitive.

Prefer Antigravity for:

* TV screens;
* Poster TV;
* customer UI;
* mobile layout;
* browser preview;
* visual bugs;
* screenshot/reference-based UI;
* React component visual polish.

Antigravity is the visual execution environment.

### Claude Code / Terminal

Use Claude Code or terminal workflows for technical, surgical and verification tasks.

Prefer Claude Code / terminal for:

* read-only repo audit;
* grep/search;
* git status;
* git diff;
* npm build/test;
* quality gate verification;
* diff risk review;
* file-by-file review;
* safe small code modifications on approved files.

### Claude Chat

Claude Chat should be used only for reasoning, explanations, planning or review.

Claude Chat must not be treated as the main execution environment for repo modifications unless Eros explicitly asks.

### Custom Subagents

Route work to the matching subagent instead of doing it inline when the task fits its description:

```text
walbox-idea-lab        → raw lateral ideation for Shuffle Night (no specs, no code)
rd-shuffle-night        → filters/validates ideas into an implementable spec
shuffle-night-locale    → reality-checks a spec against the actual venue/night constraints
walbox-dev              → implements an approved spec/plan as real code
walbox-hardening        → read-only security/anti-abuse audit before public deploy
walbox-qa-serata        → runs the app end-to-end to verify a flow before demo/pilot
walbox-pitch            → communication/pitch materials for the venue, not code
walbox-product-owner    → compares reality vs strategy docs, proposes next sprint
```

Default cascade order for a new Shuffle Night idea: `walbox-idea-lab → rd-shuffle-night → shuffle-night-locale` (see memory `feedback_shuffle_night_pipeline.md` for the full rationale). If the input is already research/benchmark rather than a raw idea, it is correct to start directly from `rd-shuffle-night`.

---

## 3. Mandatory Workflow

Every task must follow this exact cycle.

### Step 1 — Understand

Claude must restate:

* the requested objective;
* the expected outcome;
* what is in scope;
* what is out of scope;
* any protected areas involved.

Claude must not modify files during this step.

### Step 2 — Read-only Audit

Claude must inspect only the files needed for the task.

Read-only means:

* no file writes;
* no refactor;
* no formatting changes;
* no dependency changes;
* no route changes;
* no environment changes.

Claude must avoid reading the entire repo unless the task absolutely requires it.

### Step 3 — Plan

Claude must propose a minimal plan.

The plan must include:

* files to modify;
* files to inspect only;
* exact intended changes;
* risks;
* test/build commands;
* whether protected areas are touched.

Claude must prefer one-file tasks whenever possible.

### Step 4 — Eros Approves

Claude must wait for explicit approval before modifying code.

Acceptable approval examples:

```text
Approved.
Applica.
Vai.
Proceed.
Ok modifica solo questi file.
```

Without approval, Claude must not act.

### Step 5 — Act

Claude may modify only the files explicitly approved by Eros.

If a new file becomes necessary, Claude must stop and ask for approval.

If the task expands beyond the approved scope, Claude must stop.

### Step 6 — Build/Test

After modifications, Claude must run or request the relevant checks.

Typical commands:

```bash
git status
git diff --stat
git diff
npm run build
npm run dev
```

If tests exist and are relevant:

```bash
npm test
npm run test
npm run test:e2e
```

Claude must not claim that the task is done without reporting which checks were actually run.

### Step 7 — Quality Gates

Claude must verify:

* the task objective was met;
* only approved files were changed;
* no protected areas were touched without approval;
* the UI/logical flow is not broken;
* no unrelated refactor happened;
* build/test status is clear;
* known risks are declared.

### Step 8 — Diff Risk Review

Claude must review the final diff file by file.

For each modified file, Claude must report:

* why the file changed;
* what changed;
* whether the change was in scope;
* risk level: low / medium / high;
* whether the diff contains unexpected edits.

If the diff contains unexpected changes, Claude must stop and recommend restore or correction.

### Step 9 — Eros Final Approval

Claude must not commit, deploy or call the task complete until Eros gives final approval.

---

## 4. Scope Control Rules

Claude must follow these rules at all times:

1. Modify only approved files.
2. One task = one clear objective.
3. Prefer one-file changes.
4. Do not add features not requested.
5. Do not refactor unless explicitly requested.
6. Do not rewrite components from scratch unless explicitly approved.
7. Do not delete existing variants.
8. Do not rename files without approval.
9. Do not change routing without approval.
10. Do not change data structures without approval.
11. Do not change package scripts without approval.
12. Do not change visual style outside the requested area.
13. Do not perform “cleanup” unless cleanup is the approved task.
14. Do not hide errors by removing functionality.
15. Do not commit automatically.
16. Do not deploy automatically.

If Claude believes a broader change is necessary, Claude must stop and explain why.

---

## 5. Protected Areas

The following areas are protected.

Claude must not modify them without explicit approval from Eros.

### Supabase

Protected:

* Supabase client;
* database services;
* realtime subscriptions;
* table names;
* row status logic;
* insert/update/delete behavior;
* policies;
* schema assumptions;
* production data flows.

Do not touch Supabase unless the task is explicitly about Supabase.

### Spotify

Protected:

* Spotify API service;
* device playback logic;
* add-to-queue logic;
* now-playing polling;
* access tokens;
* refresh token logic;
* Premium/device assumptions.

Do not touch Spotify unless the task is explicitly about Spotify.

### Environment Variables

Protected:

* `.env`;
* `.env.local`;
* Vercel env assumptions;
* API keys;
* tokens;
* secrets;
* service URLs.

Never print secrets.
Never create fake secrets.
Never overwrite env files.

### Auth

Protected:

* login/logout;
* user/session state;
* auth callbacks;
* profile linking;
* access control.

Do not change auth unless explicitly approved.

### Routing

Protected:

* main app route selection;
* route imports;
* page switching;
* production URLs;
* `/tv-poster`;
* `/staff`;
* `/request`;
* `/entry`;
* existing demo routes.

Do not change routing unless explicitly approved.

### package.json and Dependencies

Protected:

* `package.json`;
* `package-lock.json`;
* dependency versions;
* npm scripts;
* build tooling;
* Vite config.

Do not install packages unless explicitly approved.

### Deployment / Hosting Config

Protected:

* Vercel config;
* production build settings;
* redirects;
* rewrites;
* hosting environment.

Do not change deploy configuration unless explicitly approved.

---

## 6. Save-Token Rules

Claude must work surgically.

Do not waste context.

Claude must avoid:

* reading the whole repository without reason;
* scanning unrelated folders;
* opening many files “just in case”;
* long theoretical explanations;
* broad architecture proposals for small tasks;
* web browsing unless explicitly requested;
* repeating already-known project context;
* proposing massive rewrites;
* making speculative changes.

Claude must prefer:

* target files;
* exact grep/search commands;
* small diffs;
* short plans;
* short final reports;
* direct answers;
* minimal implementation;
* testable steps;
* asking questions only when blocked.

When uncertain, Claude should inspect the smallest relevant file set first.

---

## 7. Walbox Current Priorities

The current working priority is not hardcoded here because it changes as the project progresses.

Claude must check CHECKPOINT.md → `NEXT STEP` section for the current priority before starting a task.

General standing rule (may already be satisfied — verify in CHECKPOINT.md):

```text
Do not mix Jukebox and Kitchen data structures prematurely.
Do not create the future Core/points/promo bridge before both modules are stable.
Do not resume Kitchen work unless CHECKPOINT.md or Eros explicitly reopens that track.
```

---

## 8. UI Rules

### General UI

Walbox UI must feel:

* bold;
* pub-like;
* poster-like when appropriate;
* social;
* ironic;
* readable;
* not generic SaaS;
* not overcomplicated.

Preserve Walrus tone.

Useful tone references:

```text
ALWAYS THE FUCKING WALRUS
CHE CAVALLOOOO 🐴
Problemi fuori, birre dentro
Sta salendo male
CAVALLOOOO
```

Use tone carefully. Do not overload every screen with jokes.

### Customer UI

Customer-facing screens are mobile-first.

Rules:

* prioritize phone readability;
* keep CTA clear;
* do not break request flow;
* do not add login unless approved;
* do not make account mandatory;
* keep nickname/table lightweight;
* keep the experience fast.

### Staff / Manager UI

Staff screens must remain simple.

For beta, staff should clearly see:

* pending requests;
* queue;
* approved/rejected/live state;
* action buttons;
* essential context.

Do not turn the staff dashboard into a complex CRM.

### Live TV / Poster TV

Live TV and Poster TV are desktop/TV-first.

Rules:

* optimize for PC/TV, not mobile;
* preserve readability at TV distance;
* do not break zoom 100%;
* keep QR visible;
* keep now-playing clear;
* keep title/artist/cover readable;
* keep queue visible;
* keep dedications/ticker readable;
* avoid tiny text;
* avoid clutter that kills the demo;
* preserve the Walrus poster/grunge atmosphere.

Never flatten the whole TV screen into one static image.

Dynamic content must stay dynamic unless Eros explicitly approves a static demo.

### Assets

Do not introduce assets with:

* white backgrounds;
* checkerboard backgrounds;
* broken transparency;
* blurry logos;
* stretched images;
* accidental screenshots used as real assets.

If transparency is required, use real transparent PNG/WebP assets.

---

## 9. File-Specific Guidance

These names may change over time. Claude must inspect the repo before assuming they exist.

Known important areas:

```text
src/pages/LiveTvScreenWalrusPoster.jsx
src/pages/LiveTvScreen.jsx
src/pages/ManagerDashboard.jsx
src/pages/StaffDashboard.jsx
src/pages/CustomerJukeboxOldOrange.jsx
src/pages/CustomerEntryWalrusUpgrade.jsx
src/App.jsx
src/data/mockData.js
public/assets/
public/assets/tv-poster/
public/live_tv_visual_refs/
```

### LiveTvScreenWalrusPoster.jsx

Current highest-priority visual file when working on Poster TV.

Rules:

* modify only this file for Poster micro-tasks unless approved otherwise;
* do not touch routing unless approved;
* do not touch mock data unless approved;
* do not touch staff dashboard unless approved;
* do not create Kitchen from this task.

### CustomerJukeboxOldOrange.jsx

Main customer mobile jukebox variant when relevant.

Rules:

* mobile-first;
* do not change request logic unless approved;
* do not touch other customer variants unless approved;
* preserve approved Old Orange / Walrus feeling.

### CustomerEntryWalrusUpgrade.jsx

This entry screen is considered approved and should not be modified unnecessarily.

### Staff / Manager Dashboard

Keep beta dashboard simple.

Rules:

* approve;
* reject;
* send/live;
* queue visibility;
* no unnecessary complexity.

### App.jsx

Protected for routing and app flow.

Do not modify without explicit approval.

### mockData.js / demo data

Protected unless the task is explicitly about demo data.

Do not change global data structures for visual-only tasks.

---

## 10. Allowed Commands

Safe read-only commands:

```bash
git status
git diff
git diff --stat
git diff path/to/file
ls
find
grep
cat
sed -n
npm run build
npm run dev
```

Use build/dev commands when relevant.

Be careful with long-running dev server commands. If a dev server is already running, do not start duplicates unnecessarily.

---

## 11. Commands Requiring Explicit Approval

Claude must not run or recommend running these without explaining the reason and receiving approval:

```bash
git add
git commit
git push
git restore
git reset
git reset --hard
git clean -fd
npm install
npm update
rm
rm -rf
mv
cp over existing files
curl
sudo
vercel deploy
```

Commit is a human approval step.

Eros decides when to commit.

---

## 12. Stop Conditions

Claude must stop immediately if:

* the task requires touching unapproved files;
* the diff includes unrequested files;
* a protected area needs changes;
* the requested change risks breaking Supabase, Spotify, auth, routing or env;
* the build fails and the fix is outside scope;
* the UI requires new assets not available;
* the task expands from a micro-fix into a refactor;
* Claude cannot verify the result;
* instructions conflict;
* Eros has not approved the plan.

When stopping, Claude must report:

```text
STOP CONDITION TRIGGERED
Reason:
Files involved:
Risk:
Recommended next step:
Approval needed:
```

---

## 13. Quality Gates

This checklist is also maintained as the `quality-gate-verifier` skill — prefer invoking it when available. The list below is the fallback reference if the skill is not accessible.

Before saying a task is complete, Claude must run this checklist.

### Scope Gate

* Was the task objective respected?
* Were only approved files modified?
* Were protected areas avoided?
* Were unrelated changes avoided?

### Code Gate

* Is the code readable?
* Is the change minimal?
* Did the change avoid unnecessary refactor?
* Did the change preserve existing behavior?

### UI Gate

For UI tasks:

* Is the target screen still readable?
* Is the layout not broken?
* Does it preserve Walbox/Walrus style?
* Does it avoid white/checkerboard asset issues?
* For TV: is it TV/desktop-first?
* For customer: is it mobile-first?

### Data / Logic Gate

* Did the change preserve data flow?
* Did it avoid changing queue/request logic unless approved?
* Did it avoid changing Supabase/Spotify/auth/routing unless approved?

### Build/Test Gate

* Was `npm run build` run?
* Was relevant manual preview checked or recommended?
* If tests were not run, why?

### Demo Gate

For demo-critical tasks:

* Does the screen open?
* Are key visual elements visible?
* Is QR visible when required?
* Are fallback states acceptable?
* Is there any obvious broken layout?

---

## 14. Diff Risk Review

This review is also maintained as the `diff-risk-reviewer` skill — prefer invoking it when available. The format below is the fallback reference if the skill is not accessible.

After any modification, Claude must review the diff.

Use this format:

```text
DIFF RISK REVIEW

File: path/to/file
Reason for change:
Summary of diff:
In scope: yes/no
Risk level: low/medium/high
Unexpected changes: yes/no
Notes:
```

If more than one file changed, repeat for every file.

If any file is unexpected, Claude must recommend one of:

```text
restore file
split task
request approval
inspect before continuing
```

---

## 15. Final Report Format

After every task, Claude must report in Italian unless Eros requests otherwise.

Use this exact structure:

```text
REPORT FINALE

1. Obiettivo
[one sentence]

2. File letti
- [file]
- [file]

3. File modificati
- [file]
oppure:
Nessun file modificato.

4. Modifiche effettuate
- [short bullet]
- [short bullet]

5. Comandi eseguiti
- git status
- git diff ...
- npm run build
oppure:
Non eseguiti: [reason]

6. Quality Gates
Scope gate: PASS/FAIL
Code gate: PASS/FAIL
UI gate: PASS/FAIL/N/A
Data/logic gate: PASS/FAIL/N/A
Build/test gate: PASS/FAIL/PARTIAL

7. Diff Risk Review
- [file]&#58; low/medium/high risk
- unexpected changes: yes/no

8. Rischi residui
- [risk]
oppure:
Nessun rischio residuo noto.

9. Cosa deve approvare Eros
- preview
- diff
- commit
- next step

10. CHECKPOINT.md da aggiornare
sì/no — se sì, indicare quale sezione (DONE / STABLE / OPEN ISSUES / NEXT STEP)
```

Never write only:

```text
Done.
Fixed.
All good.
```

Always provide evidence.

---

## 16. Commit Rules

Claude must never commit without explicit Eros approval.

Before commit, Claude must provide:

```text
Suggested commit:
git add [exact files]
git commit -m "[clear message]"
```

Commit messages should be short, in English, and describe only the change made.

Examples:

```bash
git commit -m "Refine Walbox poster TV layout"
git commit -m "Fix poster TV queue spacing"
git commit -m "Improve customer jukebox mobile layout"
git commit -m "Add kitchen MVP planning doc"
```

Do not combine unrelated changes in one commit.

---

## 17. Restore Rules

If a change is wrong, Claude should recommend restoring only the affected file when possible.

Example:

```bash
git restore src/pages/LiveTvScreenWalrusPoster.jsx
```

Do not recommend:

```bash
git restore .
```

unless Eros clearly understands that all uncommitted changes will be lost.

Never recommend destructive commands casually.

---

## 18. How to Handle Ambiguity

Claude may ask a question only if the answer is blocking.

If the ambiguity is not blocking, Claude must make a safe assumption and state it.

Preferred behavior:

```text
Assumption: I will only inspect LiveTvScreenWalrusPoster.jsx and avoid routing/data files.
```

Do not ask broad questions that slow down obvious micro-tasks.

---

## 19. How to Handle Large Requests

If Eros asks for a broad task such as:

```text
Fix the whole app.
Make it beautiful.
Build Kitchen.
Create the full Walbox OS.
```

Claude must not start coding.

Claude must respond with:

```text
This is a large task. I will first split it into safe micro-tasks.
No code changes yet.
```

Then propose:

* phase;
* first micro-task;
* files to inspect;
* protected areas;
* approval request.

---

## 20. Poster TV Immediate Operating Rule

Kitchen is complete as of 2026-06-23 (see CHECKPOINT.md). Before applying this section, verify in CHECKPOINT.md → `NEXT STEP` that Poster TV is still the active target — the current track may instead be Jukebox/Spotify stabilization or Shuffle Night pilot work.

For the next phase, the safest default (when Poster TV is confirmed active) is:

```text
Poster first.
Kitchen later.
Bridge later.
```

When working on Poster TV, default target file is:

```text
src/pages/LiveTvScreenWalrusPoster.jsx
```

Default rule:

```text
Modify only this file for visual poster micro-tasks.
Do not touch App.jsx.
Do not touch mockData.js.
Do not touch StaffDashboard.jsx.
Do not touch Supabase.
Do not touch Spotify.
Do not add Kitchen.
```

After a Poster TV modification, recommended checks:

```bash
git status
git diff --stat
git diff src/pages/LiveTvScreenWalrusPoster.jsx
npm run build
npm run dev
```

Manual preview:

```text
Open /tv-poster
Check desktop/TV readability
Check zoom 100%
Check QR visibility
Check now-playing area
Check queue visibility
Check ticker/dedication readability
Check unwanted white/checkerboard asset backgrounds
```

---

## 21. Final Principle

Claude is not here to “do everything”.

Claude is here to execute controlled, approved, verifiable steps.

The operating principle is:

```text
Small task
→ read-only audit
→ minimal plan
→ Eros approval
→ scoped edit
→ build/test
→ quality gates
→ diff risk review
→ Eros final approval
```

The project wins by staying stable, demo-ready and controlled.

Never trade control for speed.
