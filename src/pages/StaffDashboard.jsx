import { useState, useEffect } from "react";
import { 
  getRequests, 
  getPlaybackState, 
  getVenueSettings,
  savePlaybackState, 
  saveVenueSettings,
  approveRequest, 
  rejectRequest, 
  prioritizeRequest,
  skipToNext,
  resetToDemoState,
  subscribeState,
  saveRequests,
  MOOD_EMOJIS
} from "../data/mockData";

export default function StaffDashboard() {
  const [requests, setRequests] = useState([]);
  const [playback, setPlayback] = useState({ isPlaying: false, progress: 0, duration: 0, currentRequestId: null });
  const [settings, setSettings] = useState({ queuePaused: false });

  // Sync state helper
  const syncState = () => {
    setRequests(getRequests());
    setPlayback(getPlaybackState());
    setSettings(getVenueSettings());
  };

  useEffect(() => {
    // Initial load
    syncState();

    // Subscribe to local memory state changes (same tab)
    const unsubscribe = subscribeState(syncState);

    // Subscribe to cross-tab updates (other tabs)
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith("walbox_")) {
        syncState();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Playback timer simulation: advances progress by 1s if playing
  useEffect(() => {
    if (!playback.isPlaying || !playback.currentRequestId) return;

    const interval = setInterval(() => {
      const freshPlayback = getPlaybackState();
      if (!freshPlayback.isPlaying || !freshPlayback.currentRequestId) return;

      const nextProgress = freshPlayback.progress + 1;
      if (nextProgress >= freshPlayback.duration) {
        // Track completed -> trigger next
        skipToNext();
      } else {
        savePlaybackState({
          ...freshPlayback,
          progress: nextProgress
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [playback.isPlaying, playback.currentRequestId]);

  // Derived state lists
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const approvedQueue = requests.filter((r) => r.status === "approved");
  
  // Find current request info
  const currentRequest = requests.find((r) => r.id === playback.currentRequestId && r.status === "playing");

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Play / Pause toggle
  const togglePlay = () => {
    const updated = { ...playback, isPlaying: !playback.isPlaying };
    savePlaybackState(updated);
  };

  // Toggle submission pause
  const togglePauseSubmissions = () => {
    const updated = { ...settings, queuePaused: !settings.queuePaused };
    saveVenueSettings(updated);
  };

  // Clear all queue / reset
  const handleClearQueue = () => {
    if (window.confirm("Sei sicuro di voler svuotare tutta la coda e resettare la sessione?")) {
      saveRequests([]);
      savePlaybackState({ isPlaying: false, progress: 0, duration: 0, currentRequestId: null });
    }
  };

  const handleResetDemo = () => {
    resetToDemoState();
  };

  // Mood color utility
  const getMoodColor = (mood) => {
    switch (mood) {
      case "party": return "var(--accent-primary)";
      case "chill": return "var(--accent-secondary)";
      case "energetic": return "var(--accent-glow)";
      case "romantic": return "hsl(340, 90%, 50%)";
      case "retro": return "hsl(35, 90%, 55%)";
      default: return "var(--text-secondary)";
    }
  };

  return (
    <div className="dashboard-container">
      {/* 1. COLUMN: PENDING APPROVALS */}
      <div className="dashboard-col">
        <div className="dashboard-col-header pending">
          <h2>Richieste Pendenti</h2>
          <span className="glass-panel" style={{ padding: "2px 8px", fontSize: "12px", background: "rgba(255,255,255,0.05)" }}>
            {pendingRequests.length} in attesa
          </span>
        </div>
        
        <div className="dashboard-col-content">
          {pendingRequests.length === 0 ? (
            <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
              Nessuna richiesta in attesa. ☕
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div 
                key={req.id} 
                className="staff-card" 
                style={{ borderLeft: `3px solid ${getMoodColor(req.mood)}` }}
              >
                <div className="staff-card-header">
                  <span className="table-badge" style={{ padding: "3px 8px", fontSize: "10px" }}>
                    Tavolo {req.table}
                  </span>
                  <span style={{ color: getMoodColor(req.mood), fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    {MOOD_EMOJIS[req.mood]} {req.mood}
                  </span>
                </div>

                <div className="staff-card-body">
                  <img 
                    src={req.song.cover} 
                    alt="" 
                    className="staff-card-cover" 
                  />
                  <div style={{ flex: 1, minWidth: "0" }}>
                    <h4 className="staff-card-title">{req.song.title}</h4>
                    <p className="staff-card-artist">{req.song.artist}</p>
                  </div>
                </div>

                {req.dedication && (
                  <p className="staff-card-dedication" style={{ borderLeftColor: getMoodColor(req.mood) }}>
                    &ldquo;{req.dedication}&rdquo;
                  </p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                  <button 
                    onClick={() => approveRequest(req.id)}
                    className="btn-approve"
                  >
                    Approva 👍
                  </button>
                  <button 
                    onClick={() => rejectRequest(req.id)}
                    className="btn-reject"
                  >
                    Rifiuta 👎
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. COLUMN: ACTIVE UPCOMING QUEUE */}
      <div className="dashboard-col">
        <div className="dashboard-col-header queue">
          <h2>Coda di Riproduzione</h2>
          <span className="glass-panel" style={{ padding: "2px 8px", fontSize: "12px", background: "rgba(255,255,255,0.05)" }}>
            {approvedQueue.length} brani successivi
          </span>
        </div>
        
        <div className="dashboard-col-content">
          {approvedQueue.length === 0 ? (
            <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
              Nessun brano in coda. Le richieste approvate appariranno qui.
            </div>
          ) : (
            approvedQueue.map((req, idx) => (
              <div 
                key={req.id} 
                className="staff-card" 
                style={{ 
                  flexDirection: "row", 
                  alignItems: "center", 
                  gap: "12px", 
                  padding: "10px 14px",
                  borderLeft: `3px solid ${getMoodColor(req.mood)}`
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--text-secondary)", width: "16px", textAlign: "center" }}>
                  {idx + 1}
                </span>
                
                <img 
                  src={req.song.cover} 
                  alt="" 
                  className="staff-card-cover" 
                  style={{ width: "36px", height: "36px", borderRadius: "4px" }}
                />
                
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 className="staff-card-title" style={{ fontSize: "13px" }}>{req.song.title}</h4>
                  <p className="staff-card-artist" style={{ fontSize: "11px" }}>
                    Tavolo {req.table} • {req.song.artist}
                  </p>
                </div>

                {/* Queue Control Buttons */}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button 
                    onClick={() => prioritizeRequest(req.id, -1)}
                    disabled={idx === 0}
                    className="icon-btn-queue"
                    title="Sposta Su"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                  </button>
                  <button 
                    onClick={() => prioritizeRequest(req.id, 1)}
                    disabled={idx === approvedQueue.length - 1}
                    className="icon-btn-queue"
                    title="Sposta Giù"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </button>
                  <button 
                    onClick={() => rejectRequest(req.id)}
                    className="icon-btn-queue remove"
                    title="Rimuovi"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. COLUMN: NOW PLAYING & SETTINGS */}
      <div className="dashboard-col">
        <div className="dashboard-col-header player">
          <h2>Player Centrale</h2>
        </div>

        <div className="dashboard-col-content" style={{ overflowY: "auto", gap: "20px" }}>
          
          {/* DJ DECK CONTAINER */}
          <div className="dj-deck" style={{ 
            borderColor: currentRequest ? getMoodColor(currentRequest.mood) : "var(--glass-border)",
            boxShadow: currentRequest ? `0 15px 40px rgba(0,0,0,0.6), 0 0 25px ${getMoodColor(currentRequest.mood)}15` : "none"
          }}>
            {currentRequest ? (
              <>
                <span style={{ fontSize: "10px", color: "var(--accent-glow)", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase" }}>
                  LIVE STREAM FEED 📻
                </span>
                
                {/* Vinyl Spinner */}
                <div className={`dj-deck-vinyl ${playback.isPlaying ? "vinyl-spin" : ""}`}>
                  <img 
                    src={currentRequest.song.cover} 
                    alt={currentRequest.song.title} 
                    className="dj-deck-cover"
                  />
                  {/* Vinyl center pin */}
                  <div style={{
                    position: "absolute",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "#08090f",
                    border: "2px solid rgba(255,255,255,0.2)",
                    zIndex: 3
                  }}></div>
                </div>

                <div style={{ width: "100%", textAlign: "center" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0" }}>
                    {currentRequest.song.title}
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px", marginBottom: "0" }}>
                    {currentRequest.song.artist}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "center", width: "100%" }}>
                  <span className="table-badge" style={{ padding: "4px 10px", fontSize: "11px" }}>
                    Tavolo {currentRequest.table}
                  </span>
                  <span className="table-badge" style={{ 
                    padding: "4px 10px", 
                    fontSize: "11px",
                    color: getMoodColor(currentRequest.mood),
                    borderColor: getMoodColor(currentRequest.mood)
                  }}>
                    {MOOD_EMOJIS[currentRequest.mood]} {currentRequest.mood.toUpperCase()}
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px", marginTop: "5px" }}>
                  <div className="progress-bar-container" style={{ height: "5px" }}>
                    <div 
                      className="progress-bar-fill" 
                      style={{ 
                        width: `${(playback.progress / playback.duration) * 100}%`,
                        background: getMoodColor(currentRequest.mood)
                      }}
                    ></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)" }}>
                    <span>{formatTime(playback.progress)}</span>
                    <span>{formatTime(playback.duration)}</span>
                  </div>
                </div>

                {/* Control Panel buttons */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "5px", width: "100%", justifyContent: "center" }}>
                  <button 
                    onClick={togglePlay}
                    className="btn-play-pause"
                    style={{
                      background: getMoodColor(currentRequest.mood),
                      boxShadow: `0 0 15px ${getMoodColor(currentRequest.mood)}50`,
                      color: currentRequest.mood === "chill" || currentRequest.mood === "romantic" ? "white" : "#05070e"
                    }}
                  >
                    {playback.isPlaying ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        PAUSA
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        PLAY
                      </>
                    )}
                  </button>
                  
                  <button 
                    onClick={skipToNext}
                    className="btn-skip-next"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                    SALTA
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "40px 10px", display: "flex", flexDirection: "column", gap: "12px", textAlign: "center", alignItems: "center" }}>
                <span style={{ fontSize: "40px" }}>🎵</span>
                <h3 style={{ margin: "0" }}>Nessun brano attivo</h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0" }}>
                  Approva un brano nella colonna a sinistra, oppure clicca sul bottone sotto per caricare la coda dimostrativa.
                </p>
                {approvedQueue.length > 0 && (
                  <button 
                    onClick={skipToNext}
                    className="btn-primary" 
                    style={{ alignSelf: "center", marginTop: "10px" }}
                  >
                    Avvia Riproduzione 🚀
                  </button>
                )}
              </div>
            )}
          </div>

          {/* VENUE CONTROL SETTINGS */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Pannello di Controllo Locale</h3>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "13px" }}>Blocca Richieste</strong>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Sospendi temporaneamente l'invio dai tavoli</p>
              </div>
              <button 
                onClick={togglePauseSubmissions}
                className="glass-panel" 
                style={{ 
                  padding: "6px 12px", 
                  fontSize: "12px",
                  borderColor: settings.queuePaused ? "var(--accent-primary)" : "var(--glass-border)",
                  color: settings.queuePaused ? "var(--accent-primary)" : "var(--text-primary)",
                  background: settings.queuePaused ? "rgba(255, 0, 127, 0.05)" : "transparent"
                }}
              >
                {settings.queuePaused ? "Sospeso ⏸️" : "Attivo 🟢"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "15px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button 
                onClick={handleClearQueue}
                className="btn-secondary" 
                style={{ padding: "8px", fontSize: "12px", color: "var(--accent-primary)" }}
              >
                Svuota Sessione 🗑️
              </button>
              <button 
                onClick={handleResetDemo}
                className="btn-secondary" 
                style={{ padding: "8px", fontSize: "12px", color: "var(--accent-glow)" }}
              >
                Carica Demo 🔄
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
