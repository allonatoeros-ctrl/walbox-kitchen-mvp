# Creative Director Brief: Walbox v2

## Visual Identity & Mood
The visual design for Walbox v2 must feel **alive, immersive, and premium**. We want to avoid static interfaces in favor of a dynamic environment that reacts to music and user interactions. The aesthetic blends **cyberpunk neon glow, sleek dark-mode glassmorphism, and fluid micro-animations**.

---

## Typography
*   **Primary Font:** `Inter` or `Outfit` (Clean, legible, modern geometric sans-serif for UI elements, labels, and descriptions).
*   **Display Font:** `Syne` or `Cabinet Grotesk` (Expressive, high-impact headings for the Live TV and high-profile cards).

---

## Design System Tokens & Color Palette

We avoid flat, generic colors. Instead, we use custom-curated, harmonious HSL values that feel premium.

| Token | HSL / Value | Usage |
| :--- | :--- | :--- |
| **Dark Background** | `hsl(224, 71%, 4%)` | Deep midnight blue for global background |
| **Surface (Glass)** | `hsla(224, 71%, 8%, 0.6)` | Semi-transparent card overlays |
| **Glass Border** | `hsla(224, 100%, 100%, 0.08)` | Thin border for glassmorphic elements |
| **Accent Primary** | `hsl(322, 100%, 50%)` | Neon Hot Pink (Brand identity, CTA) |
| **Accent Secondary**| `hsl(263, 90%, 55%)` | Electric Violet (Secondary actions, mood markers) |
| **Accent Glow** | `hsl(180, 100%, 50%)` | Cyber Cyan (Active statuses, song indicators) |
| **Text Primary** | `hsl(210, 40%, 98%)` | Crisp off-white |
| **Text Secondary** | `hsl(215, 20%, 65%)` | Muted slate gray |

### Glassmorphism Formula
```css
.glass-panel {
  background: rgba(13, 17, 28, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}
```

---

## Interface Guidelines

### 1. Customer Mobile App
*   **Vibe:** Intuitive, tactile, and highly responsive.
*   **Design elements:**
    *   Smooth, bouncing state transitions for interactive elements.
    *   Soft glows behind the cover art of selected songs.
    *   Interactive mood selector: when selected, the page's background gradient subtly shifts to reflect that mood (e.g., party = neon purple/magenta, chill = soft teal/dark blue).
    *   Card-based inputs with floating labels.

### 2. Staff Dashboard
*   **Vibe:** High-performance command center. Clean, dense, but highly legible.
*   **Design elements:**
    *   A multi-column grid layout with distinct visual hierarchy.
    *   Swipe or slide animations when cards are approved or rejected.
    *   "Now Playing" panel with a simulated neon progress bar that fills smoothly.
    *   Visual indicators (colored pill tags) indicating the mood of each request.

### 3. Live TV Screen
*   **Vibe:** Kinetic typography, atmospheric backgrounds, public spectacle.
*   **Design elements:**
    *   **Dynamic Backdrop:** Deep gradient meshes that float and animate in the background using CSS animations.
    *   **Marquee/Ticker:** Dedication messages scrolling continuously at the bottom of the screen with a premium, smooth transition.
    *   **Visual Highlights:** When a new song starts, display a large card that takes over the screen momentarily (3-5 seconds) showing the song details, dedicating table, and a greeting message.
    *   **Glow Effects:** Text-shadow and box-shadow glows on current song album art.
