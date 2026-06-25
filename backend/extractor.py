"""
extractor.py  —  Stud Extraction engine

Pipeline per page:
  image / PDF page
  -> render to grayscale (RENDER_SCALE)
  -> sharpen + autocontrast preprocessing
  -> OCR in 3 orientations (0°, 90°CW, 90°CCW) each with 2 PSM modes
     (PSM 11 = sparse text, PSM 3 = full auto) for maximum recall
  -> for each detected beam token, read stud from adjacent tokens
  -> for beams still missing a stud, zoom in and re-OCR
  -> de-duplicate by location (prefer 0°, prefer has-stud, prefer PSM 11)
  -> ONLY keep beams with a confirmed stud value
  -> normalise coordinates to 0-1 range for frontend
"""

import io
import os
import re
import sys
import winreg

import pytesseract
from PIL import Image, ImageFilter, ImageOps
import pypdfium2 as pdfium


# ---------------------------------------------------------------------------
# Locate Tesseract
# ---------------------------------------------------------------------------
def _find_tesseract() -> str | None:
    for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
        try:
            with winreg.OpenKey(hive, r"SOFTWARE\Tesseract-OCR") as k:
                path, _ = winreg.QueryValueEx(k, "InstallDir")
                exe = os.path.join(path, "tesseract.exe")
                if os.path.isfile(exe):
                    return exe
        except OSError:
            pass
    for c in [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    ]:
        if os.path.isfile(c):
            return c
    from shutil import which
    return which("tesseract")


_TESS = _find_tesseract()
if _TESS:
    pytesseract.pytesseract.tesseract_cmd = _TESS


def tesseract_status() -> dict:
    if not _TESS:
        return {"available": False, "path": None, "version": None}
    try:
        ver = str(pytesseract.get_tesseract_version())
    except Exception:
        ver = "unknown"
    return {"available": True, "path": _TESS, "version": ver}


# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------
RENDER_SCALE = 3        # ~216 DPI — larger images = much more reliable OCR on small labels
MIN_IMG_PX   = 4000     # upscale small plain images to at least this
STUD_MIN     = 4
STUD_MAX     = 200      # composite beams can have 100-150+ studs
DEDUP_RADIUS = 25       # px in OCR space — collapse same-beam multi-pass duplicates

# Geometric stud association window (measured from real drawings via diag_geo).
# A beam's stud bracket sits immediately to its right on the same row:
# genuine studs cluster at dx≈+0.1w, dy≈+0.1..0.35h.  Anything outside this
# window is a different beam's stud or an annotation — rejecting it removes the
# "stud assigned where there is no stud" false positives.
STUD_DX_MIN  = -0.6     # gap (stud_left − beam_right) / beam_width; allows slight overlap
STUD_DX_MAX  =  2.0     # at most ~2 label-widths to the right
STUD_DY_MAX  =  0.8     # |stud_centre_y − beam_centre_y| / beam_height

# Beam section: W followed by 2–3 digit depth, X, 2–3 digit weight
BEAM_RE = re.compile(r"W(\d{2,3})[xX](\d{2,3})")

# W-less section: the leading "W" is sometimes dropped or mangled by OCR in
# cluttered areas ("W21X73" → "21X73" / "H21X73" / "21X73]").  Used only for
# orphan-stud recovery (a "##X##" pattern sitting right beside an unclaimed stud
# bracket is a W-dropped composite beam).  The (?<!\d)/(?!\d) guards require the
# two 2–3 digit groups to be a standalone section, never part of a dimension.
WLESS_RE = re.compile(r"(?<!\d)(\d{2,3})[xX](\d{2,3})(?!\d)")


# ---------------------------------------------------------------------------
# Rendering + preprocessing
# ---------------------------------------------------------------------------
def _preprocess(img: Image.Image) -> Image.Image:
    """Autocontrast then unsharp-mask for crisper, more Tesseract-readable text."""
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=150, threshold=3))
    return img


def _load_pages(data: bytes, filename: str) -> list[Image.Image]:
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        pdf = pdfium.PdfDocument(data)
        pages = []
        try:
            for i in range(len(pdf)):
                img = pdf[i].render(scale=RENDER_SCALE).to_pil().convert("L")
                pages.append(_preprocess(img))
        finally:
            pdf.close()
        return pages

    img = Image.open(io.BytesIO(data)).convert("L")
    longest = max(img.size)
    if longest < MIN_IMG_PX:
        f = MIN_IMG_PX / longest
        img = img.resize((int(img.width * f), int(img.height * f)), Image.LANCZOS)
    return [_preprocess(img)]


# ---------------------------------------------------------------------------
# Stud parsing
# ---------------------------------------------------------------------------
# Whitelist: zoom re-OCR may only emit digits and bracket characters.
# This forces Tesseract to resolve corrupted glyphs (5→B, 4→#, 2→Z) back to digits.
_STUD_WHITELIST = "0123456789[](){}<>"

# OCR glyph→digit confusion map.  On clean PDFs Tesseract's LSTM still misreads
# thin strokes: '1' → 'l' or 'I', '0' → 'o' or 'O'.  Normalise before parsing
# so [l18] and [1l8] both resolve to [118].
_CHAR_NORM = str.maketrans("lIoO", "1100")


def _parse_stud(text: str) -> int | None:
    """
    Extract stud value from bracketed notation.

    Tier 1 — strict: matched bracket pair, 1–3 digits.        e.g. [24] (56) {40}
    Tier 2 — opening bracket + 2–4 digits (closing corrupted). e.g. [52J [118;
    Tier 3 — closing bracket + 2–3 digits (opening lost).      e.g. 56] 62) 40}
             This is the single most common OCR failure on these drawings.
    """
    s = text.replace(" ", "").translate(_CHAR_NORM)

    # Tier 1: properly matched brackets
    for pat in (r"\[(\d{1,3})\]", r"\((\d{1,3})\)", r"\{(\d{1,3})\}", r"<(\d{1,3})>"):
        m = re.search(pat, s)
        if m:
            v = int(m.group(1))
            if STUD_MIN <= v <= STUD_MAX:
                return v

    # Tier 2: opening bracket + 2–4 digits; closing bracket may be OCR-corrupted
    m = re.search(r"[\[\(\{<](\d{2,4})(?:[^\d]|$)", s)
    if m:
        v = int(m.group(1))
        if STUD_MIN <= v <= STUD_MAX:
            return v

    # Tier 3: 2–3 digits immediately followed by a closing bracket; opening bracket lost
    m = re.search(r"(?:^|[^\d])(\d{2,3})[\]\)\}>]", s)
    if m:
        v = int(m.group(1))
        if STUD_MIN <= v <= STUD_MAX:
            return v

    return None


def _ocr_stud_crop(crop: Image.Image) -> int | None:
    """
    Aggressively read a stud value from a small label crop.
    Tries multiple PSM modes, a digit/bracket whitelist, and a binarized copy.
    The whitelist is what recovers corrupted digits ([B6]→[56], [#0]→[40]).
    """
    if crop.width < 4 or crop.height < 4:
        return None

    big = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS)

    wl = f"-c tessedit_char_whitelist={_STUD_WHITELIST}"
    configs = [
        f"--oem 3 --psm 7 {wl}",
        f"--oem 3 --psm 6 {wl}",
        f"--oem 3 --psm 11 {wl}",
        "--oem 3 --psm 7",      # unrestricted fallbacks
        "--oem 3 --psm 11",
    ]

    candidates = [big]
    # Binarized copy — hard black/white removes line-bleed around the brackets
    candidates.append(big.point(lambda p: 0 if p < 140 else 255))

    for im in candidates:
        for cfg in configs:
            txt = pytesseract.image_to_string(im, config=cfg)
            v = _parse_stud(txt)
            if v is not None:
                return v
    return None


def _zoom_read(img: Image.Image, x, y, w, h) -> int | None:
    """
    Re-OCR the region to the RIGHT of an upright label to pick up the stud bracket.
    Start the crop AFTER the label ends so the section's own digits (e.g. the 21 in
    W21X44) are never mistaken for a stud value.
    """
    iw, ih = img.size
    rx0 = max(0,  int(x + w * 0.85))   # begin just past the label text
    rx1 = min(iw, int(x + w * 2.8))    # stud bracket sits within ~2 label-widths; avoid neighbours
    ry0 = max(0,  int(y - h * 0.7))
    ry1 = min(ih, int(y + h + h * 0.7))
    if rx1 - rx0 < 6:
        return None
    return _ocr_stud_crop(img.crop((rx0, ry0, rx1, ry1)))


# Section-label zoom recovery: glyphs that appear in a "W##X##" label.
_SECT_WHITELIST = "WwXx0123456789"
# Tolerant section matcher: allows a doubled separator ("18XX40" from a line
# crossing the X) — used only on zoomed orphan-label crops.
_SECT_TOLERANT = re.compile(r"(?<!\d)(\d{2,3})[xX]{1,2}(\d{2,3})(?!\d)")
# Pure-digit run with the separator dropped ("24104" → 24 X 104).
_SECT_DIGITS = re.compile(r"(?<!\d)(\d{4,6})(?!\d)")


def _split_merged_section(digits: str) -> str | None:
    """
    Split a separator-less digit run into a section ONLY if there is exactly one
    plausible split (both parts 2–3 digits, no leading zero).  "24104" → W24X104;
    ambiguous runs are rejected so we never invent a wrong section.
    """
    cands = []
    for p in range(2, len(digits) - 1):
        a, b = digits[:p], digits[p:]
        if 2 <= len(a) <= 3 and 2 <= len(b) <= 3 and a[0] != "0" and b[0] != "0":
            cands.append((a, b))
    if len(cands) == 1:
        a, b = cands[0]
        return f"W{int(a)}X{int(b)}"
    return None


def _zoom_read_label(img: Image.Image, sx, sy, sw, sh) -> str | None:
    """
    Recover a beam SECTION by zooming into the region to the LEFT of an orphan
    stud bracket (a stud no beam claimed).  High-zoom re-OCR resolves the
    full-image failures that orphan a stud: dropped 'W'/'X', merged digits, or
    clutter.  Mirror of _zoom_read (which zooms right of a label to find a stud).
    """
    iw, ih = img.size
    x1 = min(iw, int(sx + sw * 0.4))     # include the start of the bracket
    x0 = max(0,  int(sx - sw * 5.0))     # label sits just left of the bracket
    y0 = max(0,  int(sy - sh * 0.5))
    y1 = min(ih, int(sy + sh * 1.5))
    if x1 - x0 < 10 or y1 - y0 < 6:
        return None
    crop = img.crop((x0, y0, x1, y1))
    big = crop.resize((crop.width * 4, crop.height * 4), Image.LANCZOS)
    candidates = [big, big.point(lambda p: 0 if p < 140 else 255)]
    configs = [
        "--oem 3 --psm 7",
        "--oem 3 --psm 11",
        f"--oem 3 --psm 7 -c tessedit_char_whitelist={_SECT_WHITELIST}",
        f"--oem 3 --psm 11 -c tessedit_char_whitelist={_SECT_WHITELIST}",
    ]
    for im in candidates:
        for cfg in configs:
            norm = pytesseract.image_to_string(im, config=cfg).replace(" ", "").translate(_CHAR_NORM)
            m = BEAM_RE.search(norm) or _SECT_TOLERANT.search(norm)
            if m:
                return f"W{int(m.group(1))}X{int(m.group(2))}"
            m = _SECT_DIGITS.search(norm)
            if m:
                sec = _split_merged_section(m.group(1))
                if sec is not None:
                    return sec
    return None


def _re_ocr_rotated(rotated_img: Image.Image, rot_x, rot_y, rot_w, rot_h, angle) -> int | None:
    """
    For beams detected in rotated images (90°, 270°), crop the region,
    rotate it back to upright, and re-OCR for better stud accuracy.
    """
    if angle == 0:
        return None

    iw, ih = rotated_img.size
    x0 = max(0,  int(rot_x + rot_w * 0.85))   # begin just past the label text
    x1 = min(iw, int(rot_x + rot_w * 2.8))    # avoid bleeding into neighbouring labels
    y0 = max(0,  int(rot_y - rot_h * 0.7))
    y1 = min(ih, int(rot_y + rot_h * 1.7))
    crop = rotated_img.crop((x0, y0, x1, y1))
    if crop.width < 4 or crop.height < 4:
        return None

    if angle == 90:
        crop = crop.rotate(-90, expand=False)
    elif angle == 270:
        crop = crop.rotate(90, expand=False)

    return _ocr_stud_crop(crop)


# ---------------------------------------------------------------------------
# Shared token parser — extracts beam detections from OCR data dict
# ---------------------------------------------------------------------------
def _parse_ocr_data(data: dict, angle: int, orig_w: int, orig_h: int,
                    x_offset: int = 0, y_offset: int = 0) -> list[dict]:
    """
    Walk Tesseract word-level data and return beam detections.
    x_offset / y_offset allow converting tile-local coordinates to full-image coordinates.
    """
    found = []
    n = len(data["text"])

    def _map_center(fx, fy, w, h):
        """Map a (rotated-image) box centre back to original-image coordinates."""
        rcx, rcy = fx + w / 2, fy + h / 2
        if angle == 0:
            return rcx, rcy
        if angle == 90:
            return orig_w - 1 - rcy, rcx
        return rcy, orig_h - 1 - rcx          # 270

    # Pre-index every token that parses as a stud bracket, with its geometry.
    # Association is GEOMETRIC (nearest bracket in a tight window beside the
    # label), not token-order — token order from PSM 11 sparse mode is not
    # spatially reliable and caused studs to be grabbed from far-away beams.
    stud_cands = []
    for k in range(n):
        v = _parse_stud(data["text"][k])
        if v is None:
            continue
        sx, sy, sw, sh = data["left"][k], data["top"][k], data["width"][k], data["height"][k]
        if sw <= 0 or sh <= 0:
            continue
        # (token idx, value, left, centre-y, centre-x)
        stud_cands.append((k, v, sx, sy + sh / 2, sx + sw / 2))

    claimed: set[int] = set()                 # stud token indices already used

    for i in range(n):
        token = data["text"][i].replace(" ", "").strip()
        m = BEAM_RE.match(token)
        if not m:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        if w <= 0 or h <= 0:
            continue

        section = f"W{int(m.group(1))}X{int(m.group(2))}"

        # Fast path: stud embedded in the same token (e.g. "W18X46[52]")
        stud = _parse_stud(data["text"][i])
        stud_pt = None                       # the claimed stud's centre (tile-local)

        # Geometric search: nearest stud bracket within the tight window beside
        # this label.  No match → stud stays None → beam is dropped (correct for
        # non-composite beams that genuinely have no studs).
        if stud is None:
            beam_right = x + w
            beam_cy = y + h / 2
            best = None
            for (k, v, sx, scy, scx) in stud_cands:
                if k == i:
                    continue
                dx = (sx - beam_right) / w        # gap to the right, in label widths
                dy = (scy - beam_cy) / h          # vertical offset, in label heights
                if dx < STUD_DX_MIN or dx > STUD_DX_MAX:
                    continue
                if abs(dy) > STUD_DY_MAX:
                    continue
                score = abs(dx) + abs(dy)
                if best is None or score < best[0]:
                    best = (score, v, k, scx, scy)
            if best is not None:
                stud = best[1]
                claimed.add(best[2])
                stud_pt = (best[3], best[4])

        fx, fy = x + x_offset, y + y_offset
        cx, cy = _map_center(fx, fy, w, h)
        # Record the stud's position (falls back to the label centre when the
        # stud was embedded in the same token) so orphans on the same stud can
        # be deduped later.
        if stud_pt is not None:
            scx_o, scy_o = _map_center(stud_pt[0] + x_offset, stud_pt[1] + y_offset, 0, 0)
        else:
            scx_o, scy_o = cx, cy

        found.append({
            "cx": cx, "cy": cy,
            "section": section,
            "stud": stud,
            "stud_cx": scx_o, "stud_cy": scy_o,
            "rot_x": fx, "rot_y": fy, "rot_w": w, "rot_h": h,
            "angle": angle,
        })

    # ── Orphan-stud recovery ───────────────────────────────────────────────
    # Any stud bracket not claimed above may belong to a beam whose "W" was
    # dropped by OCR ("W21X73" read as "21X73").  For each orphan stud, look for
    # a "##X##" token sitting in the tight window to its LEFT and recover it.
    wless = []
    for i in range(n):
        tok = data["text"][i].replace(" ", "").strip()
        if BEAM_RE.match(tok):
            continue
        # Normalise glyph confusions (l→1, o→0) then find a "##X##" section pattern
        # anywhere in the token not surrounded by other digits.  This catches the
        # leading "W" being dropped ("21X73"), mangled to another letter
        # ("H21X73"), or trailing junk ("21X73]", "21X73C").
        norm = tok.translate(_CHAR_NORM)
        mm = WLESS_RE.search(norm)
        if not mm:
            continue
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        if w <= 0 or h <= 0:
            continue
        wless.append((i, f"W{int(mm.group(1))}X{int(mm.group(2))}", x, y, w, h))

    used_beam: set[int] = set()
    for (k, v, sx, scy, scx) in stud_cands:
        if k in claimed:
            continue
        best = None
        for (bi, section, x, y, w, h) in wless:
            if bi in used_beam:
                continue
            dx = (sx - (x + w)) / w
            dy = (scy - (y + h / 2)) / h
            if dx < STUD_DX_MIN or dx > STUD_DX_MAX:
                continue
            if abs(dy) > STUD_DY_MAX:
                continue
            score = abs(dx) + abs(dy)
            if best is None or score < best[0]:
                best = (score, bi, section, x, y, w, h)
        if best is None:
            continue
        _, bi, section, x, y, w, h = best
        used_beam.add(bi)
        claimed.add(k)
        fx, fy = x + x_offset, y + y_offset
        cx, cy = _map_center(fx, fy, w, h)
        scx_o, scy_o = _map_center(scx + x_offset, scy + y_offset, 0, 0)
        found.append({
            "cx": cx, "cy": cy,
            "section": section,
            "stud": v,
            "stud_cx": scx_o, "stud_cy": scy_o,
            "rot_x": fx, "rot_y": fy, "rot_w": w, "rot_h": h,
            "angle": angle,
        })

    # Emit still-unclaimed stud brackets as ORPHANS (section unknown).  _detect_all
    # will zoom-OCR the label region to their left to recover the section.  These
    # carry the STUD's box so the zoom crop knows where to look.
    for (k, v, sx, scy, scx) in stud_cands:
        if k in claimed:
            continue
        sxx, syy = data["left"][k], data["top"][k]
        sww, shh = data["width"][k], data["height"][k]
        fx, fy = sxx + x_offset, syy + y_offset
        cx, cy = _map_center(fx, fy, sww, shh)
        found.append({
            "cx": cx, "cy": cy,
            "section": None,                 # orphan — label recovered later
            "stud": v,
            "stud_cx": cx, "stud_cy": cy,    # orphan position IS the stud centre
            "rot_x": fx, "rot_y": fy, "rot_w": sww, "rot_h": shh,
            "angle": angle,
        })

    return found


# ---------------------------------------------------------------------------
# Full-image scan for one orientation (PSM 11 — sparse text)
# ---------------------------------------------------------------------------
def _scan_orientation(img: Image.Image, angle: int, orig_w: int, orig_h: int) -> list[dict]:
    """PSM 11 (sparse text) — best for scattered labels on structural drawings."""
    data = pytesseract.image_to_data(
        img, config="--oem 3 --psm 11", output_type=pytesseract.Output.DICT
    )
    return _parse_ocr_data(data, angle, orig_w, orig_h)


# ---------------------------------------------------------------------------
# Tiled scan — 3×3 quadrants with overlap, each UPSCALED before OCR, 0° only.
# Small labels/studs (~30 px tall in the full image) sit at Tesseract's
# detection threshold, so the full-image and native-resolution tile passes miss
# some.  Cropping into smaller tiles AND upscaling each ~2× lifts that text to a
# comfortably readable size — this is what recovers the studs the coarse passes
# drop (verified: a "W24X68 (51)" missed in full view reads cleanly when zoomed).
# ---------------------------------------------------------------------------
TILE_UPSCALE = 2

def _scan_tiled(img: Image.Image, orig_w: int, orig_h: int, angle: int = 0,
                rows: int = 3, cols: int = 3, overlap: float = 0.12) -> list[dict]:
    """
    Upscaled tiled scan.  `angle` lets this run on rotated images too (90°/270°)
    so VERTICAL beam labels — which only read in a rotated orientation — get the
    same small-text recovery as upright ones.  `img` is the (possibly rotated)
    image; `orig_w/orig_h` are the upright page dimensions for coordinate mapping.
    """
    iw, ih = img.size
    tw = iw // cols
    th = ih // rows
    px = int(tw * overlap)
    py = int(th * overlap)
    f = TILE_UPSCALE

    found = []
    for row in range(rows):
        for col in range(cols):
            x0 = max(0, col * tw - px)
            y0 = max(0, row * th - py)
            x1 = min(iw, (col + 1) * tw + px)
            y1 = min(ih, (row + 1) * th + py)
            tile = img.crop((x0, y0, x1, y1))
            if f != 1:
                tile = tile.resize((tile.width * f, tile.height * f), Image.LANCZOS)
            data = pytesseract.image_to_data(
                tile, config="--oem 3 --psm 11",
                output_type=pytesseract.Output.DICT
            )
            # Scale OCR coordinates back down from the upscaled tile space
            if f != 1:
                for k in ("left", "top", "width", "height"):
                    data[k] = [v / f for v in data[k]]
            found += _parse_ocr_data(data, angle=angle,
                                     orig_w=orig_w, orig_h=orig_h,
                                     x_offset=x0, y_offset=y0)
    return found


# Words that appear only in a legend / key / notes block, never as framing
# annotations.  Used to locate and exclude the sample beam drawn in a legend.
_LEGEND_KEYWORDS = ("LEGEND", "SHEAR", "CAMBER", "DENOTES")


def _legend_centers(img: Image.Image) -> list[tuple[float, float]]:
    """Centres (original-image px) of legend/key indicator words on the page."""
    data = pytesseract.image_to_data(
        img, config="--oem 3 --psm 11", output_type=pytesseract.Output.DICT
    )
    pts = []
    for i in range(len(data["text"])):
        t = data["text"][i].upper()
        if any(k in t for k in _LEGEND_KEYWORDS):
            pts.append((data["left"][i] + data["width"][i] / 2,
                        data["top"][i] + data["height"][i] / 2))
    return pts


# ---------------------------------------------------------------------------
# Full detection pipeline for one page
# ---------------------------------------------------------------------------
def _detect_all(gray: Image.Image) -> list[dict]:
    ow, oh = gray.size

    rot90  = gray.rotate(90,  expand=True)
    rot270 = gray.rotate(270, expand=True)
    rot_imgs = {0: gray, 90: rot90, 270: rot270}

    # Full-image PSM 11 on three orientations + UPSCALED tiled PSM 11 on the
    # upright image.
    detections = (
        _scan_orientation(gray,   0,   ow, oh)
        + _scan_tiled(gray,   ow, oh, angle=0)
        + _scan_orientation(rot90,  90,  ow, oh)
        + _scan_orientation(rot270, 270, ow, oh)
    )

    # De-duplicate — same section AND within DEDUP_RADIUS counts as same beam.
    # Priority: angle=0 first (best coordinate accuracy), then has-stud.
    #
    # CRITICAL: simply dropping duplicates causes the systemic "3-4 missing beams"
    # issue.  The 0° scan often finds the label but not the stud (dense drawing area,
    # OCR token ordering) so stud=None.  The 90°/270° scan then finds the same beam
    # AND the stud — but because 0°+no_stud has a lower sort key it fills the slot
    # first, and the 90°+stud detection is dropped as a duplicate.  The subsequent
    # zoom fallback on the kept 0° entry may also fail, losing the beam entirely.
    #
    # Fix: if a duplicate pass found a stud the kept entry is missing, propagate it.
    detections.sort(key=lambda d: (d["angle"] != 0, d["stud"] is None))
    kept: list[dict] = []
    for d in detections:
        dup_idx = next(
            (i for i, k in enumerate(kept)
             if d["section"] == k["section"]
             and abs(d["cx"] - k["cx"]) < DEDUP_RADIUS
             and abs(d["cy"] - k["cy"]) < DEDUP_RADIUS),
            None,
        )
        if dup_idx is None:
            kept.append(d)
        elif d["stud"] is not None and kept[dup_idx]["stud"] is None:
            # Later pass found the stud the kept entry missed — rescue it
            kept[dup_idx]["stud"] = d["stud"]

    # Split real beam detections from orphan studs (section unknown)
    beams   = [d for d in kept if d["section"] is not None]
    orphans = [d for d in kept if d["section"] is None]

    # ── Cross-pass label↔stud pairing ──────────────────────────────────────
    # Pairing inside _parse_ocr_data only sees one OCR pass at a time.  A beam's
    # LABEL can be detected in one pass while its STUD is detected (as an orphan)
    # in another — both pieces exist but were never connected, so the beam was
    # dropped.  This is the systematic "few missed on every clean drawing" cause.
    # Here we connect them GLOBALLY using the same tight geometric window (in the
    # detection's own orientation space, where the stud sits just right of the
    # label on the same row).  Uses already-read tokens, so it's exact.
    used_orphans: set[int] = set()
    for d in beams:
        if d["stud"] is not None:
            continue
        b_right = d["rot_x"] + d["rot_w"]
        b_cy = d["rot_y"] + d["rot_h"] / 2
        best = None
        for oi, o in enumerate(orphans):
            if oi in used_orphans or o["angle"] != d["angle"]:
                continue
            dx = (o["rot_x"] - b_right) / d["rot_w"]
            dy = (o["rot_y"] + o["rot_h"] / 2 - b_cy) / d["rot_h"]
            if dx < STUD_DX_MIN or dx > STUD_DX_MAX or abs(dy) > STUD_DY_MAX:
                continue
            score = abs(dx) + abs(dy)
            if best is None or score < best[0]:
                best = (score, oi, o["stud"])
        if best is not None:
            d["stud"] = best[2]
            used_orphans.add(best[1])
    orphans = [o for i, o in enumerate(orphans) if i not in used_orphans]

    # For rotated detections: re-OCR the upright crop for better stud accuracy
    for d in beams:
        if d["angle"] != 0 and d["stud"] is None:
            upright_stud = _re_ocr_rotated(
                rot_imgs[d["angle"]],
                d["rot_x"], d["rot_y"], d["rot_w"], d["rot_h"],
                d["angle"],
            )
            if upright_stud is not None:
                d["stud"] = upright_stud

    # Zoom fallback for anything still missing a stud
    for d in beams:
        if d["stud"] is None:
            d["stud"] = _zoom_read(
                rot_imgs[d["angle"]],
                d["rot_x"], d["rot_y"], d["rot_w"], d["rot_h"],
            )

    # Orphan-stud recovery: a stud bracket that belongs to no detected beam.
    # Recover its section by zooming the label region to its left (handles
    # dropped W/X, merged digits, line-crossing clutter).  This rescues the
    # last 1–2 misses.
    #
    # CRITICAL dedup: an orphan is skipped if its stud position coincides with a
    # stud ALREADY claimed by a beam.  A stud claimed in one pass can be left
    # unclaimed in another (tiled/rotated); without this check it would be
    # re-recovered as a DUPLICATE beam (offset from the original because the beam
    # sits at the label, the orphan at the stud).  Comparing stud-centre to
    # stud-centre catches it cleanly.
    for o in orphans:
        if any(abs(o["cx"] - b["stud_cx"]) < DEDUP_RADIUS
               and abs(o["cy"] - b["stud_cy"]) < DEDUP_RADIUS
               for b in beams):
            continue
        section = _zoom_read_label(
            rot_imgs[o["angle"]], o["rot_x"], o["rot_y"], o["rot_w"], o["rot_h"],
        )
        if section is not None:
            o["section"] = section
            beams.append(o)

    # Only keep beams with a confirmed section AND stud value
    kept = [d for d in beams if d["section"] is not None and d["stud"] is not None]

    # Drop the sample beam drawn inside a STEEL BEAM LEGEND / key.  Legend-only
    # words (LEGEND, SHEAR STUDS, CAMBER, DENOTES) never appear among real
    # framing annotations, so any beam sitting near one is a legend example.
    legend_pts = _legend_centers(gray)
    if legend_pts:
        R = 0.07 * max(ow, oh)
        before = len(kept)
        kept = [
            d for d in kept
            if not any(abs(d["cx"] - lx) < R and abs(d["cy"] - ly) < R
                       for (lx, ly) in legend_pts)
        ]
        if before != len(kept):
            print(f"  Excluded {before - len(kept)} legend-area detection(s)", file=sys.stderr)

    # Sort top-to-bottom, left-to-right for consistent output
    kept.sort(key=lambda d: (round(d["cy"] / 50), d["cx"]))

    print(f"  Page: {len(kept)} composite beams extracted", file=sys.stderr)

    # Strip internal fields before returning
    for d in kept:
        for k in ("rot_x", "rot_y", "rot_w", "rot_h", "angle", "stud_cx", "stud_cy"):
            d.pop(k, None)

    return kept


# ---------------------------------------------------------------------------
# Outlier stud correction — fix rare OCR digit misreads (e.g. [52] read as 92)
# ---------------------------------------------------------------------------
# Look-alike digit pairs Tesseract swaps when a glyph is degraded or upscaled.
_CONFUSABLE_DIGITS = {
    frozenset("59"), frozenset("56"), frozenset("38"), frozenset("08"),
    frozenset("17"), frozenset("58"), frozenset("06"), frozenset("69"),
    frozenset("13"), frozenset("35"), frozenset("89"), frozenset("01"),
}


def _one_confusable_digit_apart(a: int, b: int) -> bool:
    sa, sb = str(a), str(b)
    if len(sa) != len(sb):
        return False
    diffs = [(x, y) for x, y in zip(sa, sb) if x != y]
    return len(diffs) == 1 and frozenset(diffs[0]) in _CONFUSABLE_DIGITS


def _correct_outlier_studs(results: list[dict]) -> None:
    """
    Snap a rare stud-value outlier to its section's dominant value when the two
    differ by a single look-alike digit — e.g. one W18X46[92] among many
    W18X46[52] is a misread of [52].  Conservative: the dominant value must be
    ≥4× and ≥4× as common as the outlier, and the outlier must appear ≤2×, so
    legitimate secondary values are never touched.
    """
    from collections import Counter
    by_sec: dict[str, list[dict]] = {}
    for r in results:
        if isinstance(r["stud_value"], int):
            by_sec.setdefault(r["beam_section"], []).append(r)
    for items in by_sec.values():
        counts = Counter(r["stud_value"] for r in items)
        mode, mode_n = counts.most_common(1)[0]
        if mode_n < 4:
            continue
        for r in items:
            v = r["stud_value"]
            if v != mode and counts[v] <= 2 and mode_n >= 4 * counts[v] \
                    and _one_confusable_digit_apart(v, mode):
                r["stud_value"] = mode


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def build_summary(results: list[dict]) -> dict:
    groups: dict[str, dict] = {}
    total_studs = 0
    for r in results:
        g = groups.setdefault(
            r["beam_section"],
            {"section": r["beam_section"], "count": 0, "stud_total": 0, "instances": []},
        )
        g["count"] += 1
        sv = r["stud_value"]
        g["instances"].append(sv)
        if isinstance(sv, int):
            g["stud_total"] += sv
            total_studs += sv

    sections = sorted(groups.values(), key=lambda x: x["section"])
    return {
        "total_beams":    len(results),
        "total_studs":    total_studs,
        "total_sections": len(sections),
        "sections":       sections,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def extract(data: bytes, filename: str) -> dict:
    if not _TESS:
        raise RuntimeError(
            "Tesseract OCR not found. "
            "Install from https://github.com/UB-Mannheim/tesseract/wiki"
        )

    raw_pages = _load_pages(data, filename)
    all_results = []
    page_data   = []

    for page_idx, page in enumerate(raw_pages):
        pw, ph = page.size
        print(f"Processing page {page_idx + 1}/{len(raw_pages)} ({pw}×{ph} px)", file=sys.stderr)
        page_results = []
        for d in _detect_all(page):
            entry = {
                "beam_section": d["section"],
                "stud_value":   d["stud"],
                "cx": round(d["cx"] / pw, 5),
                "cy": round(d["cy"] / ph, 5),
            }
            page_results.append(entry)
            all_results.append(entry)

        _correct_outlier_studs(page_results)
        page_data.append({
            "page":       page_idx,
            "ocr_width":  pw,
            "ocr_height": ph,
            "results":    page_results,
            "summary":    build_summary(page_results),
        })

    total = sum(len(pd["results"]) for pd in page_data)
    print(f"Total: {total} composite beams across {len(raw_pages)} page(s)", file=sys.stderr)

    return {
        "filename":   filename,
        "page_count": len(raw_pages),
        "pages":      page_data,
        "summary":    build_summary(all_results),
    }


def extract_page(data: bytes, filename: str, page_idx: int) -> dict:
    """Extract beams from a single page only (fast — skips all other pages)."""
    if not _TESS:
        raise RuntimeError(
            "Tesseract OCR not found. "
            "Install from https://github.com/UB-Mannheim/tesseract/wiki"
        )

    raw_pages = _load_pages(data, filename)
    total = len(raw_pages)

    if page_idx >= total:
        raise ValueError(f"Page {page_idx} out of range (doc has {total} pages)")

    page = raw_pages[page_idx]
    pw, ph = page.size
    print(f"Processing page {page_idx + 1}/{total} ({pw}×{ph} px)", file=sys.stderr)

    page_results = []
    for d in _detect_all(page):
        page_results.append({
            "beam_section": d["section"],
            "stud_value":   d["stud"],
            "cx": round(d["cx"] / pw, 5),
            "cy": round(d["cy"] / ph, 5),
        })
    _correct_outlier_studs(page_results)

    return {
        "filename":   filename,
        "page_count": total,
        "page":       page_idx,
        "ocr_width":  pw,
        "ocr_height": ph,
        "results":    page_results,
        "summary":    build_summary(page_results),
    }


def extract_region(data: bytes, filename: str, page_idx: int,
                   rx0: float, ry0: float, rx1: float, ry1: float) -> dict:
    """
    Thoroughly extract every beam inside a user-selected region.

    The region (normalised 0-1 page coordinates) is cropped from the full-res
    page and UPSCALED before running the full detection pipeline — a small crop
    means the small stud/label text becomes large enough for OCR to read
    reliably, recovering beams the whole-page pass misses.  Returned coordinates
    are mapped back to full-page normalised space so they overlay correctly.
    """
    if not _TESS:
        raise RuntimeError("Tesseract OCR not found.")

    raw_pages = _load_pages(data, filename)
    total = len(raw_pages)
    if page_idx >= total:
        raise ValueError(f"Page {page_idx} out of range (doc has {total} pages)")

    page = raw_pages[page_idx]
    pw, ph = page.size

    # Normalise/clamp the region box
    rx0, rx1 = sorted((max(0.0, min(1.0, rx0)), max(0.0, min(1.0, rx1))))
    ry0, ry1 = sorted((max(0.0, min(1.0, ry0)), max(0.0, min(1.0, ry1))))
    px0, py0 = int(rx0 * pw), int(ry0 * ph)
    px1, py1 = int(rx1 * pw), int(ry1 * ph)
    if px1 - px0 < 20 or py1 - py0 < 20:
        raise ValueError("Selected region is too small.")

    crop = page.crop((px0, py0, px1, py1))

    # Upscale the crop so its text is comfortably readable.  Bigger upscale for
    # smaller selections (where you most want fine detail); capped for memory.
    longest = max(crop.size)
    f = 3 if longest < 2500 else (2 if longest < 5000 else 1)
    big = crop.resize((crop.width * f, crop.height * f), Image.LANCZOS) if f != 1 else crop

    print(f"Region extract p{page_idx+1}: crop {crop.size} upscaled x{f} -> {big.size}", file=sys.stderr)

    results = []
    for d in _detect_all(big):
        # big -> crop -> full page -> normalised
        fx = px0 + d["cx"] / f
        fy = py0 + d["cy"] / f
        results.append({
            "beam_section": d["section"],
            "stud_value":   d["stud"],
            "cx": round(fx / pw, 5),
            "cy": round(fy / ph, 5),
        })

    return {
        "filename":   filename,
        "page":       page_idx,
        "ocr_width":  pw,
        "ocr_height": ph,
        "region":     [rx0, ry0, rx1, ry1],
        "results":    results,
    }


def render_preview(data: bytes, filename: str, page: int = 0, max_px: int = 4800) -> bytes:
    """
    High-resolution PNG preview of a specific page.

    Rendered at a high scale and saved lossless so the drawing stays crisp when
    zoomed in the viewer (PDF-like quality). PNG is used instead of JPEG because
    JPEG produces fuzzy ringing artefacts around the thin black lines and small
    text typical of structural drawings.
    """
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        pdf = pdfium.PdfDocument(data)
        try:
            page_idx = min(page, len(pdf) - 1)
            # High render scale → sharp vector lines rasterised at high DPI
            img = pdf[page_idx].render(scale=3.5).to_pil().convert("RGB")
        finally:
            pdf.close()
    else:
        img = Image.open(io.BytesIO(data)).convert("RGB")

    longest = max(img.size)
    if longest > max_px:
        f = max_px / longest
        img = img.resize((int(img.width * f), int(img.height * f)), Image.LANCZOS)

    buf = io.BytesIO()
    # Lossless PNG keeps every line crisp; compress_level kept low for speed.
    img.save(buf, format="PNG", optimize=False, compress_level=3)
    return buf.getvalue()
