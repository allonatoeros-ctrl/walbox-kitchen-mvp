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
        <style>{`
          .wlp {
            aspect-ratio: 16 / 9;
            width: min(100vw, calc(100vh * 16 / 9));
            height: min(100vh, calc(100vw * 9 / 16));
            background-color: #1c0a02;
            background-image:
              linear-gradient(rgba(10, 4, 1, 0.70), rgba(10, 4, 1, 0.70)),
              url('/assets/tv-poster/bg-grunge-wall.webp');
            background-size: cover;
            background-position: center;
            color: #eee;
            font-family: 'Courier New', Courier, monospace;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
            box-shadow: inset 0 0 120px rgba(0,0,0,0.85);
          }

          .wlp::after {
            content: '';
            position: absolute;
            inset: 0;
            box-shadow: inset 0 0 80px rgba(0,0,0,0.55);
            pointer-events: none;
            z-index: 50;
          }

          .wlp-walrus {
            position: absolute;
            left: 38%;
            top: 50%;
            transform: translateY(-50%) rotate(4deg);
            height: 90%;
            z-index: 2;
            pointer-events: none;
            opacity: 0.42;
            background: transparent;
          }

          .wlp-main {
            display: flex;
            flex: 1;
            padding: clamp(14px, 2.2vh, 30px) clamp(14px, 2.2vw, 30px) clamp(6px, 1vh, 14px);
            gap: clamp(14px, 2.2vw, 30px);
            overflow: hidden;
            position: relative;
            z-index: 10;
            min-height: 0;
            box-sizing: border-box;
          }

          .wlp-left {
            flex: 2.2;
            display: flex;
            flex-direction: column;
            border-right: 3px dashed #282828;
            padding-right: clamp(14px, 2.2vw, 30px);
            min-width: 0;
            overflow: hidden;
          }

          .wlp-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: clamp(8px, 1.2vh, 16px);
            min-width: 0;
            overflow: hidden;
            position: relative;
            z-index: 5;
          }

          .wlp-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-shrink: 0;
            margin-bottom: clamp(6px, 1vh, 14px);
          }

          .wlp-logo {
            height: clamp(160px, 24vh, 320px);
            object-fit: contain;
            background: transparent;
            display: block;
          }

          .wlp-mood-badge {
            background: #c85c08;
            color: #fff;
            font-family: 'Impact', sans-serif;
            font-size: clamp(11px, 1.6vh, 19px);
            padding: clamp(4px, 0.6vh, 8px) clamp(10px, 1.4vw, 18px);
            letter-spacing: 1px;
            border: 2px solid #000;
            box-shadow: 3px 3px 0 #000;
            text-transform: uppercase;
            align-self: flex-start;
            margin-top: clamp(10px, 1.4vh, 18px);
            transform: rotate(-0.5deg);
          }

          .wlp-now-playing {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
          }

          .wlp-cover-row {
            display: flex;
            gap: clamp(14px, 2.2vw, 32px);
            align-items: flex-start;
            flex: 1;
            min-height: 0;
            margin-bottom: clamp(8px, 1.2vh, 18px);
          }

          .wlp-vinyl {
            position: relative;
            height: clamp(220px, 31vh, 380px);
            width: clamp(220px, 31vh, 380px);
            flex-shrink: 0;
            transform: rotate(-2deg);
          }

          .wlp-vinyl::after {
            content: '';
            position: absolute;
            top: 8px; left: 8px;
            width: 100%; height: 100%;
            background: #cc0000;
            z-index: 2;
          }

          .wlp-vinyl-sleeve {
            position: absolute;
            inset: 0;
            border: none;
            overflow: hidden;
            z-index: 10;
            background: #000;
            box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
          }

          .wlp-cover-frame {
            position: absolute;
            inset: -10%;
            width: 120%;
            height: 120%;
            object-fit: fill;
            z-index: 12;
            pointer-events: none;
          }

          .wlp-sleeve-img {
            width: 100%; height: 100%;
            object-fit: cover;
            filter: contrast(1.1) saturate(1.15);
            display: block;
          }

          .wlp-vinyl-disc {
            position: absolute;
            top: 3%; right: -32%;
            width: 94%; height: 94%;
            border-radius: 50%;
            background: #0f0f0f;
            box-shadow: 8px 8px 0 rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 5;
          }

          .wlp-vinyl-disc::before {
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

          .wlp-vinyl-disc.spinning {
            animation: wlpSpin 4s linear infinite;
          }

          @keyframes wlpSpin {
            100% { transform: rotate(360deg); }
          }

          .wlp-vinyl-label {
            width: 30%; height: 30%;
            border-radius: 50%;
            object-fit: cover;
            z-index: 10;
            border: 2px solid #000;
          }

          .wlp-song-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
            position: relative;
            z-index: 20;
          }

          .wlp-meta-row {
            display: flex;
            align-items: center;
            gap: clamp(8px, 1.2vw, 20px);
            margin-bottom: clamp(4px, 0.7vh, 10px);
            flex-shrink: 0;
          }

          .wlp-waveform {
            height: clamp(16px, 2.5vh, 34px);
            width: clamp(70px, 11vw, 155px);
            object-fit: contain;
            background: transparent;
            flex-shrink: 0;
          }

          .wlp-table-pill {
            background: #000;
            color: #fff;
            font-family: 'Impact', sans-serif;
            font-size: clamp(11px, 1.6vh, 19px);
            padding: 3px 14px;
            border: 2px solid #cc0000;
            border-radius: 9999px;
            white-space: nowrap;
            text-transform: uppercase;
          }

          .wlp-title {
            font-family: 'Impact', 'Arial Black', sans-serif;
            font-size: clamp(56px, 10vh, 136px);
            font-weight: 900;
            color: #fcfaf2;
            text-transform: uppercase;
            line-height: 0.9;
            margin: 0 0 clamp(2px, 0.5vh, 8px) 0;
            text-shadow: 4px 4px 0 rgba(0,0,0,0.85);
            letter-spacing: -1px;
            word-break: break-word;
          }

          .wlp-artist {
            font-family: 'Brush Script MT', 'Georgia', cursive, serif;
            font-size: clamp(24px, 4vh, 52px);
            font-weight: bold;
            font-style: italic;
            color: #f7d070;
            margin: 0 0 clamp(4px, 0.8vh, 14px) 0;
            transform: rotate(-1deg);
            display: inline-block;
            text-shadow: 2px 2px 0 #000;
            align-self: flex-start;
            position: relative;
            padding-bottom: clamp(8px, 1.2vh, 16px);
          }

          .wlp-artist::after {
            content: '';
            position: absolute;
            bottom: 0; left: -5%;
            width: 110%;
            height: clamp(6px, 1vh, 14px);
            background: url('/assets/tv-poster/generated/walbox-live-brush.png') no-repeat center;
            background-size: 100% 100%;
          }

          .wlp-dedication {
            margin-top: auto;
            padding-top: clamp(4px, 0.6vh, 10px);
          }

          .wlp-dedic-label {
            font-family: 'Courier New', monospace;
            font-size: clamp(10px, 1.4vh, 17px);
            font-weight: 900;
            color: #cc0000;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: clamp(3px, 0.5vh, 7px);
          }

          .wlp-dedic-bubble {
            background: url('/assets/tv-poster/04-lower/dedication-card-frame.png') no-repeat center;
            background-size: 100% 100%;
            aspect-ratio: 2172 / 724;
            display: flex;
            align-items: center;
            gap: clamp(8px, 1.2vw, 18px);
            padding: clamp(8px, 1.1vh, 16px) clamp(16px, 2.8vw, 44px);
            max-width: 560px;
            box-sizing: border-box;
          }

          .wlp-dedic-mascot {
            height: clamp(30px, 4.8vh, 62px);
            object-fit: contain;
            flex-shrink: 0;
            background: transparent;
          }

          .wlp-dedic-text {
            font-family: 'Courier New', monospace;
            font-size: clamp(11px, 1.5vh, 19px);
            font-weight: 900;
            color: #fff;
            text-shadow: 1px 1px 0 #000;
            line-height: 1.2;
          }

          .wlp-progress-wrap {
            flex-shrink: 0;
            margin-top: auto;
            padding-top: clamp(6px, 0.8vh, 12px);
          }

          .wlp-progress-track {
            height: clamp(10px, 1.6vh, 22px);
            background: #111;
            border: 2px solid #333;
            position: relative;
            overflow: hidden;
            box-shadow: inset 0 3px 8px rgba(0,0,0,0.8);
          }

          .wlp-progress-fill {
            height: 100%;
            background: #cc0000;
            transition: width 1s linear;
            position: relative;
            box-shadow: 0 0 10px rgba(204,0,0,0.5);
          }

          .wlp-progress-fill::after {
            content: '';
            position: absolute; inset: 0;
            background: repeating-linear-gradient(
              45deg, transparent, transparent 10px,
              rgba(0,0,0,0.22) 10px, rgba(0,0,0,0.22) 20px
            );
          }

          .wlp-time-row {
            display: flex;
            justify-content: space-between;
            font-size: clamp(10px, 1.5vh, 19px);
            color: #888;
            font-family: 'Courier New', monospace;
            font-weight: bold;
            margin-top: 3px;
          }

          .wlp-idle {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            opacity: 0.55;
            gap: clamp(8px, 1.5vh, 22px);
          }

          .wlp-qr-card {
            width: 100%;
            object-fit: contain;
            background: transparent;
            display: block;
            flex-shrink: 0;
            max-height: clamp(85px, 21vh, 175px);
            transform: rotate(1deg);
            box-shadow: 5px 5px 0 rgba(0,0,0,0.55);
          }

          .wlp-krom-card {
            width: 100%;
            object-fit: contain;
            background: transparent;
            display: block;
            flex-shrink: 0;
            max-height: clamp(80px, 19vh, 160px);
            transform: rotate(-1deg);
            box-shadow: 5px 5px 0 rgba(0,0,0,0.55);
          }

          .wlp-queue-label {
            font-family: 'Impact', sans-serif;
            font-size: clamp(13px, 1.8vh, 24px);
            color: #fff;
            border-bottom: 3px solid #cc0000;
            padding-bottom: clamp(4px, 0.5vh, 8px);
            text-transform: uppercase;
            text-shadow: 2px 2px 0 #000;
            flex-shrink: 0;
            letter-spacing: 0.5px;
          }

          .wlp-queue {
            display: flex;
            flex-direction: column;
            gap: clamp(5px, 0.7vh, 10px);
            overflow: hidden;
            flex: 1;
            min-height: 0;
          }

          .wlp-queue-item {
            display: flex;
            align-items: center;
            background: rgba(0,0,0,0.72);
            border: 2px solid #222;
            padding: clamp(5px, 0.7vh, 9px);
            gap: clamp(6px, 0.8vw, 12px);
            position: relative;
            flex-shrink: 0;
          }

          .wlp-queue-item::before {
            content: '';
            position: absolute;
            left: -4px; top: -4px;
            width: 8px; height: 8px;
            background: #cc0000;
          }

          .wlp-queue-num {
            font-family: 'Impact', sans-serif;
            font-size: clamp(15px, 2vh, 26px);
            color: #3a3a3a;
            width: clamp(18px, 2.2vw, 30px);
            text-align: center;
            flex-shrink: 0;
          }

          .wlp-queue-cover {
            width: clamp(26px, 4vh, 50px);
            height: clamp(26px, 4vh, 50px);
            object-fit: cover;
            border: 2px solid #333;
            flex-shrink: 0;
          }

          .wlp-queue-info {
            flex: 1; min-width: 0; overflow: hidden;
          }

          .wlp-queue-song {
            font-weight: 900;
            font-size: clamp(9px, 1.3vh, 15px);
            color: #fff;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            text-transform: uppercase;
            margin: 0 0 2px 0;
          }

          .wlp-queue-artist {
            font-size: clamp(8px, 1vh, 12px);
            color: #666;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            margin: 0;
            font-family: 'Courier New', monospace; font-weight: bold;
          }

          .wlp-queue-table {
            background: #cc0000; color: #fff;
            font-weight: 900;
            padding: 3px 5px;
            font-size: clamp(7px, 0.9vh, 11px);
            font-family: 'Courier New', monospace;
            border: 1px solid #000;
            flex-shrink: 0;
            white-space: nowrap;
          }

          .wlp-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 clamp(14px, 2.2vw, 30px);
            height: clamp(28px, 4.2vh, 52px);
            flex-shrink: 0;
            position: relative; z-index: 15;
            box-sizing: border-box;
            margin-bottom: clamp(2px, 0.3vh, 5px);
          }

          .wlp-footer-krom {
            height: 88%; object-fit: contain; background: transparent; display: block;
          }
          .wlp-footer-brand {
            height: 82%; object-fit: contain; background: transparent; display: block;
          }
          .wlp-footer-stamp {
            height: 155%; object-fit: contain; background: transparent; display: block;
            transform: rotate(-8deg) translateY(-22%);
            filter: drop-shadow(3px 3px 5px rgba(0,0,0,0.55));
          }

          .wlp-ticker {
            height: clamp(38px, 4.8vh, 60px);
            background: #cc0000; color: #000;
            display: flex; align-items: center;
            font-family: 'Courier New', Courier, monospace;
            font-weight: 900;
            font-size: clamp(13px, 1.9vh, 27px);
            text-transform: uppercase;
            overflow: hidden;
            border-top: clamp(3px, 0.4vh, 6px) solid #000;
            box-shadow: 0 -6px 16px rgba(0,0,0,0.8);
            position: relative; z-index: 20;
            flex-shrink: 0;
          }

          .wlp-ticker-label {
            background: #000;
            padding: 0 clamp(8px, 1.2vw, 16px);
            height: 100%;
            display: flex; align-items: center;
            flex-shrink: 0;
            border-right: 4px solid #cc0000;
            box-shadow: 8px 0 12px rgba(0,0,0,0.8);
          }

          .wlp-ticker-label-img {
            height: 62%; object-fit: contain; background: transparent; display: block;
          }

          .wlp-ticker-scroll {
            white-space: nowrap;
            animation: wlpScroll 28s linear infinite;
            padding-left: 22px;
          }

          @keyframes wlpScroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }

          .wlp-takeover {
            position: absolute; inset: 0; z-index: 100;
            background: radial-gradient(circle at center, #330000 0%, #000 100%);
            display: flex; flex-direction: column;
            justify-content: center; align-items: center; text-align: center;
            animation: wlpStamp 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards;
          }

          @keyframes wlpStamp {
            0% { transform: scale(2) rotate(10deg); opacity: 0; }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }

          .wlp-takeover-cover {
            width: clamp(150px, 32vh, 380px); height: clamp(150px, 32vh, 380px);
            border: clamp(6px, 1.2vh, 16px) solid #fff;
            box-shadow: clamp(8px, 1.5vw, 20px) clamp(8px, 1.5vw, 20px) 0 #cc0000;
            transform: rotate(3deg); object-fit: cover;
          }

          .wlp-takeover-title {
            font-family: 'Impact', sans-serif;
            font-size: clamp(38px, 6.5vh, 100px);
            color: #fff; text-transform: uppercase;
            line-height: 0.9; margin: clamp(10px, 1.6vh, 20px) 0 6px 0;
            text-shadow: 5px 5px 0 #cc0000; transform: rotate(-2deg);
          }

          .wlp-takeover-artist {
            font-size: clamp(16px, 2.8vh, 38px);
            font-weight: 900; color: #000;
            background: #fff; padding: 4px 16px;
            margin: 6px 0; transform: rotate(1deg);
          }

          .wlp-takeover-table {
            background: #cc0000; color: #fff;
            font-weight: 900; font-family: 'Courier New', monospace;
            font-size: clamp(14px, 2.2vh, 30px);
            padding: clamp(4px, 0.7vh, 9px) clamp(10px, 1.6vw, 22px);
            border: 3px solid #000; margin-top: 18px;
            box-shadow: 4px 4px 0 #000;
          }

          .wlp-reaction {
            position: absolute; inset: 0; z-index: 90;
            display: flex; justify-content: center; align-items: center;
            pointer-events: none;
            background: rgba(204,0,0,0.32);
          }

          .wlp-reaction-text {
            font-family: 'Impact', sans-serif;
            font-size: clamp(60px, 10vh, 170px);
            color: #fff; text-transform: uppercase;
            text-shadow: 10px 10px 0 #cc0000, -3px -3px 0 #000;
            animation: wlpPulse 0.4s infinite alternate;
          }

          @keyframes wlpPulse {
            0% { transform: rotate(-10deg) scale(1); }
            100% { transform: rotate(-5deg) scale(1.1); }
          }
        `}</style>

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
                    </div>
                    <img
                      src="/assets/tv-poster/cover-frame-worn.png"
                      className="wlp-cover-frame"
                      alt=""
                      aria-hidden="true"
                    />
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
            <div className="wlp-queue-label">★ PROSSIMI IN CODA</div>
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

        <div className="wlp-ticker">
          <div className="wlp-ticker-label">
            <img
              src="/assets/tv-poster/04-lower/ticker-label-dediche.png"
              alt="DEDICHE"
              className="wlp-ticker-label-img"
            />
          </div>
          <div className="wlp-ticker-scroll">
            {tickerText} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {tickerText}
          </div>
        </div>

      </div>
    </div>
  );
}
