# Antigravity prompt — Stud Extraction industrial redesign

Paste the block below into Antigravity (Agent mode) with the repo open at
`D:\Stud EXtraction`. It references `docs/UI_REDESIGN_BRIEF.md`, so keep that file in
the repo. Run it as one task; let the agent plan, then implement.

---

## ▶ Prompt to paste

```
You are a senior frontend engineer + product designer specializing in industrial /
engineering software (CAD, BIM, steel detailing, SCADA/HMI). Redesign the frontend of
this app to an industrial, structural-steel grade UI/UX. The current UI looks generic and
"AI-generated"; the new one must look like professional steel-detailing software.

AUTHORITATIVE SPEC
Read and follow docs/UI_REDESIGN_BRIEF.md exactly. It defines the design principles,
color tokens, typography, iconography, layout, per-screen requirements, motion, and a
"definition of done" checklist. Treat that file as the source of truth. If anything here
conflicts with it, the brief wins.

STACK (do not change)
- React 18 + Vite 5. UI code in frontend/src/ (App.jsx, components/, index.css).
- This is a PRESENTATION-LAYER redesign only. Do NOT touch:
  - frontend/src/api.js (API calls)
  - any backend/ code or extraction logic
  - the request/response shapes
- Preserve 100% of existing functionality: login/register, per-page extraction, per-page
  status dots, summary metrics, by-section breakdown, drawing viewer with beam markers,
  results table, history log, manage users, JSON download.

WHAT TO DO
1. Explore frontend/src/ first and list every component + the routes/views that exist.
   Produce a short plan mapping each screen in the brief (§6) to the file(s) you'll edit.
2. Set up the design system:
   - Add fonts (Archivo, IBM Plex Sans, IBM Plex Mono) via <link> in index.html.
   - Add lucide-react for icons (one dependency). Remove ALL emoji used as icons.
   - Put every color/spacing/type token from the brief (§2, §3) into :root in
     frontend/src/index.css. No hardcoded hex in components.
3. Build shared primitives (small, reusable): Button, IconButton, StatusDot, Tag,
   MetricTile, DataTable, Panel/SurfaceCard, SectionLabel, BlueprintGrid background.
   Sharp edges (radius 0–3px), 1px hairline borders, no shadows, no gradients.
4. Redesign each screen per brief §6: Login (access-terminal), top bar, left nav rail,
   sidebar cockpit (pages/summary/by-section), drawing viewer (blueprint grid + ruler +
   engineering callout markers), results table, history, manage users.
5. Replace the gear/emoji logo with the inline-SVG I-beam wide-flange mark (brief §9).
6. Apply restrained mechanical motion only (brief §7).

CONSTRAINTS
- ~90% grayscale; hi-vis orange (--accent) is a SIGNAL color used sparingly (≤5 element
  types per screen): primary action, active nav bar, key metric number, live status dot.
- All values (beam sections, stud counts, page #s, IDs, versions) in tabular monospace
  with font-feature-settings "tnum" 1. Labels/prose in the grotesque sans.
- Sentence case for all headings. Plain technical labels ("Sign in", "Run extraction"),
  not marketing copy.
- Accessibility: visible focus rings, aria-labels on icon buttons, ≥4.5:1 contrast, never
  color-only state.

DELIVERY
- Work screen-by-screen. After each screen, run `npm run build` (or `npm run dev`) to
  confirm it compiles, then continue.
- Do not leave dead code, unused emoji, or stray gradients.
- When finished, verify every item in the brief's §11 "Definition of done" checklist and
  report which files you changed and how you satisfied each checklist item.

Start by exploring the codebase and giving me the screen→file plan before writing code.
```

---

## Notes for running it

- **Run the brief and prompt together.** The prompt is deliberately thin because the heavy
  detail lives in `UI_REDESIGN_BRIEF.md`. Keep both in the repo.
- **Let it plan first.** The last line forces a plan before edits — review the
  screen→file mapping before approving implementation.
- **Iterate per screen.** If you only want to start with one screen (e.g. Login), append:
  *"For this run, implement only the Login/Register screen (brief §6.1) and the shared
  primitives it needs. Stop after it builds."*
- **Guardrail.** If the agent drifts toward gradients/emoji/rounded glassy cards, reply:
  *"That violates brief §0 and §1 — revert to flat steel surfaces, hairlines, mono data,
  one orange signal accent."*
