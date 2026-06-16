import { useState, useEffect, useRef } from "react";
import { 
  getRequests, 
  getPlaybackState, 
  subscribeState, 
  MOOD_EMOJIS 
} from "../data/mockData";

export default function LiveTvScreenWalrus() {
  const [requests, setRequests] = useState([]);
  const [playback, setPlayback] = useState({ isPlaying: false, progress: 0, duration: 0, currentRequestId: null });
  const [showTakeover, setShowTakeover] = useState(false);
  const [takeoverRequest, setTakeoverRequest] = useState(null);
  
  // Reaction state
  const [tvReaction, setTvReaction] = useState(() => {
    try {
      const saved = localStorage.getItem("walbox_tv_reaction");
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.timestamp && (Date.now() - data.timestamp < 6000)) {
          return data;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });
  
  const prevSongIdRef = useRef(null);

  // Sync state helper
  const syncState = () => {
    setRequests(getRequests());
    setPlayback(getPlaybackState());
  };

  useEffect(() => {
    syncState();
    
    // Subscribe to state changes (local/same tab)
    const unsubscribe = subscribeState(syncState);
    
    // Subscribe to cross-tab updates (other tabs)
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith("walbox_")) {
        syncState();
        if (e.key === "walbox_tv_reaction" && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data && data.type && data.timestamp) {
              setTvReaction(data);
            }
          } catch (error) {
            console.error(error);
          }
        }
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Clear reaction after 6 seconds
  useEffect(() => {
    if (!tvReaction) return;
    
    const elapsed = Date.now() - tvReaction.timestamp;
    const remaining = Math.max(0, 6000 - elapsed);
    
    if (remaining <= 0) {
      setTvReaction(null);
      return;
    }

    const timer = setTimeout(() => {
      setTvReaction(null);
    }, remaining);

    return () => clearTimeout(timer);
  }, [tvReaction]);

  // Derived calculations
  const currentRequest = requests.find((r) => r.id === playback.currentRequestId && r.status === "playing");
  const approvedQueue = requests.filter((r) => r.status === "approved");

  // Track changes to trigger takeover screen
  useEffect(() => {
    if (currentRequest) {
      if (prevSongIdRef.current !== currentRequest.id) {
        // Song changed! Trigger takeover
        setTakeoverRequest(currentRequest);
        setShowTakeover(true);
        prevSongIdRef.current = currentRequest.id;

        const timer = setTimeout(() => {
          setShowTakeover(false);
        }, 4000); // 4 seconds takeover

        return () => clearTimeout(timer);
      }
    } else {
      prevSongIdRef.current = null;
      setShowTakeover(false);
    }
  }, [currentRequest]);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Get colors based on mood
  const getMoodColors = (mood) => {
    switch (mood) {
      case "party": 
        return { blob1: "hsl(322, 100%, 50%)", blob2: "hsl(263, 90%, 55%)", blob3: "hsl(35, 90%, 55%)", main: "hsl(322, 100%, 50%)" };
      case "chill": 
        return { blob1: "hsl(200, 80%, 40%)", blob2: "hsl(263, 90%, 55%)", blob3: "hsl(180, 100%, 50%)", main: "hsl(200, 80%, 45%)" };
      case "energetic": 
        return { blob1: "hsl(180, 100%, 50%)", blob2: "hsl(220, 80%, 40%)", blob3: "hsl(263, 90%, 55%)", main: "hsl(180, 100%, 50%)" };
      case "romantic": 
        return { blob1: "hsl(340, 90%, 50%)", blob2: "hsl(322, 100%, 50%)", blob3: "hsl(263, 90%, 55%)", main: "hsl(340, 90%, 50%)" };
      case "retro": 
        return { blob1: "hsl(35, 90%, 55%)", blob2: "hsl(340, 90%, 50%)", blob3: "hsl(263, 90%, 55%)", main: "hsl(35, 90%, 55%)" };
      default: 
        return { blob1: "var(--accent-primary)", blob2: "var(--accent-secondary)", blob3: "var(--accent-glow)", main: "var(--accent-secondary)" };
    }
  };

  const colors = getMoodColors(currentRequest?.mood);

  // Collect all active dedications for the ticker
  const tickerDedications = requests
    .filter((r) => r.dedication && (r.status === "playing" || r.status === "approved" || r.status === "played"))
    .slice(0, 10); // last 10 messages

  const tickerText = tickerDedications.length > 0 
    ? tickerDedications.map((r) => `Tavolo ${r.table} dedica "${r.song.title}" : "${r.dedication}"`).join("  •  ")
    : "Scegli la colonna sonora! Inquadra il sottobicchiere al tavolo per richiedere una traccia.  •  Benvenuto a The Walrus Pub Milano. Stay Thirsty, Stay Walrus 🍻";

  const playingClass = playback.isPlaying ? "tv-viewport-playing" : "";
  const moodClass = currentRequest?.mood ? `tv-mood-${currentRequest.mood}` : "tv-mood-default";
  const hasReactionClass = tvReaction ? "tv-has-reaction" : "";

  return (
    <div className={`tv-viewport tv-walrus-variant ${playingClass} ${moodClass} ${hasReactionClass}`}>
      
      {/* STAFF REACTION OVERLAY */}
      {tvReaction && (
        <div className={`tv-reaction-overlay reaction-${tvReaction.type}`}>
          <div className="reaction-glow-border"></div>
          <div className="reaction-particles">
            {[...Array(15)].map((_, i) => (
              <div key={i} className={`reaction-particle p-${i + 1}`} />
            ))}
          </div>
          <div className="reaction-content">
            {tvReaction.type === "hype" && (
              <>
                <h1 className="reaction-title">SALA OUT OF CONTROL</h1>
                <p className="reaction-subtitle">STA SALENDO MALISSIMO! ⚡</p>
              </>
            )}
            {tvReaction.type === "party" && (
              <>
                <h1 className="reaction-title">IL WALRUS SI DISSOCIA</h1>
                <p className="reaction-subtitle">LO STAFF DECLINA OGNI RESPONSABILITÀ 🔴</p>
              </>
            )}
            {tvReaction.type === "cheers" && (
              <>
                <h1 className="reaction-title">BRINDISI DEI TRICHECHI</h1>
                <p className="reaction-subtitle">ALZATE QUEI BOCCALI AL CIELO! 🍻</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Warm Background Mesh */}
      <div className="tv-background-mesh">
        <div className="tv-bg-blob tv-bg-blob-1" style={{ backgroundColor: colors.blob1 }}></div>
        <div className="tv-bg-blob tv-bg-blob-2" style={{ backgroundColor: colors.blob2 }}></div>
        <div className="tv-bg-blob tv-bg-blob-3" style={{ backgroundColor: colors.blob3 }}></div>
      </div>

      {/* Floating Spark/Ember Particles */}
      <div className="tv-particles-container walrus-tv-sparks">
        <div className="tv-particle tv-particle-1"></div>
        <div className="tv-particle tv-particle-2"></div>
        <div className="tv-particle tv-particle-3"></div>
        <div className="tv-particle tv-particle-4"></div>
        <div className="tv-particle tv-particle-5"></div>
        <div className="tv-particle tv-particle-6"></div>
        <div className="tv-particle tv-particle-7"></div>
        <div className="tv-particle tv-particle-8"></div>
      </div>

      {/* NEW SONG TAKEOVER SCREEN */}
      {showTakeover && takeoverRequest && (
        <div className="tv-takeover-screen">
          <div className="tv-takeover-glow"></div>
          
          <div className="tv-takeover-content">
            <span className="tv-takeover-subtitle">
              Prossimo Brano in Onda 🚀
            </span>

            <div className="tv-takeover-cover-wrapper">
              <div className="tv-takeover-cover-shadow"></div>
              <img 
                src={takeoverRequest.song.cover} 
                alt="" 
                className="tv-takeover-cover"
              />
            </div>

            <div>
              <h1 className="tv-takeover-title">
                {takeoverRequest.song.title}
              </h1>
              <p className="tv-takeover-artist">
                {takeoverRequest.song.artist}
              </p>
            </div>

            <div className="walrus-tv-table-badge">
              <span className="walrus-tv-badge-text">Richiesto dal Tavolo {takeoverRequest.table}</span>
            </div>

            <div className="tv-takeover-social">
              Condividi il tuo momento. Tagga @TheWalrusPub
            </div>
          </div>
        </div>
      )}

      {/* LEFT: MAIN NOW PLAYING PANEL */}
      <div className="tv-main-panel">
        
        {/* Top Header info */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <svg className="walrus-mascot-svg" width="64" height="64" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: "var(--walrus-white-warm, #F7F5F0)" }}>
              <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="6" />
              {/* Tusks (zanne) */}
              <path d="M40 52 L40 78 L46 72 Z" fill="currentColor" />
              <path d="M60 52 L60 78 L54 72 Z" fill="currentColor" />
              {/* Mustache (baffi) */}
              <path d="M50 48 C25 40 20 62 15 62 C15 62 25 50 50 52 C75 50 85 62 85 62 C80 62 75 40 50 48 Z" fill="currentColor" />
              {/* Eyes */}
              <circle cx="40" cy="38" r="4.5" fill="currentColor" />
              <circle cx="60" cy="38" r="4.5" fill="currentColor" />
            </svg>
            <div>
              <span className="walrus-tv-header-sup" style={{ fontSize: "12px", color: "var(--walrus-copper, #D48952)", letterSpacing: "3px", fontWeight: "bold", display: "block" }}>
                WALBOX × THE WALRUS PUB
              </span>
              <h2 className="walrus-tv-header-title" style={{ fontSize: "24px", fontWeight: "800", fontFamily: "var(--font-display)", color: "var(--walrus-white-warm, #F7F5F0)", margin: 0 }}>
                WALRUS LIVE SHUFFLE
              </h2>
            </div>
          </div>
          {currentRequest && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="tv-table-badge walrus-tv-mood-badge">
                {MOOD_EMOJIS[currentRequest.mood]} {currentRequest.mood}
              </span>
            </div>
          )}
        </div>

        {/* Center Now Playing card */}
        {currentRequest ? (
          <div className="walrus-tv-now-playing-panel" style={{ display: "flex", gap: "50px", alignItems: "center", margin: "40px 0" }}>
            
            {/* 3D Vinyl Sleeve & Rotating Disc */}
            <div className="tv-track-card-container">
              <div className="tv-vinyl-disc">
                <img 
                  src={currentRequest.song.cover} 
                  alt="" 
                  className="tv-vinyl-label"
                />
              </div>
              <div className="tv-vinyl-sleeve">
                <img 
                  src={currentRequest.song.cover} 
                  alt="" 
                />
              </div>
            </div>

            {/* Song Text details */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                <span className="tv-table-badge walrus-tv-table-badge">
                  <span className="walrus-tv-badge-text">TAVOLO {currentRequest.table}</span>
                </span>
                
                {/* Audio visualizer */}
                {playback.isPlaying && (
                  <div className="eq-container-premium">
                    {[...Array(14)].map((_, i) => (
                      <div key={i} className="eq-bar-premium" />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h1 className="tv-now-playing-title">
                  {currentRequest.song.title}
                </h1>
                <p className="tv-now-playing-artist">
                  {currentRequest.song.artist}
                </p>
              </div>

              {/* Dedication Bubble */}
              {currentRequest.dedication && (
                <div className="tv-dedication-box">
                  <p className="tv-dedication-label">
                    Al tavolo dicono che...
                  </p>
                  <p className="tv-dedication-text">
                    &ldquo;{currentRequest.dedication}&rdquo;
                  </p>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="walrus-tv-waiting-state" style={{ textAlign: "center", padding: "80px 0" }}>
            <svg className="walrus-mascot-svg" width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: "var(--walrus-copper)", margin: "0 auto 20px auto", display: "block" }}>
              <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="6" />
              <path d="M40 52 L40 78 L46 72 Z" fill="currentColor" />
              <path d="M60 52 L60 78 L54 72 Z" fill="currentColor" />
              <path d="M50 48 C25 40 20 62 15 62 C15 62 25 50 50 52 C75 50 85 62 85 62 C80 62 75 40 50 48 Z" fill="currentColor" />
              <circle cx="40" cy="38" r="4.5" fill="currentColor" />
              <circle cx="60" cy="38" r="4.5" fill="currentColor" />
            </svg>
            <h1 style={{ fontSize: "36px", fontWeight: "800", marginTop: "20px", fontFamily: "var(--font-display)", color: "var(--walrus-white-warm, #F7F5F0)" }}>
              Banco in attesa di richieste...
            </h1>
            <p style={{ fontSize: "18px", marginTop: "10px", color: "var(--walrus-copper, #D48952)" }}>
              Fai la prima mossa! Inquadra il sottobicchiere al tavolo per scegliere la musica.
            </p>
          </div>
        )}

        {/* Bottom Progress details */}
        {currentRequest && (
          <div className="tv-progress-container">
            <div className="tv-progress-track">
              <div 
                className="tv-progress-fill" 
                style={{ 
                  width: `${(playback.progress / playback.duration) * 100}%`
                }}
              >
                <div className="tv-progress-dot"></div>
              </div>
            </div>
            <div className="tv-progress-times">
              <span>{formatTime(playback.progress)}</span>
              <span>{formatTime(playback.duration)}</span>
            </div>
          </div>
        )}

      </div>

      {/* RIGHT: UPCOMING QUEUE PANEL */}
      <div className="tv-side-panel">
        
        {/* QR Coaster Widget */}
        <div className="walrus-tv-coaster-wrapper">
          <div className="walrus-tv-qr-coaster">
            {/* SVG Inline QR Code */}
            <svg width="85" height="85" viewBox="0 0 100 100" className="walrus-tv-coaster-qr-svg">
              {/* Corners */}
              <rect x="0" y="0" width="30" height="30" fill="black" />
              <rect x="5" y="5" width="20" height="20" fill="white" />
              <rect x="10" y="10" width="10" height="10" fill="black" />
              
              <rect x="70" y="0" width="30" height="30" fill="black" />
              <rect x="75" y="5" width="20" height="20" fill="white" />
              <rect x="80" y="10" width="10" height="10" fill="black" />
              
              <rect x="0" y="70" width="30" height="30" fill="black" />
              <rect x="5" y="75" width="20" height="20" fill="white" />
              <rect x="10" y="80" width="10" height="10" fill="black" />

              {/* Random blocks representing data */}
              <rect x="35" y="5" width="10" height="10" fill="black" />
              <rect x="50" y="15" width="10" height="10" fill="black" />
              <rect x="35" y="25" width="15" height="5" fill="black" />
              <rect x="15" y="35" width="10" height="15" fill="black" />
              <rect x="40" y="40" width="20" height="20" fill="black" />
              <rect x="70" y="45" width="15" height="10" fill="black" />
              <rect x="80" y="60" width="10" height="15" fill="black" />
              <rect x="45" y="75" width="15" height="15" fill="black" />
              <rect x="75" y="80" width="10" height="10" fill="black" />
            </svg>
          </div>
          <div className="walrus-tv-coaster-cta">
            <h4>SCEGLI LA MUSICA</h4>
            <p>Inquadra il sottobicchiere al tavolo</p>
          </div>
        </div>

        <h3 style={{ 
          fontFamily: "var(--font-display)", 
          fontSize: "18px", 
          fontWeight: "800", 
          letterSpacing: "1px",
          marginBottom: "20px",
          color: "var(--walrus-white-warm, #F7F5F0)"
        }}>
          PROSSIMI AL BANCONE
        </h3>

        {/* Approved Queue list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "15px", flex: 1, overflowY: "hidden" }}>
          {approvedQueue.length === 0 ? (
            <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--walrus-copper, #D48952)", fontSize: "13px" }}>
              Nessuno in coda al bancone.<br />La tua canzone potrebbe essere la prima! 💡
            </div>
          ) : (
            approvedQueue.slice(0, 4).map((req, idx) => (
              <div 
                key={req.id} 
                className="tv-queue-card"
              >
                <span className="tv-queue-num">
                  {idx + 1}
                </span>
                
                <img 
                  src={req.song.cover} 
                  alt="" 
                  className="tv-queue-cover"
                />

                <div className="tv-queue-info">
                  <h4 className="tv-queue-title">
                    {req.song.title}
                  </h4>
                  <p className="tv-queue-artist">
                    {req.song.artist}
                  </p>
                </div>

                <span className="tv-queue-badge walrus-tv-queue-badge">
                  <span className="walrus-tv-badge-text">Tavolo {req.table}</span>
                </span>
              </div>
            ))
          )}

          {approvedQueue.length > 4 && (
            <div style={{ textAlign: "center", fontSize: "12px", color: "var(--walrus-copper, #D48952)" }}>
              + altri {approvedQueue.length - 4} brani approvati in coda
            </div>
          )}
        </div>

      </div>

      {/* FOOTER MARQUEE TICKER */}
      <div className="tv-ticker-ribbon">
        <div className="tv-ticker-label">
          VOCI DAL BANCONE
        </div>

        {/* Marquee Wrapper */}
        <div className="tv-ticker-container">
          <div className="tv-ticker-scroll">
            {tickerText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {tickerText}
          </div>
        </div>
      </div>
    </div>
  );
}
