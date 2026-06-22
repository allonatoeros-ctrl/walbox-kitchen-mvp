# Antigravity Workflow: Walbox v2

This document guides how Antigravity (your AI coding assistant) works on the **walbox-from-zero-v2** project, detailing standards, task management, and design-to-code practices.

---

## 1. Incremental Execution & Task Tracking

For all coding tasks, Antigravity will adhere to a strict structured workflow:

1.  **State Management:** Always track current progress in a `task.md` file in the conversation context.
    *   Mark task progress: `[ ]` for pending, `[/]` for active, and `[x]` for completed tasks.
2.  **Code Modifications:**
    *   Preserve existing docstrings, comments, and structure unless explicitly tasked to replace them.
    *   Use targeted replacement tools (`replace_file_content` or `multi_replace_file_content`) to prevent replacing entire files unnecessarily.
3.  **Documentation:** Wrap up any significant development segment by creating or updating `walkthrough.md` to show what changed, what was tested, and how to verify.

---

## 2. Coding & Design Standards

To fulfill the premium visual requirements of Walbox v2, the following rules apply:

*   **No Placeholders:** Never write generic texts or empty components. Use mock data lists (such as actual track names, artists, and beautiful Unsplash URLs for cover art) to make the MVP look immediately production-ready.
*   **Vanilla CSS for Styling:** Unless Tailwind CSS is explicitly requested, construct clean, modular vanilla CSS (with CSS variables defined in a global sheet like `index.css`) for maximum flexibility, glassmorphism filters, and smooth keyframe animations.
*   **Premium Dark Mode Default:** Build all views on a dark midnight blue palette with bright accents, ensuring correct HSL values and glow layers are applied to text and panels.
*   **Mobile-First for Customers:** The customer view must render perfectly on modern smartphones. Use flexbox, grid, and fluid sizing (`rem`, `vh`, `vw`) to keep views fitting within standard viewports without breaking.
*   **Accessible ID Naming:** Keep all interactive elements (buttons, inputs, links) marked with unique, descriptive HTML `id` attributes to simplify testing and future-proof the codebase.

---

## 3. Verification & Testing

Every code addition must be verified by running the development server and checking:

1.  **Tab Syncing:** Verify that local storage synchronization works by checking if state transitions in the `/dashboard` or `/customer` tab reflect in the `/tv` tab in real time.
2.  **Responsive Layouts:** Verify design appearance on both simulated mobile viewports and desktop resolutions.
3.  **Error Boundaries:** Verify that mock search failures or missing url table parameters degrade gracefully.
