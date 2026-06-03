import { useState, useEffect, useRef } from "react";
import { 
  getRequests, 
  getPlaybackState, 
  subscribeState, 
  MOOD_EMOJIS 
} from "../data/mockData";

export default function LiveTvScreen() {
  const [requests, setRequests] = useState([]);
  const [playback, setPlayback] = useState({ isPlaying: false, progress: 0, duration: 0, currentRequestId: null });
  const [showTakeover, setShowTakeover] = useState(false);
  const [takeoverRequest, setTakeoverRequest] = useState(null);
  
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
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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
    : "Scegli la musica! Scansiona il QR code al tavolo e richiedi la tua traccia preferita.  •  Benvenuto in Walbox Social Jukebox.";

  return (
    <div className="tv-viewport">
      {/* Animated gradient background mesh */}
      <div className="tv-background-mesh">
        <div className="tv-bg-blob tv-bg-blob-1" style={{ backgroundColor: colors.blob1 }}></div>
        <div className="tv-bg-blob tv-bg-blob-2" style={{ backgroundColor: colors.blob2 }}></div>
        <div className="tv-bg-blob tv-bg-blob-3" style={{ backgroundColor: colors.blob3 }}></div>
      </div>

      {/* NEW SONG TAKEOVER SCREEN */}
      {showTakeover && takeoverRequest && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(5, 7, 14, 0.95)",
          backdropFilter: "blur(40px)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "30px",
          color: "white",
          animation: "fadeIn 0.5s ease-out"
        }}>
          <span style={{ 
            fontSize: "14px", 
            letterSpacing: "8px", 
            color: getMoodColors(takeoverRequest.mood).main, 
            fontWeight: "bold",
            textTransform: "uppercase"
          }}>
            Prossimo Brano in Onda 🚀
          </span>

          <img 
            src={takeoverRequest.song.cover} 
            alt="" 
            style={{ 
              width: "250px", 
              height: "250px", 
              borderRadius: "20px", 
              boxShadow: `0 0 50px ${getMoodColors(takeoverRequest.mood).main}50`,
              border: `2px solid ${getMoodColors(takeoverRequest.mood).main}`
            }} 
          />

          <div style={{ textAlign: "center" }}>
            <h1 style={{ 
              fontFamily: "var(--font-display)", 
              fontSize: "48px", 
              fontWeight: "900", 
              margin: "0",
              letterSpacing: "-1px"
            }}>
              {takeoverRequest.song.title}
            </h1>
            <p style={{ fontSize: "24px", color: "var(--text-secondary)", marginTop: "5px" }}>
              {takeoverRequest.song.artist}
            </p>
          </div>

          <div className="glass-panel" style={{ 
            padding: "12px 30px", 
            borderColor: getMoodColors(takeoverRequest.mood).main,
            color: "white",
            fontSize: "18px",
            fontWeight: "bold"
          }}>
            Richiesto dal Tavolo {takeoverRequest.table}
          </div>
        </div>
      )}

      {/* LEFT: MAIN NOW PLAYING PANEL */}
      <div className="tv-main-panel">
        
        {/* Top Header info */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)", letterSpacing: "3px", fontWeight: "bold" }}>
              WALBOX SYSTEM
            </span>
            <h2 style={{ fontSize: "24px", fontWeight: "800", fontFamily: "var(--font-display)" }}>
              Live Venue Audio
            </h2>
          </div>
          {currentRequest && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="glass-panel" style={{ 
                padding: "6px 15px", 
                fontSize: "14px", 
                fontWeight: "bold",
                color: colors.main,
                borderColor: colors.main
              }}>
                {MOOD_EMOJIS[currentRequest.mood]} {currentRequest.mood.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Center Now Playing card */}
        {currentRequest ? (
          <div style={{ display: "flex", gap: "50px", alignItems: "center", margin: "40px 0" }}>
            
            {/* Album Cover */}
            <div style={{ position: "relative" }}>
              <div style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                width: "280px",
                height: "280px",
                borderRadius: "20px",
                background: colors.main,
                filter: "blur(30px)",
                opacity: "0.4",
                zIndex: -1
              }}></div>
              <img 
                src={currentRequest.song.cover} 
                alt="" 
                style={{ 
                  width: "280px", 
                  height: "280px", 
                  borderRadius: "20px", 
                  objectFit: "cover",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.6)"
                }} 
              />
            </div>

            {/* Song Text details */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                <span className="glass-panel" style={{ 
                  padding: "4px 12px", 
                  fontSize: "13px", 
                  fontWeight: "bold", 
                  color: "var(--accent-glow)", 
                  borderColor: "var(--accent-glow)" 
                }}>
                  TAVOLO {currentRequest.table}
                </span>
                
                {/* Audio waves */}
                {playback.isPlaying && (
                  <div className="eq-container">
                    <div className="eq-bar" style={{ backgroundColor: colors.main }}></div>
                    <div className="eq-bar" style={{ animationDelay: "0.2s" }}></div>
                    <div className="eq-bar" style={{ animationDelay: "0.4s", backgroundColor: colors.main }}></div>
                    <div className="eq-bar" style={{ animationDelay: "0.1s" }}></div>
                  </div>
                )}
              </div>

              <div>
                <h1 style={{ 
                  fontFamily: "var(--font-display)", 
                  fontSize: "56px", 
                  fontWeight: "900", 
                  lineHeight: "1.05",
                  letterSpacing: "-2px",
                  margin: "0",
                  textShadow: "0 0 40px rgba(0,0,0,0.5)"
                }}>
                  {currentRequest.song.title}
                </h1>
                <p style={{ fontSize: "28px", color: "var(--text-secondary)", fontWeight: "500", marginTop: "5px" }}>
                  {currentRequest.song.artist}
                </p>
              </div>

              {/* Dedication Bubble */}
              {currentRequest.dedication && (
                <div className="glass-panel" style={{ 
                  padding: "20px 25px", 
                  borderRadius: "15px",
                  background: "rgba(13, 17, 28, 0.4)",
                  borderColor: colors.main,
                  borderLeftWidth: "4px",
                  maxWidth: "550px"
                }}>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                    Dedica del tavolo
                  </p>
                  <p style={{ fontSize: "16px", fontStyle: "italic", lineHeight: "1.5" }}>
                    &ldquo;{currentRequest.dedication}&rdquo;
                  </p>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "60px", opacity: 0.8 }}>📻</span>
            <h1 style={{ fontSize: "36px", fontWeight: "800", marginTop: "20px" }}>Jukebox in Attesa</h1>
            <p style={{ fontSize: "18px", marginTop: "10px" }}>Inquadra il QR code al tavolo per scegliere la prossima canzone!</p>
          </div>
        )}

        {/* Bottom Progress details */}
        {currentRequest && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="progress-bar-container" style={{ height: "8px" }}>
              <div 
                className="progress-bar-fill" 
                style={{ 
                  width: `${(playback.progress / playback.duration) * 100}%`,
                  background: `linear-gradient(90deg, ${colors.main}, var(--accent-glow))`
                }}
              ></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "500" }}>
              <span>{formatTime(playback.progress)}</span>
              <span>{formatTime(playback.duration)}</span>
            </div>
          </div>
        )}

      </div>

      {/* RIGHT: UPCOMING QUEUE PANEL */}
      <div className="tv-side-panel">
        
        {/* QR Code and CTA */}
        <div className="glass-panel" style={{ 
          padding: "20px", 
          textAlign: "center", 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          gap: "12px",
          marginBottom: "40px",
          borderColor: "rgba(0, 255, 255, 0.15)",
          background: "rgba(0, 255, 255, 0.02)"
        }}>
          
          {/* SVG Inline QR Code */}
          <svg width="100" height="100" viewBox="0 0 100 100" style={{ background: "white", padding: "8px", borderRadius: "8px" }}>
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

          <div>
            <h4 style={{ fontSize: "14px", fontWeight: "700" }}>Scegli tu il prossimo brano!</h4>
            <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "3px" }}>
              Inquadra il QR al tuo tavolo
            </p>
          </div>
        </div>

        <h3 style={{ 
          fontFamily: "var(--font-display)", 
          fontSize: "18px", 
          fontWeight: "800", 
          letterSpacing: "1px",
          marginBottom: "20px" 
        }}>
          PROSSIMI IN CODA
        </h3>

        {/* Approved Queue list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "15px", flex: 1, overflowY: "hidden" }}>
          {approvedQueue.length === 0 ? (
            <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
              Coda vuota.<br />La tua canzone potrebbe essere la prima! 💡
            </div>
          ) : (
            approvedQueue.slice(0, 4).map((req, idx) => (
              <div 
                key={req.id} 
                className="glass-panel" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "12px", 
                  padding: "10px 15px",
                  borderColor: "rgba(255,255,255,0.03)"
                }}
              >
                <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-secondary)" }}>
                  {idx + 1}
                </span>
                
                <img 
                  src={req.song.cover} 
                  alt="" 
                  style={{ width: "45px", height: "45px", borderRadius: "6px", objectFit: "cover" }} 
                />

                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 style={{ fontSize: "13px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {req.song.title}
                  </h4>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {req.song.artist}
                  </p>
                </div>

                <span className="glass-panel" style={{ 
                  padding: "2px 8px", 
                  fontSize: "11px", 
                  fontWeight: "bold",
                  color: getMoodColors(req.mood).main,
                  borderColor: getMoodColors(req.mood).main
                }}>
                  Tavolo {req.table}
                </span>
              </div>
            ))
          )}

          {approvedQueue.length > 4 && (
            <div style={{ textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
              + altri {approvedQueue.length - 4} brani approvati in coda
            </div>
          )}
        </div>

      </div>

      {/* FOOTER MARQUEE TICKER */}
      <div style={{
        gridColumn: "span 2",
        height: "45px",
        background: "rgba(13, 17, 28, 0.95)",
        borderTop: "1px solid var(--glass-border)",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        zIndex: 3
      }}>
        <div style={{
          background: "var(--accent-primary)",
          color: "white",
          padding: "0 20px",
          height: "100%",
          display: "flex",
          alignItems: "center",
          fontWeight: "bold",
          fontSize: "13px",
          letterSpacing: "1px",
          zIndex: 4,
          whiteSpace: "nowrap",
          boxShadow: "10px 0 20px rgba(0,0,0,0.5)"
        }}>
          DEDICHE DI STASERA 💬
        </div>

        {/* Marquee Wrapper */}
        <div style={{
          flex: 1,
          overflow: "hidden",
          position: "relative"
        }}>
          <div style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            paddingLeft: "100%",
            animation: "marquee 45s linear infinite",
            fontSize: "14px",
            fontWeight: "500",
            color: "var(--text-primary)"
          }}>
            {tickerText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {tickerText}
          </div>
        </div>
      </div>
    </div>
  );
}
