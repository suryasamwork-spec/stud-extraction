import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";

export default function UploadView({ onFile }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div className="upload-view">
      <label
        className={"dropzone" + (drag ? " drag" : "")}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        aria-label="Upload structural framing drawing"
      >
        <div className="dz-icon">
          <UploadCloud size={32} />
        </div>
        <h3>Upload a framing drawing</h3>
        <p style={{ color: "var(--fg-muted)", fontSize: "12px", marginTop: "4px" }}>
          Click to browse or drag &amp; drop a file here
        </p>
        <div className="dz-hint">
          <span className="format-chip">PNG</span>
          <span className="format-chip">JPG</span>
          <span className="format-chip">TIFF</span>
          <span className="format-chip">PDF</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
        />
      </label>
      <p className="upload-foot" style={{ color: "var(--fg-dim)", fontSize: "11px", marginTop: "16px", maxWidth: "480px", textAlign: "center", lineHeight: "1.5" }}>
        After uploading, the drawing opens in the workspace canvas. Select <b>Run extraction</b> in the sidebar to read every beam and its corresponding stud count.
      </p>
    </div>
  );
}
