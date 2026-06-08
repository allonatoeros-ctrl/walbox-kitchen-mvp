import { useState, useEffect } from "react";
import walrusLogo from "../../references/original_rebrand_pack/assets/walrus-logo2.png";

export default function CustomerEntry() {
  const [table, setTable] = useState("");
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
    window.history.pushState({}, "", `/request?table=${encodeURIComponent(table.trim())}`);
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
          padding: "45px min(24px, 6vw) 35px min(24px, 6vw)", 
          textAlign: "center", 
          display: "flex", 
          flexDirection: "column", 
          gap: "28px",
          boxSizing: "border-box",
          background: "#1c0a00", // Dark chocolate coaster/counter surface
          border: "2px solid #ff6600",
          borderTop: "8px solid #ff6600", // Thick counter top bar
          borderRadius: "12px",
          boxShadow: "8px 8px 0 #000000" // Hard black flat shadow
        }}
      >
        {/* Brand Logo and Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <img 
              src={walrusLogo} 
              alt="The Walrus Pub Logo" 
              style={{
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                border: "3px solid #ff6600",
                boxShadow: "0 0 20px rgba(255, 102, 0, 0.4)",
                display: "block"
              }}
            />
            {/* Retro sticker badge */}
            <div 
              style={{
                position: "absolute",
                bottom: "-6px",
                right: "-30px",
                background: "#ff6600",
                color: "#000000",
                fontFamily: "var(--font-display)",
                fontSize: "9px",
                fontWeight: "900",
                padding: "3px 8px",
                borderRadius: "3px",
                transform: "rotate(-8deg)",
                boxShadow: "2px 2px 0 #fffdd0", // Cream shadow
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
            >
              Always the Fucking Walrus
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "5px" }}>
            <h1 
              style={{ 
                fontFamily: "var(--font-display)", 
                fontSize: "clamp(36px, 10vw, 44px)", 
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "1px",
                lineHeight: "1.0",
                margin: "0",
                color: "#fffdd0", // Retro Cream
                textShadow: "3px 3px 0 #000"
              }}
            >
              THE WALBOX
            </h1>
            <p 
              style={{ 
                fontFamily: "var(--font-base)",
                fontSize: "12px", 
                color: "#ff6600", 
                fontWeight: "700", 
                letterSpacing: "3px",
                textTransform: "uppercase",
                margin: "0"
              }}
            >
              Social Jukebox v2
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
                border: isFocused ? "2px solid #ff6600" : "2px solid rgba(255, 102, 0, 0.4)",
                borderRadius: "8px",
                padding: "12px",
                color: "#fffdd0", // Retro cream text color
                fontSize: "24px",
                textAlign: "center",
                fontWeight: "800",
                letterSpacing: "2px",
                outline: "none",
                boxShadow: isFocused ? "0 0 15px rgba(255, 102, 0, 0.3)" : "none",
                transition: "all 0.2s ease"
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

          <button 
            type="submit" 
            style={{
              backgroundColor: "#ff6600",
              color: "#000000",
              border: "2px solid #000000",
              borderRadius: "8px",
              padding: "14px 24px",
              fontFamily: "var(--font-display)",
              fontSize: "16px",
              fontWeight: "800",
              textTransform: "uppercase",
              letterSpacing: "1px",
              cursor: "pointer",
              boxShadow: btnPressed ? "0 2px 0 #cc5200" : "0 6px 0 #cc5200",
              transform: btnPressed ? "translateY(4px)" : "translateY(0)",
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
            Entra nella Walbox 🍺
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
