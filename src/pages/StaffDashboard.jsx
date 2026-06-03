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
        <div className="dashboard-col-header">
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
                className="glass-panel" 
                style={{ 
                  padding: "15px", 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "10px",
                  borderColor: "rgba(255,255,255,0.06)" 
                }}
              >
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <img 
                    src={req.song.cover} 
                    alt="" 
                    style={{ width: "50px", height: "50px", borderRadius: "6px", objectFit: "cover" }} 
                  />
                  <div style={{ flex: 1, minWidth: "0" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {req.song.title}
                    </h4>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {req.song.artist}
                    </p>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "5px" }}>
                      <span className="glass-panel" style={{ padding: "1px 6px", fontSize: "10px", fontWeight: "bold", color: "var(--accent-glow)", borderColor: "var(--accent-glow)" }}>
                        Tavolo {req.table}
                      </span>
                      <span className="glass-panel" style={{ padding: "1px 6px", fontSize: "10px", fontWeight: "bold", color: getMoodColor(req.mood), borderColor: getMoodColor(req.mood) }}>
                        {MOOD_EMOJIS[req.mood]} {req.mood}
                      </span>
                    </div>
                  </div>
                </div>

                {req.dedication && (
                  <p style={{ 
                    fontSize: "12px", 
                    color: "var(--text-secondary)", 
                    fontStyle: "italic", 
                    background: "rgba(255,255,255,0.02)", 
                    padding: "6px 10px", 
                    borderRadius: "4px",
                    borderLeft: `2px solid ${getMoodColor(req.mood)}`
                  }}>
                    &ldquo;{req.dedication}&rdquo;
                  </p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "5px" }}>
                  <button 
                    onClick={() => approveRequest(req.id)}
                    className="btn-primary" 
                    style={{ 
                      padding: "8px", 
                      fontSize: "13px", 
                      background: "linear-gradient(135deg, #28a745, #218838)",
                      boxShadow: "none"
                    }}
                  >
                    Approva 👍
                  </button>
                  <button 
                    onClick={() => rejectRequest(req.id)}
                    className="btn-secondary" 
                    style={{ padding: "8px", fontSize: "13px" }}
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
        <div className="dashboard-col-header">
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
                className="glass-panel" 
                style={{ 
                  padding: "12px", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "12px",
                  borderColor: "rgba(255,255,255,0.05)" 
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: "bold", color: "var(--text-secondary)", width: "20px", textAlign: "center" }}>
                  {idx + 1}
                </span>
                
                <img 
                  src={req.song.cover} 
                  alt="" 
                  style={{ width: "40px", height: "40px", borderRadius: "4px", objectFit: "cover" }} 
                />
                
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {req.song.title}
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    Tavolo {req.table} • {req.song.artist}
                  </p>
                </div>

                {/* Queue Control Buttons */}
                <div style={{ display: "flex", gap: "4px" }}>
                  <button 
                    onClick={() => prioritizeRequest(req.id, -1)}
                    disabled={idx === 0}
                    className="btn-secondary" 
                    style={{ padding: "5px 8px", fontSize: "12px", opacity: idx === 0 ? 0.3 : 1 }}
                    title="Sposta Su"
                  >
                    ⬆️
                  </button>
                  <button 
                    onClick={() => prioritizeRequest(req.id, 1)}
                    disabled={idx === approvedQueue.length - 1}
                    className="btn-secondary" 
                    style={{ padding: "5px 8px", fontSize: "12px", opacity: idx === approvedQueue.length - 1 ? 0.3 : 1 }}
                    title="Sposta Giù"
                  >
                    ⬇️
                  </button>
                  <button 
                    onClick={() => rejectRequest(req.id)}
                    className="btn-secondary" 
                    style={{ padding: "5px 8px", fontSize: "12px", color: "var(--accent-primary)" }}
                    title="Rimuovi"
                  >
                    ❌
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. COLUMN: NOW PLAYING & SETTINGS */}
      <div className="dashboard-col">
        <div className="dashboard-col-header">
          <h2>Player Centrale</h2>
        </div>

        <div className="dashboard-col-content" style={{ overflowY: "auto", gap: "20px" }}>
          
          {/* NOW PLAYING CONTAINER */}
          <div className="glass-panel" style={{ 
            padding: "25px", 
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "15px",
            borderColor: currentRequest ? getMoodColor(currentRequest.mood) : "var(--glass-border)",
            boxShadow: currentRequest ? `0 8px 32px 0 rgba(0,0,0,0.4), 0 0 20px ${getMoodColor(currentRequest.mood)}20` : "none"
          }}>
            {currentRequest ? (
              <>
                <span style={{ fontSize: "11px", color: "var(--accent-glow)", fontWeight: "bold", letterSpacing: "2px", textTransform: "uppercase" }}>
                  In Riproduzione 📻
                </span>
                
                <img 
                  src={currentRequest.song.cover} 
                  alt={currentRequest.song.title} 
                  style={{ 
                    width: "180px", 
                    height: "180px", 
                    borderRadius: "12px", 
                    objectFit: "cover",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                    border: `1px solid rgba(255,255,255,0.1)` 
                  }} 
                />

                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: "800" }}>{currentRequest.song.title}</h3>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>{currentRequest.song.artist}</p>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                  <span className="glass-panel" style={{ padding: "2px 8px", fontSize: "11px", color: getMoodColor(currentRequest.mood), borderColor: getMoodColor(currentRequest.mood) }}>
                    Tavolo {currentRequest.table}
                  </span>
                  {currentRequest.dedication && (
                    <span className="glass-panel" style={{ padding: "2px 8px", fontSize: "11px", color: "var(--text-secondary)" }} title={currentRequest.dedication}>
                      💬 Con dedica
                    </span>
                  )}
                </div>

                {/* Progress Bar */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div className="progress-bar-container">
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
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "5px" }}>
                  <button 
                    onClick={togglePlay}
                    className="btn-primary" 
                    style={{ 
                      padding: "10px 20px", 
                      fontSize: "14px",
                      background: playback.isPlaying ? "var(--btn-sec)" : getMoodColor(currentRequest.mood),
                      color: "black",
                      fontWeight: "bold",
                      boxShadow: "none"
                    }}
                  >
                    {playback.isPlaying ? "PAUSA ⏸️" : "PLAY ▶️"}
                  </button>
                  
                  <button 
                    onClick={skipToNext}
                    className="btn-secondary" 
                    style={{ padding: "10px 15px", fontSize: "14px" }}
                    title="Salta alla prossima"
                  >
                    SALTA ⏭️
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "40px 10px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <span style={{ fontSize: "40px" }}>🎵</span>
                <h3>Nessun brano attivo</h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
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
