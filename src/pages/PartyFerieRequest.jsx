import { useState, useEffect, useMemo, useRef } from "react";
import walrusLogo from "../../references/original_rebrand_pack/assets/walrus-logo2.png";
import { MOCK_SONGS } from "../data/mockData";
import { insertPartyFerieRequest, useRealtimePartyFerieRequests } from "../hooks/usePartyFerieRealtime";
import { supabase } from "../lib/supabaseClient";

const DEDICATION_MAX = 200;
const STORAGE_KEY = "walbox_party_ferie_request_ids";

function normalizeSpotifySong(track) {
  return {
    id: track.id,
    title: track.name,
    artist: track.artists,
    cover: track.image || "",
    duration: Math.floor((track.durationMs || 0) / 1000),
    spotifyTrackId: track.id || "",
    spotifyTrackUri: track.uri || "",
  };
}

function normalizeMockSong(song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    cover: song.cover,
    duration: song.duration,
    spotifyTrackId: song.spotify_track_id || "",
    spotifyTrackUri: song.spotify_track_uri || "",
  };
}

function loadStoredRequestIds() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.length > 0) : [];
  } catch {
    return [];
  }
}

function persistRequestIds(ids) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage non disponibile (private mode/quota) — Supabase resta comunque la fonte di verità.
  }
}

function readInitialTable() {
  const params = new URLSearchParams(window.location.search);
  const rawTableParam = params.get("table");
  return rawTableParam ? rawTableParam.trim().replace(/^[Tt]+/, "") : "";
}

function readInitialNickname() {
  const params = new URLSearchParams(window.location.search);
  return params.get("nickname") || "";
}

const STATUS_BADGES = {
  pending: {
    text: "IN REGIA 🟡",
    bg: "#fffdd0",
    border: "#ff6600",
    color: "#ff6600",
    boxShadow: "2px 2px 0 #000",
  },
  sourcing: {
    text: "LA REGIA LA STA CERCANDO 🔍",
    bg: "#1a0a00",
    border: "#ff6600",
    color: "#ff6600",
    boxShadow: "2px 2px 0 #000",
  },
  ready: {
    text: "PRONTA IN CODA 🟢",
    bg: "#ff6600",
    border: "#000000",
    color: "#000000",
    boxShadow: "2px 2px 0 #fffdd0",
  },
  loaded: {
    text: "STA PER PARTIRE 🎚️",
    bg: "#ff6600",
    border: "#000000",
    color: "#000000",
    boxShadow: "2px 2px 0 #fffdd0",
  },
  playing: {
    text: "ALZA LO SGUARDO 📺",
    bg: "#ff007f",
    border: "#fffdd0",
    color: "#fffdd0",
    boxShadow: "2px 2px 0 #000",
  },
  played: {
    text: "GIÀ SUONATA ✅",
    bg: "#0c0400",
    border: "#2c2c2c",
    color: "#888",
    boxShadow: "none",
  },
  skipped: {
    text: "SALTATA DALLA REGIA 🔴",
    bg: "#121212",
    border: "#3a1212",
    color: "#b33a3a",
    boxShadow: "2px 2px 0 #000",
  },
};

function getStatusBadge(status) {
  return STATUS_BADGES[status] || STATUS_BADGES.pending;
}

export default function PartyFerieRequest() {
  const [table] = useState(readInitialTable);
  const [nickname] = useState(readInitialNickname);
  const [activeTab, setActiveTab] = useState("request"); // 'request' | 'my-requests'
  const [searchQuery, setSearchQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [dedication, setDedication] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState("");
  const [myRequestIds, setMyRequestIds] = useState(loadStoredRequestIds);
  const submissionTimeoutRef = useRef(null);

  const allRequests = useRealtimePartyFerieRequests();
  const myRequests = useMemo(
    () =>
      allRequests
        .filter((r) => myRequestIds.includes(r.id))
        .sort((a, b) => (b.queuePosition || 0) - (a.queuePosition || 0)),
    [allRequests, myRequestIds]
  );

  useEffect(() => {
    return () => {
      if (submissionTimeoutRef.current) clearTimeout(submissionTimeoutRef.current);
    };
  }, []);

  // Debounced Spotify search with fallback to MOCK_SONGS
  const trimmedQuery = searchQuery.trim();

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return undefined;
    }

    let isActive = true;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal });
        if (!isActive) return;
        if (res.ok) {
          const data = await res.json();
          if (!isActive) return;
          let tracks = [];
          if (Array.isArray(data)) {
            tracks = data;
          } else if (Array.isArray(data?.tracks)) {
            tracks = data.tracks;
          } else if (Array.isArray(data?.results)) {
            tracks = data.results;
          }
          if (tracks.length > 0) {
            setSpotifyResults(tracks.map(normalizeSpotifySong));
            return;
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return;
      } finally {
        if (isActive) setIsSearching(false);
      }
      // Fallback: filter MOCK_SONGS locally
      if (isActive) {
        setSpotifyResults(
          MOCK_SONGS.filter(
            (s) =>
              s.title.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
              s.artist.toLowerCase().includes(trimmedQuery.toLowerCase())
          ).map(normalizeMockSong)
        );
      }
    }, 400);

    return () => {
      isActive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const displayedResults = trimmedQuery.length < 2 ? [] : spotifyResults;
  const displayedIsSearching = trimmedQuery.length < 2 ? false : isSearching;

  const handleSelectSong = (song) => {
    setSelectedSong(song);
    setSearchQuery("");
  };

  const hasValidSpotifyIds =
    !!selectedSong && !!selectedSong.spotifyTrackId && !!selectedSong.spotifyTrackUri;

  const rememberRequestId = (id) => {
    if (!id) return;
    setMyRequestIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistRequestIds(next);
      return next;
    });
  };

  const handleSubmitRequest = async () => {
    if (!selectedSong || !hasValidSpotifyIds) return;
    setIsSubmitting(true);
    setError("");
    try {
      const inserted = await insertPartyFerieRequest(supabase, {
        nickname: nickname.trim(),
        table: table.trim(),
        dedication: dedication.trim(),
        spotifyTrackId: selectedSong.spotifyTrackId,
        spotifyTrackUri: selectedSong.spotifyTrackUri,
        trackName: selectedSong.title,
        artistName: selectedSong.artist,
        artworkUrl: selectedSong.cover,
        durationMs: (selectedSong.duration || 0) * 1000,
      });
      rememberRequestId(inserted?.id);
      setSelectedSong(null);
      setDedication("");
      setShowPreview(false);
      setSubmissionSuccess(true);
      if (submissionTimeoutRef.current) clearTimeout(submissionTimeoutRef.current);
      submissionTimeoutRef.current = setTimeout(() => setSubmissionSuccess(false), 6000);
    } catch (err) {
      console.error("insertPartyFerieRequest failed:", err);
      setError("Invio non riuscito. Riprova tra un attimo.");
    }
    setIsSubmitting(false);
  };

  return (
    <div
      className="mobile-wrapper"
      style={{
        background: "linear-gradient(180deg, #331100 0%, #1a0800 100%)",
        minHeight: "100vh",
        fontFamily: "var(--font-sans)",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .pf-search-input {
          width: 100% !important;
          background: #1a0800 !important;
          color: #f5f0e8 !important;
          font-family: var(--font-sans) !important;
          border: none !important;
          border-bottom: 3px solid #f05a24 !important;
          border-radius: 0 !important;
          padding: 10px 4px !important;
          font-size: 18px !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .pf-search-input::placeholder { color: #f5f0e8 !important; opacity: 0.5 !important; font-style: italic !important; }
        .pf-song-card { transition: transform 0.1s, box-shadow 0.1s !important; cursor: pointer; }
        .pf-song-card:hover { transform: translate(-2px, -2px) !important; box-shadow: 6px 6px 0 #000000 !important; border-color: #ff8800 !important; }
        .pf-textarea {
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
        }
        .pf-submit-btn {
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
          transition: transform 0.1s, box-shadow 0.1s, background-color 0.1s !important;
        }
        .pf-submit-btn:hover:not(:disabled) { background: #ff8800 !important; }
        .pf-submit-btn:active:not(:disabled) { transform: translateY(6px) !important; box-shadow: 0 2px 0 #000000 !important; }
        .pf-submit-btn:disabled {
          background: #331c10 !important;
          border-color: #55331c !important;
          color: #664433 !important;
          box-shadow: 0 4px 0 #000000 !important;
          transform: translateY(4px) !important;
          cursor: not-allowed !important;
        }
        .pf-secondary-btn {
          background: #0c0400 !important;
          color: #ff6600 !important;
          border: 2px solid #ff6600 !important;
        }
      `}</style>
      <div className="mobile-bg-glow" style={{ background: "radial-gradient(circle, rgba(255, 102, 0, 0.25) 0%, transparent 70%)" }}></div>

      <header style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        background: "#0c0400",
        borderTop: "5px solid #f05a24",
        borderBottom: "4px solid #ff6600",
        marginBottom: "20px",
        borderRadius: "0 0 8px 8px",
        boxShadow: "0 4px 0 #000",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <img
            src={walrusLogo}
            alt="The Walrus Pub Logo"
            style={{ width: "40px", height: "40px", borderRadius: "50%", border: "2px solid #ff6600", boxShadow: "0 0 15px rgba(255, 102, 0, 0.45)", display: "block" }}
          />
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "900", fontFamily: "var(--font-display)", margin: "0", color: "#fffdd0", textTransform: "uppercase", letterSpacing: "1px", textShadow: "2px 2px 0 #000" }}>
              THE WALBOX
            </h2>
            <span style={{ fontSize: "10px", color: "#ff6600", fontWeight: "900", textTransform: "uppercase", letterSpacing: "1px" }}>
              PARTY FERIE 🏖️
            </span>
          </div>
        </div>
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
          boxShadow: "2px 2px 0 #fffdd0",
        }}>
          {nickname ? `${nickname} • T.${table || "?"}` : `TAVOLO ${table || "?"}`}
        </span>
      </header>

      {/* Tabs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px", padding: "0 16px" }}>
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
          }}
        >
          🎵 Richiedi Brano
        </button>
        <button
          onClick={() => setActiveTab("my-requests")}
          style={{
            padding: "12px",
            fontSize: "14px",
            fontFamily: "var(--font-display)",
            fontWeight: "900",
            textTransform: "uppercase",
            cursor: "pointer",
            position: "relative",
            borderRadius: "6px",
            background: activeTab === "my-requests" ? "#1c0a00" : "transparent",
            border: activeTab === "my-requests" ? "2px solid #ff6600" : "2px solid rgba(255, 102, 0, 0.3)",
            color: activeTab === "my-requests" ? "#ff6600" : "rgba(255, 102, 0, 0.6)",
            boxShadow: activeTab === "my-requests" ? "4px 4px 0 #000" : "none",
          }}
        >
          📋 Le Mie Richieste
          {myRequests.length > 0 && (
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
              fontWeight: "bold",
            }}>
              {myRequests.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "request" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "0 16px 30px" }}>
          {!selectedSong ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "800", fontFamily: "var(--font-display)", color: "#fffdd0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Proponi un brano per il Party Ferie
              </h3>

              <div className="form-group" style={{ margin: "0" }}>
                <input
                  type="text"
                  placeholder="Digita titolo o artista... 🔎"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pf-search-input"
                />
              </div>

              {trimmedQuery !== "" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "300px", overflowY: "auto", padding: "5px 4px 5px 0" }}>
                  {displayedIsSearching ? (
                    <div style={{ textAlign: "center", padding: "20px", color: "#ff6600", fontSize: "14px", fontFamily: "var(--font-display)", fontWeight: "600", textTransform: "uppercase" }}>
                      Cerco su Spotify... 🎵
                    </div>
                  ) : displayedResults.length > 0 ? (
                    displayedResults.map((song) => (
                      <div
                        key={song.id}
                        onClick={() => handleSelectSong(song)}
                        className="pf-song-card"
                        style={{
                          width: "100%",
                          padding: "12px",
                          border: "2px solid rgba(255, 106, 0, 0.85)",
                          background: "rgba(18, 7, 1, 0.96)",
                          borderRadius: "12px",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          boxShadow: "4px 4px 0 #000000",
                        }}
                      >
                        <div style={{ flex: "0 0 56px" }}>
                          {song.cover ? (
                            <img src={song.cover} alt={song.title} style={{ width: "56px", height: "56px", borderRadius: "8px", objectFit: "cover", display: "block" }} />
                          ) : (
                            <div style={{ width: "56px", height: "56px", borderRadius: "8px", border: "2px solid #333", background: "#2a1000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>🎵</div>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                          <h4 style={{ color: "#fffdd0", fontSize: "16px", fontWeight: "800", fontFamily: "var(--font-display)", lineHeight: "1.15", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0" }}>
                            {song.title.toUpperCase()}
                          </h4>
                          <p style={{ color: "#ff6600", fontSize: "14px", lineHeight: "1.2", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: "0" }}>
                            {song.artist}
                          </p>
                          {!(song.spotifyTrackId && song.spotifyTrackUri) && (
                            <span style={{ fontSize: "10px", color: "#ff4d4d", fontWeight: "700", textTransform: "uppercase" }}>
                              ⚠️ Non collegato a Spotify — non inviabile
                            </span>
                          )}
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
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedSong) return;
                setShowPreview(true);
              }}
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "15px",
                background: "#1a0a00",
                border: "2px solid #ff6600",
                padding: "12px",
                borderRadius: "6px",
                boxShadow: "4px 4px 0 #000000",
              }}>
                {selectedSong.cover ? (
                  <img
                    src={selectedSong.cover}
                    alt={selectedSong.title}
                    style={{ width: "60px", height: "60px", borderRadius: "4px", objectFit: "cover", border: "2px solid #000" }}
                  />
                ) : (
                  <div style={{ width: "60px", height: "60px", borderRadius: "4px", border: "2px solid #000", background: "#2a1000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>🎵</div>
                )}
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 style={{ fontSize: "16px", fontWeight: "800", fontFamily: "var(--font-display)", color: "#fffdd0" }}>{selectedSong.title.toUpperCase()}</h4>
                  <p style={{ fontSize: "13px", color: "#ff6600", fontWeight: "600" }}>{selectedSong.artist}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSong(null);
                    setShowPreview(false);
                  }}
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
                    boxShadow: "2px 2px 0 #000",
                  }}
                >
                  Cambia
                </button>
              </div>

              {!hasValidSpotifyIds && (
                <div style={{
                  padding: "12px 14px",
                  background: "#2a0d0d",
                  border: "2px solid #ff4d4d",
                  borderRadius: "6px",
                  color: "#ff9d9d",
                  fontSize: "12px",
                  fontWeight: "700",
                }}>
                  ⚠️ Questo brano non ha un collegamento Spotify valido: non può essere inviato in regia. Scegli un altro brano.
                </div>
              )}

              <div className="form-group" style={{ margin: "0" }}>
                <label htmlFor="dedication-input" style={{ fontSize: "13px", fontWeight: "900", color: "#ff6600", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Aggiungi una dedica (opzionale)
                </label>
                <textarea
                  id="dedication-input"
                  rows="3"
                  maxLength={DEDICATION_MAX}
                  placeholder="Es. Dedicata a tutti quelli del tavolo 3! 🍹"
                  value={dedication}
                  onChange={(e) => setDedication(e.target.value)}
                  className="pf-textarea"
                ></textarea>
                <span style={{ fontSize: "11px", color: "#a0a0a0", textAlign: "right", fontFamily: "monospace", marginTop: "4px", display: "block" }}>
                  {dedication.length}/{DEDICATION_MAX} CARATTERI
                </span>
              </div>

              <button type="submit" className="pf-submit-btn" disabled={isSubmitting || !hasValidSpotifyIds}>
                {isSubmitting ? "INVIO IN CORSO..." : "ANTEPRIMA E INVIO ⚡"}
              </button>
            </form>
          )}

          {error && (
            <span style={{ color: "#ff4d4d", fontSize: "13px", fontWeight: "600", textAlign: "center" }}>
              ⚠️ {error}
            </span>
          )}
        </div>
      ) : (
        /* My Requests List View */
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "0 16px 30px" }}>
          {myRequests.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#a0a0a0" }}>
              <span style={{ fontSize: "36px" }}>🏖️</span>
              <h3 style={{ fontSize: "16px", marginTop: "10px", color: "#fffdd0", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "1px" }}>Nessuna richiesta effettuata</h3>
              <p style={{ fontSize: "13px", marginTop: "5px", fontStyle: "italic" }}>
                Le canzoni che proponi appariranno qui insieme al loro stato in tempo reale.
              </p>
            </div>
          ) : (
            myRequests.map((req) => {
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
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    {req.artworkUrl ? (
                      <img
                        src={req.artworkUrl}
                        alt=""
                        style={{ width: "50px", height: "50px", borderRadius: "4px", objectFit: "cover", border: "2px solid #000" }}
                      />
                    ) : (
                      <div style={{ width: "50px", height: "50px", borderRadius: "4px", border: "2px solid #000", background: "#2a1000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🎵</div>
                    )}

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
                          margin: "0",
                        }}>
                          {req.trackName}
                        </h4>

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
                          whiteSpace: "nowrap",
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
                        marginBottom: "0",
                      }}>
                        {req.artistName}
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
                      boxShadow: "2px 2px 0 #000",
                    }}>
                      &ldquo;{req.dedication}&rdquo;
                    </div>
                  )}

                  {req.status === "playing" && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "5px", padding: "0 5px" }}>
                      <span style={{ fontSize: "11px", color: "#ff007f", fontWeight: "900", letterSpacing: "1px", textTransform: "uppercase", fontFamily: "var(--font-display)" }}>
                        IN RIPRODUZIONE NEL LOCALE! 🔊
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {submissionSuccess && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: "20px", animation: "fadeIn 0.3s ease-out",
        }} onClick={() => setSubmissionSuccess(false)}>
          <div style={{
            background: "#0c0400", border: "5px solid #ff6600", borderRadius: "8px",
            padding: "30px 20px", width: "100%", maxWidth: "360px", textAlign: "center",
            boxShadow: "8px 8px 0 #000000",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#ff6600", fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: "950", margin: "0 0 15px 0", textTransform: "uppercase", textShadow: "2px 2px 0 #000000" }}>
              INVIATA IN REGIA 🏖️
            </h2>
            <p style={{ color: "#fffdd0", fontSize: "14px", fontWeight: "700", margin: "0 0 25px 0" }}>
              Se la regia approva, finisce in TV!
            </p>
            <button onClick={() => setSubmissionSuccess(false)} className="pf-submit-btn" style={{ boxShadow: "4px 4px 0 #000000", transform: "none" }}>
              OK 🍺
            </button>
          </div>
        </div>
      )}

      {showPreview && selectedSong && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.95)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9990, padding: "20px", animation: "fadeIn 0.2s ease-out",
        }}>
          <div style={{
            background: "#0c0400", border: "4px solid #ff6600", borderRadius: "8px",
            padding: "24px 20px", width: "100%", maxWidth: "360px", boxShadow: "8px 8px 0 #000000",
            display: "flex", flexDirection: "column", gap: "16px", color: "#fffdd0",
          }}>
            <h2 style={{
              fontSize: "22px", fontWeight: "950", color: "#ff6600", fontFamily: "var(--font-display)",
              textAlign: "center", textTransform: "uppercase", letterSpacing: "1px", textShadow: "2px 2px 0 #000000", margin: "0",
            }}>
              CONTROLLA PRIMA DI MANDARE IN REGIA
            </h2>

            <div style={{
              alignSelf: "center", background: "#ff6600", border: "2px solid #000", borderRadius: "4px",
              padding: "4px 12px", fontSize: "13px", fontWeight: "900", color: "#000", fontFamily: "var(--font-display)",
              textTransform: "uppercase", letterSpacing: "0.5px", boxShadow: "2px 2px 0 #000000", marginBottom: "4px",
            }}>
              TAVOLO {table || "?"}
            </div>

            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center",
              background: "#1a0a00", border: "2px solid #ff6600", borderRadius: "6px", padding: "16px 12px",
              boxShadow: "4px 4px 0 #000000",
            }}>
              {selectedSong.cover ? (
                <img
                  src={selectedSong.cover}
                  alt={selectedSong.title}
                  style={{ width: "100px", height: "100px", borderRadius: "4px", objectFit: "cover", border: "3px solid #000", boxShadow: "4px 4px 0 #000000" }}
                />
              ) : (
                <div style={{ width: "100px", height: "100px", borderRadius: "4px", border: "3px solid #000", background: "#2a1000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "32px", boxShadow: "4px 4px 0 #000000" }}>🎵</div>
              )}
              <div style={{ width: "100%" }}>
                <h4 style={{ fontSize: "18px", fontWeight: "900", fontFamily: "var(--font-display)", color: "#fffdd0", margin: "4px 0 2px 0", textTransform: "uppercase" }}>
                  {selectedSong.title}
                </h4>
                <p style={{ fontSize: "14px", color: "#ff6600", fontWeight: "700", margin: "0" }}>
                  {selectedSong.artist}
                </p>
              </div>
            </div>

            {dedication && (
              <div style={{
                fontSize: "13px", fontStyle: "italic", color: "#fffdd0", background: "#0c0400",
                padding: "10px 14px", borderRadius: "6px", borderLeft: "4px solid #ff6600",
                boxShadow: "3px 3px 0 #000000", lineHeight: "1.4", wordBreak: "break-word", textAlign: "left",
              }}>
                &ldquo;{dedication}&rdquo;
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => handleSubmitRequest()}
                disabled={isSubmitting || !hasValidSpotifyIds}
                className="pf-submit-btn"
              >
                {isSubmitting ? "INVIO IN CORSO..." : "🚀 MANDA IN REGIA"}
              </button>

              <button
                type="button"
                onClick={() => setShowPreview(false)}
                disabled={isSubmitting}
                className="pf-secondary-btn"
                style={{
                  width: "100%", borderRadius: "6px", padding: "12px 20px", fontFamily: "var(--font-display)",
                  fontSize: "14px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.5px",
                  cursor: "pointer", boxShadow: "4px 4px 0 #000000", display: "flex", alignItems: "center", justifyContent: "center",
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
