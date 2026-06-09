import { useState, useEffect, useRef } from "react";
import walrusLogo from "../../references/original_rebrand_pack/assets/walrus-logo2.png";
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
  const [showPreview, setShowPreview] = useState(false);

  const notifiedSongIds = useRef(new Set());
  const submissionTimeoutRef = useRef(null);
  const [showLookUpAlert, setShowLookUpAlert] = useState(false);
  const [currentAlertSong, setCurrentAlertSong] = useState(null);

  // Clean up auto-close timer on unmount
  useEffect(() => {
    return () => {
      if (submissionTimeoutRef.current) {
        clearTimeout(submissionTimeoutRef.current);
      }
    };
  }, []);

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
    if (e) e.preventDefault();
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
      setShowPreview(false);
      setSubmissionSuccess(true);
      setIsSubmitting(false);

      // Flash success and switch tabs after 4 seconds
      if (submissionTimeoutRef.current) clearTimeout(submissionTimeoutRef.current);
      submissionTimeoutRef.current = setTimeout(() => {
        setSubmissionSuccess(false);
        setActiveTab("my-songs");
      }, 4000);
    }, 800); // simulated network delay
  };

  const handleDismissSubmission = () => {
    if (submissionTimeoutRef.current) {
      clearTimeout(submissionTimeoutRef.current);
      submissionTimeoutRef.current = null;
    }
    setSubmissionSuccess(false);
    setActiveTab("my-songs");
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
        return {
          text: "IN SALA VAR 🟡",
          bg: "#fffdd0",
          border: "#ff6600",
          color: "#ff6600",
          boxShadow: "2px 2px 0 #000"
        };
      case "approved":
        return {
          text: "APPROVATA DAL BANCONE 🟢",
          bg: "#ff6600",
          border: "#000000",
          color: "#000000",
          boxShadow: "2px 2px 0 #fffdd0"
        };
      case "playing":
        return {
          text: "ALZA LO SGUARDO 📺",
          bg: "#ff007f",
          border: "#fffdd0",
          color: "#fffdd0",
          boxShadow: "2px 2px 0 #000"
        };
      case "rejected":
        return {
          text: "BOCCIATA SENZA APPELLO 🔴",
          bg: "#121212",
          border: "#3a1212",
          color: "#b33a3a",
          boxShadow: "2px 2px 0 #000"
        };
      default:
        return {
          text: "COMPLETATA",
          bg: "#0c0400",
          border: "#2c2c2c",
          color: "#888",
          boxShadow: "none"
        };
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .walbox-popup-btn {
          transition: transform 0.1s, box-shadow 0.1s, background-color 0.1s !important;
        }
        .walbox-popup-btn:hover {
          background: #ff8800 !important;
        }
        .walbox-popup-btn:active {
          transform: translate(2px, 2px) !important;
          box-shadow: 2px 2px 0 #fffdd0 !important;
        }
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
          font-style: italic;
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
        .walbox-preview-secondary-btn {
          background: #0c0400 !important;
          color: #ff6600 !important;
          border: 2px solid #ff6600 !important;
          transition: transform 0.1s, box-shadow 0.1s, color 0.1s, border-color 0.1s !important;
        }
        .walbox-preview-secondary-btn:hover:not(:disabled) {
          color: #fffdd0 !important;
          border-color: #fffdd0 !important;
          background: #120600 !important;
        }
        .walbox-preview-secondary-btn:active:not(:disabled) {
          transform: translate(2px, 2px) !important;
          box-shadow: 2px 2px 0 #000000 !important;
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
        boxShadow: "0 4px 0 #000"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src={walrusLogo}
            alt="The Walrus Pub Logo"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "2px solid #ff6600",
              boxShadow: "0 0 15px rgba(255, 102, 0, 0.45)",
              display: "block"
            }}
          />
          <div>
            <h2 style={{
              fontSize: "18px",
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
              fontSize: "10px",
              color: "#ff6600",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "1px"
            }}>
              SCEGLI LA PORCHERIA
            </span>
          </div>
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
          style={{
            padding: "12px",
            fontSize: "14px",
            fontFamily: "var(--font-display)",
            fontWeight: "900",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: "6px",
            background: activeTab === "request" ? "#1c0a00" : "transparent",
            border: activeTab === "request" ? "2px solid #ff6600" : "2px solid rgba(255, 102, 0, 0.3)",
            color: activeTab === "request" ? "#ff6600" : "rgba(255, 102, 0, 0.6)",
            boxShadow: activeTab === "request" ? "4px 4px 0 #000" : "none",
            transition: "all 0.1s ease"
          }}
        >
          🎵 Richiedi Brano
        </button>
        <button
          onClick={() => setActiveTab("my-songs")}
          style={{
            padding: "12px",
            fontSize: "14px",
            fontFamily: "var(--font-display)",
            fontWeight: "900",
            textTransform: "uppercase",
            cursor: "pointer",
            position: "relative",
            borderRadius: "6px",
            background: activeTab === "my-songs" ? "#1c0a00" : "transparent",
            border: activeTab === "my-songs" ? "2px solid #ff6600" : "2px solid rgba(255, 102, 0, 0.3)",
            color: activeTab === "my-songs" ? "#ff6600" : "rgba(255, 102, 0, 0.6)",
            boxShadow: activeTab === "my-songs" ? "4px 4px 0 #000" : "none",
            transition: "all 0.1s ease"
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
            <div style={{
              padding: "15px",
              background: "#1c0a00",
              border: "2px solid #ff007f",
              borderRadius: "6px",
              boxShadow: "4px 4px 0 #000",
              textAlign: "center"
            }}>
              <span style={{ fontSize: "14px", color: "#ff007f", fontWeight: "900", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                ⏸️ Invio richieste temporaneamente sospeso dallo staff.
              </span>
            </div>
          )}

          {!selectedSong ? (
            /* Song Search View */
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "15px"
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
                          letterSpacing: "0.5px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}>
                          {song.mood === "chill" ? (
                            <>
                              ZEN, BIRRA E MUTISMO{" "}
                              <img
                                src="/walrus-beer-sticker.png"
                                alt="Sticker Birra"
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  objectFit: "contain",
                                  transform: "rotate(-5deg)",
                                  filter: "drop-shadow(1px 1px 0px #000)"
                                }}
                              />
                            </>
                          ) : (
                            getPlaylistLabel(song.mood)
                          )}
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
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!selectedSong) return;
              if (venueSettings.queuePaused) {
                alert("La coda delle richieste è attualmente messa in pausa dallo staff.");
                return;
              }
              setShowPreview(true);
            }} style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px"
            }}>

              {/* Selected Track Info Card */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                background: "#1a0a00",
                border: "2px solid #ff6600",
                padding: "12px",
                borderRadius: "6px",
                boxShadow: "4px 4px 0 #000000"
              }}>
                <img
                  src={selectedSong.cover}
                  alt={selectedSong.title}
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "4px",
                    objectFit: "cover",
                    border: "2px solid #000"
                  }}
                />
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "800", fontFamily: "var(--font-display)", color: "#fffdd0" }}>{selectedSong.title.toUpperCase()}</h4>
                  <p style={{ fontSize: "13px", color: "#ff6600", fontWeight: "600" }}>{selectedSong.artist}</p>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 8px",
                    fontSize: "10px",
                    marginTop: "4px",
                    fontWeight: "900",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                    background: "#0c0400",
                    border: `1.5px solid ${getMoodColor(selectedMood)}`,
                    color: getMoodColor(selectedMood),
                    borderRadius: "4px",
                    boxShadow: "2px 2px 0 #000"
                  }}>
                    {selectedMood === "chill" ? (
                      <>
                        ZEN, BIRRA E MUTISMO{" "}
                        <img
                          src="/walrus-beer-sticker.png"
                          alt="Sticker Birra"
                          style={{
                            width: "16px",
                            height: "16px",
                            objectFit: "contain",
                            transform: "rotate(-5deg)",
                            filter: "drop-shadow(1px 1px 0px #000)"
                          }}
                        />
                      </>
                    ) : (
                      MOOD_LABELS[selectedMood]
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSong(null);
                    setShowPreview(false);
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
                      {mood === "chill" ? (
                        <img
                          src="/walrus-beer-sticker.png"
                          alt="Sticker Birra"
                          style={{
                            width: "26px",
                            height: "26px",
                            objectFit: "contain",
                            marginRight: "6px",
                            transform: "rotate(-5deg)",
                            filter: "drop-shadow(2px 2px 0px #000)"
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "18px", marginRight: "6px" }}>{MOOD_EMOJIS[mood]}</span>
                      )}
                      {MOOD_LABELS[mood] ? MOOD_LABELS[mood].replace(MOOD_EMOJIS[mood], "").trim().toUpperCase() : mood.toUpperCase()}
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
                {isSubmitting ? "INVIO IN CORSO..." : "MANDA AL WALBOX 🚀"}
              </button>
            </form>
          )}
        </div>
      ) : (
        /* My Songs List View */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {submittedRequests.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#a0a0a0" }}>
              <span style={{ fontSize: "36px" }}>📻</span>
              <h3 style={{ fontSize: "16px", marginTop: "10px", color: "#fffdd0", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "1px" }}>Nessuna richiesta effettuata</h3>
              <p style={{ fontSize: "13px", marginTop: "5px", fontStyle: "italic" }}>
                Le canzoni che prenoti appariranno qui insieme al loro stato di riproduzione in tempo reale.
              </p>
            </div>
          ) : (
            submittedRequests.map((req) => {
              const badge = getStatusBadge(req.status);
              return (
                <div
                  key={req.id}
                  style={{
                    padding: "15px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    background: "#1a0a00",
                    border: req.status === "playing" ? "3px solid #ff007f" : "2px solid #ff6600",
                    borderRadius: "8px",
                    boxShadow: req.status === "playing" ? "6px 6px 0 #ff6600" : "4px 4px 0 #000000",
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <img
                      src={req.song.cover}
                      alt=""
                      style={{ width: "50px", height: "50px", borderRadius: "4px", objectFit: "cover", border: "2px solid #000" }}
                    />

                    <div style={{ flex: 1, minWidth: "0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                        <h4 style={{
                          fontSize: "14px",
                          fontWeight: "800",
                          fontFamily: "var(--font-display)",
                          color: "#fffdd0",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          margin: "0"
                        }}>
                          {req.song.title}
                        </h4>

                        {/* Status Badge */}
                        <span style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "900",
                          fontFamily: "var(--font-display)",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          backgroundColor: badge.bg,
                          border: `2px solid ${badge.border}`,
                          color: badge.color,
                          boxShadow: badge.boxShadow || "none",
                          whiteSpace: "nowrap"
                        }}>
                          {badge.text}
                        </span>
                      </div>
                      <p style={{
                        fontSize: "12px",
                        color: "#ff6600",
                        fontWeight: "600",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginTop: "2px",
                        marginBottom: "0"
                      }}>
                        {req.song.artist}
                      </p>
                    </div>
                  </div>

                  {req.dedication && (
                    <div style={{
                      fontSize: "12px",
                      fontStyle: "italic",
                      color: "#fffdd0",
                      background: "#0c0400",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      borderLeft: `4px solid ${req.status === "playing" ? "#ff007f" : "#ff6600"}`,
                      borderTop: "1px solid #1a0a00",
                      borderRight: "1px solid #1a0a00",
                      borderBottom: "1px solid #1a0a00",
                      boxShadow: "2px 2px 0 #000"
                    }}>
                      &ldquo;{req.dedication}&rdquo;
                    </div>
                  )}

                  {req.status === "playing" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px", padding: "0 5px" }}>
                      <span style={{ fontSize: "11px", color: "#ff007f", fontWeight: "900", letterSpacing: "1px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
                        IN RIPRODUZIONE NEL LOCALE! 🔊
                      </span>
                      <div className="eq-container" style={{ height: "15px" }}>
                        <div className="eq-bar" style={{ width: "2px", backgroundColor: "#ff007f", animationDuration: "0.8s" }}></div>
                        <div className="eq-bar" style={{ width: "2px", backgroundColor: "#ff007f", animationDuration: "1.2s" }}></div>
                        <div className="eq-bar" style={{ width: "2px", backgroundColor: "#ff007f", animationDuration: "0.9s" }}></div>
                        <div className="eq-bar" style={{ width: "2px", backgroundColor: "#ff007f", animationDuration: "1.4s" }}></div>
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "2px",
                  transform: "rotate(-3deg)"
                }}>
                  {currentAlertSong.mood === "chill" ? (
                    <>
                      <img
                        src="/walrus-beer-sticker.png"
                        alt="Sticker Birra"
                        style={{
                          width: "18px",
                          height: "18px",
                          objectFit: "contain",
                          transform: "rotate(-5deg)",
                          filter: "drop-shadow(1px 1px 0px #000)"
                        }}
                      />
                      ZEN, BIRRA E MUTISMO MOMENT
                    </>
                  ) : (
                    <>
                      {MOOD_EMOJIS[currentAlertSong.mood]} {MOOD_LABELS[currentAlertSong.mood] ? MOOD_LABELS[currentAlertSong.mood].replace(MOOD_EMOJIS[currentAlertSong.mood], "").trim().toUpperCase() : currentAlertSong.mood.toUpperCase()} MOMENT
                    </>
                  )}
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

      {submissionSuccess && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "20px",
          animation: "fadeIn 0.3s ease-out"
        }}>
          <div style={{
            background: "#0c0400",
            border: "5px solid #ff6600",
            borderRadius: "8px",
            padding: "30px 20px",
            width: "100%",
            maxWidth: "360px",
            textAlign: "center",
            boxShadow: "8px 8px 0 #000000",
            position: "relative"
          }}>
            <img
              src="/walrus-beer-sticker.png"
              alt="Sticker Birra"
              style={{
                position: "absolute",
                top: "-30px",
                right: "-20px",
                width: "72px",
                height: "72px",
                objectFit: "contain",
                transform: "rotate(12deg)",
                filter: "drop-shadow(3px 3px 0px #000000)",
                zIndex: 10
              }}
            />
            <h2 style={{
              color: "#ff6600",
              fontFamily: "var(--font-display)",
              fontSize: "28px",
              fontWeight: "950",
              margin: "0 0 15px 0",
              textTransform: "uppercase",
              textShadow: "2px 2px 0 #000000",
              lineHeight: "1.2"
            }}>
              CHE CAVALLOOOO 🐴
            </h2>
            <h3 style={{
              color: "#fffdd0",
              fontFamily: "var(--font-display)",
              fontSize: "16px",
              fontWeight: "900",
              textTransform: "uppercase",
              textShadow: "2px 2px 0 #000000",
              margin: "0 0 12px 0",
              lineHeight: "1.4"
            }}>
              LA SALA VAR HA PRESO IN CARICO LA PORCHERIA
            </h3>
            <p style={{
              color: "#a0a0a0",
              fontSize: "13px",
              fontWeight: "600",
              margin: "0 0 25px 0"
            }}>
              Se Rocchi approva, finisce dritta in TV.
            </p>
            <button
              onClick={handleDismissSubmission}
              style={{
                width: "100%",
                background: "#ff6600",
                color: "#000000",
                border: "3px solid #000000",
                borderRadius: "6px",
                padding: "14px 20px",
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: "900",
                textTransform: "uppercase",
                letterSpacing: "1px",
                cursor: "pointer",
                boxShadow: "4px 4px 0 #000000",
                transition: "all 0.1s ease",
                transform: "translateY(0)"
              }}
              className="walbox-popup-btn"
            >
              OK, MI DISSOCIO
            </button>
          </div>
        </div>
      )}

      {showPreview && selectedSong && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9990,
          padding: "20px",
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            background: "#0c0400",
            border: "4px solid #ff6600",
            borderRadius: "8px",
            padding: "24px 20px",
            width: "100%",
            maxWidth: "360px",
            boxShadow: "8px 8px 0 #000000",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            color: "#fffdd0"
          }}>
            <h2 style={{
              fontSize: "22px",
              fontWeight: "950",
              color: "#ff6600",
              fontFamily: "var(--font-display)",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "1px",
              textShadow: "2px 2px 0 #000000",
              margin: "0"
            }}>
              PREVIEW RICHIESTA
            </h2>

            <div style={{
              alignSelf: "center",
              background: "#ff6600",
              border: "2px solid #000",
              borderRadius: "4px",
              padding: "4px 12px",
              fontSize: "13px",
              fontWeight: "900",
              color: "#000",
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              boxShadow: "2px 2px 0 #000000",
              marginBottom: "4px"
            }}>
              TAVOLO {table}
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              textAlign: "center",
              background: "#1a0a00",
              border: "2px solid #ff6600",
              borderRadius: "6px",
              padding: "16px 12px",
              boxShadow: "4px 4px 0 #000000"
            }}>
              <img
                src={selectedSong.cover}
                alt={selectedSong.title}
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "4px",
                  objectFit: "cover",
                  border: "3px solid #000",
                  boxShadow: "4px 4px 0 #000000"
                }}
              />
              <div style={{ width: "100%" }}>
                <h4 style={{
                  fontSize: "18px",
                  fontWeight: "900",
                  fontFamily: "var(--font-display)",
                  color: "#fffdd0",
                  margin: "4px 0 2px 0",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}>
                  {selectedSong.title}
                </h4>
                <p style={{
                  fontSize: "14px",
                  color: "#ff6600",
                  fontWeight: "700",
                  margin: "0 0 8px 0"
                }}>
                  {selectedSong.artist}
                </p>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: "900",
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase",
                  background: "#0c0400",
                  border: `2px solid ${getMoodColor(selectedMood)}`,
                  color: getMoodColor(selectedMood),
                  borderRadius: "4px",
                  boxShadow: "2px 2px 0 #000"
                }}>
                  {selectedMood === "chill" ? (
                    <>
                      <img
                        src="/walrus-beer-sticker.png"
                        alt="Sticker Birra"
                        style={{
                          width: "20px",
                          height: "20px",
                          objectFit: "contain",
                          transform: "rotate(-5deg)",
                          filter: "drop-shadow(1px 1px 0px #000)"
                        }}
                      />
                      ZEN, BIRRA E MUTISMO
                    </>
                  ) : (
                    <>
                      {MOOD_EMOJIS[selectedMood]} {MOOD_LABELS[selectedMood] ? MOOD_LABELS[selectedMood].replace(MOOD_EMOJIS[selectedMood], "").trim().toUpperCase() : selectedMood.toUpperCase()}
                    </>
                  )}
                </span>
              </div>
            </div>

            {dedication && (
              <div style={{
                fontSize: "13px",
                fontStyle: "italic",
                color: "#fffdd0",
                background: "#0c0400",
                padding: "10px 14px",
                borderRadius: "6px",
                borderLeft: "4px solid #ff6600",
                borderTop: "1px solid #1a0a00",
                borderRight: "1px solid #1a0a00",
                borderBottom: "1px solid #1a0a00",
                boxShadow: "3px 3px 0 #000000",
                lineHeight: "1.4",
                wordBreak: "break-word",
                textAlign: "left"
              }}>
                &ldquo;{dedication}&rdquo;
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => handleSubmitRequest()}
                disabled={isSubmitting}
                className="walbox-submit-btn"
              >
                {isSubmitting ? "INVIO IN CORSO..." : "🚀 MANDA IN SALA VAR"}
              </button>

              <button
                type="button"
                onClick={() => setShowPreview(false)}
                disabled={isSubmitting}
                className="walbox-preview-secondary-btn"
                style={{
                  width: "100%",
                  borderRadius: "6px",
                  padding: "12px 20px",
                  fontFamily: "var(--font-display)",
                  fontSize: "14px",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  cursor: "pointer",
                  boxShadow: "4px 4px 0 #000000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ← TORNA A SPACCARE TUTTO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
