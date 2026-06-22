# MVP Scope: Walbox v2

This document defines the strict boundaries of the initial Minimum Viable Product (MVP) for Walbox v2. To maintain focus on user experience and visual polish, we prioritize front-end fidelity over backend complexity.

---

## 1. IN Scope (What We Are Building)

The MVP will feature three primary interfaces connected by a shared, mockable local state layer:

### A. Customer Request Interface (Mobile-First)
*   **Table Identification:** Simple input or URL parameter (e.g., `?table=12`) to capture the customer's table number.
*   **Mock Song Search:** A simulated search input that queries a local catalog of popular songs (with album art, artists, and durations).
*   **Mood Selection:** Interactive selectors for standard moods (e.g., *Energetic, Chill, Romantic, Retro, Party*).
*   **Dedication/Message Input:** A text field where the customer can write a dedication to someone at their table or in the venue.
*   **Request Status Tracker:** A simple, visually engaging feedback view showing if their request is pending, approved, or playing.

### B. Staff Dashboard (Desktop-Optimized)
*   **Pending Requests Column:** Card-based list of customer requests showing the song, table, mood, dedication, and timestamp.
*   **Queue Management Controls:**
    *   *Approve:* Move a pending request into the active queue.
    *   *Reject/Skip:* Decline or remove a request with visual feedback.
    *   *Prioritize:* Reorder items in the active queue.
*   **Now Playing Panel:** Displays the currently playing song with progress bar simulation and pause/play controls.
*   **Venue Controls:** A simple panel to clear the queue, pause requests, or switch venue modes.

### C. Live TV Screen (1080p Display-Optimized)
*   **Now Playing View:** Large, immersive cover art, animated wave form or progress indicator, and song details.
*   **Upcoming Queue Ticker:** Sleek sidebar or footer list showing next songs.
*   **Dedication Alert Banner:** A marquee or toast-style container displaying guest dedications (e.g., *"Table 4 dedicates 'Dancing Queen' to the birthday girl!"*).
*   **Dynamic Visual Moods:** Background gradients or particle systems that subtly shift colors based on the mood of the current song.

### D. Mock State Layer (Fake Local Queue)
*   An in-memory or `localStorage`-backed state system that coordinates data between the Customer, Staff, and TV screens if run in the same browser session or across tabs.

---

## 2. OUT of Scope (Strict Exclusions)

To avoid premature optimization and integration delays, the following features are **explicitly excluded** from the initial MVP:

*   ❌ **Supabase / Real Backend:** No external database setup, REST/GraphQL APIs, or cloud hosting.
*   ❌ **User Authentication:** No sign-up, login, social logins, or staff password screens. (Staff vs. Customer will be simulated via routing or query params).
*   ❌ **Spotify API Integration:** No actual Spotify web playback SDK, token refresh flows, or live Spotify search. All track data and music playback UI will be simulated/mocked.
*   ❌ **Loyalty / Gamification:** No coin system, paid request bidding, points, or user profiles.
*   ❌ **Multi-Tenant Architecture:** Single venue configuration only. No tenant administration, billing, or subscription tiers.
*   ❌ **Legacy Code Reuse:** Zero integration of code from the previous iteration. Every line of CSS/JS/HTML is built fresh.
