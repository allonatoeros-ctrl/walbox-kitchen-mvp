import { useState, useEffect } from "react";

export default function CustomerEntry() {
  const [table, setTable] = useState("");
  const [error, setError] = useState("");

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
    <div className="mobile-wrapper" style={{ justifyContent: "center" }}>
      <div className="mobile-bg-glow"></div>
      
      <div className="glass-panel" style={{ padding: "40px 30px", textAlign: "center", display: "flex", flexDirection: "column", gap: "30px" }}>
        
        {/* Brand Header */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h1 style={{ 
            fontFamily: "var(--font-display)", 
            fontSize: "42px", 
            fontWeight: "800",
            letterSpacing: "-1px",
            lineHeight: "1",
            margin: "0",
            background: "linear-gradient(to right, var(--accent-primary), var(--accent-secondary))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 30px rgba(255, 0, 127, 0.2)"
          }}>
            WALBOX
          </h1>
          <p style={{ 
            fontSize: "14px", 
            color: "var(--accent-glow)", 
            fontWeight: "600", 
            letterSpacing: "2px",
            textTransform: "uppercase" 
          }}>
            Social Jukebox v2
          </p>
        </div>

        {/* Intro */}
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
          Scegli la musica del locale direttamente dal tuo tavolo. Senza app, senza registrazione.
        </p>

        {/* Entry Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="form-group" style={{ textAlign: "left", margin: "0" }}>
            <label htmlFor="table-input" style={{ fontSize: "13px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
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
              className="text-input text-input-table"
            />
            {error && (
              <span style={{ color: "var(--accent-primary)", fontSize: "13px", marginTop: "5px", fontWeight: "500" }}>
                ⚠️ {error}
              </span>
            )}
          </div>

          <button type="submit" className="btn-primary">
            Entra nel Jukebox ⚡
          </button>
        </form>

        {/* Footer info */}
        <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "20px", fontSize: "12px", color: "var(--text-secondary)" }}>
          📍 Connesso al Live System della sala
        </div>
      </div>
    </div>
  );
}
