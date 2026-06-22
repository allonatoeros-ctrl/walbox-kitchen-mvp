import { useState, useEffect } from "react";

export default function CustomerKitchenEntry() {
  const [table, setTable] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get("table");
    if (tableParam) setTable(tableParam);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!table.trim()) {
      setError("Inserisci il numero del tavolo per ordinare.");
      return;
    }
    setError("");

    const cleanTable = table.trim().replace(/^[Tt]/, "");
    const cleanNickname = nickname.trim() || "Ospite Walrus";

    try {
      localStorage.setItem(
        "walboxCustomerSession",
        JSON.stringify({ table: cleanTable, nickname: cleanNickname })
      );
    } catch {}

    window.history.pushState({}, "", "/kitchen");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #1a0800 0%, #0d0400 100%)",
        padding: "24px 16px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            fontSize: 40,
            marginBottom: 8,
          }}
        >
          🍺
        </div>
        <h1
          style={{
            color: "#f05a24",
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          The Walrus
        </h1>
        <p
          style={{
            color: "#d4a55a",
            fontSize: 14,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            margin: "6px 0 0",
          }}
        >
          Ordina dal tavolo
        </p>
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              color: "#d4a55a",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            Numero tavolo *
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="es. 7"
            value={table}
            onChange={(e) => setTable(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#2a1000",
              border: "2px solid #f05a24",
              borderRadius: 10,
              color: "#fff",
              fontSize: 18,
              fontWeight: 700,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              color: "#d4a55a",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: 6,
            }}
          >
            Il tuo nome (opzionale)
          </label>
          <input
            type="text"
            placeholder="es. Marco"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#2a1000",
              border: "2px solid #3a1800",
              borderRadius: 10,
              color: "#fff",
              fontSize: 16,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {error && (
          <p
            style={{
              color: "#ff4444",
              fontSize: 13,
              margin: 0,
              fontWeight: 600,
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          style={{
            marginTop: 8,
            padding: "16px",
            background: "#f05a24",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontSize: 17,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            cursor: "pointer",
          }}
        >
          Vai al menu →
        </button>
      </form>
    </div>
  );
}
