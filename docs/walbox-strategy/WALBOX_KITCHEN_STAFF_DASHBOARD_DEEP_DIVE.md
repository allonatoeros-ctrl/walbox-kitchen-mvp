# WALBOX KITCHEN STAFF DASHBOARD DEEP DIVE

**Project:** Walbox / Walrus Social Jukebox / Walrus Digital OS  
**Client:** The Walrus Pub  
**Module:** Walbox Kitchen / Staff Dashboard  
**Purpose:** Define the product and UX direction for a professional, functional staff dashboard inspired by real Kitchen Display System (KDS), expeditor screens and restaurant order workflows.

---

## 1. Executive Summary

The Walbox Staff Dashboard must not feel like a generic admin panel.

It must work like a lightweight **Kitchen Display System + Expeditor Screen + Phone Pager Control** for The Walrus Pub.

The goal is to improve real staff work:

- make incoming orders immediately visible;
- reduce mistakes in food preparation;
- make kitchen notes impossible to miss;
- show order age and urgency;
- let staff advance order status quickly;
- handle high-volume moments without endless scrolling;
- call the customer when the order is ready;
- keep the UI professional, readable and reliable.

The dashboard must answer the staff's real questions in seconds:

```text
What order is this?
How long has it been waiting?
What do I need to prepare?
Is there an important note?
What is the next action?
Is it ready to call the customer?
```

---

## 2. Product Positioning

Walbox started as a social jukebox and live TV experience.

After the latest Walrus client meeting, Walbox expanded into a wider digital operating system for the venue:

```text
Jukebox + Kitchen + Points + Promo + Events + Merch + Social Experience = Walbox
```

The Kitchen module is urgent because the venue is opening a sandwich kitchen and may not rely on classic table service.

The simplest and strongest MVP pitch is:

> Instead of giving the customer a physical vibrating pager, Walbox uses the customer's phone. The customer orders from QR, staff sees the order, staff marks it ready, and the customer's phone alerts them.

The Staff Dashboard is therefore not a secondary admin page. It is the operational heart of the Kitchen MVP.

---

## 3. Reference Model: Lightweight KDS

A real Kitchen Display System usually replaces paper tickets or printed order slips with digital tickets.

Important KDS concepts to translate into Walbox:

- digital tickets;
- real-time incoming orders;
- order status;
- preparation timer;
- kitchen notes and modifiers;
- station or workflow routing;
- order ageing and urgency;
- fulfillment actions;
- expeditor or pass screen;
- production item counts / all-day view.

Walbox does not need a full enterprise KDS now.

Walbox needs a practical MVP version:

```text
Received → Preparing → Ready → Delivered / Cancelled
```

---

## 4. Core UX Principle

The dashboard must optimize for action, not decoration.

Every visible element must answer at least one of these questions:

```text
Does this help staff prepare the order?
Does this reduce the risk of an error?
Does this help staff decide priority?
Does this help staff call or deliver the order?
Does this help the manager understand current workload?
```

If the answer is no, the element should not be in the main operational view.

---

## 5. Main Dashboard Structure

Recommended layout for desktop/tablet:

```text
┌────────────────────────────────────────────────────────────┐
│ WALBOX STAFF · Cucina Panini      4 active · avg 8 min     │
├────────────────────────────────────────────────────────────┤
│ NOW TO PREPARE: 8 Smash · 5 Chicken · 4 Fries · 3 Beers    │
├───────────────┬────────────────────┬───────────────────────┤
│ RECEIVED      │ PREPARING          │ READY TO CALL          │
│ 2 orders      │ 3 orders           │ 1 order                │
│               │                    │                       │
│ [order card]  │ [order card]       │ [ready card]           │
│ [order card]  │ [urgent card]      │                       │
└───────────────┴────────────────────┴───────────────────────┘
```

Secondary history can be compressed below or hidden behind a filter:

```text
Delivered / Cancelled
```

Do not make delivered/cancelled orders compete visually with active orders.

---

## 6. Header Requirements

The header must be operational, not decorative.

Recommended information:

```text
WALBOX STAFF · Cucina Panini
4 active · 1 ready · average wait 8 min · last order 30s ago
```

Optional indicators:

- Live / updated now;
- service mode;
- total orders today;
- average preparation time.

Avoid oversized decorative headers. Staff needs vertical space for orders.

---

## 7. All-Day View / Production Summary

This is one of the most important professional features.

Add a compact production summary above the status columns:

```text
NOW TO PREPARE
8× Smash Burger · 5× Chicken Burger · 4× Fries · 3× Krombacher
```

Purpose:

- reduce the need to read every ticket one by one;
- help kitchen understand total workload;
- help batch preparation;
- make the dashboard feel like a serious operational tool.

MVP rule:

- compute this only from active orders;
- include orders with status `received` and `preparing`;
- exclude `ready`, `delivered`, and `cancelled` unless there is a specific reason.

---

## 8. Order Statuses

Use these MVP statuses:

```text
received    → Ricevuto
preparing   → In preparazione
ready       → Pronto da chiamare
delivered   → Consegnato
cancelled   → Annullato
```

Recommended main columns:

```text
Ricevuti | In preparazione | Pronti da chiamare
```

Recommended secondary area:

```text
Consegnati / Annullati
```

---

## 9. Order Card: Standard Version

A normal order card should be compact and action-focused.

Recommended structure:

```text
#104 · TAVOLO 7
Eros · 8 min fa

2× Smash Burger
1× Fries
1× Krombacher

NOTA CUCINA
Senza cipolla. Salsa a parte.

[PREPARA]
```

Required visible fields:

- order number or short id;
- table number;
- customer nickname/name;
- order time or elapsed time;
- compact item summary;
- kitchen note if present;
- one primary action button.

Optional fields:

- total number of items;
- status badge;
- priority indicator;
- detail button.

Do not show prices in the kitchen view.

---

## 10. Order Card: Long Order Version

Long orders must not create infinite vertical cards.

For orders with more than 6 items, use a compact summary:

```text
#108 · TAVOLO 3
Gruppo Marco · 11 min fa

20 item
8× Smash · 6× Chicken · 6× Fries
3 note cucina

[APRI DETTAGLIO] [SEGNA PRONTO]
```

Detailed item list should appear only on demand:

- drawer;
- modal;
- expandable panel;
- secondary detail view.

Rule:

```text
Default view = decision summary
Detail view = preparation detail
```

---

## 11. Kitchen Notes and Modifiers

Kitchen notes are critical.

They must be visually impossible to miss.

Examples:

```text
NOTA CUCINA
Senza cipolla
```

```text
ALLERGIA / ATTENZIONE
No lattosio
```

Visual rules:

- highlight notes with a strong visual block;
- place notes before the primary action;
- never hide important notes only inside detail view;
- if multiple notes exist, show a warning count in compact view.

Do not treat kitchen notes like normal secondary text.

---

## 12. Timer and Urgency

Every active order needs a visible elapsed timer.

Recommended urgency thresholds for MVP:

```text
0–5 min      normal
6–10 min     attention
11–15 min    urgent
15+ min      critical
```

Visual treatment:

- normal: calm visual state;
- attention: stronger timer color or badge;
- urgent: strong border or status highlight;
- critical: very visible but not chaotic.

Avoid constant blinking or excessive animation.

The goal is priority awareness, not panic.

---

## 13. Primary Actions

Each card should have one dominant next action based on status.

Recommended actions:

```text
received  → PREPARA
preparing → PRONTO
ready     → CONSEGNATO
```

Secondary actions:

```text
ANNULLA
APRI DETTAGLIO
```

Button rules:

- primary action must be large;
- recommended height: 48–56px;
- full-width or highly visible;
- avoid tiny icons for critical actions;
- avoid multiple equal-weight buttons.

---

## 14. Ready-to-Call Zone

The `ready` column is not just a final status.

It is the phone pager control zone.

When an order becomes ready:

- staff should clearly see that the customer must be called/notified;
- the customer-facing status screen should show a ready popup;
- browser vibration can be triggered if supported;
- sound can be used only where browser permissions allow it.

Walrus-style customer message example:

```text
CAVALLOOOO 🐴 Il tuo ordine è pronto. Vieni a ritirarlo al banco.
```

Staff-side label:

```text
PRONTO DA CHIAMARE
```

---

## 15. Color System

Colors must be semantic.

Recommended meaning:

```text
received    neutral / dark
preparing   yellow / orange
ready       green
urgent      red / strong warning
notes       yellow warning block
cancelled   muted / danger but secondary
```

Do not use many decorative colors.

Do not make all cards visually equal.

The staff must understand status at a glance.

---

## 16. Information Hierarchy

Priority order inside the card:

```text
1. Order id / table
2. Elapsed time / urgency
3. Customer nickname
4. Item summary
5. Critical notes
6. Primary action
7. Secondary action / details
```

Things that should not be prominent in kitchen view:

- prices;
- marketing descriptions;
- long product descriptions;
- loyalty points;
- promo explanations;
- decorative slogans;
- customer social features.

Those can exist elsewhere, not in the kitchen operational view.

---

## 17. Empty States

Each column needs a useful empty state.

Examples:

```text
No new orders.
```

```text
Nothing currently in preparation.
```

```text
No orders ready to call.
```

Avoid big illustrations or empty decorative panels that waste space.

---

## 18. High-Volume Behavior

The dashboard must still work with 20 active orders.

Rules:

- no single vertical list of huge cards;
- columns must scroll independently if needed;
- cards must be compact by default;
- long orders must summarize;
- all-day view must show total item counts;
- delivered/cancelled orders must not occupy primary space;
- staff must be able to identify urgent orders without scanning everything manually.

Scalability target:

```text
At least 8–12 active orders should remain manageable on tablet/desktop.
20 active orders should still be usable with scrolling and compact cards.
```

---

## 19. Mobile vs Tablet/Desktop

The staff dashboard should prioritize tablet/desktop.

Primary target:

```text
tablet horizontal / laptop / desktop monitor
```

Mobile can be supported, but should not drive the main layout if it damages staff efficiency.

Possible responsive behavior:

- desktop/tablet: 3 columns;
- small screen: tabs by status or stacked columns;
- actions remain large.

---

## 20. What Not To Build Now

Do not build in the first MVP:

- payments;
- checkout;
- fiscal cash register integration;
- printer integration;
- inventory;
- multi-location logic;
- advanced analytics;
- full staff accounts;
- complex permissions;
- customer CRM;
- automated marketing;
- merch ecommerce;
- booking integration;
- Supabase persistence before local flow is validated.

These can exist in the long-term Walbox roadmap, but not in this dashboard iteration.

---

## 21. Technical Implementation Principles

Use a safe incremental approach.

Rules:

- do not rewrite the whole app;
- do not touch Jukebox files;
- keep Kitchen separate;
- use existing kitchen mock data if present;
- modify one file per micro-task when possible;
- do not change routing without explicit approval;
- do not add backend in the first dashboard polish task;
- preserve existing working functionality;
- run diff after every modification;
- build/test before commit.

Recommended files, depending on the current app structure:

```text
src/pages/KitchenStaffDashboard.jsx
src/data/kitchenMockData.js
src/App.jsx
```

But the first implementation should ideally modify only:

```text
src/pages/KitchenStaffDashboard.jsx
```

---

## 22. First Recommended Micro-Task

Before implementation, perform a read-only audit.

Audit goal:

```text
Compare the current Kitchen Staff Dashboard against this KDS/Expeditor specification.
```

Then implement only the first safe micro-task.

Likely first implementation:

```text
Reorganize the main dashboard into 3 operational columns:
Received | Preparing | Ready
```

Do not implement everything at once.

---

## 23. Stop Conditions

Stop immediately if an agent proposes to:

- rewrite the whole app;
- modify unrelated Jukebox files;
- change routing without approval;
- change App.jsx without a plan;
- change data structure globally without approval;
- add backend/Supabase immediately;
- add payments or checkout;
- add inventory;
- show prices in the kitchen view;
- create huge decorative cards;
- remove working order status logic;
- merge Kitchen and Jukebox too early;
- make the dashboard look like a generic admin analytics panel instead of staff operations.

---

## 24. Definition of Done for Staff Dashboard MVP

The dashboard MVP is good when:

```text
1. Staff can see new orders instantly.
2. Orders are grouped by operational status.
3. Each active order has a visible elapsed timer.
4. Notes are highly visible.
5. Items are summarized clearly.
6. Long orders do not create unusable cards.
7. Primary actions are large and obvious.
8. Ready orders are easy to call/deliver.
9. Delivered/cancelled orders do not clutter the main work area.
10. The view still works with many active orders.
11. No unrelated modules are touched.
12. Build passes.
```

---

## 25. Prompt for Claude / Antigravity — Read-Only Audit

Use this before any code modification.

```text
Model to use: Gemini 3.1 Pro high or Claude Sonnet Thinking

Read this document:
@docs/walbox-strategy/WALBOX_KITCHEN_STAFF_DASHBOARD_DEEP_DIVE.md

Then analyze only these files, if they exist:
@src/pages/KitchenStaffDashboard.jsx
@src/data/kitchenMockData.js
@src/App.jsx

Do not modify code.
Do not create files.
Do not change routing.
Do not run implementation steps.

Goal:
Evaluate the current staff/kitchen dashboard against the Walbox KDS/Expeditor specification in this document.

Return only:
1. what is already aligned;
2. what is not aligned yet;
3. main problems for real staff usage;
4. what must be avoided;
5. first safe micro-task to implement;
6. exact file to modify;
7. risk level of the change;
8. git diff command to run after implementation.
```

---

## 26. Prompt for Claude / Antigravity — First Implementation

Use only after the audit and Eros approval.

```text
Model to use: Gemini 3.1 Pro high

Apply only the approved micro-task.

Modify only:
@src/pages/KitchenStaffDashboard.jsx

Goal:
Reorganize the main staff dashboard into 3 operational columns:
- Received
- Preparing
- Ready to call

Keep the existing data logic.
Do not modify App.jsx.
Do not modify kitchenMockData.js.
Do not add backend.
Do not add payment.
Do not change routing.
Do not show prices in the kitchen operational view.

Each order card must show:
- order number/id;
- table;
- customer nickname/name;
- received time and/or elapsed minutes;
- compact item summary;
- kitchen notes highlighted if present;
- one large primary action to advance status.

For orders with more than 6 items, show a compact summary and an “Open detail” action instead of a long infinite list.

At the end, report only:
1. files modified;
2. what changed;
3. what to check in preview;
4. recommended git diff command.
```

---

## 27. Commands After Modification

Run:

```bash
git status
git diff --stat
git diff src/pages/KitchenStaffDashboard.jsx
npm run build
```

If using Vite preview/dev:

```bash
npm run dev
```

Then open the staff/kitchen route according to the current app routing.

---

## 28. Commit / Restore

If the result is correct:

```bash
git add src/pages/KitchenStaffDashboard.jsx
git commit -m "Improve kitchen staff dashboard workflow"
```

If the result is wrong:

```bash
git restore src/pages/KitchenStaffDashboard.jsx
```

---

## 29. Final Product Decision

The winning direction is:

```text
Less admin panel.
More operational control room.
```

Walbox Staff Dashboard should feel like:

```text
A professional but simple kitchen command screen for The Walrus.
```

It must make staff faster, calmer and more accurate.

That is what will make Walbox valuable beyond the jukebox wow effect.
