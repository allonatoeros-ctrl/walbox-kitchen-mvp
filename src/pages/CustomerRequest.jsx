import { useState, useEffect, useRef } from "react";
import { 
  MOCK_SONGS, 
  MOOD_EMOJIS, 
  addRequest, 
  getRequests, 
  subscribeState, 
  getVenueSettings,
  MOOD_LABELS
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

  // Playlist label helper for song cards
  const getPlaylistLabel = (mood) => {
    switch (mood) {
      case "party": return "CAVALLOOOO 🐴";
      case "retro": return "VECCHIA SCUOLA DA BANCONE 🎸";
      case "chill": return "ZEN, BIRRA E MUTISMO 🍺";
      case "romantic": return "DEDICA TOSSICA 💔";
      case "energetic": return "STA SALENDO MALE ⚡";
      default: return "SELEZIONE WALBOX 🦭";
    }
  };

  return (
    <div className="mobile-wrapper" style={{ background: "linear-gradient(180deg, #331100 0%, #1a0800 100%)", minHeight: "100vh" }}>
      <style>{`
        .walbox-search-input {
          width: 100%;
          background: #0c0400 !important;
          border: 2px solid #ff6600 !important;
          border-radius: 6px !important;
          padding: 14px 18px !important;
          color: #fffdd0 !important;
          font-size: 16px !important;
          outline: none !important;
          box-shadow: 4px 4px 0 #000000 !important;
          transition: all 0.1s ease !important;
        }
        .walbox-search-input:focus {
          border-color: #ff6600 !important;
          box-shadow: 6px 6px 0 #000000 !important;
          background: #120600 !important;
        }
        .walbox-search-input::placeholder {
          color: #a0a0a0 !important;
          opacity: 0.7;
        }
        .walbox-song-card {
          transition: transform 0.1s, box-shadow 0.1s !important;
        }
        .walbox-song-card:hover {
          transform: translate(-2px, -2px) !important;
          box-shadow: 6px 6px 0 #000000 !important;
          border-color: #ff8800 !important;
        }
        .walbox-song-card:active {
          transform: translate(1px, 1px) !important;
          box-shadow: 2px 2px 0 #000000 !important;
        }
        .walbox-song-card-suggestion {
          transition: transform 0.1s, box-shadow 0.1s !important;
        }
        .walbox-song-card-suggestion:hover:not([disabled]) {
          transform: translate(-1px, -1px) !important;
          box-shadow: 4px 4px 0 #000000 !important;
          border-color: #ff8800 !important;
        }
        .walbox-song-card-suggestion:active:not([disabled]) {
          transform: translate(1px, 1px) !important;
          box-shadow: 1px 1px 0 #000000 !important;
        }
        .walbox-mood-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 14px !important;
          font-family: var(--font-display) !important;
          font-size: 13px !important;
          font-weight: 800 !important;
          letter-spacing: 0.5px !important;
          color: #fffdd0 !important;
          background: #120600 !important;
          border: 2px solid #ff6600 !important;
          border-radius: 6px !important;
          box-shadow: 3px 3px 0 #000000 !important;
          cursor: pointer !important;
          transition: transform 0.1s, box-shadow 0.1s, background-color 0.1s !important;
        }
        .walbox-mood-chip:hover {
          background: #1c0a00 !important;
          border-color: #ff8800 !important;
        }
        .walbox-mood-chip.selected {
          background: #ff6600 !important;
          color: #000000 !important;
          border-color: #fffdd0 !important;
          box-shadow: 3px 3px 0 #ff007f !important;
          transform: translate(1px, 1px) !important;
        }
        .walbox-mood-chip:active {
          transform: translate(2px, 2px) !important;
          box-shadow: 1px 1px 0 #000000 !important;
        }
        .walbox-textarea {
          width: 100%;
          background: #0c0400 !important;
          border: 2px solid #ff6600 !important;
          border-radius: 6px !important;
          padding: 12px 16px !important;
          color: #fffdd0 !important;
          font-family: monospace !important;
          font-size: 15px !important;
          outline: none !important;
          box-shadow: 4px 4px 0 #000000 !important;
          resize: none !important;
          transition: all 0.1s ease !important;
        }
        .walbox-textarea:focus {
          border-color: #ff8800 !important;
          box-shadow: 6px 6px 0 #000000 !important;
          background: #120600 !important;
        }
        .walbox-textarea::placeholder {
          color: #a0a0a0 !important;
          opacity: 0.6;
        }
        .walbox-submit-btn {
          width: 100%;
          background: #ff6600 !important;
          color: #000000 !important;
          border: 2px solid #000000 !important;
          border-radius: 6px !important;
          padding: 14px 24px !important;
          font-family: var(--font-display) !important;
          font-size: 16px !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          letter-spacing: 1px !important;
          cursor: pointer !important;
          box-shadow: 0 8px 0 #000000 !important;
          transform: translateY(0) !important;
          transition: transform 0.1s, box-shadow 0.1s, background-color 0.1s !important;
          text-align: center !important;
        }
        .walbox-submit-btn:hover:not(:disabled) {
          background: #ff8800 !important;
        }
        .walbox-submit-btn:active:not(:disabled) {
          transform: translateY(6px) !important;
          box-shadow: 0 2px 0 #000000 !important;
        }
        .walbox-submit-btn:disabled {
          background: #331c10 !important;
          border-color: #55331c !important;
          color: #664433 !important;
          box-shadow: 0 4px 0 #000000 !important;
          transform: translateY(4px) !important;
          cursor: not-allowed !important;
        }
      `}</style>
      <div className="mobile-bg-glow" style={{ background: "radial-gradient(circle, rgba(255, 102, 0, 0.25) 0%, transparent 70%)" }}></div>

      {/* Header bar */}
      <header style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        padding: "12px 16px",
        background: "#0c0400",
        borderBottom: "4px solid #ff6600",
        marginBottom: "20px",
        borderRadius: "0 0 8px 8px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.4)"
      }}>
        <div>
          <h2 style={{ 
            fontSize: "20px", 
            fontWeight: "900", 
            fontFamily: "var(--font-display)", 
            margin: "0",
            color: "#fffdd0",
            textTransform: "uppercase",
            letterSpacing: "1px",
            textShadow: "2px 2px 0 #000"
          }}>
            THE WALBOX
          </h2>
          <span style={{ 
            fontSize: "11px", 
            color: "#ff6600",
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: "1px"
          }}>
            SALA VAR LISSONE ⚽
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            background: "#ff6600",
            border: "2px solid #000",
            borderRadius: "4px",
            padding: "5px 10px",
            fontSize: "12px",
            fontWeight: "900",
            color: "#000",
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            boxShadow: "2px 2px 0 #fffdd0"
          }}>
            TAVOLO {table}
          </span>
          <button 
            onClick={() => {
              window.history.pushState({}, "", "/entry");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }} 
            className="btn-change-table"
            style={{
              background: "#1c0a00",
              border: "1.5px solid #ff6600",
              color: "#fffdd0",
              fontSize: "10px",
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontWeight: "700",
              padding: "6px 10px",
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.1s ease",
              boxShadow: "2px 2px 0 #000"
            }}
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
            <div className="glass-panel" style={{ 
              padding: "20px", 
              display: "flex", 
              flexDirection: "column", 
              gap: "15px",
              background: "#1c0a00",
              border: "2px solid #ff6600",
              borderTop: "6px solid #ff6600",
              borderRadius: "8px",
              boxShadow: "8px 8px 0 #000000"
            }}>
              <h3 style={{ fontSize: "16px", fontWeight: "800", fontFamily: "var(--font-display)", color: "#fffdd0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Cerca una canzone
              </h3>
              
              <div className="form-group" style={{ margin: "0" }}>
                <input
                  type="text"
                  placeholder="Digita titolo o artista... 🔎"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="walbox-search-input"
                  disabled={venueSettings.queuePaused}
                />
              </div>

              {/* Search Results */}
              {searchQuery.trim() !== "" && (
                <div style={{ 
                  display: "flex", 
                  flexDirection: "column", 
                  gap: "12px", 
                  maxHeight: "300px", 
                  overflowY: "auto",
                  padding: "5px 4px 5px 0" 
                }}>
                  {filteredSongs.length > 0 ? (
                    filteredSongs.map((song) => (
                      <div 
                        key={song.id} 
                        onClick={() => handleSelectSong(song)}
                        className="walbox-song-card"
                        style={{ 
                          display: "flex", 
                          flexDirection: "column",
                          gap: "8px", 
                          padding: "12px", 
                          cursor: "pointer",
                          background: "#1a0a00",
                          border: "2px solid #ff6600",
                          borderRadius: "6px",
                          boxShadow: "4px 4px 0 #000000",
                          position: "relative",
                          overflow: "hidden"
                        }}
                      >
                        {/* Playlist label */}
                        <div style={{
                          alignSelf: "flex-start",
                          background: "#ff6600",
                          color: "#000",
                          fontSize: "9px",
                          fontWeight: "900",
                          padding: "2px 6px",
                          borderRadius: "2px",
                          fontFamily: "var(--font-display)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px"
                        }}>
                          {getPlaylistLabel(song.mood)}
                        </div>

                        {/* Song Details */}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ position: "relative" }}>
                            <img 
                              src={song.cover} 
                              alt={song.title} 
                              style={{ width: "48px", height: "48px", borderRadius: "4px", objectFit: "cover", border: "2px solid #000" }} 
                            />
                            <div style={{
                              position: "absolute",
                              top: "-6px",
                              right: "-6px",
                              background: "#fffdd0",
                              color: "#000",
                              border: "1.5px solid #000",
                              borderRadius: "50%",
                              width: "16px",
                              height: "16px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "10px",
                              fontWeight: "900",
                              boxShadow: "1px 1px 0 #000"
                            }}>
                              +
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: "0" }}>
                            <h4 style={{ 
                              fontSize: "15px", 
                              fontWeight: "800", 
                              fontFamily: "var(--font-display)",
                              color: "#fffdd0",
                              overflow: "hidden", 
                              textOverflow: "ellipsis", 
                              whiteSpace: "nowrap",
                              margin: "0"
                            }}>
                              {song.title.toUpperCase()}
                            </h4>
                            <p style={{ 
                              fontSize: "12px", 
                              color: "#ff6600",
                              fontWeight: "600",
                              overflow: "hidden", 
                              textOverflow: "ellipsis", 
                              whiteSpace: "nowrap",
                              margin: "2px 0 0 0"
                            }}>
                              {song.artist}
                            </p>
                          </div>
                          <span style={{ fontSize: "11px", color: "#a0a0a0", fontFamily: "monospace", paddingRight: "5px" }}>
                            {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, "0")}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "20px", color: "#a0a0a0", fontSize: "14px", fontFamily: "var(--font-display)", fontWeight: "600", textTransform: "uppercase" }}>
                      Nessun brano trovato 😢
                    </div>
                  )}
                </div>
              )}

              {searchQuery.trim() === "" && (
                <div>
                  <p style={{ fontSize: "13px", color: "#a0a0a0", textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>
                    Digita qualcosa per esplorare il catalogo locale.
                  </p>
                  
                  {/* Quick Suggestions */}
                  <div style={{ marginTop: "10px" }}>
                    <p style={{ fontSize: "12px", fontWeight: "900", color: "#ff6600", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
                      Consigliati stasera:
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {MOCK_SONGS.slice(0, 3).map((song) => (
                        <div 
                          key={song.id}
                          onClick={() => !venueSettings.queuePaused && handleSelectSong(song)}
                          className="walbox-song-card-suggestion"
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "10px", 
                            padding: "8px 12px", 
                            borderRadius: "6px",
                            background: "#1a0a00",
                            border: "1.5px solid #ff6600",
                            boxShadow: "3px 3px 0 #000000",
                            cursor: venueSettings.queuePaused ? "not-allowed" : "pointer",
                            fontSize: "13px"
                          }}
                        >
                          <img src={song.cover} alt="" style={{ width: "30px", height: "30px", borderRadius: "4px", border: "1px solid #000" }} />
                          <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <strong style={{ color: "#fffdd0", fontFamily: "var(--font-display)", fontWeight: "700" }}>{song.title.toUpperCase()}</strong> • <span style={{ color: "#ff6600", fontWeight: "600" }}>{song.artist}</span>
                          </div>
                          <span style={{ fontSize: "10px", color: "#a0a0a0", fontFamily: "monospace" }}>
                            {getPlaylistLabel(song.mood).split(" ")[0]}
                          </span>
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
              background: "#1c0a00",
              border: "2px solid #ff6600",
              borderTop: "6px solid #ff6600",
              borderRadius: "8px",
              boxShadow: "8px 8px 0 #000000"
            }}>
              
              {/* Selected Track Info Card */}
              <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                <img 
                  src={selectedSong.cover} 
                  alt={selectedSong.title} 
                  style={{ 
                    width: "70px", 
                    height: "70px", 
                    borderRadius: "6px", 
                    objectFit: "cover",
                    border: "2px solid #000"
                  }} 
                />
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "800", fontFamily: "var(--font-display)", color: "#fffdd0" }}>{selectedSong.title.toUpperCase()}</h4>
                  <p style={{ fontSize: "14px", color: "#ff6600", fontWeight: "600" }}>{selectedSong.artist}</p>
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
                    {MOOD_LABELS[selectedMood]}
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setSelectedSong(null)}
                  className="btn-change-table"
                  style={{
                    background: "#1c0a00",
                    border: "1.5px solid #ff6600",
                    color: "#fffdd0",
                    fontSize: "10px",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                    fontWeight: "700",
                    padding: "6px 10px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    boxShadow: "2px 2px 0 #000"
                  }}
                >
                  Cambia
                </button>
              </div>

              {/* Mood Selector Chips */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={{ fontSize: "13px", fontWeight: "900", color: "#ff6600", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Come ti senti? (Seleziona un mood)
                </label>
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr 1fr", 
                  gap: "10px", 
                  paddingBottom: "5px"
                }}>
                  {Object.keys(MOOD_EMOJIS).map((mood, idx) => (
                    <button
                      key={mood}
                      type="button"
                      onClick={() => setSelectedMood(mood)}
                      className={`walbox-mood-chip ${selectedMood === mood ? "selected" : ""}`}
                      style={{
                        gridColumn: idx === 4 ? "span 2" : "auto"
                      }}
                    >
                      <span style={{ fontSize: "18px", marginRight: "6px" }}>{MOOD_EMOJIS[mood]}</span>
                      {MOOD_LABELS[mood] ? MOOD_LABELS[mood].replace(MOOD_EMOJIS[mood], "").trim() : mood.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dedication Textarea */}
              <div className="form-group" style={{ margin: "0" }}>
                <label htmlFor="dedication-input" style={{ fontSize: "13px", fontWeight: "900", color: "#ff6600", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Aggiungi una dedica (opzionale)
                </label>
                <textarea
                  id="dedication-input"
                  rows="3"
                  maxLength="100"
                  placeholder="Es. Dedicata a tutti quelli del tavolo 3! 🍹 o Auguri Marco!"
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                  className="walbox-textarea"
                ></textarea>
                <span style={{ fontSize: "11px", color: "#a0a0a0", textAlign: "right", fontFamily: "monospace", marginTop: "4px" }}>
                  {dedication.length}/100 CARATTERI
                </span>
              </div>

              {/* Submit Button */}
              <button 
                type="submit" 
                className="walbox-submit-btn" 
                disabled={isSubmitting}
              >
                {isSubmitting ? "INVIO IN CORSO..." : "INVIA AL JUKEBOX 🚀"}
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
          
          <div className="look-up-content" style={{ maxWidth: "320px", gap: "10px" }} onClick={(e) => e.stopPropagation()}>
            <div className="look-up-header-text" style={{ gap: "2px", marginBottom: "2px" }}>
              <h2 style={{ fontSize: "22px" }}>ALZA LO SGUARDO! 📺</h2>
              <h3 style={{ fontSize: "14px" }}>Hai fatto casino. Ora guarda la TV.</h3>
              <p style={{ fontSize: "11px", padding: "0" }}>La tua dedica è live in TV. Screenshot, stories, tagga @TheWalrusPub. Chi è rimasto sul divano deve soffrire.</p>
            </div>

            {/* Story Canvas Card */}
            <div className="story-canvas" style={{ 
              borderColor: getMoodColor(currentAlertSong.mood), 
              aspectRatio: "unset", 
              height: "auto", 
              minHeight: "unset", 
              maxHeight: "unset", 
              padding: "14px", 
              gap: "8px" 
            }}>
              <div className="story-canvas-header" style={{ justifyContent: "center", fontSize: "11px", fontWeight: "900", color: "#ff6600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <span>🚨 TAVOLO {currentAlertSong.table} HA FATTO CASINO</span>
              </div>

              <div className="story-canvas-body" style={{ flex: "none", gap: "6px", padding: "4px 0" }}>
                <div className="story-canvas-cover-container" style={{ width: "90px", height: "90px", margin: "0 auto", marginBottom: "2px" }}>
                  <img 
                    src={currentAlertSong.song.cover} 
                    alt="" 
                    className="story-canvas-cover"
                    style={{ boxShadow: `0 0 15px ${getMoodColor(currentAlertSong.mood)}30` }}
                  />
                </div>
                
                <h4 className="story-canvas-title" style={{ fontSize: "15px", fontWeight: "900" }}>{currentAlertSong.song.title}</h4>
                <p className="story-canvas-artist" style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 2px 0" }}>{currentAlertSong.song.artist}</p>
                
                <span className="story-canvas-mood" style={{ 
                  borderColor: getMoodColor(currentAlertSong.mood), 
                  color: getMoodColor(currentAlertSong.mood),
                  fontSize: "10px",
                  fontWeight: "900",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: "rgba(0,0,0,0.2)",
                  display: "inline-block",
                  marginTop: "2px",
                  transform: "rotate(-3deg)"
                }}>
                  {MOOD_EMOJIS[currentAlertSong.mood]} {MOOD_LABELS[currentAlertSong.mood] ? MOOD_LABELS[currentAlertSong.mood].replace(MOOD_EMOJIS[currentAlertSong.mood], "").trim().toUpperCase() : currentAlertSong.mood.toUpperCase()} MOMENT
                </span>
              </div>

              <div className="story-canvas-dedication" style={{ 
                borderLeftColor: getMoodColor(currentAlertSong.mood),
                padding: "6px 10px",
                fontSize: "11px",
                margin: "4px 0",
                borderRadius: "6px",
                lineHeight: "1.3"
              }}>
                {currentAlertSong.dedication ? `“${currentAlertSong.dedication}”` : `“Nessuna dedica. Solo responsabilità morale del Tavolo ${currentAlertSong.table}. 🍺”`}
              </div>

              <p style={{
                fontSize: "10px",
                fontWeight: "900",
                color: "#fffdd0",
                margin: "2px 0 0 0",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                STA PASSANDO IN TV. NON FARE IL VAGO.
              </p>

              <div className="story-canvas-footer" style={{ paddingTop: "8px", justifyContent: "center" }}>
                <span style={{ fontSize: "10px", fontWeight: "900", color: "#a0a0a0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  📸 SCREENSHOT O SEI UN DIVANISTA
                </span>
              </div>
            </div>

            <button 
              onClick={() => setShowLookUpAlert(false)} 
              className="btn-secondary look-up-close-btn"
              style={{ marginTop: "2px" }}
            >
              Torna al Jukebox ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
