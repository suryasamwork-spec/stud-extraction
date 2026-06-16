# Stud Extraction — Industrial UI/UX Redesign Brief

> Design language: **structural-steel engineering software**, not a SaaS landing page.
> Reference points: Tekla Structures, SDS/2, Bluebeam Revu, Trimble Connect, AISC steel
> manuals, mill certs, and shop drawings. The product reads steel framing plans — the
> interface should feel like it was built *by* a steel detailer *for* a steel detailer.

---

## 0. The problem with the current UI (what to kill)

The current screens read as "AI-generated / vibe-coded." Concretely, remove:

- **Emoji as icons** (🔍 📜 👥 📁 🔑 👤 ⚙️). Replace every one with a proper line-icon set.
- **Glassy purple/blue gradient backgrounds** and the soft radial glows.
- **Candy-rounded cards** with large border-radius and drop-shadow blooms.
- **Gradient-filled accent button** with glow (the orange "Authenticate Access" pill).
- **Friendly rounded display font** for headings.
- **Decorative, low-information layouts** — lots of empty padding, little data density.
- Marketing copy tone ("Secure Portal Access", "Authenticate Access"). Use plain, technical labels ("Sign in", "Run extraction").

These are the tells of generic AI UI. Every one has an industrial replacement below.

---

## 1. Design principles

1. **Engineering instrument, not a website.** Dense, gridded, measured. Information per
   square inch is high. Whitespace is structural, never decorative.
2. **Monospace for all data.** Beam sections (`W18X86`), stud counts (`[118]`), page
   numbers, coordinates, version strings, IDs — anything that is a *value* is mono and
   tabular-aligned. Prose/labels are a grotesque sans.
3. **One functional accent.** Safety/hi-vis orange is authentic to steel & construction
   (hi-vis PPE, primer, mill marks). Keep it — but use it *sparingly* as a signal color,
   not a fill. Most of the UI is steel gray on near-black.
4. **Sharp, machined edges.** Radius 0–3px max. Borders are 1px hairlines, not shadows.
   Depth comes from value steps between surfaces, not blur.
5. **State is explicit and legible.** OCR status, per-page extract state, confidence,
   counts — surfaced as labeled readouts and status chips, like an HMI / SCADA panel.
6. **Blueprint affordances.** Subtle ruler ticks, grid backgrounds in the drawing viewer,
   measurement-style dividers. The drawing canvas is the hero.

---

## 2. Color tokens

Dark, desaturated, steel. Define as CSS variables (`:root`).

```css
:root {
  /* Surfaces — cool steel grays, stepped by value not blur */
  --bg-0:        #0b0d10;   /* app background (near-black, slight blue) */
  --bg-1:        #121519;   /* panels / sidebar */
  --bg-2:        #181c22;   /* cards, table rows */
  --bg-3:        #20262e;   /* raised / hover */
  --bg-inset:    #0e1114;   /* inputs, wells, drawing canvas */

  /* Hairlines */
  --line:        #2a3038;   /* default 1px border */
  --line-strong: #3a424c;   /* emphasis / active border */

  /* Text */
  --fg:          #e6eaef;   /* primary */
  --fg-muted:    #9aa4b0;   /* secondary labels */
  --fg-dim:      #5e6976;   /* tertiary / hints / units */

  /* Accent — hi-vis safety orange. SIGNAL ONLY, used sparingly. */
  --accent:      #ff6a00;
  --accent-weak: #2a1a0e;   /* tinted bg behind accent text */

  /* Status */
  --ok:          #3fb950;   /* OCR ready, extracted */
  --warn:        #d29922;   /* low confidence / partial */
  --err:         #f85149;   /* failed */
  --info:        #4493f8;   /* neutral interactive (links) */

  /* Data viz: section-color palette stays, but desaturate ~15% so dots
     read as engineering markers, not toy stickers. */
}
```

Rule of thumb: a screen should be ~90% grayscale. Orange appears only on the primary
action, active nav indicator, key metric numbers, and the live OCR/status dot.

---

## 3. Typography

Pick distinctive, technical fonts — **not** Inter/Roboto/Arial/system.

- **Display / headings:** a tight industrial grotesque. Good options:
  `Archivo`, `Archivo Expanded`, `Saira`, `Saira Condensed`, or `Chakra Petch`.
  Use ALL-CAPS sparingly for section eyebrows with letter-spacing `0.08em`.
- **Body / UI labels:** `IBM Plex Sans` or `Archivo` (regular). Clean, neutral, a bit
  technical.
- **Data / mono:** `IBM Plex Mono` or `JetBrains Mono`. Enable `font-feature-settings:
  "tnum" 1;` (tabular numerals) so columns of counts align perfectly.

Type scale (px): 11 (units/eyebrow), 12 (table body), 13 (labels), 14 (body), 16 (sub-
heads), 20 (panel titles), 28 (page H1). Weights: 400 / 500 / 600 only. Never 800-black.

Headings are **sentence case**, not Title Case. "Run extraction", not "Run Extraction".

---

## 4. Iconography

Replace ALL emoji with a single coherent line-icon set: **Tabler Icons** or **Lucide**
(both have React packages). 1.5px stroke, outline only, `currentColor`, 18–20px.

| Current emoji | Replace with (Lucide/Tabler name) |
|---|---|
| ⚙️ logo | `hexagon` / custom I-beam mark (see §9) |
| 🔍 Workspace | `layout-dashboard` or `scan-line` |
| 📜 History Log | `history` / `clock` |
| 👥 Manage Users | `users` |
| 📁 Upload | `upload-cloud` / `file-up` |
| 🔑 password | `key` (line) |
| 👤 username | `user` (line) |
| 🟢 OCR ready | a 6px filled status dot, not emoji |

---

## 5. Layout system

- **8px base grid.** All spacing is a multiple of 4 (prefer 8/12/16/24).
- **App shell:** fixed top utility bar (48px) + left nav rail + main content. The current
  three-zone split is right; tighten it and remove rounded panel corners.
- **Density:** table row height 36–40px. Sidebar items 40px. Inputs 40px. Buttons 40px.
- **Hairline dividers** between every functional zone, full-bleed, `--line`.
- **No card has a shadow.** Surfaces separate by `--bg-1/2/3` value steps + 1px border.

---

## 6. Screen-by-screen

### 6.1 Login / Register (`Login` view)

Replace the marketing split-hero with an **access terminal** look.

- Left panel: dark steel, a faint **blueprint grid** background (1px lines @ `--line` on
  `--bg-0`, 32px cells) and a large engineering wordmark. Spec strip at the bottom stays
  but rendered as a **labeled readout table** (key in `--fg-dim` mono caps, value in
  `--fg` mono):
  ```
  ENGINE      TESSERACT OCR 5.5.0
  AUTH        RBAC
  STORE       SQLITE
  BUILD       v1.0.0
  ```
- Right panel: a bordered "login module." Heading: **"Sign in"** (not "Secure Portal
  Access"). Sign in / Register as a 2-segment toggle with a sliding 2px orange underline,
  not pill buttons.
- Inputs: flat, inset (`--bg-inset`), 1px `--line` border, 2px radius. On focus, border
  → `--accent`, plus a 1px inset ring. Icon sits inside on the left, `--fg-dim`.
- Primary button: **solid** `--accent`, dark text (`#0b0d10`), 2px radius, no glow, no
  gradient. Label "Sign in". Hover: brighten 6%. Active: translateY(1px).
- "Show demo credentials": a small mono link, `--info`, underlined on hover only.

### 6.2 App shell — top bar

- Left: I-beam wordmark + "STUD EXTRACTION" in tracked caps + one-line descriptor in
  `--fg-dim`.
- Right cluster: **OCR status pill** = filled `--ok` dot + mono `OCR READY · v5.5.0`.
  Then the user chip: avatar square (not circle), `admin` + a flat `ADMIN` role tag
  (orange text on `--accent-weak`, 2px radius, mono caps). `Logout` as a ghost button.

### 6.3 Left nav rail

- Items: icon + label, 40px tall, 2px radius hover (`--bg-3`). Active item: left **2px
  orange bar** + `--bg-2` fill + orange icon. No pill, no glow.
- Section labels ("WORKSPACE", "SUMMARY", "BY SECTION"): 11px mono caps, `--fg-dim`,
  letter-spacing 0.1em, with a hairline under.

### 6.4 Sidebar — pages + summary + by-section

This is the data cockpit. Make it feel like an instrument cluster.

- **Pages list:** `PG 01 … PG 04`, mono, with a per-page status glyph (▢ idle, ◐ running,
  ✓ done = `--ok`, ✕ error = `--err`). Active page: 2px orange left bar. Zero-pad numbers.
- **Extract button:** solid orange, label `RUN EXTRACTION · PG 01` (mono caps). Disabled
  state desaturated to gray, not faded orange.
- **Summary metrics:** 3 readout tiles in a row — replace the rounded boxes with flat
  bordered cells. Big mono number (`--fg`, key one in `--accent`), unit label below in
  11px mono caps `--fg-dim`. Like a gauge readout:
  ```
  ┌───────────┬───────────┬───────────┐
  │   0042    │   2362    │    20     │
  │ COMP.BEAMS│ TOT.STUDS │ SECTIONS  │
  └───────────┴───────────┴───────────┘
  ```
- **By section:** a tight list. Each row: section name (`W16X36`, mono), a small count
  chip (`4×`), and stud total (`144`). Color dot uses the (desaturated) section palette.
  Rows are 32px, hairline separated, hover `--bg-2`.

### 6.5 Drawing viewer (hero)

- Canvas background: `--bg-inset` with a faint **blueprint grid** + corner ruler ticks.
- Toolbar: page nav `‹ PG 4 / 4 ›`, zoom readout `160%`, `−／＋／FIT` as flat icon
  buttons in a bordered group. All mono.
- Beam markers (the colored stud dots): keep the concept but render as **engineering
  callouts** — a filled disc with mono white number + a 1px leader. On hover, show a
  tooltip with `section · studs · (x,y)`.
- Empty state: not a yellow folder emoji. A dashed `--line-strong` drop zone, a line
  `upload-cloud` icon (`--fg-dim`), heading "Upload a framing drawing", subline, and a
  mono format chip row `PNG · JPG · TIFF · PDF`. Drag-over: border → `--accent`, faint
  `--accent-weak` wash.

### 6.6 Results table

- Full-width data table. Columns: `#` · `BEAM SECTION` · `STUD VALUE` · (optional)
  `CONFIDENCE` · `PAGE`. Header row: 11px mono caps, `--fg-dim`, sticky.
- Body: 12px mono, tabular numerals, 36px rows, zebra via `--bg-1/--bg-2`, hairline
  columns optional. Section cells link-colored (`--info`); stud value in `--ok` when
  confidently parsed.
- A `Download JSON` ghost button top-right, `download` icon.

### 6.7 History log & Manage users

- Same table system. History: timestamp (mono), filename, beams, studs, a `VIEW` action.
- Manage users: table with role tags (the same flat orange/gray tag style), row actions
  as ghost icon buttons.

---

## 7. Motion

Restrained and mechanical. No bounces, no springy easing.

- Transitions: `120–160ms ease-out` on hover/focus/active only.
- Page/panel mount: a single 200ms fade + 4px rise. No staggered confetti reveals.
- Status dot: a slow 2s opacity pulse for "running" states only.
- Active-nav orange bar: 140ms width/opacity, not a slide-bounce.

## 8. Accessibility & quality bar

- All text ≥ 11px; body 14px; contrast ≥ 4.5:1 (check orange-on-dark for text — use it on
  fills with dark text, or as borders/dots, rarely as small text).
- Every interactive element has a visible focus ring (1px `--accent` inset).
- Icon-only buttons get `aria-label`. Status conveyed by text + color, never color alone.
- Keyboard: tab order top-bar → nav → sidebar → canvas → table.

## 9. Brand mark

Drop the gear emoji. Commission/draw a simple **I-beam (wide-flange) cross-section** mark:
two horizontal flanges + a vertical web, in `--accent`, inside a 2px-radius square on
`--bg-2`. It instantly signals "structural steel." Provide as inline SVG.

---

## 10. Tech constraints (existing stack — do not change)

- **React 18 + Vite 5.** Components live in `frontend/src/` (`App.jsx`,
  `components/Sidebar.jsx`, etc.). Styles in `frontend/src/index.css`.
- **Do not** alter API calls (`api.js`), backend, or extraction logic. This is a
  presentation-layer redesign only.
- Keep all existing functionality: per-page extract, page status dots, summary, by-
  section breakdown, history, user management, login/register, JSON download.
- Add fonts via `<link>` in `index.html` (Google Fonts: Archivo, IBM Plex Sans, IBM Plex
  Mono) or `@fontsource`. Add icons via `lucide-react` (preferred) — one dependency.
- Centralize all tokens in `:root` in `index.css`. No inline hex values in components.

## 11. Definition of done

- [ ] Zero emoji anywhere in the UI.
- [ ] Zero gradients, zero glow/bloom shadows; depth is value-steps + 1px hairlines.
- [ ] All values render in tabular mono; all labels in the grotesque sans.
- [ ] Orange appears on ≤ ~5 element types per screen.
- [ ] Login is an "access terminal," not a marketing hero.
- [ ] Drawing canvas has a blueprint grid + ruler affordance.
- [ ] All tables share one dense, sticky-header system.
- [ ] Looks like steel-detailing software a professional would trust — not a template.
