import { useState, useEffect, useRef } from "react";
import {
  getRequests,
  getPlaybackState,
  subscribeState,
  MOOD_EMOJIS
} from "../data/mockData";

export default function LiveTvScreenWalrusPoster() {
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

  // Visual Fallback tracks if queue is empty
  const fallbackQueue = [
    { id: 'fallback-1', song: { title: 'Do I Wanna Know?', artist: 'Arctic Monkeys', cover: 'https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop&q=80' }, table: 'WALRUS' },
    { id: 'fallback-2', song: { title: 'Seven Nation Army', artist: 'The White Stripes', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop&q=80' }, table: 'WALRUS' }
  ];

  const displayQueue = approvedQueue.length > 0 ? approvedQueue : fallbackQueue;

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

  // Collect all active dedications for the ticker
  const tickerDedications = requests
    .filter((r) => r.dedication && (r.status === "playing" || r.status === "approved" || r.status === "played"))
    .slice(0, 10); // last 10 messages

  const tickerText = tickerDedications.length > 0
    ? tickerDedications.map((r) => `Tavolo ${r.table} dedica "${r.song.title}" : "${r.dedication}"`).join("  •  ")
    : "Scegli la musica! Scansiona il QR code al tavolo e richiedi la tua traccia preferita.  •  Benvenuto al Walrus.";

  return (
    <div className="walrus-poster-container">
      {/* Inline styles for the specific poster look to avoid touching other files */}
      <style>{`
        .walrus-poster-container {
          width: 100vw;
          height: 100vh;
          background-color: #0a0a0a;
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)),
            url('/assets/tv-poster/bg-grunge-wall.webp');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          color: #eee;
          font-family: 'Courier New', Courier, monospace;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        /* Grunge Background Typography Watermark */
        .walrus-poster-container::before {
          content: 'LIVE STAGE';
          position: absolute;
          top: 10%;
          left: -5%;
          font-family: 'Impact', sans-serif;
          font-size: 350px;
          color: rgba(255, 255, 255, 0.02);
          transform: rotate(-10deg);
          pointer-events: none;
          z-index: 0;
          line-height: 0.8;
          white-space: nowrap;
        }

        /* Grunge Border Overlay */
        .walrus-poster-container::after {
          content: '';
          position: absolute;
          inset: 0;
          border: 15px solid #000;
          border-image: url('data:image/svg+xml;utf8,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="100" height="100" fill="none" stroke="black" stroke-width="15" stroke-dasharray="20 10 5 15" /></svg>') 15 stretch;
          pointer-events: none;
          z-index: 50;
          opacity: 0.9;
          box-shadow: inset 0 0 80px rgba(0,0,0,0.95);
        }

        .poster-main-layout {
          display: flex;
          flex: 1;
          padding: 50px;
          gap: 50px;
          height: calc(100vh - 70px); /* space for ticker */
          box-sizing: border-box;
          z-index: 10;
        }

        .poster-left-panel {
          flex: 2.2;
          display: flex;
          flex-direction: column;
          border-right: 6px dashed #333;
          padding-right: 50px;
          position: relative;
        }

        .poster-right-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 35px;
        }

        /* LEFT PANEL STYLES */
        .poster-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 20px;
          border-bottom: 8px solid #cc0000;
          padding-bottom: 15px;
        }

        .poster-header-titles {
          display: flex;
          flex-direction: column;
        }

        .poster-brand-title-1 {
          font-size: 80px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -3px;
          color: #fff;
          text-shadow: 5px 5px 0 #cc0000, -2px -2px 0 #000;
          margin: 0;
          line-height: 0.9;
          font-family: 'Impact', 'Arial Black', sans-serif;
        }

        .poster-brand-title-2 {
          font-size: 90px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -4px;
          color: #cc0000;
          text-shadow: 4px 4px 0 #fff, -2px -2px 0 #000;
          margin: -10px 0 0 0;
          line-height: 0.9;
          font-family: 'Impact', 'Arial Black', sans-serif;
        }
        
        .poster-brand-subtitle {
          font-size: 20px;
          font-weight: bold;
          letter-spacing: 8px;
          color: #000;
          background: #fff;
          display: inline-block;
          padding: 5px 15px;
          text-transform: uppercase;
          margin-top: 15px;
          align-self: flex-start;
          transform: rotate(-1deg);
        }

        .poster-now-playing {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          width: 100%;
        }

        .poster-cover-hero-container {
          display: flex;
          gap: 70px;
          align-items: center;
          width: 100%;
          margin-bottom: 30px;
        }

        /* NEW VINYL EFFECT */
        .poster-vinyl-hero {
          position: relative;
          width: 350px;
          height: 350px;
          display: flex;
          align-items: center;
          transform: rotate(-2deg);
          flex-shrink: 0;
        }

        .poster-vinyl-sleeve {
          position: relative;
          width: 350px;
          height: 350px;
          z-index: 10;
          border: 15px solid #fff;
          box-shadow: 20px 20px 0 #cc0000, inset 0 0 20px rgba(0,0,0,0.8);
          background: #000;
        }

        .poster-sleeve-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: contrast(1.1) saturate(1.2);
        }

        .poster-vinyl-disc {
          position: absolute;
          width: 330px;
          height: 330px;
          right: -100px; /* slides out */
          border-radius: 50%;
          background: #111;
          box-shadow: 10px 10px 0 rgba(0,0,0,0.7), inset 0 0 20px #000;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 5;
        }

        .poster-vinyl-disc.is-playing {
          animation: spinRecord 4s linear infinite;
        }

        .poster-vinyl-disc::before {
          content: '';
          position: absolute;
          inset: 5px;
          border-radius: 50%;
          border: 1px solid #222;
          box-shadow: 
            inset 0 0 0 10px #111, 
            inset 0 0 0 12px #333, 
            inset 0 0 0 30px #111, 
            inset 0 0 0 32px #222, 
            inset 0 0 0 60px #111, 
            inset 0 0 0 62px #333,
            inset 0 0 0 90px #111,
            inset 0 0 0 92px #222;
        }

        .poster-vinyl-label {
          width: 110px;
          height: 110px;
          border-radius: 50%;
          object-fit: cover;
          z-index: 10;
          border: 4px solid #000;
        }

        @keyframes spinRecord {
          100% { transform: rotate(360deg); }
        }

        .poster-vinyl-hero::before {
          content: 'ON AIR';
          position: absolute;
          top: -20px;
          left: -20px;
          background: #000;
          color: #fff;
          padding: 5px 20px;
          font-weight: 900;
          font-family: 'Impact', sans-serif;
          font-size: 32px;
          transform: rotate(-5deg);
          box-shadow: 5px 5px 0 #cc0000;
          z-index: 20;
          letter-spacing: 2px;
        }

        /* Fake tape on cover */
        .poster-vinyl-hero::after {
          content: '';
          position: absolute;
          bottom: -15px; left: 100px;
          width: 80px; height: 30px;
          background: rgba(255,255,255,0.7);
          transform: rotate(-15deg);
          box-shadow: 0 2px 5px rgba(0,0,0,0.4);
          z-index: 20;
        }

        .poster-song-info-block {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .poster-song-title {
          font-size: 80px;
          font-weight: 900;
          color: #fff;
          text-transform: uppercase;
          line-height: 0.95;
          margin: 0 0 15px 0;
          font-family: 'Impact', 'Arial Black', sans-serif;
          text-shadow: 5px 5px 0 #cc0000, -2px -2px 0 #000;
          letter-spacing: -2px;
          word-break: break-word;
        }

        .poster-song-artist {
          font-size: 35px;
          font-weight: bold;
          color: #111;
          background: #fff;
          text-transform: uppercase;
          margin: 0 0 25px 0;
          display: inline-block;
          padding: 5px 15px;
          align-self: flex-start;
          transform: rotate(1deg);
          box-shadow: 5px 5px 0 #cc0000;
        }

        .poster-requester-badge {
          background: #cc0000;
          color: #fff;
          font-weight: 900;
          font-size: 26px;
          padding: 10px 25px;
          display: inline-block;
          transform: rotate(-1deg);
          border: 4px solid #000;
          box-shadow: 6px 6px 0 #000;
          font-family: 'Courier New', Courier, monospace;
        }

        .poster-dedication-bubble {
          margin-top: 25px;
          background: #111;
          border: 4px dashed #555;
          padding: 15px 25px;
          font-style: italic;
          color: #fff;
          font-size: 22px;
          font-weight: bold;
          max-width: 90%;
          box-shadow: 5px 5px 0 #000;
          position: relative;
        }
        
        .poster-dedication-bubble::before {
          content: 'MESSAGE:';
          display: block;
          font-family: 'Impact', sans-serif;
          color: #cc0000;
          font-size: 24px;
          font-style: normal;
          margin-bottom: 5px;
          letter-spacing: 1px;
        }

        /* Red Progress Bar */
        .poster-progress-container {
          margin-top: auto;
          width: 100%;
          background: #111;
          height: 30px;
          border: 4px solid #444;
          position: relative;
          box-shadow: inset 0 5px 10px rgba(0,0,0,0.8);
        }

        .poster-progress-fill {
          height: 100%;
          background: #cc0000;
          width: 0%;
          transition: width 1s linear;
          position: relative;
          box-shadow: 0 0 15px rgba(204,0,0,0.5);
        }
        
        .poster-progress-fill::after {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 0; left: 0;
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 15px,
            rgba(0,0,0,0.3) 15px,
            rgba(0,0,0,0.3) 30px
          );
        }

        .poster-time-labels {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          margin-top: 10px;
          font-size: 24px;
          color: #aaa;
          font-family: 'Courier New', monospace;
        }

        /* RIGHT PANEL STYLES */
        
        /* QR Box Flyer */
        .poster-qr-box {
          background: #eee;
          padding: 20px;
          border: 5px solid #000;
          color: #000;
          display: flex;
          align-items: center;
          gap: 20px;
          transform: rotate(2deg);
          box-shadow: 8px 8px 0 #cc0000;
          position: relative;
        }
        
        .poster-qr-box::before {
          content: '';
          position: absolute;
          top: -15px; left: -15px; transform: rotate(-45deg);
          width: 90px; height: 30px;
          background: rgba(255, 255, 255, 0.6);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          z-index: 2;
        }

        .poster-qr-svg {
          background: #fff;
          padding: 8px;
          border: 3px solid #000;
          width: 100px;
          height: 100px;
        }

        .poster-qr-text {
          display: flex;
          flex-direction: column;
        }

        .poster-qr-text h4 {
          font-family: 'Impact', sans-serif;
          font-size: 32px;
          margin: 0 0 5px 0;
          text-transform: uppercase;
          line-height: 0.9;
          color: #cc0000;
          text-shadow: 2px 2px 0 #000;
        }
        .poster-qr-text p {
          margin: 0;
          font-weight: 900;
          font-size: 16px;
          font-family: 'Courier New', monospace;
        }

        /* Krombacher Mini-Poster (Dark/Grunge) */
        .krombacher-poster {
          background: #1c1c1c; 
          background-image: radial-gradient(circle at center, #2e2e2e 0%, #111 100%);
          border: 4px solid #444;
          padding: 20px 15px;
          text-align: center;
          transform: rotate(-3deg);
          box-shadow: 10px 10px 0 rgba(0,0,0,0.9), inset 0 0 30px rgba(0,0,0,0.8);
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 10px 0;
          color: #eee;
        }

        .krombacher-poster::after {
          content: '';
          position: absolute;
          top: -12px; left: 50%;
          transform: translateX(-50%) rotate(-4deg);
          width: 90px; height: 30px;
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(0,0,0,0.6);
          box-shadow: 0 2px 5px rgba(0,0,0,0.6);
        }

        .krombacher-text-top {
          font-family: 'Impact', sans-serif;
          font-size: 36px;
          color: #fff;
          line-height: 1;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-shadow: 2px 2px 0 #000;
        }

        .krombacher-sticker {
          max-height: 120px;
          margin: 10px 0;
          transform: rotate(5deg);
          filter: drop-shadow(5px 5px 0 rgba(0,0,0,0.9)) brightness(0.9) contrast(1.2);
        }

        .krombacher-text-bottom {
          font-family: 'Impact', sans-serif;
          font-size: 42px;
          color: #cc0000;
          line-height: 1;
          text-shadow: 3px 3px 0 #000;
          margin-bottom: 10px;
          text-transform: uppercase;
        }

        .krombacher-brand {
          font-family: 'Courier New', Courier, monospace;
          font-size: 18px;
          font-weight: 900;
          background: #cc0000;
          color: #fff;
          padding: 4px 12px;
          transform: rotate(-1deg);
          border: 2px solid #000;
        }

        /* Queue List */
        .poster-queue-title {
          font-family: 'Impact', sans-serif;
          font-size: 36px;
          color: #fff;
          border-bottom: 5px solid #cc0000;
          padding-bottom: 10px;
          margin: 10px 0 15px 0;
          text-transform: uppercase;
          text-shadow: 3px 3px 0 #000;
        }

        .poster-queue-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
          flex: 1;
        }

        .poster-queue-item {
          display: flex;
          align-items: center;
          background: #000;
          border: 3px solid #333;
          padding: 10px;
          gap: 15px;
          position: relative;
        }
        
        .poster-queue-item::before {
          content: '';
          position: absolute;
          left: -6px; top: -6px;
          width: 12px; height: 12px;
          background: #cc0000;
        }

        .poster-queue-num {
          font-family: 'Impact', sans-serif;
          font-size: 35px;
          color: #555;
          width: 40px;
          text-align: center;
          line-height: 1;
        }

        .poster-queue-cover {
          width: 60px;
          height: 60px;
          object-fit: cover;
          border: 2px solid #333;
          filter: grayscale(0.2);
        }

        .poster-queue-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .poster-queue-song {
          font-weight: 900;
          font-size: 18px;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: uppercase;
          margin: 0 0 3px 0;
        }

        .poster-queue-artist {
          font-size: 14px;
          color: #888;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: 'Courier New', monospace;
          font-weight: bold;
        }

        .poster-queue-table {
          background: #cc0000;
          color: #fff;
          font-weight: 900;
          padding: 4px 8px;
          font-size: 14px;
          font-family: 'Courier New', Courier, monospace;
          border: 2px solid #000;
        }

        /* Ticker */
        .poster-ticker {
          height: 70px;
          background: #cc0000;
          color: #000;
          display: flex;
          align-items: center;
          font-family: 'Courier New', Courier, monospace;
          font-weight: 900;
          font-size: 32px;
          text-transform: uppercase;
          overflow: hidden;
          border-top: 8px solid #000;
          box-shadow: 0 -10px 20px rgba(0,0,0,0.8);
          position: relative;
          z-index: 20;
        }

        .poster-ticker-label {
          background: #000;
          color: #fff;
          padding: 0 30px;
          height: 100%;
          display: flex;
          align-items: center;
          font-family: 'Impact', sans-serif;
          font-size: 38px;
          letter-spacing: 2px;
          z-index: 2;
          box-shadow: 10px 0 15px rgba(0,0,0,0.8);
          border-right: 5px solid #cc0000;
        }

        .poster-ticker-scroll {
          white-space: nowrap;
          animation: posterScroll 25s linear infinite;
          padding-left: 30px;
          text-shadow: 1px 1px 0 #fff;
        }

        @keyframes posterScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        /* Takeover & Reactions */
        .poster-takeover {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.95);
          z-index: 100;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          animation: stampIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          background-image: radial-gradient(circle at center, #330000 0%, #000 100%);
        }

        @keyframes stampIn {
          0% { transform: scale(2) rotate(10deg); opacity: 0; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        .poster-takeover-title {
          font-family: 'Impact', sans-serif;
          font-size: 130px;
          color: #fff;
          text-transform: uppercase;
          line-height: 0.9;
          margin: 30px 0 10px 0;
          text-shadow: 8px 8px 0 #cc0000, -3px -3px 0 #000;
          transform: rotate(-2deg);
        }

        .poster-takeover-artist {
          font-size: 50px;
          font-weight: 900;
          color: #000;
          background: #fff;
          padding: 5px 20px;
          margin: 10px 0;
          transform: rotate(1deg);
        }

        .poster-takeover-cover {
          width: 500px;
          height: 500px;
          border: 20px solid #fff;
          box-shadow: 25px 25px 0 #cc0000;
          transform: rotate(3deg);
        }

        .poster-reaction-overlay {
          position: absolute;
          inset: 0;
          z-index: 90;
          display: flex;
          justify-content: center;
          align-items: center;
          pointer-events: none;
          background: rgba(204, 0, 0, 0.4);
          mix-blend-mode: color-dodge;
        }

        .poster-reaction-text {
          font-family: 'Impact', sans-serif;
          font-size: 200px;
          color: #fff;
          text-transform: uppercase;
          text-shadow: 15px 15px 0 #cc0000, -3px -3px 0 #000;
          transform: rotate(-10deg) scale(1.5);
          animation: pulseHype 0.4s infinite alternate;
        }

        @keyframes pulseHype {
          0% { transform: rotate(-10deg) scale(1); }
          100% { transform: rotate(-5deg) scale(1.1); }
        }
      `}</style>

      {/* REACTION OVERLAY */}
      {tvReaction && (
        <div className="poster-reaction-overlay">
          <div className="poster-reaction-text">
            {tvReaction.type === "hype" && "HYPE!"}
            {tvReaction.type === "party" && "PARTY!"}
            {tvReaction.type === "cheers" && "CHEERS!"}
          </div>
        </div>
      )}

      {/* TAKEOVER OVERLAY */}
      {showTakeover && takeoverRequest && (
        <div className="poster-takeover">
          <img src={takeoverRequest.song.cover} className="poster-takeover-cover" alt="" />
          <h1 className="poster-takeover-title">{takeoverRequest.song.title}</h1>
          <p className="poster-takeover-artist">{takeoverRequest.song.artist}</p>
          <div className="poster-requester-badge" style={{ marginTop: '30px', fontSize: '40px' }}>
            TAVOLO {takeoverRequest.table}
          </div>
        </div>
      )}

      <div className="poster-main-layout">

        {/* LEFT PANEL */}
        <div className="poster-left-panel">
          <div className="poster-header">
            <div className="poster-header-titles">
              <h2 className="poster-brand-title-1">WALBOX LIVE</h2>
              <h2 className="poster-brand-title-2">WALRUS STAGE</h2>
              <div className="poster-brand-subtitle">LIVE VENUE AUDIO SYSTEM</div>
            </div>
            {currentRequest && (
              <div className="poster-requester-badge" style={{ alignSelf: 'flex-start', background: '#000', color: '#fff', borderColor: '#cc0000' }}>
                MOOD: {currentRequest.mood.toUpperCase()}
              </div>
            )}
          </div>

          {currentRequest ? (
            <div className="poster-now-playing">
              <div className="poster-cover-hero-container">

                {/* Vinyl / Cover Component */}
                <div className="poster-vinyl-hero">
                  <div className={`poster-vinyl-disc ${playback.isPlaying ? 'is-playing' : ''}`}>
                    <img src={currentRequest.song.cover} alt="" className="poster-vinyl-label" />
                  </div>
                  <div className="poster-vinyl-sleeve">
                    <img src={currentRequest.song.cover} alt="" className="poster-sleeve-img" />
                  </div>
                </div>

                <div className="poster-song-info-block">
                  <h1 className="poster-song-title">{currentRequest.song.title}</h1>
                  <h2 className="poster-song-artist">{currentRequest.song.artist}</h2>

                  <div style={{ alignSelf: 'flex-start' }}>
                    <div className="poster-requester-badge">
                      REQUESTED BY TAVOLO {currentRequest.table}
                    </div>
                  </div>

                  {currentRequest.dedication && (
                    <div className="poster-dedication-bubble">
                      "{currentRequest.dedication}"
                    </div>
                  )}
                </div>
              </div>

              <div className="poster-progress-container">
                <div
                  className="poster-progress-fill"
                  style={{ width: `${(playback.progress / playback.duration) * 100}%` }}
                ></div>
              </div>
              <div className="poster-time-labels">
                <span>{formatTime(playback.progress)}</span>
                <span>{formatTime(playback.duration)}</span>
              </div>
            </div>
          ) : (
            <div className="poster-now-playing" style={{ opacity: 0.6, alignItems: 'center' }}>
              <h1 className="poster-song-title" style={{ fontSize: '130px', textAlign: 'center' }}>NO SIGNAL</h1>
              <h2 className="poster-song-artist" style={{ fontSize: '50px' }}>SCAN THE QR TO PLAY</h2>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="poster-right-panel">

          <div className="poster-qr-box">
            <svg className="poster-qr-svg" viewBox="0 0 100 100">
              {/* Fake QR blocks */}
              <rect x="0" y="0" width="30" height="30" fill="black" />
              <rect x="5" y="5" width="20" height="20" fill="white" />
              <rect x="10" y="10" width="10" height="10" fill="black" />
              <rect x="70" y="0" width="30" height="30" fill="black" />
              <rect x="75" y="5" width="20" height="20" fill="white" />
              <rect x="80" y="10" width="10" height="10" fill="black" />
              <rect x="0" y="70" width="30" height="30" fill="black" />
              <rect x="5" y="75" width="20" height="20" fill="white" />
              <rect x="10" y="80" width="10" height="10" fill="black" />
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
            <div className="poster-qr-text">
              <h4>YOUR MUSIC<br />HERE</h4>
              <p>SCAN QR AT TABLE</p>
            </div>
          </div>

          <div className="krombacher-poster">
            <div className="krombacher-text-top">PROBLEMI FUORI</div>
            <img src="/walrus-beer-sticker.png" alt="Walrus Beer Sticker" className="krombacher-sticker" />
            <div className="krombacher-text-bottom">BIRRE DENTRO</div>
            <div className="krombacher-brand">KROMBACHER</div>
          </div>

          <div className="poster-queue-title">UPCOMING TRACKS</div>

          <div className="poster-queue-list">
            {displayQueue.map((req, idx) => (
              <div key={req.id} className="poster-queue-item">
                <div className="poster-queue-num">{idx + 1}</div>
                <img src={req.song.cover} className="poster-queue-cover" alt="" />
                <div className="poster-queue-info">
                  <p className="poster-queue-song">{req.song.title}</p>
                  <p className="poster-queue-artist">{req.song.artist}</p>
                </div>
                <div className="poster-queue-table">
                  {String(req.table).startsWith('WALRUS') ? req.table : `T${req.table}`}
                </div>
              </div>
            ))}
            {approvedQueue.length > 4 && (
              <div style={{ textAlign: 'center', color: '#cc0000', marginTop: '5px', fontWeight: '900', fontSize: '20px', fontFamily: 'Courier New' }}>
                + {approvedQueue.length - 4} MORE TRACKS
              </div>
            )}
          </div>
        </div>

      </div>

      {/* TICKER */}
      <div className="poster-ticker">
        <div className="poster-ticker-label">SHOUTOUTS</div>
        <div className="poster-ticker-scroll">
          {tickerText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {tickerText}
        </div>
      </div>

    </div>
  );
}
