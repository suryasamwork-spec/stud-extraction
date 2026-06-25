# Stud Extraction

Upload a steel framing plan (image or PDF) and automatically extract every
**beam section** (`W##X##`) and its **stud value** (the number in brackets next
to it). Results are shown in a table, with a sidebar **summary grouped by beam
section** and running totals.

No AI model or API key is required — text is read directly from the drawing
using the **Tesseract OCR** engine.

---

## What's inside

```
Stud EXtraction/
├── backend/              FastAPI server (Python)
│   ├── main.py           API endpoints + serves the frontend
│   └── extractor.py      OCR + beam/stud parsing engine
├── frontend/             React app (Vite)
│   ├── src/              components, app logic, styles
│   └── dist/             built app (created by `npm run build`)
├── data/                 SQLite history of past extractions (auto-created)
├── requirements.txt      Python dependencies
├── run.bat               ONE-CLICK launcher (Windows)
└── README.md
```

---

## How to run (Windows — easiest)

1. Make sure these are installed once on your PC:
   - **Python 3.10+**  (you have 3.14)
   - **Node.js 18+**   (you have 24)
   - **Tesseract OCR** — installed at
     `C:\Users\<you>\AppData\Local\Programs\Tesseract-OCR`
     (get it from <https://github.com/UB-Mannheim/tesseract/wiki> if missing)

2. **Double-click `run.bat`.**
   The first run sets up Python, installs packages, builds the frontend, then
   opens your browser at **http://localhost:8001**. Later runs start instantly.

3. To stop the app, press **Ctrl + C** in the black window.

---

## How to use

1. **Upload a drawing** — click the box or drag in a PNG / JPG / TIFF / PDF.
2. Click **🔍 Extract**.
3. Read the results:
   - **Main table** — every beam instance with its stud value (or “no studs”).
   - **Sidebar** — each beam section (e.g. `W18X40`, `W14X22`) is its own group
     with a count badge; click a group to see each instance and the stud total.
   - **Top cards** — Total Beams, Total Studs, Sections.
4. **⬇ Download JSON** exports the results:
   ```json
   [
     { "beam_section": "W18X40", "stud_value": 24 },
     { "beam_section": "W16X31", "stud_value": null }
   ]
   ```
5. **📝 Raw OCR text** shows exactly what the engine read (useful for checking
   missed labels).

---

## Extraction rules

- **Beam section**: `W` + digits + `X` + digits (e.g. `W18X40`). Prefixes like
  `CANT.` are dropped, keeping the `W##X##`.
- **Stud value**: an integer in `[]`, `()`, `{}` or `<>` right after the beam.
- No bracket → `stud_value` is `null` (the beam has no studs).
- Each instance is listed separately — repeated beams are **not** merged.
- **Ignored**: dimensions (`15'-7"`), grid bubbles (`3`, `4.8`), section
  callouts (`S-503`), column refs (`C3`), and other markup.
- A plausibility filter (depth 4–60, weight 6–999) drops OCR noise that
  happens to look like a beam.

---

## Accuracy note

Because this uses OCR (not an AI vision model), accuracy depends on image
quality. Clean, high-resolution drawings work best; blurry or low-res scans may
miss or misread some labels. Use **Raw OCR text** to see what was read. If you
ever get an Anthropic API key, the OCR step in `backend/extractor.py` can be
swapped for Claude vision for higher accuracy — the rest of the app stays the
same.

---

## Developer mode (optional, live reload)

Run two terminals:

```
# terminal 1 — backend
.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8001

# terminal 2 — frontend (hot reload, proxies /api to :8001)
cd frontend
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

---

## API reference

| Method | Path                 | Description                                |
|--------|----------------------|--------------------------------------------|
| GET    | `/api/health`        | Engine status (Tesseract version/path)     |
| POST   | `/api/extract`       | Upload a file → beams + studs + summary     |
| GET    | `/api/history`       | Last 50 extractions (id, filename, totals)  |
| GET    | `/api/history/{id}`  | Full stored result for one extraction       |
```
