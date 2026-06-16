import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { login } from "../api";

/* ── Stud bolt SVG icon (rotated, blue outline) ── */
const StudBoltIcon = () => (
  <svg
    viewBox="0 0 80 120"
    width="64"
    height="80"
    fill="none"
    stroke="#388bfd"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: "rotate(-30deg)",
      filter: "drop-shadow(0 2px 12px rgba(56, 139, 253, 0.5))",
    }}
  >
    {/* Hex head */}
    <polygon points="18,28 40,14 62,28 62,48 40,62 18,48" />
    <line x1="40" y1="14" x2="40" y2="62" />
    <path d="M18,28 L40,40 L62,28" />
    {/* Bolt shaft */}
    <path d="M28,52 L28,96 C28,101 52,101 52,96 L52,56" />
    {/* Threads */}
    <line x1="28" y1="62" x2="52" y2="58" />
    <line x1="28" y1="72" x2="52" y2="68" />
    <line x1="28" y1="82" x2="52" y2="78" />
    <line x1="28" y1="92" x2="52" y2="88" />
  </svg>
);

/* ── User icon ── */
const UserIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/* ── Lock icon ── */
const LockIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ── Eye icons ── */
const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

/* ── Forgot Password icon ── */
const ForgotIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
  </svg>
);

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lp-root">
      {/* ── Left: Full-bleed industrial photo ── */}
      <div className="lp-photo-panel" />

      {/* ── Right: Login form panel ── */}
      <div className="lp-form-panel">
        {/* Faint technical wireframe decoration on right edge */}
        <div className="lp-wireframe-deco" />

        <div className="lp-form-wrapper">
          {/* Logo + Brand */}
          <div className="lp-brand">
            <StudBoltIcon />
            <h1 className="lp-title">
              <span className="lp-title-blue">STUD</span>{" "}
              <span className="lp-title-white">EXTRACTION</span>
            </h1>
            <div className="lp-title-divider" />
            <p className="lp-subtitle">PRECISION. STRENGTH. RELIABILITY.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="lp-form" noValidate>
            {/* Username */}
            <div className="lp-field">
              <span className="lp-field-icon lp-field-icon--left">
                <UserIcon />
              </span>
              <input
                id="lp-username"
                type="text"
                className="lp-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
                autoFocus
              />
            </div>

            {/* Password */}
            <div className="lp-field">
              <span className="lp-field-icon lp-field-icon--left">
                <LockIcon />
              </span>
              <input
                id="lp-password"
                type={showPassword ? "text" : "password"}
                className="lp-input lp-input--has-right"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="lp-field-icon lp-field-icon--right lp-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="lp-error">
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              id="lp-submit"
              type="submit"
              className="lp-btn"
              disabled={loading}
            >
              {loading ? "AUTHENTICATING..." : "LOGIN"}
            </button>

            {/* Forgot Password */}
            <button
              type="button"
              className="lp-forgot"
              onClick={() => {/* placeholder */ }}
            >
              <ForgotIcon />
              <span>Forgot Password?</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
