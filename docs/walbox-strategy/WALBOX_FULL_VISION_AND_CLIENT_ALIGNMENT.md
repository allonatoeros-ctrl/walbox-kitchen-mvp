# WALBOX FULL VISION & CLIENT ALIGNMENT

**Project:** Walbox / Walrus Social Jukebox / Walrus Digital OS  
**Client:** The Walrus Pub  
**Date:** 2026-06-15  
**Purpose:** Align the original Walbox vision with the latest Walrus client meeting, preserve the full long-term pitch, and define the immediate priorities without losing the bigger product direction.

---

## 1. Executive Summary

Walbox started as a **social jukebox and live TV experience** for The Walrus Pub: customers scan a QR code, enter with nickname and table, request songs, choose moods/reactions, write dedications, and the venue controls everything from a manager dashboard while a Live TV Screen creates atmosphere.

After the latest Walrus meeting, the vision expanded. The client’s ideas moved Walbox from a music/social experience into a wider **Walrus digital operating system**: menu, QR orders, kitchen workflow, food/drink promos, points, events, merchandising, contest, bookings, website, notifications and staff tools.

The two visions are not in conflict.

They combine into one stronger direction:

> **Walbox is the digital social operating system of The Walrus: it helps customers order, play, participate, earn points and discover promos; it helps staff manage orders, events, content, kitchen flow and the live venue experience.**

The immediate priority is not to build everything at once. The immediate priority is:

1. **Finish and activate the digital jukebox, especially the Poster TV version that the client liked.**
2. **Build a separate but connected Walbox Kitchen MVP**, because the venue is opening a sandwich kitchen and cannot rely on classic table service.
3. **Create the bridge between Jukebox and Kitchen** through table, nickname/profile, points, promos and Live TV/social experience.

---

## 2. Original Walbox Vision

The original Walbox idea was built around the concept of a **social experience for the pub**.

Core elements:

- QR access from the table.
- Lightweight customer entry: nickname + table.
- Music requests.
- Mood/reaction selection.
- Short dedication/message.
- Manager dashboard for moderation.
- Live TV Screen showing music, table, mood, reaction, dedications and rankings.
- Walrus tone: ironic, bold, local, recognizable.
- Social content generation for the social media manager.
- Future gamification: points, badges, rewards, table rankings, coupons and promo.

Original strategic positioning:

> Walbox transforms a normal night into an interactive social experience: the customer participates, the venue collects light customer signals, the TV creates atmosphere and the social media manager gets content ready to publish.

This remains valid.

The latest meeting does not replace this vision. It gives it a stronger operational reason to exist.

---

## 3. Latest Walrus Client Meeting: New Inputs

The client proposed or opened the door to the following ideas:

### Menu, kitchen and orders

- Interactive menu.
- Menu connected to staff operations.
- Orders sent from the customer’s phone.
- Orders appearing on a kitchen/staff screen.
- Order status.
- Customer phone rings/vibrates/notifies when the order is ready.
- Model similar to **La Piadineria pager system**, but using the customer phone instead of a physical vibrating device.
- This is urgent because the venue is preparing to open a sandwich kitchen and may not be able to serve tables directly.

### Promo and food/drink strategy

- Combo promo: sandwich + beer + fries, from X to Y, valid until end of year.
- Food promos.
- Drink list.
- Cocktail of the day.
- Cocktail of the month.
- Six/seven cocktails to promote.
- Simple descriptions of beers/cocktails, like a digital “decanter” explaining characteristics and taste.

### Loyalty and points

- Points card / loyalty system.
- Points for eating.
- Points for drinking.
- Points connected to rewards.
- Points connected to profile and prizes.
- Rewards unlocked every certain number of points.

### Merchandising

- Merchandising must be inserted into the app.
- Many people do not know the merch exists.
- Merch should be connected to menu, promo, points and customer engagement.
- Future online merch sales.
- Promo based on remaining inventory.

### Events and initiatives

- Fantacalcio.
- Fantasanremo.
- Quiz night with prizes.
- All Walrus initiatives, events, promos, new sandwiches, new cocktails and new openings should be communicated to customers.
- Notifications through email, app or future channel.

### Website and booking

- Booking from the website.
- Website redesign.
- Connection between Walbox and the public website.

### Social and community

- Contest connected to Instagram/social tagging.
- Best post/story tagging Walrus wins a prize.
- Presence/check-in in the venue.
- Possibility of seeing who is at the bar or creating light social/crew dynamics.
- Must be handled carefully: social participation, not a dating app.

### Bar/restaurant bridge

- Bridge between Walrus bar and restaurant.
- Bridge between customer-facing app and management/staff tools.

---

## 4. Alignment: Original Vision vs Client Inputs

| Area | Original Walbox idea | Latest Walrus input | Final interpretation |
|---|---|---|---|
| QR access | QR for jukebox/table | QR for menu/orders/profile | QR becomes the single entry point into Walbox |
| Jukebox | Core product | Liked, especially Poster version | Keep and finish as immediate visible demo |
| Live TV | Music, moods, dedications, rankings | Could show promo, events, orders ready, contest | TV becomes the live communication layer of the venue |
| Dashboard | Moderate music requests | Staff/kitchen orders, promo, events | Dashboard evolves into Staff OS |
| Points | Future gamification | Food/drink loyalty requested | Points become the bridge between all modules |
| Promo | Future coupon/promo idea | Combo sandwich + beer + fries, cocktail promo | Promo becomes core business layer |
| Social content | Help SMM with live material | Contest post/story, events, rankings | Social Engine becomes a real marketing tool |
| Merch | Future idea | Strong client interest | Merch becomes part of loyalty/promo engine |
| Menu/orders | Not original core | New urgent priority | Kitchen MVP becomes second immediate product |
| Website/bookings | Future expansion | Requested by client | Roadmap, not immediate MVP |
| Check-in/crew | Future social idea | Client opened to presence in venue | Later feature, must be designed carefully |

Conclusion:

> The client’s ideas do not move Walbox away from the original vision. They validate it and make it more useful. Walbox should now be treated as a modular venue operating system with a social soul.

---

## 5. Final Product Architecture

Walbox should be organized as modular products under one ecosystem.

### 5.1 Walbox Jukebox

Purpose: social experience, music, mood, dedications, TV atmosphere.

Includes:

- QR table entry.
- Nickname/table.
- Song request.
- Mood/reaction.
- Dedication.
- Manager moderation.
- Poster TV Screen.
- Rankings and live moments.

Immediate goal: **finish and activate Poster version**.

---

### 5.2 Walbox Kitchen

Purpose: solve the new kitchen/sandwich operational problem.

Includes:

- QR menu.
- Table/customer identification.
- Food/drink menu.
- Combo promo.
- Order submission.
- Staff/kitchen dashboard.
- Order states.
- Customer phone alert when ready.

Order states for MVP:

```text
Received
In preparation
Ready
Delivered
Cancelled
```

Customer ready alert:

- In-app popup.
- Vibration with browser vibration API when supported.
- Sound when allowed by browser interaction rules.
- Walrus-style message.

Example:

> CAVALLOOOO 🐴 Il tuo ordine è pronto. Vieni a ritirarlo al banco.

---

### 5.3 Walbox Core

Purpose: connect Jukebox and Kitchen.

Includes:

- Table.
- Nickname.
- Lightweight profile.
- Points.
- Rewards.
- Promo eligibility.
- Customer history/light memory.

This is the bridge that prevents the project from becoming two separate apps.

---

### 5.4 Walbox Promo Engine

Purpose: manage food, drink, merch and event promotions.

Includes:

- Combo sandwich + beer + fries.
- Cocktail of the day.
- Cocktail of the month.
- Merch promo.
- Event promo.
- Points-linked offers.
- Future inventory-based promo.

---

### 5.5 Walbox Loyalty Engine

Purpose: make customers return and participate.

Includes:

- Points for food.
- Points for drink.
- Points for jukebox participation.
- Points for merch.
- Points for event participation.
- Rewards.
- Badges.
- Customer levels.

Possible levels:

```text
Cucciolo di Tricheco
Tricheco da Banco
Tricheco Affamato
Tricheco Leggendario
Always The Fucking Walrus
```

---

### 5.6 Walbox Events Engine

Purpose: support recurring venue initiatives.

Includes:

- Quiz night.
- Fantacalcio.
- Fantasanremo.
- Shuffle Night.
- Event calendar.
- Event-specific rewards.
- TV screen integration.

---

### 5.7 Walbox Merch Engine

Purpose: make merch visible and commercially active.

Includes:

- Merch showcase in app.
- Points/rewards connected to merch.
- Promo based on stock.
- Future online sales.
- Future inventory management.

---

### 5.8 Walbox Website & Booking

Purpose: external presence and conversion.

Includes:

- Website redesign.
- Booking flow.
- Event visibility.
- Menu visibility.
- Merch/shop visibility.
- Future customer account/profile.

This is roadmap, not immediate MVP.

---

### 5.9 Walbox Social & Community

Purpose: turn the venue into a participatory social environment.

Includes:

- Social contest.
- Best story/post tagging Walrus.
- Rewards connected to points.
- Live TV finalists.
- Venue check-in.
- Light crew/social presence.

Important rule:

> This must feel like social participation in the pub, not a dating app and not invasive tracking.

---

## 6. Immediate Priority After Meeting

The client’s urgent need is linked to the kitchen opening.

Priority order:

### Priority 1 — Finish Walbox Jukebox Poster

Reason:

- It already exists.
- The client liked the Poster version.
- It creates the wow effect.
- It is the easiest module to activate for a first night.

Goal:

> Jukebox Poster should become presentable, stable and usable for a Walrus Shuffle Night.

Do not rewrite the existing jukebox. Finish it.

---

### Priority 2 — Build Walbox Kitchen MVP

Reason:

- It solves a real operational problem.
- The venue is opening a sandwich kitchen.
- They may not be able to serve tables directly.
- The phone-ready-alert replaces the physical pager.

Goal:

> Customer scans QR, orders from the menu, staff sees the order, staff marks it ready, customer phone alerts them.

This is the most valuable new feature.

---

### Priority 3 — Create the Bridge

Reason:

- Jukebox and Kitchen must not become two unrelated products.
- The bridge is what makes Walbox a system.

Bridge elements:

- Same table.
- Same nickname/profile.
- Same points.
- Same tone.
- Same TV/social layer.
- Promo between food, drink and music.

Example future flow:

> You ordered sandwich + beer. +40 Tricheco Points. Want to request a song while you wait?

---

## 7. 30-Day Operational Plan

### Week 1 — Stabilize Jukebox Poster

Goals:

- Confirm current Poster file/route.
- Fix visual issues.
- Keep QR visible.
- Keep TV-safe layout.
- Do not touch Spotify/Supabase unless necessary.
- Test on Vercel/TV if possible.

Output:

> Jukebox Poster is demo-ready.

---

### Week 2 — Kitchen MVP Static Prototype

Goals:

- Create separate Kitchen customer page.
- Static menu with panini, beer, fries, combo promo.
- Customer can create a demo order.
- Use localStorage or demo state first.
- No payment.
- No backend at first.

Output:

> Customer can submit a fake order from phone.

---

### Week 3 — Staff/Kitchen Dashboard

Goals:

- Create kitchen/staff order screen.
- Show incoming orders.
- Change status: received, preparing, ready, delivered.
- Keep UI simple and readable for staff.

Output:

> Staff can manage order status.

---

### Week 4 — Customer Ready Alert + Bridge Concept

Goals:

- Customer sees order status.
- When ready, customer sees popup.
- Add vibration/sound if browser allows.
- Add first points demo.
- Add “while you wait, request a song” bridge.

Output:

> Kitchen MVP feels like the phone version of a restaurant pager.

---

## 8. 12-Month Roadmap

### Month 1 — Jukebox Poster + Kitchen MVP foundation

- Finish poster jukebox.
- Create kitchen/customer menu prototype.
- Create staff order dashboard.
- Add order ready alert.

### Month 2 — Kitchen beta with real venue feedback

- Improve menu structure.
- Add real panini/drink data.
- Add combo promo.
- Test with staff.
- Refine order status UX.

### Month 3 — Supabase persistence for Kitchen

- Persist orders.
- Sync customer/staff screens.
- Add basic order history.
- Separate test/demo data from real usage.

### Month 4 — Lightweight profile + points

- Customer profile demo.
- Points for orders.
- Points for jukebox actions.
- First rewards.

### Month 5 — Promo engine

- Combo promo manager.
- Cocktail of the day/month.
- Food/drink promo cards.
- TV promo display.

### Month 6 — Merch integration

- Merch showcase.
- Points and promo connected to merch.
- Stock/promo demo.

### Month 7 — Events engine

- Quiz night.
- Fantacalcio.
- Fantasanremo.
- Event calendar.
- TV/social content.

### Month 8 — Social contest

- Tag Walrus contest mechanics.
- Manual staff moderation.
- Points/prize connection.
- TV finalist display.

### Month 9 — Website refresh plan and first implementation

- Landing/site structure.
- Menu page.
- Event page.
- Booking CTA.

### Month 10 — Booking MVP

- Simple reservation request.
- Admin view.
- Confirmation workflow.

### Month 11 — Notifications and customer communication

- Email/newsletter basics.
- App/in-app notification center.
- Promo/event announcements.

### Month 12 — Product consolidation

- Polish.
- Documentation.
- Demo package.
- Case study.
- Reusable version for other venues.

---

## 9. What Not To Build Immediately

Do not build these in the first phase:

- Online payments.
- Full ecommerce.
- Fiscal/cash register integration.
- Printer integration.
- Native iOS/Android app.
- Complex CRM.
- Advanced inventory.
- Automated marketing campaigns.
- Real-time social matching.
- Full booking platform.
- Enterprise-level analytics.

These can exist in the roadmap, but not in the immediate build.

---

## 10. Technical Strategy

### Development principles

- Keep existing Jukebox work safe.
- Do not rewrite the whole app.
- Create new Kitchen module separately.
- Use localStorage/demo state first.
- Add Supabase only after the flow is proven.
- One module at a time.
- One screen at a time.
- Commit after every stable step.

### Suggested module routes / screens

Potential routes:

```text
/jukebox
/tv-poster
/kitchen
/kitchen/status
/staff/orders
/profile
/promos
```

Potential files:

```text
src/pages/CustomerKitchenMenu.jsx
src/pages/CustomerOrderStatus.jsx
src/pages/KitchenStaffDashboard.jsx
src/pages/WalboxProfileDemo.jsx
src/data/kitchenDemoData.js
src/services/kitchenLocalState.js
```

These are suggestions only. Claude/Antigravity should inspect the current app before deciding exact names.

---

## 11. Claude / Antigravity Init Goal

Before coding, ask Claude inside Antigravity to review the current app against this plan.

Claude must act as:

> Walbox Technical Strategy Reviewer

It should not modify code during init.

It should answer:

1. What already exists and can be reused.
2. What should remain untouched.
3. How to separate Jukebox and Kitchen safely.
4. What first implementation step is safest.
5. What risks exist if too many features are attempted together.

---

## 12. Claude Init Prompt

Use this prompt inside Antigravity after this file is added to the project.

```text
You are acting as Walbox Technical Strategy Reviewer inside Antigravity.

Read the current Walbox app structure and these planning files:
- WALBOX_PROJECT_CONTEXT.md
- WALBOX_FULL_VISION_AND_CLIENT_ALIGNMENT.md
- ANTIGRAVITY_WORKFLOW.md
- WALBOX_PROMPT_LIBRARY.md

Do not modify code.
Do not create files.
Do not run implementation steps.

Goal:
Compare the existing app with the new Walrus client priorities.

Context:
Walbox started as a social jukebox / live TV experience.
After the latest client meeting, the urgent priority is:
1. finish the Poster Jukebox version;
2. create a separate Kitchen MVP for QR menu/orders;
3. connect both later through table, customer profile, points, promo and TV/social experience.

Return only:
1. what already exists and can be reused;
2. what should remain untouched;
3. recommended module separation;
4. safest first implementation step;
5. risks if we try to build too much at once;
6. exact files you would inspect next before any code modification.
```

---

## 13. Strategic Positioning After Alignment

Final positioning:

> Walbox starts from the two most urgent needs of The Walrus: a live social jukebox that creates atmosphere and a QR kitchen/order flow that helps the new sandwich service work without classic table service. From there, Walbox grows into the digital operating system of the venue: points, promo, events, merch, website, bookings and social content.

Short version:

> **Walbox is not just a jukebox. It is the social and operational layer of The Walrus.**

---

## 14. Final Decision

The project should now proceed in this order:

```text
1. Preserve full vision.
2. Finish Jukebox Poster.
3. Build Kitchen MVP separately.
4. Connect them through table/profile/points/promo.
5. Expand into loyalty, events, merch, website and booking.
```

This keeps the pitch alive while preventing implementation chaos.

