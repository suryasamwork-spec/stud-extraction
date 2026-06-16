import { useState, useRef, useEffect } from "react";
import { User, LogOut, ChevronDown, Sun, Moon } from "lucide-react";

const IBeamIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ display: "block" }}>
    <path d="M4 4h16v3h-6v10h6v3H4v-3h6V7H4Z" />
  </svg>
);

const BrandMark = () => (
  <div style={{
    width: "24px",
    height: "24px",
    borderRadius: "2px",
    backgroundColor: "var(--bg-2)",
    border: "1px solid var(--line)",
    display: "grid",
    placeItems: "center",
    color: "var(--accent)"
  }}>
    <IBeamIcon />
  </div>
);

export default function Header({ engine, currentUser, onLogout, theme, onToggleTheme }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => dropdownRef.current ? document.removeEventListener("mousedown", handleClickOutside) : undefined;
  }, []);

  // Translate engine status
  let statusClass = "status-dot";
  let statusText = "OCR CHECKING";
  let versionText = "";
  
  if (engine === "offline") {
    statusClass += " bad";
    statusText = "OFFLINE";
  } else if (engine && engine.available) {
    statusClass += " ok";
    statusText = "OCR READY";
    versionText = ` · v${engine.version || "5.5.0"}`;
  } else if (engine) {
    statusClass += " bad";
    statusText = "OCR ERROR";
  }

  return (
    <header className="app-header">
      <div className="brand">
        <BrandMark />
        <div>
          <h1>STUD EXTRACTION</h1>
          <p className="t-mono" style={{ fontSize: "9px", letterSpacing: "0.02em", color: "var(--fg-dim)" }}>
            STEEL FRAMING PARSER
          </p>
        </div>
      </div>
      
      <div className="header-actions">
        <span className="engine-status">
          <span className={statusClass} />
          <span>{statusText}{versionText}</span>
        </span>

        <button
          className="icon-btn"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{ cursor: "pointer" }}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {currentUser && (
          <div className="user-profile-container" ref={dropdownRef} style={{ position: "relative" }}>
            <div 
              className={`user-profile-badge ${showDropdown ? "active" : ""}`}
              onClick={() => setShowDropdown(!showDropdown)}
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              <div className="user-profile-icon">
                <User size={14} />
              </div>
              <div className="user-profile-info">
                <span className="user-profile-name">{currentUser.username}</span>
                <span className={`role-tag ${currentUser.role}`}>{currentUser.role}</span>
              </div>
              <ChevronDown 
                size={12} 
                className="chevron" 
                style={{ 
                  color: "var(--fg-dim)", 
                  transition: "transform 120ms ease-out", 
                  transform: showDropdown ? "rotate(180deg)" : "none",
                  marginLeft: "4px"
                }} 
              />
            </div>

            {showDropdown && (
              <div className="user-profile-dropdown">
                <div className="dropdown-user-header">
                  <div className="avatar-square">
                    <User size={18} />
                  </div>
                  <div className="user-profile-info">
                    <span className="dropdown-username">{currentUser.username}</span>
                    <span className="dropdown-role">{currentUser.role.toUpperCase()} ACCOUNT</span>
                  </div>
                </div>
                <div style={{ width: "100%", height: "1px", backgroundColor: "var(--line)", margin: "4px 0" }}></div>
                <button 
                  className="dropdown-item logout-btn" 
                  onClick={() => {
                    setShowDropdown(false);
                    onLogout();
                  }}
                  style={{ 
                    width: "100%", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px", 
                    border: "none", 
                    background: "transparent", 
                    color: "var(--err)", 
                    padding: "10px 12px", 
                    cursor: "pointer", 
                    fontSize: "12px", 
                    textAlign: "left", 
                    fontFamily: "var(--font-sans)", 
                    fontWeight: "600" 
                  }}
                >
                  <LogOut size={14} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
