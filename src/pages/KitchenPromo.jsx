export default function KitchenPromo() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        background: "var(--bg-dark)",
        color: "var(--text-primary)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.8rem, 8vw, 2.6rem)",
          letterSpacing: "0.02em",
          margin: 0,
          color: "var(--accent-primary)",
        }}
      >
        NON DOVEVI SCANSIONARE.
      </h1>
      <p
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "clamp(1.1rem, 5vw, 1.4rem)",
          color: "var(--text-secondary)",
          marginTop: "16px",
        }}
      >
        CI VEDIAMO PRESTO.
      </p>
    </div>
  );
}
