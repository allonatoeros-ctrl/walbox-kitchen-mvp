import { useState, useEffect, useRef } from "react";
import {
  getRequests,
  getPlaybackState,
  subscribeState,
  MOOD_EMOJIS
} from "../data/mockData";

export default function LiveTvScreenWalrusPosterPro() {
  const [requests, setRequests] = useState([]);
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

  const syncState = () => {
    setRequests(getRequests());
    setPlayback(getPlaybackState());
  };

  useEffect(() => {
    syncState();
    const unsubscribe = subscribeState(syncState);
    const handleStorage = (e) => {
      if (e.key && e.key.startsWith("walbox_")) {
        syncState();
        if (e.key === "walbox_tv_reaction" && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data && data.type && data.timestamp) setTvReaction(data);
          } catch (error) { console.error(error); }
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => { unsubscribe(); window.removeEventListener("storage", handleStorage); };
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
    if (currentRequest) {
      if (prevSongIdRef.current !== currentRequest.id) {
        setTakeoverRequest(currentRequest);
        setShowTakeover(true);
        prevSongIdRef.current = currentRequest.id;
        const timer = setTimeout(() => setShowTakeover(false), 4000);
        return () => clearTimeout(timer);
      }
    } else {
      prevSongIdRef.current = null;
      setShowTakeover(false);
    }
  }, [requests, playback]);

  const currentRequest = requests.find((r) => r.id === playback.currentRequestId && r.status === "playing");
  const approvedQueue = requests.filter((r) => r.status === "approved");

  const fallbackQueue = [
    { id: "fb-1", song: { title: "Do I Wanna Know?", artist: "Arctic Monkeys", cover: "https://images.unsplash.com/photo-1619983081563-430f63602796?w=200&h=200&fit=crop&q=80" }, table: "WALRUS" },
    { id: "fb-2", song: { title: "Seven Nation Army", artist: "The White Stripes", cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&h=200&fit=crop&q=80" }, table: "WALRUS" },
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
      <div className="wlp2">
        <style>{`
          .wlp2 {
            aspect-ratio: 16 / 9;
            width: min(100vw, calc(100vh * 16 / 9));
            height: min(100vh, calc(100vw * 9 / 16));
            background-color: #1a0901;
            background-image:
              linear-gradient(rgba(7, 2, 0, 0.65), rgba(7, 2, 0, 0.65)),
              url('/assets/tv-poster/bg-grunge-wall.webp');
            background-size: cover;
            background-position: center;
            color: #eee;
            font-family: 'Courier New', Courier, monospace;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
          }

          .wlp2::before {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at 50% 46%, transparent 36%, rgba(0,0,0,0.78) 100%);
            pointer-events: none;
            z-index: 1;
          }

          /* ── WALRUS HERO ── */
          .wlp2-walrus {
            position: absolute;
            left: 34%;
            top: 50%;
            transform: translateY(-50%) rotate(3deg);
            height: 94%;
            z-index: 2;
            pointer-events: none;
            opacity: 0.52;
            background: transparent;
          }

          /* ── MAIN GRID ── */
          .wlp2-grid {
            flex: 1;
            display: flex;
            gap: 0;
            padding: clamp(14px, 2.2vh, 28px) clamp(16px, 2.4vw, 30px) clamp(8px, 1.2vh, 16px);
            position: relative;
            z-index: 10;
            min-height: 0;
            box-sizing: border-box;
            overflow: hidden;
          }

          /* Left 63% */
          .wlp2-left {
            flex: 63;
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
            padding-right: clamp(12px, 1.8vw, 24px);
          }

          /* Right 37% */
          .wlp2-right {
            flex: 37;
            display: flex;
            flex-direction: column;
            gap: clamp(6px, 0.9vh, 13px);
            min-width: 0;
            overflow: hidden;
            position: relative;
            z-index: 5;
          }

          /* ── HEADER ── */
          .wlp2-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-shrink: 0;
            margin-bottom: clamp(8px, 1.4vh, 20px);
          }

          .wlp2-pub-identity {
            display: flex;
            flex-direction: column;
            gap: clamp(1px, 0.25vh, 4px);
          }

          .wlp2-pub-top-row {
            display: flex;
            align-items: center;
            gap: clamp(5px, 0.7vw, 10px);
          }

          .wlp2-walrus-head {
            height: clamp(26px, 4.2vh, 54px);
            object-fit: contain;
            background: transparent;
            flex-shrink: 0;
          }

          .wlp2-pub-title-img {
            height: clamp(13px, 2vh, 26px);
            object-fit: contain;
            background: transparent;
          }

          .wlp2-main-text-img {
            height: clamp(44px, 7.2vh, 94px);
            object-fit: contain;
            background: transparent;
            display: block;
          }

          .wlp2-tagline-img {
            height: clamp(8px, 1.3vh, 17px);
            object-fit: contain;
            background: transparent;
            display: block;
            opacity: 0.80;
          }

          .wlp2-mood-badge {
            background: #c85c08;
            color: #fff;
            font-family: 'Impact', sans-serif;
            font-size: clamp(10px, 1.5vh, 18px);
            padding: clamp(4px, 0.5vh, 7px) clamp(10px, 1.3vw, 16px);
            letter-spacing: 1px;
            border: 2px solid #000;
            box-shadow: 3px 3px 0 #000;
            text-transform: uppercase;
            align-self: flex-start;
            margin-top: clamp(8px, 1.2vh, 16px);
            transform: rotate(-0.5deg);
            white-space: nowrap;
            flex-shrink: 0;
          }

          /* ── NOW PLAYING ── */
          .wlp2-now-playing {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
          }

          .wlp2-cover-row {
            display: flex;
            gap: clamp(12px, 1.8vw, 26px);
            align-items: flex-start;
            flex: 1;
            min-height: 0;
            overflow: hidden;
          }

          /* ── VINYL ── */
          .wlp2-vinyl {
            position: relative;
            height: clamp(120px, 20vh, 260px);
            width: clamp(120px, 20vh, 260px);
            flex-shrink: 0;
            transform: rotate(-2deg);
          }

          .wlp2-vinyl::after {
            content: '';
            position: absolute;
            top: 7px; left: 7px;
            width: 100%; height: 100%;
            background: #cc0000;
            z-index: 2;
          }

          .wlp2-vinyl-sleeve {
            position: absolute;
            inset: 0;
            overflow: hidden;
            z-index: 10;
            background: #000;
            box-shadow: inset 0 0 16px rgba(0,0,0,0.8);
          }

          .wlp2-cover-frame {
            position: absolute;
            inset: -10%;
            width: 120%;
            height: 120%;
            object-fit: fill;
            z-index: 12;
            pointer-events: none;
          }

          .wlp2-sleeve-img {
            width: 100%; height: 100%;
            object-fit: cover;
            filter: contrast(1.1) saturate(1.15);
            display: block;
          }

          .wlp2-vinyl-disc {
            position: absolute;
            top: 3%; right: -46%;
            width: 92%; height: 92%;
            border-radius: 50%;
            background: #0f0f0f;
            box-shadow: 7px 7px 0 rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 5;
          }

          .wlp2-vinyl-disc::before {
            content: '';
            position: absolute;
            inset: 4px;
            border-radius: 50%;
            box-shadow:
              inset 0 0 0 8px #111,
              inset 0 0 0 10px #252525,
              inset 0 0 0 26px #111,
              inset 0 0 0 28px #1e1e1e,
              inset 0 0 0 52px #111,
              inset 0 0 0 54px #252525,
              inset 0 0 0 76px #111;
          }

          .wlp2-vinyl-disc.spinning {
            animation: wlp2Spin 4s linear infinite;
          }

          @keyframes wlp2Spin {
            100% { transform: rotate(360deg); }
          }

          .wlp2-vinyl-label {
            width: 30%; height: 30%;
            border-radius: 50%;
            object-fit: cover;
            z-index: 10;
            border: 2px solid #000;
          }

          /* ── SONG INFO ── */
          .wlp2-song-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
            position: relative;
            z-index: 20;
          }

          .wlp2-meta-row {
            display: flex;
            align-items: center;
            gap: clamp(6px, 1vw, 14px);
            margin-bottom: clamp(4px, 0.6vh, 8px);
            flex-shrink: 0;
          }

          .wlp2-waveform {
            height: clamp(13px, 2vh, 28px);
            width: clamp(55px, 8.5vw, 120px);
            object-fit: contain;
            background: transparent;
            flex-shrink: 0;
          }

          .wlp2-table-pill {
            background: #000;
            color: #fff;
            font-family: 'Impact', sans-serif;
            font-size: clamp(10px, 1.4vh, 17px);
            padding: 3px 12px;
            border: 2px solid #cc0000;
            border-radius: 9999px;
            white-space: nowrap;
            text-transform: uppercase;
          }

          .wlp2-title {
            font-family: 'Impact', 'Arial Black', sans-serif;
            font-size: clamp(58px, 11vh, 144px);
            font-weight: 900;
            color: #fcfaf2;
            text-transform: uppercase;
            line-height: 0.88;
            margin: 0 0 clamp(3px, 0.5vh, 8px) 0;
            text-shadow: 5px 5px 0 rgba(0,0,0,0.92);
            letter-spacing: -2px;
            word-break: break-word;
            flex-shrink: 0;
          }

          .wlp2-artist {
            font-family: 'Brush Script MT', 'Georgia', cursive, serif;
            font-size: clamp(20px, 3.6vh, 46px);
            font-weight: bold;
            font-style: italic;
            color: #f7d070;
            margin: 0 0 clamp(4px, 0.7vh, 12px) 0;
            transform: rotate(-1deg);
            display: inline-block;
            text-shadow: 2px 2px 0 #000;
            align-self: flex-start;
            position: relative;
            padding-bottom: clamp(6px, 1vh, 14px);
            flex-shrink: 0;
          }

          .wlp2-artist::after {
            content: '';
            position: absolute;
            bottom: 0; left: -5%;
            width: 110%;
            height: clamp(5px, 0.9vh, 12px);
            background: url('/assets/tv-poster/generated/walbox-live-brush.png') no-repeat center;
            background-size: 100% 100%;
          }

          .wlp2-dedication {
            margin-top: auto;
            padding-top: clamp(2px, 0.4vh, 6px);
            flex-shrink: 0;
          }

          .wlp2-dedic-label {
            font-family: 'Courier New', monospace;
            font-size: clamp(9px, 1.2vh, 14px);
            font-weight: 900;
            color: #cc0000;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 0;
            padding: clamp(3px, 0.4vh, 6px) clamp(12px, 1.8vw, 22px) clamp(2px, 0.3vh, 5px);
            background: rgba(0,0,0,0.55);
            display: inline-block;
          }

          .wlp2-dedic-bubble {
            background: url('/assets/tv-poster/04-lower/dedication-card-frame.png') no-repeat center;
            background-size: 100% 100%;
            aspect-ratio: 2172 / 724;
            display: flex;
            align-items: center;
            gap: clamp(6px, 1vw, 14px);
            padding: clamp(6px, 0.9vh, 13px) clamp(14px, 2.2vw, 36px);
            max-width: 500px;
            box-sizing: border-box;
          }

          .wlp2-dedic-mascot {
            height: clamp(24px, 4vh, 52px);
            object-fit: contain;
            flex-shrink: 0;
            background: transparent;
          }

          .wlp2-dedic-text {
            font-family: 'Courier New', monospace;
            font-size: clamp(10px, 1.4vh, 17px);
            font-weight: 900;
            color: #fff;
            text-shadow: 1px 1px 0 #000;
            line-height: 1.2;
          }

          /* ── PROGRESS BAR — inside left column at bottom of now-playing ── */
          .wlp2-progress-wrap {
            flex-shrink: 0;
            margin-top: clamp(6px, 1vh, 14px);
            padding-right: clamp(4px, 0.5vw, 8px);
          }

          .wlp2-progress-track {
            height: clamp(8px, 1.3vh, 18px);
            background: #111;
            border: 2px solid #2a2a2a;
            position: relative;
            overflow: hidden;
            box-shadow: inset 0 2px 6px rgba(0,0,0,0.8);
          }

          .wlp2-progress-fill {
            height: 100%;
            background: #cc0000;
            transition: width 1s linear;
            position: relative;
            box-shadow: 0 0 10px rgba(204,0,0,0.5);
          }

          .wlp2-progress-fill::after {
            content: '';
            position: absolute;
            right: 0;
            top: 50%;
            transform: translateY(-50%) translateX(50%);
            width: clamp(10px, 1.6vh, 20px);
            height: clamp(10px, 1.6vh, 20px);
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 4px #fff;
            z-index: 5;
          }

          .wlp2-time-row {
            display: flex;
            justify-content: space-between;
            font-size: clamp(9px, 1.2vh, 16px);
            color: #888;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            margin-top: 2px;
          }

          /* ── IDLE ── */
          .wlp2-idle {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            opacity: 0.5;
            gap: clamp(6px, 1.2vh, 18px);
          }

          /* ── RIGHT RAIL ── */
          .wlp2-qr-card {
            width: 100%;
            object-fit: contain;
            background: transparent;
            display: block;
            flex-shrink: 0;
            max-height: clamp(78px, 19vh, 165px);
            transform: rotate(1deg);
            box-shadow: 4px 4px 0 rgba(0,0,0,0.5);
          }

          .wlp2-krom-card {
            width: 100%;
            object-fit: contain;
            background: transparent;
            display: block;
            flex-shrink: 0;
            max-height: clamp(68px, 16.5vh, 145px);
            transform: rotate(-1deg);
            box-shadow: 4px 4px 0 rgba(0,0,0,0.5);
          }

          .wlp2-queue-label {
            font-family: 'Impact', sans-serif;
            font-size: clamp(11px, 1.6vh, 21px);
            color: #fff;
            border-bottom: 3px solid #cc0000;
            padding-bottom: clamp(3px, 0.4vh, 7px);
            text-transform: uppercase;
            text-shadow: 2px 2px 0 #000;
            flex-shrink: 0;
            letter-spacing: 0.5px;
          }

          .wlp2-queue {
            display: flex;
            flex-direction: column;
            gap: clamp(4px, 0.6vh, 9px);
            overflow: hidden;
            flex: 1;
            min-height: 0;
          }

          .wlp2-queue-item {
            display: flex;
            align-items: center;
            background: rgba(0,0,0,0.72);
            border: 1px solid #222;
            border-left: 3px solid #cc0000;
            padding: clamp(7px, 0.9vh, 12px) clamp(6px, 0.8vw, 10px);
            gap: clamp(5px, 0.7vw, 10px);
            flex-shrink: 0;
          }

          .wlp2-queue-num {
            font-family: 'Impact', sans-serif;
            font-size: clamp(17px, 2.5vh, 30px);
            color: #cc0000;
            width: clamp(15px, 1.9vw, 26px);
            text-align: center;
            flex-shrink: 0;
            text-shadow: 2px 2px 0 #000;
          }

          .wlp2-queue-cover {
            width: clamp(22px, 3.6vh, 44px);
            height: clamp(22px, 3.6vh, 44px);
            object-fit: cover;
            border: 2px solid #333;
            flex-shrink: 0;
          }

          .wlp2-queue-info {
            flex: 1; min-width: 0; overflow: hidden;
          }

          .wlp2-queue-song {
            font-weight: 900;
            font-size: clamp(8px, 1.2vh, 14px);
            color: #fff;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            text-transform: uppercase;
            margin: 0 0 2px 0;
          }

          .wlp2-queue-artist {
            font-size: clamp(7px, 0.9vh, 11px);
            color: #666;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            margin: 0;
            font-family: 'Courier New', monospace;
            font-weight: bold;
          }

          .wlp2-queue-table {
            background: #cc0000;
            color: #fff;
            font-weight: 900;
            padding: 2px 5px;
            font-size: clamp(6px, 0.8vh, 10px);
            font-family: 'Courier New', monospace;
            border: 1px solid #000;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* ── TICKER ── */
          .wlp2-ticker {
            height: clamp(34px, 4.5vh, 56px);
            background: #cc0000;
            color: #000;
            display: flex;
            align-items: center;
            font-family: 'Courier New', Courier, monospace;
            font-weight: 900;
            font-size: clamp(12px, 1.8vh, 25px);
            text-transform: uppercase;
            overflow: hidden;
            border-top: clamp(2px, 0.35vh, 5px) solid #000;
            box-shadow: 0 -4px 10px rgba(0,0,0,0.6);
            position: relative;
            z-index: 20;
            flex-shrink: 0;
          }

          .wlp2-ticker-label {
            background: #000;
            padding: 0 clamp(8px, 1.2vw, 16px);
            height: 100%;
            display: flex;
            align-items: center;
            flex-shrink: 0;
            border-right: 4px solid #cc0000;
            box-shadow: 8px 0 10px rgba(0,0,0,0.8);
          }

          .wlp2-ticker-label-img {
            height: 60%;
            object-fit: contain;
            background: transparent;
            display: block;
          }

          .wlp2-ticker-scroll {
            white-space: nowrap;
            animation: wlp2Scroll 28s linear infinite;
            padding-left: 20px;
          }

          @keyframes wlp2Scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }

          /* ── FOOTER ── */
          .wlp2-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 clamp(14px, 2.2vw, 30px);
            height: clamp(30px, 4.8vh, 58px);
            flex-shrink: 0;
            position: relative;
            z-index: 25;
            box-sizing: border-box;
            background: #000;
            border-top: 2px solid #1a1a1a;
          }

          .wlp2-footer-krom {
            height: 85%;
            object-fit: contain;
            background: transparent;
            display: block;
          }

          .wlp2-footer-brand {
            height: 80%;
            object-fit: contain;
            background: transparent;
            display: block;
          }

          .wlp2-footer-stamp {
            height: 150%;
            object-fit: contain;
            background: transparent;
            display: block;
            transform: rotate(-8deg) translateY(-22%);
            filter: drop-shadow(3px 3px 5px rgba(0,0,0,0.55));
          }

          /* ── TAKEOVER ── */
          .wlp2-takeover {
            position: absolute; inset: 0; z-index: 100;
            background: radial-gradient(circle at center, #330000 0%, #000 100%);
            display: flex; flex-direction: column;
            justify-content: center; align-items: center; text-align: center;
            animation: wlp2Stamp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          }

          @keyframes wlp2Stamp {
            0% { transform: scale(2) rotate(10deg); opacity: 0; }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }

          .wlp2-takeover-cover {
            width: clamp(140px, 30vh, 360px);
            height: clamp(140px, 30vh, 360px);
            border: clamp(5px, 1vh, 14px) solid #fff;
            box-shadow: clamp(8px, 1.4vw, 18px) clamp(8px, 1.4vw, 18px) 0 #cc0000;
            transform: rotate(3deg);
            object-fit: cover;
          }

          .wlp2-takeover-title {
            font-family: 'Impact', sans-serif;
            font-size: clamp(36px, 6vh, 95px);
            color: #fff;
            text-transform: uppercase;
            line-height: 0.9;
            margin: clamp(8px, 1.4vh, 18px) 0 5px 0;
            text-shadow: 5px 5px 0 #cc0000;
            transform: rotate(-2deg);
          }

          .wlp2-takeover-artist {
            font-size: clamp(14px, 2.6vh, 36px);
            font-weight: 900;
            color: #000;
            background: #fff;
            padding: 4px 14px;
            margin: 5px 0;
            transform: rotate(1deg);
          }

          .wlp2-takeover-table {
            background: #cc0000;
            color: #fff;
            font-weight: 900;
            font-family: 'Courier New', monospace;
            font-size: clamp(13px, 2vh, 28px);
            padding: clamp(4px, 0.6vh, 8px) clamp(10px, 1.4vw, 20px);
            border: 3px solid #000;
            margin-top: 16px;
            box-shadow: 4px 4px 0 #000;
          }

          /* ── REACTION ── */
          .wlp2-reaction {
            position: absolute; inset: 0; z-index: 90;
            display: flex; justify-content: center; align-items: center;
            pointer-events: none;
            background: rgba(204,0,0,0.30);
          }

          .wlp2-reaction-text {
            font-family: 'Impact', sans-serif;
            font-size: clamp(58px, 9.5vh, 160px);
            color: #fff;
            text-transform: uppercase;
            text-shadow: 10px 10px 0 #cc0000, -3px -3px 0 #000;
            animation: wlp2Pulse 0.4s infinite alternate;
          }

          @keyframes wlp2Pulse {
            0% { transform: rotate(-10deg) scale(1); }
            100% { transform: rotate(-5deg) scale(1.1); }
          }
        `}</style>

        {/* Reaction overlay */}
        {tvReaction && (
          <div className="wlp2-reaction">
            <div className="wlp2-reaction-text">
              {tvReaction.type === "hype" && "HYPE!"}
              {tvReaction.type === "party" && "PARTY!"}
              {tvReaction.type === "cheers" && "CHEERS!"}
            </div>
          </div>
        )}

        {/* New song takeover */}
        {showTakeover && takeoverRequest && (
          <div className="wlp2-takeover">
            <img src={takeoverRequest.song.cover} className="wlp2-takeover-cover" alt="" />
            <h1 className="wlp2-takeover-title">{takeoverRequest.song.title}</h1>
            <p className="wlp2-takeover-artist">{takeoverRequest.song.artist}</p>
            <div className="wlp2-takeover-table">TAVOLO {takeoverRequest.table}</div>
          </div>
        )}

        {/* Walrus hero — absolute, behind content */}
        <img
          src="/assets/tv-poster/02-hero/walrus-orange-hero.png"
          className="wlp2-walrus"
          alt=""
        />

        {/* Main two-column grid */}
        <div className="wlp2-grid">

          {/* LEFT COLUMN */}
          <div className="wlp2-left">

            {/* Compact pub identity header */}
            <div className="wlp2-header">
              <div className="wlp2-pub-identity">
                <div className="wlp2-pub-top-row">
                  <img
                    src="/assets/tv-poster/generated/walrus-head-orange.png"
                    className="wlp2-walrus-head"
                    alt=""
                  />
                  <img
                    src="/assets/tv-poster/generated/walrus-pub-title.png"
                    className="wlp2-pub-title-img"
                    alt="The Walrus Pub"
                  />
                </div>
                <img
                  src="/assets/tv-poster/generated/walbox-main-text.png"
                  className="wlp2-main-text-img"
                  alt="WALBOX"
                />
                <img
                  src="/assets/tv-poster/generated/walbox-tagline.png"
                  className="wlp2-tagline-img"
                  alt=""
                />
              </div>
              {currentRequest && (
                <div className="wlp2-mood-badge">⚡ {currentRequest.mood.toUpperCase()}</div>
              )}
            </div>

            {/* Now playing or idle */}
            {currentRequest ? (
              <div className="wlp2-now-playing">
                <div className="wlp2-cover-row">

                  {/* Vinyl sleeve + disc */}
                  <div className="wlp2-vinyl">
                    <div className={`wlp2-vinyl-disc ${playback.isPlaying ? "spinning" : ""}`}>
                      <img src={currentRequest.song.cover} alt="" className="wlp2-vinyl-label" />
                    </div>
                    <div className="wlp2-vinyl-sleeve">
                      <img src={currentRequest.song.cover} alt="" className="wlp2-sleeve-img" />
                    </div>
                    <img
                      src="/assets/tv-poster/cover-frame-worn.png"
                      className="wlp2-cover-frame"
                      alt=""
                      aria-hidden="true"
                    />
                  </div>

                  {/* Song info — title is the dominant element */}
                  <div className="wlp2-song-info">
                    <div className="wlp2-meta-row">
                      <img
                        src="/assets/tv-poster/02-hero/red-waveform.png"
                        alt=""
                        className="wlp2-waveform"
                      />
                      <div className="wlp2-table-pill">TAVOLO {currentRequest.table}</div>
                    </div>
                    <h1 className="wlp2-title">{currentRequest.song.title}</h1>
                    <h2 className="wlp2-artist">{currentRequest.song.artist}</h2>
                    {currentRequest.dedication && (
                      <div className="wlp2-dedication">
                        <div className="wlp2-dedic-label">DEDICA DEL TAVOLO ★★</div>
                        <div className="wlp2-dedic-bubble">
                          <img
                            src="/assets/tv-poster/04-lower/dedication-mascot-small.png"
                            alt=""
                            className="wlp2-dedic-mascot"
                          />
                          <span className="wlp2-dedic-text">"{currentRequest.dedication}"</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar — anchored at bottom of now-playing */}
                <div className="wlp2-progress-wrap">
                  <div className="wlp2-progress-track">
                    <div
                      className="wlp2-progress-fill"
                      style={{ width: `${(playback.progress / playback.duration) * 100}%` }}
                    />
                  </div>
                  <div className="wlp2-time-row">
                    <span>{formatTime(playback.progress)}</span>
                    <span>{formatTime(playback.duration)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="wlp2-idle">
                <h1 className="wlp2-title" style={{ fontSize: "clamp(52px,9vh,118px)", textAlign: "center" }}>
                  NO SIGNAL
                </h1>
                <h2 className="wlp2-artist" style={{ fontSize: "clamp(18px,2.8vh,38px)" }}>
                  SCAN THE QR TO PLAY
                </h2>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div className="wlp2-right">
            <img
              src="/assets/tv-poster/03-sidebar/qr-card-frame.png"
              alt="Scan QR"
              className="wlp2-qr-card"
            />
            <img
              src="/assets/tv-poster/03-sidebar/krombacher-card.png"
              alt="Krombacher"
              className="wlp2-krom-card"
            />
            <div className="wlp2-queue-label">★ PROSSIMI IN CODA</div>
            <div className="wlp2-queue">
              {displayQueue.slice(0, 3).map((req, idx) => (
                <div key={req.id} className="wlp2-queue-item">
                  <div className="wlp2-queue-num">{idx + 1}</div>
                  <img src={req.song.cover} alt="" className="wlp2-queue-cover" />
                  <div className="wlp2-queue-info">
                    <p className="wlp2-queue-song">{req.song.title}</p>
                    <p className="wlp2-queue-artist">{req.song.artist}</p>
                  </div>
                  <div className="wlp2-queue-table">{tableLabel(req.table)}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Dediche ticker */}
        <div className="wlp2-ticker">
          <div className="wlp2-ticker-label">
            <img
              src="/assets/tv-poster/04-lower/ticker-label-dediche.png"
              alt="DEDICHE"
              className="wlp2-ticker-label-img"
            />
          </div>
          <div className="wlp2-ticker-scroll">
            {tickerText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {tickerText}
          </div>
        </div>

        {/* Footer */}
        <div className="wlp2-footer">
          <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
            <img src="/assets/tv-poster/04-lower/krombacher-mini-left.png" alt="" className="wlp2-footer-krom" />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <img src="/assets/tv-poster/04-lower/footer-brand-strip.png" alt="" className="wlp2-footer-brand" />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <img src="/assets/tv-poster/04-lower/walrus-approved-stamp.png" alt="" className="wlp2-footer-stamp" />
          </div>
        </div>

      </div>
    </div>
  );
}
