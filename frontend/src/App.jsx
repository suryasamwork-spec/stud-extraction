import { useEffect, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import UploadView from "./components/UploadView.jsx";
import DrawingViewer from "./components/DrawingViewer.jsx";
import ResultsTable from "./components/ResultsTable.jsx";
import LoginView from "./components/LoginView.jsx";
import HistoryView from "./components/HistoryView.jsx";
import UserManagementView from "./components/UserManagementView.jsx";
import { getHealth, previewFile, extractFile, extractRegion, getPageCount, getCurrentUser, logout } from "./api.js";

// Recompute summary client-side after merging region results.
function buildSummaryClient(results) {
  const groups = {};
  let totalStuds = 0;
  for (const r of results) {
    const g = groups[r.beam_section] ?? (groups[r.beam_section] = { section: r.beam_section, count: 0, stud_total: 0, instances: [] });
    g.count += 1;
    g.instances.push(r.stud_value);
    if (typeof r.stud_value === "number") { g.stud_total += r.stud_value; totalStuds += r.stud_value; }
  }
  const sections = Object.values(groups).sort((a, b) => a.section.localeCompare(b.section));
  return { total_beams: results.length, total_studs: totalStuds, total_sections: sections.length, sections };
}

export default function App() {
  const [engine, setEngine]           = useState(null);
  const [file, setFile]               = useState(null);
  const [error, setError]             = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages]   = useState(1);
  const [previewUrl, setPreviewUrl]   = useState(null);

  // Authentication & Layout Tab State
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [activeTab, setActiveTab]     = useState("workspace");

  // Theme State
  const [theme, setTheme]             = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Per-page state
  const [pagesData, setPagesData]     = useState({});   // { [idx]: {results, ocr_width, ocr_height, summary} }
  const [pageStatus, setPageStatus]   = useState({});   // { [idx]: "idle"|"working"|"done"|"error" }

  const previewCache = useRef({});

  useEffect(() => {
    // Check user session
    getCurrentUser()
      .then((user) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setLoadingUser(false));

    getHealth().then((d) => setEngine(d.tesseract)).catch(() => setEngine("offline"));
  }, []);

  async function fetchPreview(f, page) {
    if (previewCache.current[page]) {
      setPreviewUrl(previewCache.current[page]);
      return;
    }
    setPreviewUrl(null);
    try {
      const url = await previewFile(f, page);
      previewCache.current[page] = url;
      setPreviewUrl(url);
    } catch (e) {
      setError("Preview failed: " + e.message);
    }
  }

  async function handleFile(f) {
    Object.values(previewCache.current).forEach((u) => URL.revokeObjectURL(u));
    previewCache.current = {};
    setFile(f);
    setPagesData({});
    setPageStatus({});
    setError(null);
    setCurrentPage(0);
    setTotalPages(1);
    setPreviewUrl(null);
    const [, count] = await Promise.all([fetchPreview(f, 0), getPageCount(f)]);
    setTotalPages(count);
  }

  function handleReset() {
    Object.values(previewCache.current).forEach((u) => URL.revokeObjectURL(u));
    previewCache.current = {};
    setFile(null);
    setPreviewUrl(null);
    setPagesData({});
    setPageStatus({});
    setError(null);
    setCurrentPage(0);
    setTotalPages(1);
  }

  // The region the user has drawn (normalised 0-1), or null for full page.
  const [regionSel, setRegionSel] = useState(null);

  // Extract the current page — OR, if a region is selected, just that region
  // (merged into existing results).  Same button, scoped smaller.
  async function handleExtract() {
    if (!file) return;
    const pg = currentPage;
    setPageStatus((prev) => ({ ...prev, [pg]: "working" }));
    setError(null);

    // Region mode: crop + thorough extract, MERGE into existing results.
    if (regionSel) {
      try {
        const result = await extractRegion(file, pg, regionSel);
        setPagesData((prev) => {
          const existing = prev[pg]?.results ?? [];
          const merged = [...existing];
          // A region beam landing on an existing detection is the SAME physical
          // beam (the region pass may shift its position slightly or misread a
          // digit, e.g. 56→66).  Treat anything co-located as a duplicate and
          // keep the original.  Beams are ~0.08 apart, so 0.018 is safe.
          const DUP = 0.018;
          for (const nb of result.results) {
            const dup = merged.some(
              (e) => Math.abs(e.cx - nb.cx) < DUP && Math.abs(e.cy - nb.cy) < DUP
            );
            if (!dup) merged.push(nb);
          }
          return {
            ...prev,
            [pg]: {
              results:    merged,
              ocr_width:  result.ocr_width  ?? prev[pg]?.ocr_width,
              ocr_height: result.ocr_height ?? prev[pg]?.ocr_height,
              summary:    buildSummaryClient(merged),
            },
          };
        });
        setPageStatus((prev) => ({ ...prev, [pg]: "done" }));
        setRegionSel(null);   // clear the box once extracted
      } catch (e) {
        setError(e.message);
        setPageStatus((prev) => ({ ...prev, [pg]: "error" }));
      }
      return;
    }

    // Full-page extraction (replaces results)
    try {
      const result = await extractFile(file, pg);
      setPagesData((prev) => ({
        ...prev,
        [pg]: {
          results:    result.results,
          ocr_width:  result.ocr_width,
          ocr_height: result.ocr_height,
          summary:    result.summary,
        },
      }));
      setPageStatus((prev) => ({ ...prev, [pg]: "done" }));
    } catch (e) {
      setError(e.message);
      setPageStatus((prev) => ({ ...prev, [pg]: "error" }));
    }
  }

  async function handlePageChange(newPage) {
    setRegionSel(null);
    setCurrentPage(newPage);
    fetchPreview(file, newPage);
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
    handleReset();
    setActiveTab("workspace");
  }

  function handleLoadHistoryItem(payload) {
    Object.values(previewCache.current).forEach((u) => URL.revokeObjectURL(u));
    previewCache.current = {};

    setFile({ name: payload.filename, size: 0 });
    setPreviewUrl(null);
    setPagesData({
      0: {
        results:    payload.results,
        ocr_width:  payload.ocr_width,
        ocr_height: payload.ocr_height,
        summary:    payload.summary,
      }
    });
    setPageStatus({ 0: "done" });
    setError(null);
    setCurrentPage(0);
    setTotalPages(1);
    setActiveTab("workspace");
  }

  if (loadingUser) {
    return (
      <div className="history-loading-container" style={{ height: "100vh" }}>
        <div className="pg-spinner" style={{ fontSize: "32px" }}>⋯</div>
        <p style={{ marginTop: "12px", color: "var(--muted)", fontSize: "14px" }}>Verifying credentials session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginView 
        onLoginSuccess={(user) => setCurrentUser(user)} 
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
    );
  }

  const pageData    = pagesData[currentPage] ?? null;
  const curStatus   = pageStatus[currentPage] ?? "idle";
  const summary     = pageData?.summary ?? null;

  return (
    <>
      <Header 
        engine={engine} 
        currentUser={currentUser} 
        onLogout={handleLogout} 
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />
      <main className="layout">
        <Sidebar
          fileName={file?.name ?? null}
          status={curStatus}
          summary={summary}
          pageCount={totalPages}
          currentPage={currentPage}
          pageStatus={pageStatus}
          onPageChange={handlePageChange}
          onExtract={handleExtract}
          onReset={handleReset}
          hasRegion={!!regionSel}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentUser={currentUser}
        />
        <section className="content">
          {activeTab === "users" ? (
            <UserManagementView currentUser={currentUser} />
          ) : activeTab === "history" ? (
            <HistoryView currentUser={currentUser} onLoadHistoryItem={handleLoadHistoryItem} />
          ) : !file ? (
            <UploadView onFile={handleFile} />
          ) : (
            <>
              <DrawingViewer
                url={previewUrl}
                fileName={file.name}
                status={curStatus}
                error={error}
                results={pageData?.results ?? null}
                ocrW={pageData?.ocr_width  ?? null}
                ocrH={pageData?.ocr_height ?? null}
                currentPage={currentPage}
                pageCount={totalPages}
                onPageChange={handlePageChange}
                regionSel={regionSel}
                onRegionSelect={setRegionSel}
              />
              {curStatus === "done" && pageData?.results?.length > 0 && (
                <div className="results-section">
                  <ResultsTable
                    results={pageData.results}
                    currentPage={currentPage}
                    pageCount={totalPages}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
