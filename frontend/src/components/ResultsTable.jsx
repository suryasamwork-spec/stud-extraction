import { Download } from "lucide-react";

const padNum = (num, length = 2) => String(num).padStart(length, "0");

function downloadJson(results, page) {
  const clean = results.map(({ beam_section, stud_value }) => ({ beam_section, stud_value }));
  const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `stud_extraction_page${page + 1}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ResultsTable({ results, currentPage, pageCount }) {
  const label = pageCount > 1 ? `PAGE ${padNum(currentPage + 1)} / ${padNum(pageCount)}` : null;
  
  return (
    <div className="results-wrap">
      <div className="results-head">
        <h2>EXTRACTED COMPOSITE BEAMS {label && <small style={{ color: "var(--fg-dim)", marginLeft: "8px" }}>· {label}</small>}</h2>
        <button 
          className="btn ghost small" 
          onClick={() => downloadJson(results, currentPage)}
          style={{ display: "inline-flex", gap: "6px", height: "28px" }}
        >
          <Download size={12} />
          <span>DOWNLOAD JSON</span>
        </button>
      </div>

      <table className="results-table">
        <thead>
          <tr>
            <th style={{ width: "80px" }}>INDEX</th>
            <th>BEAM SECTION</th>
            <th style={{ textAlign: "right", width: "120px" }}>STUD COUNT</th>
          </tr>
        </thead>
        <tbody>
          {results.length === 0 ? (
            <tr>
              <td colSpan={3} className="no-results">
                No composite steel beams detected on this page.
              </td>
            </tr>
          ) : (
            results.map((r, i) => (
              <tr key={i}>
                <td style={{ color: "var(--fg-dim)" }}>{padNum(i + 1, 3)}</td>
                <td className="beam">{r.beam_section}</td>
                <td className="stud" style={{ textAlign: "right" }}>{r.stud_value}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
