import { useEffect, useState } from "react";
import { RefreshCw, FileSearch, Trash2, Archive } from "lucide-react";
import { getHistory, deleteHistoryItem, getHistoryItem } from "../api";

const padNum = (num, length = 2) => String(num).padStart(length, "0");

export default function HistoryView({ currentUser, onLoadHistoryItem }) {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchHistory() {
    setLoading(true);
    setError(null);
    try {
      const data = await getHistory();
      setHistoryList(data);
    } catch (err) {
      setError(err.message || "Failed to load history items.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to permanently delete this extraction record?")) {
      return;
    }
    try {
      await deleteHistoryItem(id);
      setHistoryList((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }

  async function handleLoad(id) {
    try {
      const payload = await getHistoryItem(id);
      onLoadHistoryItem(payload);
    } catch (err) {
      alert("Failed to load historical record details: " + err.message);
    }
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp * 1000);
    const yr = d.getFullYear();
    const mo = padNum(d.getMonth() + 1);
    const dy = padNum(d.getDate());
    const hr = padNum(d.getHours());
    const mi = padNum(d.getMinutes());
    return `${yr}-${mo}-${dy} ${hr}:${mi}`;
  }

  if (loading) {
    return (
      <div className="history-loading-container">
        <div className="pg-spinner" style={{ fontSize: "28px" }}>⋯</div>
        <p>Loading historical records...</p>
      </div>
    );
  }

  return (
    <div className="history-view-container">
      <div className="results-head">
        <div>
          <h2>📜 STRUCTURAL EXTRACTION LOGS</h2>
          <p style={{ fontSize: "11px", color: "var(--fg-dim)", marginTop: "4px" }}>
            {isAdmin 
              ? "Global audit log of all system extractions. Administrators can delete records." 
              : "List of your past beam and stud extraction results."}
          </p>
        </div>
        <button 
          className="btn ghost small" 
          onClick={fetchHistory}
          style={{ display: "inline-flex", gap: "6px", height: "28px" }}
        >
          <RefreshCw size={12} />
          <span>REFRESH</span>
        </button>
      </div>

      {error && (
        <div className="viewer-error" style={{ margin: "16px 0", borderRadius: "2px" }}>
          ⚠️ {error}
        </div>
      )}

      {historyList.length === 0 ? (
        <div className="no-results" style={{ border: "1px dashed var(--line)", padding: "48px 16px" }}>
          <div style={{ color: "var(--fg-dim)", marginBottom: "12px", display: "grid", placeItems: "center" }}>
            <Archive size={32} />
          </div>
          <h3>No records found</h3>
          <p style={{ color: "var(--fg-dim)", fontSize: "11px", marginTop: "4px" }}>
            Perform drawing extractions in the workspace to populate this log.
          </p>
        </div>
      ) : (
        <div className="table-scroll-container">
          <table className="results-table">
            <thead>
              <tr>
                <th style={{ width: "80px" }}>ID</th>
                <th>DRAWING FILENAME</th>
                <th style={{ width: "100px" }}>BEAMS</th>
                <th style={{ width: "100px" }}>STUDS</th>
                {isAdmin && <th style={{ width: "120px" }}>UPLOADER</th>}
                <th style={{ width: "160px" }}>DATE RECORDED</th>
                <th style={{ textAlign: "right", width: "200px" }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {historyList.map((item) => (
                <tr key={item.id}>
                  <td style={{ color: "var(--fg-dim)" }}>#{padNum(item.id, 3)}</td>
                  <td style={{ fontWeight: "600" }}>{item.filename}</td>
                  <td className="beam">{item.total_beams}</td>
                  <td className="stud">{item.total_studs}</td>
                  {isAdmin && (
                    <td>
                      <span className={`role-tag ${item.uploader === "admin" ? "admin" : "user"}`}>
                        {item.uploader || "unknown"}
                      </span>
                    </td>
                  )}
                  <td style={{ color: "var(--fg-muted)" }}>
                    {formatDate(item.created_at)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="history-actions-cell" style={{ gap: "6px" }}>
                      <button 
                        className="btn ghost small" 
                        onClick={() => handleLoad(item.id)}
                        style={{ display: "inline-flex", gap: "4px", height: "26px" }}
                      >
                        <FileSearch size={12} />
                        <span>VIEW</span>
                      </button>
                      {isAdmin && (
                        <button 
                          className="btn ghost small" 
                          onClick={(e) => handleDelete(item.id, e)}
                          style={{ display: "inline-flex", gap: "4px", color: "var(--err)", borderColor: "rgba(248,81,73,0.2)", height: "26px" }}
                        >
                          <Trash2 size={12} />
                          <span>DELETE</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
