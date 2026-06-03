import { useState, useEffect, useRef } from "react";
import { 
  MOCK_SONGS, 
  MOOD_EMOJIS, 
  addRequest, 
  getRequests, 
  subscribeState, 
  getVenueSettings 
} from "../data/mockData";

export default function CustomerRequest() {
  const [table, setTable] = useState("");
  const [activeTab, setActiveTab] = useState("request"); // 'request' | 'my-songs'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSong, setSelectedSong] = useState(null);
  const [selectedMood, setSelectedMood] = useState("chill");
  const [dedication, setDedication] = useState("");
  const [submittedRequests, setSubmittedRequests] = useState([]);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [venueSettings, setVenueSettings] = useState({ queuePaused: false });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const notifiedSongIds = useRef(new Set());
  const [showLookUpAlert, setShowLookUpAlert] = useState(false);
  const [currentAlertSong, setCurrentAlertSong] = useState(null);

  // Monitor for playing songs from this table to trigger LookUp alert
  useEffect(() => {
    if (!submittedRequests || submittedRequests.length === 0) return;
    const playingRequest = submittedRequests.find((r) => r.status === "playing");
    if (playingRequest) {
      if (!notifiedSongIds.current.has(playingRequest.id)) {
        notifiedSongIds.current.add(playingRequest.id);
        setCurrentAlertSong(playingRequest);
        setShowLookUpAlert(true);
      }
    }
  }, [submittedRequests]);

  // Load table from URL query param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get("table");
    if (!tableParam) {
      // Redirect to entry if no table is set
      window.history.pushState({}, "", "/entry");
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    setTable(tableParam);

    // Sync initial state and register listener for real-time updates
    const syncState = () => {
      const allRequests = getRequests();
      const myRequests = allRequests.filter(
        (r) => String(r.table).trim().toLowerCase() === String(tableParam).trim().toLowerCase()
      );
      setSubmittedRequests(myRequests.reverse()); // latest first
      setVenueSettings(getVenueSettings());
    };

    syncState();
    const unsubscribe = subscribeState(syncState);
    
    // Cross-tab storage listener
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
  }, [table]);

  // Handle song selection
  const handleSelectSong = (song) => {
    setSelectedSong(song);
    setSelectedMood(song.mood); // pre-select song's default mood
    setSearchQuery(""); // clear search
  };

  // Submit request
  const handleSubmitRequest = (e) => {
    e.preventDefault();
    if (!selectedSong) return;
    if (venueSettings.queuePaused) {
      alert("La coda delle richieste è attualmente messa in pausa dallo staff.");
      return;
    }

    setIsSubmitting(true);
    
    setTimeout(() => {
      addRequest(table, selectedSong.id, selectedMood, dedication);
      
      // Reset form
      setSelectedSong(null);
      setDedication("");
      setSubmissionSuccess(true);
      setIsSubmitting(false);

      // Flash success and switch tabs
      setTimeout(() => {
        setSubmissionSuccess(false);
        setActiveTab("my-songs");
      }, 1500);
    }, 800); // simulated network delay
  };

  // Filter songs by search query
  const filteredSongs = searchQuery.trim() === "" 
    ? [] 
    : MOCK_SONGS.filter(
        (song) =>
          song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          song.artist.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Mood color helper for dynamic glow
  const getMoodColor = (mood) => {
    switch (mood) {
      case "party": return "var(--accent-primary)";
      case "chill": return "var(--accent-secondary)";
      case "energetic": return "var(--accent-glow)";
      case "romantic": return "hsl(340, 90%, 50%)";
      case "retro": return "hsl(35, 90%, 55%)";
      default: return "var(--accent-secondary)";
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return { text: "In attesa 🟡", bg: "rgba(255, 193, 7, 0.15)", border: "rgba(255, 193, 7, 0.4)", color: "#ffc107" };
      case "approved":
        return { text: "Approvata 🟢", bg: "rgba(40, 167, 69, 0.15)", border: "rgba(40, 167, 69, 0.4)", color: "#28a745" };
      case "playing":
        return { text: "Ora in onda 🔵", bg: "rgba(0, 255, 255, 0.15)", border: "rgba(0, 255, 255, 0.4)", color: "#00ffff" };
      case "rejected":
        return { text: "Rifiutata 🔴", bg: "rgba(220, 53, 69, 0.15)", border: "rgba(220, 53, 69, 0.4)", color: "#dc3545" };
      default:
        return { text: "Completata", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", color: "#aaa" };
    }
  };

  return (
    <div className="mobile-wrapper">
      <div className="mobile-bg-glow" style={{ background: `radial-gradient(circle, ${getMoodColor(selectedMood)} 0%, transparent 70%)` }}></div>

      {/* Header bar */}
      <header style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        paddingBottom: "15px", 
        borderBottom: "1px solid var(--glass-border)",
        marginBottom: "20px"
      }}>
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", fontFamily: "var(--font-display)", margin: "0" }}>
            Walbox Music
          </h2>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Live Queue Player
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="table-badge">
            Tavolo {table}
          </span>
          <button 
            onClick={() => {
              window.history.pushState({}, "", "/entry");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }} 
            className="btn-change-table"
          >
            Modifica 🔄
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "1fr 1fr", 
        gap: "10px", 
        marginBottom: "20px" 
      }}>
        <button 
          onClick={() => setActiveTab("request")}
          className="glass-panel"
          style={{
            padding: "12px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            background: activeTab === "request" ? "rgba(255, 255, 255, 0.08)" : "transparent",
            borderColor: activeTab === "request" ? "var(--accent-primary)" : "var(--glass-border)",
            color: activeTab === "request" ? "var(--text-primary)" : "var(--text-secondary)"
          }}
        >
          🎵 Richiedi Brano
        </button>
        <button 
          onClick={() => setActiveTab("my-songs")}
          className="glass-panel"
          style={{
            padding: "12px",
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            position: "relative",
            background: activeTab === "my-songs" ? "rgba(255, 255, 255, 0.08)" : "transparent",
            borderColor: activeTab === "my-songs" ? "var(--accent-primary)" : "var(--glass-border)",
            color: activeTab === "my-songs" ? "var(--text-primary)" : "var(--text-secondary)"
          }}
        >
          📋 Le Mie Richieste
          {submittedRequests.length > 0 && (
            <span style={{
              position: "absolute",
              top: "-5px",
              right: "-5px",
              background: "var(--accent-primary)",
              color: "white",
              fontSize: "10px",
              borderRadius: "50%",
              width: "18px",
              height: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold"
            }}>
              {submittedRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "request" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {venueSettings.queuePaused && (
            <div className="glass-panel" style={{ 
              padding: "15px", 
              backgroundColor: "rgba(255, 0, 127, 0.05)", 
              borderColor: "var(--accent-primary)",
              textAlign: "center"
            }}>
              <span style={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: "600" }}>
                ⏸️ Invio richieste temporaneamente sospeso dallo staff.
              </span>
            </div>
          )}

          {submissionSuccess ? (
            <div className="glass-panel" style={{ 
              padding: "40px 20px", 
              textAlign: "center", 
              borderColor: "var(--accent-glow)",
              animation: "pulseBorder 1s infinite" 
            }}>
              <h2 style={{ color: "var(--accent-glow)", fontSize: "24px", marginBottom: "10px" }}>
                Richiesta Inviata! 🚀
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                La tua richiesta è in attesa di approvazione da parte dello staff.
              </p>
            </div>
          ) : !selectedSong ? (
            /* Song Search View */
            <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "600" }}>Cerca una canzone</h3>
              
              <div className="form-group" style={{ margin: "0" }}>
                <input
                  type="text"
                  placeholder="Titolo o artista..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-input"
                  style={{ width: "100%" }}
                  disabled={venueSettings.queuePaused}
                />
              </div>

              {/* Search Results */}
              {searchQuery.trim() !== "" && (
                <div style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "10px", 
                  maxHeight: "300px", 
                  overflowY: "auto",
                  paddingTop: "5px" 
                }}>
                  {filteredSongs.length > 0 ? (
                    filteredSongs.map((song) => (
                      <div 
                        key={song.id} 
                        onClick={() => handleSelectSong(song)}
                        className="glass-panel"
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "12px", 
                          padding: "10px", 
                          cursor: "pointer",
                          borderColor: "rgba(255,255,255,0.05)" 
                        }}
                      >
                        <img 
                          src={song.cover} 
                          alt={song.title} 
                          style={{ width: "45px", height: "45px", borderRadius: "var(--radius-sm)", objectFit: "cover" }} 
                        />
                        <div style={{ flex: 1, minWidth: "0" }}>
                          <h4 style={{ fontSize: "14px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {song.title}
                          </h4>
                          <p style={{ fontSize: "12px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {song.artist}
                          </p>
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", paddingRight: "5px" }}>
                          {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, "0")}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "20px", color: "var(--text-secondary)", fontSize: "14px" }}>
                      Nessun brano trovato 😢
                    </div>
                  )}
                </div>
              )}

              {searchQuery.trim() === "" && (
                <div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "center", padding: "10px 0" }}>
                    Digita qualcosa per esplorare il catalogo locale.
                  </p>
                  
                  {/* Quick Suggestions */}
                  <div style={{ marginTop: "10px" }}>
                    <p style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "8px" }}>Consigliati stasera:</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {MOCK_SONGS.slice(0, 3).map((song) => (
                        <div 
                          key={song.id}
                          onClick={() => !venueSettings.queuePaused && handleSelectSong(song)}
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "10px", 
                            padding: "8px", 
                            borderRadius: "var(--radius-sm)",
                            background: "rgba(255,255,255,0.02)",
                            cursor: venueSettings.queuePaused ? "not-allowed" : "pointer",
                            fontSize: "13px"
                          }}
                        >
                          <img src={song.cover} alt="" style={{ width: "30px", height: "30px", borderRadius: "4px" }} />
                          <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <strong>{song.title}</strong> • <span style={{ color: "var(--text-secondary)" }}>{song.artist}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Selected Song Form Flow */
            <form onSubmit={handleSubmitRequest} className="glass-panel" style={{ 
              padding: "20px", 
              display: "flex", 
              flexDirection: "column", 
              gap: "20px",
              borderColor: getMoodColor(selectedMood),
              boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 15px ${getMoodColor(selectedMood)}15`
            }}>
              
              {/* Selected Track Info Card */}
              <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                <img 
                  src={selectedSong.cover} 
                  alt={selectedSong.title} 
                  style={{ 
                    width: "70px", 
                    height: "70px", 
                    borderRadius: "var(--radius-md)", 
                    objectFit: "cover",
                    boxShadow: `0 0 15px ${getMoodColor(selectedMood)}40` 
                  }} 
                />
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "700" }}>{selectedSong.title}</h4>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>{selectedSong.artist}</p>
                  <span className="glass-panel" style={{ 
                    display: "inline-block", 
                    padding: "2px 8px", 
                    fontSize: "11px", 
                    marginTop: "6px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    borderColor: getMoodColor(selectedMood),
                    color: getMoodColor(selectedMood)
                  }}>
                    {MOOD_EMOJIS[selectedMood]} {selectedMood}
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedSong(null)}
                  className="btn-secondary" 
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                >
                  Cambia
                </button>
              </div>

              {/* Mood Selector Chips */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                  Come ti senti? (Seleziona un mood)
                </label>
                <div style={{ 
                  display: "flex", 
                  gap: "8px", 
                  overflowX: "auto", 
                  paddingBottom: "5px",
                  whiteSpace: "nowrap",
                  WebkitOverflowScrolling: "touch"
                }}>
                  {Object.keys(MOOD_EMOJIS).map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => setSelectedMood(mood)}
                      className={`mood-chip ${selectedMood === mood ? `selected-${mood}` : ""}`}
                    >
                      {MOOD_EMOJIS[mood]} {mood.charAt(0).toUpperCase() + mood.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dedication Textarea */}
              <div className="form-group" style={{ margin: "0" }}>
                <label htmlFor="dedication-input" style={{ fontSize: "13px", fontWeight: "600" }}>
                  Aggiungi una dedica o un messaggio (opzionale)
                </label>
                <textarea
                  id="dedication-input"
                  rows="3"
                  maxLength="100"
                  placeholder="Es. Dedicata a tutti quelli del tavolo 3! 🍹 o Auguri Marco!"
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                  className="text-input"
                  style={{ resize: "none", width: "100%", fontSize: "16px" }}
                ></textarea>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", textAlign: "right" }}>
                  {dedication.length}/100 caratteri
                </span>
              </div>

              {/* Submit Button */}
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ 
                  background: getMoodColor(selectedMood),
                  boxShadow: `0 8px 20px ${getMoodColor(selectedMood)}45`,
                  color: selectedMood === "chill" || selectedMood === "romantic" ? "white" : "#05070e"
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Invio in corso..." : "Invia al Jukebox 🚀"}
              </button>
            </form>
          )}
        </div>
      ) : (
        /* My Songs List View */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {submittedRequests.length === 0 ? (
            <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)" }}>
              <span style={{ fontSize: "36px" }}>📻</span>
              <h3 style={{ fontSize: "16px", marginTop: "10px", color: "var(--text-primary)" }}>Nessuna richiesta effettuata</h3>
              <p style={{ fontSize: "13px", marginTop: "5px" }}>
                Le canzoni che prenoti appariranno qui insieme al loro stato di riproduzione in tempo reale.
              </p>
            </div>
          ) : (
            submittedRequests.map((req) => {
              const badge = getStatusBadge(req.status);
              return (
                <div 
                  key={req.id} 
                  className="glass-panel" 
                  style={{ 
                    padding: "15px", 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: "10px",
                    borderColor: req.status === "playing" ? "var(--accent-glow)" : "var(--glass-border)",
                    boxShadow: req.status === "playing" ? "var(--shadow-neon-cyan)" : "none"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <img 
                      src={req.song.cover} 
                      alt="" 
                      style={{ width: "50px", height: "50px", borderRadius: "var(--radius-sm)", objectFit: "cover" }} 
                    />
                    
                    <div style={{ flex: 1, minWidth: "0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                        <h4 style={{ fontSize: "14px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0" }}>
                          {req.song.title}
                        </h4>
                        
                        {/* Status Badge */}
                        <span style={{ 
                          padding: "2px 8px", 
                          borderRadius: "4px", 
                          fontSize: "11px", 
                          fontWeight: "bold",
                          backgroundColor: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.color,
                          whiteSpace: "nowrap"
                        }}>
                          {badge.text}
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }}>
                        {req.song.artist}
                      </p>
                    </div>
                  </div>

                  {req.dedication && (
                    <div style={{ 
                      fontSize: "12px", 
                      fontStyle: "italic", 
                      color: "var(--text-secondary)", 
                      background: "rgba(255,255,255,0.02)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      borderLeft: `2px solid ${getMoodColor(req.mood)}`
                    }}>
                      &ldquo;{req.dedication}&rdquo;
                    </div>
                  )}

                  {req.status === "playing" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px", padding: "0 5px" }}>
                      <span style={{ fontSize: "11px", color: "var(--accent-glow)", fontWeight: "600", letterSpacing: "1px", textTransform: "uppercase" }}>
                        In riproduzione nel locale!
                      </span>
                      <div className="eq-container" style={{ height: "15px" }}>
                        <div className="eq-bar" style={{ width: "2px", animationDuration: "0.8s" }}></div>
                        <div className="eq-bar" style={{ width: "2px", animationDuration: "1.2s" }}></div>
                        <div className="eq-bar" style={{ width: "2px", animationDuration: "0.9s" }}></div>
                        <div className="eq-bar" style={{ width: "2px", animationDuration: "1.4s" }}></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {showLookUpAlert && currentAlertSong && (
        <div className="look-up-overlay" onClick={() => setShowLookUpAlert(false)}>
          <div className="look-up-bg-glow" style={{ background: `radial-gradient(circle, ${getMoodColor(currentAlertSong.mood)} 0%, transparent 70%)` }}></div>
          
          <div className="look-up-content" onClick={(e) => e.stopPropagation()}>
            <div className="look-up-header-text">
              <h2>LOOK UP! 📺</h2>
              <h3>La tua traccia è ora in onda.</h3>
              <p>Alza lo sguardo al maxischermo. Abbiamo preparato una cartolina della tua serata da condividere.</p>
            </div>

            {/* Story Canvas Card */}
            <div className="story-canvas" style={{ borderColor: getMoodColor(currentAlertSong.mood) }}>
              <div className="story-canvas-header">
                <span>WALBOX LIVE SESSION</span>
                <span className="story-canvas-table">TAVOLO {currentAlertSong.table}</span>
              </div>

              <div className="story-canvas-body">
                <div className="story-canvas-cover-container">
                  <img 
                    src={currentAlertSong.song.cover} 
                    alt="" 
                    className="story-canvas-cover"
                    style={{ boxShadow: `0 0 20px ${getMoodColor(currentAlertSong.mood)}40` }}
                  />
                </div>
                
                <h4 className="story-canvas-title">{currentAlertSong.song.title}</h4>
                <p className="story-canvas-artist">{currentAlertSong.song.artist}</p>
                
                <span className="story-canvas-mood" style={{ borderColor: getMoodColor(currentAlertSong.mood), color: getMoodColor(currentAlertSong.mood) }}>
                  {MOOD_EMOJIS[currentAlertSong.mood]} {currentAlertSong.mood.toUpperCase()}
                </span>
              </div>

              <div className="story-canvas-dedication" style={{ borderLeftColor: getMoodColor(currentAlertSong.mood) }}>
                {currentAlertSong.dedication ? `“${currentAlertSong.dedication}”` : "“Soundtrack of the night.”"}
              </div>

              <div className="story-canvas-footer">
                <span className="story-canvas-location">📍 @WalboxVenue</span>
                <span className="story-canvas-watermark">📸 Screenshot & share your vibe</span>
              </div>
            </div>

            <button 
              onClick={() => setShowLookUpAlert(false)} 
              className="btn-secondary look-up-close-btn"
            >
              Torna al Jukebox ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
