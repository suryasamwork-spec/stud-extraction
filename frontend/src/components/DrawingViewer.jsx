import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import {
  ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, Info,
  Hand, Scan, Plus, Minus,
} from "lucide-react";

const SECTION_COLORS = [
  "#d95b5b", "#3eaba4", "#379eb4", "#d4ac1c", "#8982db",
  "#009c7d", "#d7a95e", "#c05e46", "#5f9ddb", "#d7658f",
  "#43cb9e", "#5a4ec7", "#d9c88e", "#b8bfbf", "#d59688",
];

function sectionColor(section) {
  let h = 0;
  for (let i = 0; i < section.length; i++) h = (h * 31 + section.charCodeAt(i)) >>> 0;
  return SECTION_COLORS[h % SECTION_COLORS.length];
}

const padNum = (num, length = 2) => String(num).padStart(length, "0");

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const FIT_FILL  = 1.0;  // fitted drawing fills the canvas (no shrink-to-background)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function DrawingViewer({
  url, fileName, status, error, results, ocrW, ocrH,
  currentPage, pageCount, onPageChange,
}) {
  const containerRef = useRef(null);
  const imgRef       = useRef(null);

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [view, setView]       = useState({ scale: 1, tx: 0, ty: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const panRef  = useRef({ active: false, startX: 0, startY: 0, baseTx: 0, baseTy: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(imgSize);
  sizeRef.current = imgSize;

  const working = status === "working";

  // ── Constrain a view so the drawing always covers the canvas ───────────────
  // Scale can't drop below the fit scale (so zoom-out never reveals background),
  // and pan offsets are clamped so the drawing edges can't move inside the
  // viewport — the drawing "sticks" instead of floating over the grid.
  const clampView = useCallback((v) => {
    const el = containerRef.current;
    const { w, h } = sizeRef.current;
    if (!el || !w || !h) return v;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return v;

    const fitScale = Math.max(cw / w, ch / h) * FIT_FILL;
    const scale = clamp(v.scale, fitScale, MAX_SCALE);
    const sw = w * scale;
    const sh = h * scale;

    // If the drawing is smaller than the canvas on an axis, centre it (locked).
    // Otherwise clamp so neither edge pulls inside the viewport.
    const tx = sw <= cw ? (cw - sw) / 2 : clamp(v.tx, cw - sw, 0);
    const ty = sh <= ch ? (ch - sh) / 2 : clamp(v.ty, ch - sh, 0);

    return { scale, tx, ty };
  }, []);

  const fitScaleNow = useCallback(() => {
    const el = containerRef.current;
    const { w, h } = sizeRef.current;
    if (!el || !w || !h) return MIN_SCALE;
    return Math.max(el.clientWidth / w, el.clientHeight / h) * FIT_FILL;
  }, []);

  // ── Fit a given drawing size into the canvas, centred ──────────────────────
  const fitWith = useCallback((w, h) => {
    const el = containerRef.current;
    if (!el || !w || !h) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.max(cw / w, ch / h) * FIT_FILL;
    setView(clampView({ scale, tx: (cw - w * scale) / 2, ty: (ch - h * scale) / 2 }));
  }, [clampView]);

  const fit = useCallback(() => {
    fitWith(sizeRef.current.w, sizeRef.current.h);
  }, [fitWith]);

  // ── Actual size (1:1), centred & constrained ───────────────────────────────
  const actualSize = useCallback(() => {
    const el = containerRef.current;
    const { w, h } = sizeRef.current;
    if (!el || !w || !h) return;
    setView(clampView({ scale: 1, tx: (el.clientWidth - w) / 2, ty: (el.clientHeight - h) / 2 }));
  }, [clampView]);

  // Capture natural size and immediately fit once layout has settled
  const onImgLoad = useCallback((e) => {
    const w = e.target.naturalWidth;
    const h = e.target.naturalHeight;
    setImgSize({ w, h });
    sizeRef.current = { w, h };
    requestAnimationFrame(() => fitWith(w, h));
  }, [fitWith]);

  // Re-fit when a new drawing URL arrives
  useLayoutEffect(() => { fit(); }, [fit, url]);

  // On container resize, keep the current zoom but re-clamp so the drawing
  // stays bounded (never reveals background, never drifts off-edge).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setView((v) => clampView(v)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clampView]);

  // ── Zoom toward a point (container-local px) ───────────────────────────────
  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const next = clamp(v.scale * factor, fitScaleNow(), MAX_SCALE);
      const k = next / v.scale;
      return clampView({
        scale: next,
        tx: cx - (cx - v.tx) * k,
        ty: cy - (cy - v.ty) * k,
      });
    });
  }, [clampView, fitScaleNow]);

  const zoomCenter = useCallback((factor) => {
    const el = containerRef.current;
    if (!el) return;
    zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  }, [zoomAt]);

  // ── Wheel = zoom to cursor ─────────────────────────────────────────────────
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX - rect.left, e.clientY - rect.top);
  }, [zoomAt]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // ── Hand / drag panning ────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    containerRef.current?.setPointerCapture?.(e.pointerId);
    panRef.current = {
      active: true, startX: e.clientX, startY: e.clientY,
      baseTx: viewRef.current.tx, baseTy: viewRef.current.ty,
    };
    setIsPanning(true);
  }, []);

  const onPointerMove = useCallback((e) => {
    const p = panRef.current;
    if (!p.active) return;
    setView((v) => clampView({
      ...v,
      tx: p.baseTx + (e.clientX - p.startX),
      ty: p.baseTy + (e.clientY - p.startY),
    }));
  }, [clampView]);

  const endPan = useCallback(() => {
    panRef.current.active = false;
    setIsPanning(false);
  }, []);

  const onDoubleClick = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect();
    zoomAt(1.6, e.clientX - rect.left, e.clientY - rect.top);
  }, [zoomAt]);

  const sections  = results ? [...new Set(results.map((r) => r.beam_section))].sort() : [];
  const multiPage = pageCount > 1;
  const hasImg    = Boolean(url);

  return (
    <div className="drawing-container">
      {/* Top toolbar */}
      <div className="viewer-toolbar">
        <span className="tb-filename">{fileName || "NO DRAWING ACTIVE"}</span>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {multiPage && (
            <div className="tb-zoom" style={{ border: "1px solid var(--line)" }}>
              <button className="tb-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous page">
                <ChevronLeft size={14} />
              </button>
              <span className="tb-pct" style={{ minWidth: "72px", textAlign: "center" }}>
                PG {padNum(currentPage + 1)} / {padNum(pageCount)}
              </span>
              <button className="tb-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next page">
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <div className="tb-zoom">
            <span className="tb-pct" style={{ minWidth: "52px", textAlign: "center" }}>
              {Math.round(view.scale * 100)}%
            </span>
          </div>
        </div>
      </div>

      {working && (
        <div className="viewer-progress">
          <div className="progress-track"><div className="progress-bar" /></div>
          <span className="t-mono" style={{ fontSize: "11px" }}>OCR PARSING IN PROGRESS — DETECTING BEAMS &amp; STUDS...</span>
        </div>
      )}
      {error && <div className="viewer-error t-mono">ERROR: {error}</div>}

      {/* Canvas */}
      <div
        ref={containerRef}
        className={`viewer-canvas${hasImg ? " pannable" : ""}${isPanning ? " grabbing" : ""}`}
        onPointerDown={hasImg ? onPointerDown : undefined}
        onPointerMove={hasImg ? onPointerMove : undefined}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        onPointerCancel={endPan}
        onDoubleClick={hasImg ? onDoubleClick : undefined}
      >
        {/* Left vertical tool palette */}
        {hasImg && (
          <div className="viewer-rail" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
            <button className="rail-btn rail-active" aria-label="Pan / hand tool" title="Pan (drag the drawing)">
              <Hand size={16} />
            </button>
            <div className="rail-sep" />
            <button className="rail-btn" onClick={() => zoomCenter(1.25)} aria-label="Zoom in" title="Zoom in">
              <Plus size={16} />
            </button>
            <button className="rail-btn" onClick={() => zoomCenter(1 / 1.25)} aria-label="Zoom out" title="Zoom out">
              <Minus size={16} />
            </button>
            <div className="rail-sep" />
            <button className="rail-btn" onClick={fit} aria-label="Fit to screen" title="Fit to screen">
              <Maximize size={15} />
            </button>
            <button className="rail-btn" onClick={actualSize} aria-label="Actual size 1:1" title="Actual size · 1:1">
              <Scan size={15} />
            </button>
          </div>
        )}

        {url ? (
          <div
            className="canvas-scale-wrap"
            style={{
              width: imgSize.w || undefined,
              height: imgSize.h || undefined,
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
              transformOrigin: "0 0",
            }}
          >
            <img
              ref={imgRef}
              src={url}
              alt="Structural steel framing plan layout"
              className="drawing-img"
              draggable={false}
              onLoad={onImgLoad}
            />

            {results && results.length > 0 && ocrW && ocrH && (
              <svg className="beams-svg" viewBox={`0 0 ${ocrW} ${ocrH}`} preserveAspectRatio="none">
                {results.map((r, i) => {
                  const color  = sectionColor(r.beam_section);
                  const px     = r.cx * ocrW;
                  const py     = r.cy * ocrH;
                  const radius = Math.round(ocrW / 140);
                  const cx = px + radius;
                  const cy = py - radius;
                  const tooltipText = `${r.beam_section} · ${r.stud_value} STUDS · (${Math.round(r.cx * 100)}, ${Math.round(r.cy * 100)})`;
                  return (
                    <g key={i} className="callout-group">
                      <title>{tooltipText}</title>
                      <circle cx={px} cy={py} r={radius * 0.25} fill={color} />
                      <line x1={px} y1={py} x2={cx} y2={cy} stroke={color} strokeWidth={radius * 0.1} strokeDasharray={`${radius * 0.15}, ${radius * 0.15}`} />
                      <circle cx={cx} cy={cy} r={radius * 0.75} fill={color} stroke="var(--fg)" strokeWidth={radius * 0.08} />
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={radius * 0.9} fontWeight="600" fill="white" className="t-mono" style={{ userSelect: "none" }}>
                        {r.stud_value}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        ) : results && results.length > 0 ? (
          <div className="viewer-loading" style={{ textAlign: "center", maxWidth: "400px", border: "1px solid var(--line)", padding: "24px", backgroundColor: "var(--bg-1)", borderRadius: "2px" }}>
            <div style={{ color: "var(--info)", marginBottom: "12px", display: "grid", placeItems: "center" }}>
              <Info size={32} />
            </div>
            <h3 style={{ fontSize: "14px", fontWeight: "600" }}>Historical results loaded</h3>
            <p style={{ color: "var(--fg-muted)", fontSize: "12px", marginTop: "8px", lineHeight: "1.5" }}>
              The extraction dataset was retrieved from the history log.
              Raw engineering drawing files are not stored in the database.
              Review the structural count metrics and tabular details below.
            </p>
          </div>
        ) : (
          <div className="viewer-loading t-mono" style={{ fontSize: "12px" }}>
            NO DRAWING FILE LOADED
          </div>
        )}

        {hasImg && (
          <div className="viewer-hint t-mono" aria-hidden="true">
            <Hand size={12} /> DRAG TO PAN · SCROLL TO ZOOM · DBL-CLICK TO ZOOM IN
          </div>
        )}
      </div>

      {sections.length > 0 && (
        <div className="beam-legend">
          {sections.map((sec) => (
            <div key={sec} className="legend-item">
              <span className="legend-dot" style={{ background: sectionColor(sec) }} />
              <span className="legend-label">{sec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
