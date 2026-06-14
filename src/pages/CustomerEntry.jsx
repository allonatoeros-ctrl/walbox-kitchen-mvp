import { useState, useEffect } from "react";
import walrusLogo from "../../references/original_rebrand_pack/assets/walrus-logo2.png";

export default function CustomerEntry() {
  const [table, setTable] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  // Custom states for premium micro-interactions
  const [isFocused, setIsFocused] = useState(false);
  const [btnPressed, setBtnPressed] = useState(false);

  useEffect(() => {
    // Check if table is already in the query params (e.g., scan QR code ?table=5)
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get("table");
    if (tableParam) {
      setTable(tableParam);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!table.trim()) {
      setError("Inserisci il numero del tuo tavolo per continuare.");
      return;
    }
    setError("");

    // Custom Router navigation
    const qs = new URLSearchParams({ table: table.trim() });
    if (nickname.trim()) qs.set("nickname", nickname.trim());
    window.history.pushState({}, "", `/request?${qs.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div
      className="mobile-wrapper"
      style={{
        justifyContent: "center",
        background: "linear-gradient(180deg, #331100 0%, #1a0800 100%)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}
    >
      <style>{`
        @keyframes stickerPulse {
          0%, 100% { transform: rotate(-4deg) scale(1); }
          50% { transform: rotate(-2deg) scale(1.04); }
        }
        .sticker-animate {
          animation: stickerPulse 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sticker-animate {
            animation: none !important;
          }
        }
      `}</style>

      {/* Background glow tailored to Walrus Beer theme */}
      <div
        className="mobile-bg-glow"
        style={{
          background: "radial-gradient(circle, rgba(255, 102, 0, 0.25) 0%, transparent 70%)"
        }}
      ></div>

      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "400px",
          margin: "0 auto",
          padding: "20px min(16px, 4vw) 10px min(16px, 4vw)",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: "40px", // More breathing room for logo, title, and form
          boxSizing: "border-box",
          background: "transparent", // Remove dark chocolate card background
          border: "none", // Remove border
          boxShadow: "none" // Remove hard flat shadow to de-card the entry
        }}
      >
        {/* Brand Logo and Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
          {/* Logo and Sticker Wrapper */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <img
              src={walrusLogo}
              alt="The Walrus Pub Logo"
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                border: "4px solid #ff6600",
                boxShadow: "0 0 35px rgba(255, 102, 0, 0.55)",
                display: "block"
              }}
            />
            {/* Retro sticker badge */}
            <div
              className="sticker-animate"
              style={{
                background: "#000000",
                color: "#ff6600",
                fontFamily: "var(--font-display)",
                fontSize: "9px",
                fontWeight: "900",
                padding: "4px 10px",
                borderRadius: "3px",
                transform: "rotate(-4deg)",
                boxShadow: "2px 2px 0 #fffdd0", // Cream shadow
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
            >
              ALWAYS THE FUCKING WALRUS
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "5px" }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(36px, 10vw, 44px)",
                fontWeight: "900",
                textTransform: "uppercase",
                letterSpacing: "1px",
                lineHeight: "1.0",
                margin: "0",
                color: "#fffdd0", // Retro Cream
                textShadow: "4px 4px 0 #000"
              }}
            >
              THE WALBOX
            </h1>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                color: "#ff6600",
                fontWeight: "900",
                letterSpacing: "4px",
                textTransform: "uppercase",
                margin: "0"
              }}
            >
              TRICHECO MUSIC EXPERIENCE
            </p>
          </div>
        </div>

        {/* Intro copy */}
        <p
          style={{
            fontFamily: "var(--font-base)",
            fontSize: "14px",
            color: "#a0a0a0",
            lineHeight: "1.6",
            margin: "0"
          }}
        >
          Scegli la musica del locale direttamente dal tuo tavolo.<br />
          <span style={{ color: "#fffdd0", fontWeight: "600" }}>Senza app, senza registrazione.</span>
          <span style={{ display: "block", fontSize: "12px", color: "#a0a0a0", fontStyle: "italic", marginTop: "6px" }}>
            Problemi fuori, birre grandi dentro. 🍺
          </span>
        </p>

        {/* Entry Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div className="form-group" style={{ textAlign: "left", margin: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
              htmlFor="table-input"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                color: "#ff6600",
                fontWeight: "700",
                letterSpacing: "1px",
                textTransform: "uppercase"
              }}
            >
              Numero del Tavolo
            </label>
            <input
              id="table-input"
              type="text"
              pattern="[0-9]*"
              inputMode="numeric"
              placeholder="Es. 12"
              value={table}
              onChange={(e) => {
                setTable(e.target.value);
                if (error) setError("");
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className="text-input text-input-table"
              style={{
                width: "100%",
                background: "#0c0400", // Darkest chocolate background
                border: "2px solid #ff6600",
                borderRadius: "6px",
                padding: "12px",
                color: "#fffdd0", // Retro cream text color
                fontSize: "24px",
                textAlign: "center",
                fontWeight: "800",
                letterSpacing: "2px",
                outline: "none",
                boxShadow: isFocused ? "4px 4px 0 #000000" : "none",
                transition: "all 0.1s ease"
              }}
            />
            {error && (
              <span
                style={{
                  color: "#ff4d4d",
                  fontSize: "13px",
                  marginTop: "6px",
                  fontWeight: "600",
                  display: "block",
                  textAlign: "center"
                }}
              >
                ⚠️ {error}
              </span>
            )}
          </div>

          <div className="form-group" style={{ textAlign: "left", margin: "0", display: "flex", flexDirection: "column", gap: "8px" }}>
            <label
              htmlFor="nickname-input"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "12px",
                color: "#ff6600",
                fontWeight: "700",
                letterSpacing: "1px",
                textTransform: "uppercase"
              }}
            >
              Il tuo nome (opzionale)
            </label>
            <input
              id="nickname-input"
              type="text"
              placeholder="Es. Marco"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              className="text-input"
              style={{
                width: "100%",
                background: "#0c0400",
                border: "2px solid #ff6600",
                borderRadius: "6px",
                padding: "12px",
                color: "#fffdd0",
                fontSize: "18px",
                textAlign: "center",
                fontWeight: "700",
                letterSpacing: "1px",
                outline: "none",
                transition: "all 0.1s ease"
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              backgroundColor: "#ff6600",
              color: "#000000",
              border: "2px solid #000000",
              borderRadius: "6px",
              padding: "14px 24px",
              fontFamily: "var(--font-display)",
              fontSize: "16px",
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: "1px",
              cursor: "pointer",
              boxShadow: btnPressed ? "0 2px 0 #000000" : "0 8px 0 #000000",
              transform: btnPressed ? "translateY(6px)" : "translateY(0)",
              transition: "transform 0.1s, box-shadow 0.1s",
              width: "100%",
              textAlign: "center"
            }}
            onMouseDown={() => setBtnPressed(true)}
            onMouseUp={() => setBtnPressed(false)}
            onMouseLeave={() => setBtnPressed(false)}
            onTouchStart={() => setBtnPressed(true)}
            onTouchEnd={() => setBtnPressed(false)}
          >
            ENTRA NEL WALBOX 🍺
          </button>
        </form>

        {/* Footer info */}
        <div
          style={{
            borderTop: "2px solid rgba(255, 102, 0, 0.15)",
            paddingTop: "20px",
            fontSize: "12px",
            fontFamily: "var(--font-base)",
            color: "#a0a0a0",
            letterSpacing: "0.5px"
          }}
        >
          📍 Connesso alla Sala VAR del locale
        </div>
      </div>
    </div>
  );
}
