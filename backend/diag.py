"""
diag.py — practical diagnostic. Shows the RAW truth of what OCR sees on a page,
so we stop guessing. Run:  python -m backend.diag <pdf> <page_index>
"""
import sys, re
import pytesseract
from . import extractor as ex

PDF  = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\user\Downloads\STUDS1.pdf"
PAGE = int(sys.argv[2]) if len(sys.argv) > 2 else 1   # 0-based

with open(PDF, "rb") as f:
    data = f.read()

pages = ex._load_pages(data, PDF)
img = pages[PAGE]
print(f"Page {PAGE} size: {img.size}", file=sys.stderr)

# ---- Raw full-image PSM 11 ----
d = pytesseract.image_to_data(img, config="--oem 3 --psm 11",
                              output_type=pytesseract.Output.DICT)

# Every token containing a 'W' + digits pattern (loose, to see near-misses too)
loose = re.compile(r"[Ww]\d")
beam_hits = []        # token matched BEAM_RE
near_miss = []        # has W+digit but didn't match BEAM_RE
n = len(d["text"])
for i in range(n):
    raw = d["text"][i]
    tok = raw.replace(" ", "").strip()
    if ex.BEAM_RE.match(tok):
        beam_hits.append((i, raw, d["left"][i], d["top"][i], d["width"][i], d["height"][i]))
    elif loose.search(tok) and len(tok) >= 3:
        near_miss.append((i, raw))

print(f"\n=== FULL-IMAGE PSM 11: {len(beam_hits)} beam-section tokens matched ===")

# For each beam hit, run the SAME forward-search the extractor uses and report
detected_with_stud = 0
detected_no_stud   = 0
zoom_recovered     = 0
for (i, raw, x, y, w, h) in beam_hits:
    m = ex.BEAM_RE.match(raw.replace(" ", ""))
    section = f"W{int(m.group(1))}X{int(m.group(2))}"
    stud = ex._parse_stud(raw)
    src = "same-token"
    if stud is None:
        for j in range(i + 1, min(i + 16, n)):
            nt = d["text"][j].strip()
            if not nt:
                continue
            if ex.BEAM_RE.match(nt.replace(" ", "")):
                break
            if abs(d["top"][j] - y) >= h * 3.0:
                continue
            stud = ex._parse_stud(nt)
            if stud is not None:
                src = f"fwd-tok '{nt}'"
                break
            stud = ex._parse_stud(raw + nt)
            if stud is not None:
                src = f"concat '{raw}'+'{nt}'"
                break
    if stud is not None:
        detected_with_stud += 1
        print(f"  OK   {section:9s} stud={stud:<4} via {src}   (raw='{raw}')")
    else:
        detected_no_stud += 1
        # Practically test the NEW whitelisted zoom re-OCR on this dropped beam
        recovered = ex._zoom_read(img, x, y, w, h)
        nbrs = []
        for j in range(i + 1, min(i + 6, n)):
            if d["text"][j].strip():
                nbrs.append(repr(d["text"][j]))
        tag = f"ZOOM-RECOVERED stud={recovered}" if recovered is not None else "still NONE"
        print(f"  DROP {section:9s} -> {tag:24s} raw='{raw}'  nextTokens={nbrs}")
        if recovered is not None:
            zoom_recovered += 1

print(f"\nSummary full-image: {detected_with_stud} kept, {detected_no_stud} dropped")
print(f"Of the {detected_no_stud} dropped, whitelisted ZOOM recovered {zoom_recovered}")
print(f"=> effective full-image total: {detected_with_stud + zoom_recovered}")

# Show a sample of near-miss tokens (sections OCR mangled)
print(f"\n=== Near-miss tokens (W+digit but no full match), first 30 ===")
for i, raw in near_miss[:30]:
    print(f"   {raw!r}")
