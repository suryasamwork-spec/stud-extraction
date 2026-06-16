import { useState } from "react";
import { ScanLine, Clock, Users, Play, ChevronDown, ChevronUp } from "lucide-react";

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

function SectionGroup({ section }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="section-group">
      <div className="section-group-head" onClick={() => setOpen((o) => !o)}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span 
            className="legend-dot" 
            style={{ 
              backgroundColor: sectionColor(section.section), 
              width: "6px", 
              height: "6px", 
              marginRight: "8px", 
              flexShrink: 0 
            }} 
          />
          <span className="section-name">{section.section}</span>
        </div>
        <div className="section-meta">
          <span className="section-count">{section.count}×</span>
          <span className="section-studs t-mono">{section.stud_total}</span>
          <span className="chevron" style={{ color: "var(--fg-dim)", display: "flex" }}>
            {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </div>
      </div>
      {open && (
        <div className="section-detail">
          {section.instances.map((s, i) => (
            <div className="row" key={i}>
              <span>INSTANCE {padNum(i + 1)}</span>
              <span className="stud-badge t-mono" style={{ color: "var(--ok)", fontWeight: "600" }}>
                {s} STUDS
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PageStatusGlyph({ status }) {
  if (status === "working") return <span className="t-mono status-dot pulse ok" style={{ fontSize: "11px", color: "var(--accent)" }}>◐</span>;
  if (status === "done")    return <span className="t-mono" style={{ color: "var(--ok)", fontWeight: "600" }}>✓</span>;
  if (status === "error")   return <span className="t-mono" style={{ color: "var(--err)", fontWeight: "600" }}>✕</span>;
  return <span className="t-mono" style={{ color: "var(--fg-dim)" }}>▢</span>;
}

export default function Sidebar({
  fileName, status, summary,
  pageCount, currentPage, pageStatus,
  onPageChange, onExtract, onReset,
  activeTab, onTabChange, currentUser
}) {
  const s        = summary || { total_beams: 0, total_studs: 0, total_sections: 0, sections: [] };
  const working  = status === "working";
  const multiPage = pageCount > 1;

  return (
    <aside className="sidebar">
      {/* Navigation tabs */}
      <div className="sidebar-nav-tabs">
        <button 
          className={`sidebar-nav-btn ${activeTab === "workspace" ? "active" : ""}`}
          onClick={() => onTabChange("workspace")}
        >
          <ScanLine size={16} />
          <span>Workspace</span>
        </button>
        <button 
          className={`sidebar-nav-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => onTabChange("history")}
        >
          <Clock size={16} />
          <span>History Log</span>
        </button>
        {currentUser?.role === "admin" && (
          <button 
            className={`sidebar-nav-btn ${activeTab === "users" ? "active" : ""}`}
            onClick={() => onTabChange("users")}
          >
            <Users size={16} />
            <span>Manage Users</span>
          </button>
        )}
      </div>

      <div className="tb-divider" style={{ width: "100%", height: "1px", backgroundColor: "var(--line)", flexShrink: 0 }}></div>

      {/* Workspace Cockpit Details */}
      <div className="sidebar-section" style={{ display: "flex", flexDirection: "column", gap: "12px", flexShrink: 0 }}>
        {/* Extract button */}
        <button
          className="extract-btn"
          onClick={onExtract}
          disabled={!fileName || working || activeTab !== "workspace"}
        >
          {working ? (
            <span>EXTRACTING PG {padNum(currentPage + 1)}...</span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
              <Play size={12} fill="currentColor" />
              RUN EXTRACTION · PG {padNum(currentPage + 1)}
            </span>
          )}
        </button>

        {fileName && activeTab === "workspace" && (
          <button className="btn ghost" style={{ width: "100%" }} onClick={onReset}>
            New drawing
          </button>
        )}
      </div>

      {/* Pages List (Visible when drawing is active) */}
      {fileName && activeTab === "workspace" && (
        <div className="sidebar-section" style={{ flexShrink: 0 }}>
          <div className="sidebar-head">
            <h2>PAGES</h2>
          </div>
          <div className="page-list">
            {Array.from({ length: pageCount }, (_, i) => {
              const pgSt = pageStatus?.[i] ?? "idle";
              return (
                <button
                  key={i}
                  className={`page-btn${currentPage === i ? " active" : ""}`}
                  onClick={() => onPageChange(i)}
                  disabled={pgSt === "working"}
                >
                  <span>PG {padNum(i + 1)}</span>
                  <PageStatusGlyph status={pgSt} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="sidebar-section" style={{ flexShrink: 0 }}>
        <div className="sidebar-head">
          <h2>
            SUMMARY
            {multiPage && activeTab === "workspace" && <span className="summary-page-tag"> · PG {padNum(currentPage + 1)}</span>}
          </h2>
        </div>
        <div className="totals">
          <div className="total-card">
            <span className="total-num">{s.total_beams}</span>
            <span className="total-label">COMP.BEAMS</span>
          </div>
          <div className="total-card accent2">
            <span className="total-num">{s.total_studs}</span>
            <span className="total-label">TOT.STUDS</span>
          </div>
          <div className="total-card">
            <span className="total-num">{s.total_sections}</span>
            <span className="total-label">SECTIONS</span>
          </div>
        </div>
      </div>

      {/* Sections Breakdown */}
      <div className="sidebar-section" style={{ flex: 1, minHeight: "150px" }}>
        <div className="sidebar-head">
          <h2>BY SECTION</h2>
        </div>
        <div className="sections-list">
          {s.sections.length === 0 ? (
            <p className="side-hint" style={{ color: "var(--fg-dim)", fontSize: "11px", fontStyle: "italic" }}>
              {working
                ? `Reading page ${padNum(currentPage + 1)}...`
                : "No structural framing sections detected."}
            </p>
          ) : (
            s.sections.map((sec) => <SectionGroup key={sec.section} section={sec} />)
          )}
        </div>
      </div>
    </aside>
  );
}
