import { useState, useEffect, useRef } from "react";
import {
  getPlaybackState,
  MOOD_EMOJIS
} from "../data/mockData";
import { useRealtimeRequests } from "../hooks/useSongRequests";
import "./LiveTvScreenWalrusPoster.css";

export default function LiveTvScreenWalrusPoster() {
  const requests = useRealtimeRequests();
  const [playback, setPlayback] = useState({ isPlaying: false, progress: 0, duration: 0, currentRequestId: null });
  const [showTakeover, setShowTakeover] = useState(false);
  const [takeoverRequest, setTakeoverRequest] = useState(null);

  const [tvReaction, setTvReaction] = useState(() => {
    try {
      const saved = localStorage.getItem("walbox_tv_reaction");
      if (saved) {
        const data = JSON.parse(saved);
        if (data && data.timestamp && (Date.now() - data.timestamp < 6000)) return data;
      }
    } catch (e) { console.error(e); }
    return null;
  });

  const prevSongIdRef = useRef(null);

  const currentRequest = requests.find((r) => r.status === "playing");

  useEffect(() => {
    setPlayback(getPlaybackState());
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith("walbox_")) {
        setPlayback(getPlaybackState());
        if (e.key === "walbox_tv_reaction" && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data && data.type && data.timestamp) setTvReaction(data);
          } catch (error) { console.error(error); }
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => { window.removeEventListener("storage", handleStorage); };
  }, []);

  useEffect(() => {
    if (!tvReaction) return;
    const elapsed = Date.now() - tvReaction.timestamp;
    const remaining = Math.max(0, 6000 - elapsed);
    if (remaining <= 0) { setTvReaction(null); return; }
    const timer = setTimeout(() => setTvReaction(null), remaining);
    return () => clearTimeout(timer);
  }, [tvReaction]);

  useEffect(() => {
    if (!currentRequest) {
      setShowTakeover(false);
      prevSongIdRef.current = null;
      return;
    }
    if (prevSongIdRef.current === currentRequest.id) return;
    prevSongIdRef.current = currentRequest.id;
    setTakeoverRequest(currentRequest);
    setShowTakeover(true);
    const timer = setTimeout(() => setShowTakeover(false), 4000);
    return () => clearTimeout(timer);
  }, [currentRequest?.id]);
  const approvedQueue = requests.filter((r) => r.status === "approved");

  const fallbackQueue = [
    { id: "fallback-1", song: { title: "Do I Wanna Know?", artist: "Arctic Monkeys", cover: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop&q=80" }, table: "WALRUS" },
    { id: "fallback-2", song: { title: "Seven Nation Army", artist: "The White Stripes", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop&q=80" }, table: "WALRUS" }
  ];

  const displayQueue = approvedQueue.length > 0 ? approvedQueue : fallbackQueue;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const tickerDedications = requests
    .filter((r) => r.dedication && (r.status === "playing" || r.status === "approved" || r.status === "played"))
    .slice(0, 10);

  const tickerText = tickerDedications.length > 0
    ? tickerDedications.map((r) => `TAVOLO ${r.table} dedica "${r.song.title}" : "${r.dedication}"`).join("  •  ")
    : "Scegli la musica! Scansiona il QR code al tavolo e richiedi la tua traccia preferita.  •  Benvenuto al Walrus.";

  const tableLabel = (t) => isNaN(t) ? String(t) : `TAVOLO ${t}`;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div className="wlp">

        {tvReaction && (
          <div className="wlp-reaction">
            <div className="wlp-reaction-text">
              {tvReaction.type === "hype" && "HYPE!"}
              {tvReaction.type === "party" && "PARTY!"}
              {tvReaction.type === "cheers" && "CHEERS!"}
            </div>
          </div>
        )}

        {showTakeover && takeoverRequest && (
          <div className="wlp-takeover">
            <img src={takeoverRequest.song.cover} className="wlp-takeover-cover" alt="" />
            <h1 className="wlp-takeover-title">{takeoverRequest.song.title}</h1>
            <p className="wlp-takeover-artist">{takeoverRequest.song.artist}</p>
            <div className="wlp-takeover-table">TAVOLO {takeoverRequest.table}</div>
          </div>
        )}

        <img
          src="/assets/tv-poster/02-hero/walrus-orange-hero.png"
          className="wlp-walrus"
          alt=""
        />

        <div className="wlp-main">

          <div className="wlp-left">
            <div className="wlp-header">
              <img
                src="/assets/tv-poster/generated/walbox-logo-full.png"
                alt="Walbox"
                className="wlp-logo"
              />
              {currentRequest && (
                <div className="wlp-mood-badge">⚡ {currentRequest.mood.toUpperCase()}</div>
              )}
            </div>

            {currentRequest ? (
              <div className="wlp-now-playing">
                <div className="wlp-cover-row">
                  <div className="wlp-vinyl">
                    <div className={`wlp-vinyl-disc ${playback.isPlaying ? "spinning" : ""}`}>
                      <img src={currentRequest.song.cover} alt="" className="wlp-vinyl-label" />
                    </div>
                    <div className="wlp-vinyl-sleeve">
                      <img src={currentRequest.song.cover} alt="" className="wlp-sleeve-img" />
                      <img
                        src="/assets/tv-poster/cover-frame-worn.png"
                        className="wlp-cover-frame"
                        alt=""
                        aria-hidden="true"
                      />
                    </div>
                  </div>

                  <div className="wlp-song-info">
                    <div className="wlp-meta-row">
                      <img
                        src="/assets/tv-poster/02-hero/red-waveform.png"
                        alt=""
                        className="wlp-waveform"
                      />
                      <div className="wlp-table-pill">TAVOLO {currentRequest.table}</div>
                    </div>
                    <h1 className="wlp-title">{currentRequest.song.title}</h1>
                    <h2 className="wlp-artist">{currentRequest.song.artist}</h2>
                    {currentRequest.dedication && (
                      <div className="wlp-dedication">
                        <div className="wlp-dedic-label">DEDICA DEL TAVOLO ★★</div>
                        <div className="wlp-dedic-bubble">
                          <img
                            src="/assets/tv-poster/04-lower/dedication-mascot-small.png"
                            alt=""
                            className="wlp-dedic-mascot"
                          />
                          <span className="wlp-dedic-text">"{currentRequest.dedication}"</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="wlp-idle">
                <h1 className="wlp-title" style={{ fontSize: "clamp(56px,9.5vh,125px)", textAlign: "center" }}>
                  NO SIGNAL
                </h1>
                <h2 className="wlp-artist" style={{ fontSize: "clamp(20px,3.2vh,42px)" }}>
                  SCAN THE QR TO PLAY
                </h2>
              </div>
            )}
          </div>

          <div className="wlp-right">
            <img
              src="/assets/tv-poster/03-sidebar/qr-card-frame.png"
              alt="Scan QR"
              className="wlp-qr-card"
            />
            <img
              src="/assets/tv-poster/03-sidebar/krombacher-card.png"
              alt="Krombacher"
              className="wlp-krom-card"
            />
            <div className="wlp-queue-label">★ PROSSIMI IN CODA ★</div>
            <div className="wlp-queue">
              {displayQueue.slice(0, 3).map((req, idx) => (
                <div key={req.id} className="wlp-queue-item">
                  <div className="wlp-queue-num">{idx + 1}</div>
                  <img src={req.song.cover} alt="" className="wlp-queue-cover" />
                  <div className="wlp-queue-info">
                    <p className="wlp-queue-song">{req.song.title}</p>
                    <p className="wlp-queue-artist">{req.song.artist}</p>
                  </div>
                  <div className="wlp-queue-table">{tableLabel(req.table)}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {currentRequest && (
          <div className="wlp-progress-wrap">
            <div className="wlp-progress-track">
              <div
                className="wlp-progress-fill"
                style={{ width: `${(playback.progress / playback.duration) * 100}%` }}
              />
            </div>
            <div className="wlp-time-row">
              <span>{formatTime(playback.progress)}</span>
              <span>{formatTime(playback.duration)}</span>
            </div>
          </div>
        )}

        <div className="wlp-ticker">
          <div className="wlp-ticker-label">
            DEDICHE DI STASERA ⚡
          </div>
          <div className="wlp-ticker-scroll">
            {tickerText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {tickerText}
          </div>
        </div>

        <div className="wlp-footer">
          <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
            <img src="/assets/tv-poster/04-lower/krombacher-mini-left.png" alt="" className="wlp-footer-krom" />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <img src="/assets/tv-poster/04-lower/footer-brand-strip.png" alt="" className="wlp-footer-brand" />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <img src="/assets/tv-poster/04-lower/walrus-approved-stamp.png" alt="" className="wlp-footer-stamp" />
          </div>
        </div>

      </div>
    </div>
  );
}
