import { useState, useEffect, useRef } from "react";
import {
  MOOD_EMOJIS
} from "../data/mockData";
import { useRealtimeRequests } from "../hooks/useSongRequests";
import { supabase } from "../lib/supabaseClient";
import "./LiveTvScreenWalrusPoster.css";

// Playback is considered stale (staff device offline / Spotify closed) if
// playback_state hasn't been updated in this many ms — avoids showing a
// frozen fake percentage.
const PLAYBACK_STALE_MS = 15000;

export default function LiveTvScreenWalrusPoster() {
  const requests = useRealtimeRequests();
  const [remotePlayback, setRemotePlayback] = useState(null);
  const [now, setNow] = useState(() => Date.now());
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
  const songSwitchTimeRef = useRef(0);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === "walbox_tv_reaction" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data && data.type && data.timestamp) setTvReaction(data);
        } catch (error) { console.error(error); }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => { window.removeEventListener("storage", handleStorage); };
  }, []);

  // Real Spotify playback state, written by the staff device polling (Step 1)
  // into Supabase playback_state (single row, id=1). Replaces the old
  // localStorage-based simulated progress.
  useEffect(() => {
    let channel;
    let cancelled = false;

    async function init() {
      const { data, error } = await supabase
        .from('playback_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) console.error('[playback_state] SELECT failed:', error);
      else if (data && !cancelled) setRemotePlayback(data);

      if (cancelled) return;

      channel = supabase
        .channel('realtime:playback_state:tv')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'playback_state' },
          (payload) => {
            if (payload.new && payload.new.id === 1) setRemotePlayback(payload.new);
          }
        )
        .subscribe();
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Re-check staleness periodically even if no new payload arrives
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Ignore playback_state readings older than the last song switch — avoids
  // briefly showing the previous track's progress/duration right after
  // auto-advance, before the staff device's next poll tick overwrites it.
  const playbackReady = !remotePlayback || new Date(remotePlayback.updated_at).getTime() >= songSwitchTimeRef.current;
  const playbackStale = !remotePlayback || !playbackReady || (now - new Date(remotePlayback.updated_at).getTime() > PLAYBACK_STALE_MS);
  const playback = playbackStale
    ? { isPlaying: false, progress: 0, duration: 0 }
    : {
        isPlaying: !!remotePlayback.is_playing,
        progress: Math.round((remotePlayback.progress_ms || 0) / 1000),
        duration: Math.round((remotePlayback.duration_ms || 0) / 1000),
      };

  // Native Queue Mode (Step 3): the main title/artist/cover must always
  // reflect the real Spotify now-playing track (written by the Staff
  // device's pollPlayback into playback_state), not song_requests.status.
  const nowPlayingTrack = !playbackStale && remotePlayback?.track_name
    ? {
        title: remotePlayback.track_name,
        artist: remotePlayback.artist_name,
        cover: remotePlayback.cover_url,
      }
    : null;

  // Native Queue Mode (Step 3): the nickname/dedication/table overlay must
  // only appear when the real playing track's URI matches an actual Walbox
  // request — matched independently here (not just trusting song_requests
  // status, which is set by the Staff device and could lag a beat behind
  // this device's own Realtime feed). No match = real track shown plainly,
  // no fake "Tavolo X" attribution.
  const currentRequest = remotePlayback?.spotify_track_uri
    ? requests.find(
        (r) =>
          (r.status === 'playing' || r.status === 'approved' || r.status === 'played') &&
          r.song?.spotify_uri === remotePlayback.spotify_track_uri
      )
    : null;

  useEffect(() => {
    if (!tvReaction) return;
    const elapsed = Date.now() - tvReaction.timestamp;
    const remaining = Math.max(0, 6000 - elapsed);
    if (remaining <= 0) { setTvReaction(null); return; }
    const timer = setTimeout(() => setTvReaction(null), remaining);
    return () => clearTimeout(timer);
  }, [tvReaction]);

  // Native Queue Mode (Step 3): trigger the "just switched" takeover on a
  // real Spotify track change (spotify_track_uri), not on Supabase status —
  // the takeover reveal itself only appears for genuine Walbox requests
  // (takeoverRequest stays null for manually-started Spotify tracks, so the
  // existing `{showTakeover && takeoverRequest && ...}` JSX below simply
  // doesn't render, no fake attribution).
  useEffect(() => {
    const uri = remotePlayback?.spotify_track_uri;
    if (!uri) {
      setShowTakeover(false);
      prevSongIdRef.current = null;
      return;
    }
    if (prevSongIdRef.current === uri) return;
    if (prevSongIdRef.current !== null) songSwitchTimeRef.current = Date.now();
    prevSongIdRef.current = uri;
    setTakeoverRequest(currentRequest || null);
    setShowTakeover(true);
    const timer = setTimeout(() => setShowTakeover(false), 4000);
    return () => clearTimeout(timer);
  }, [remotePlayback?.spotify_track_uri, currentRequest]);
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

            {nowPlayingTrack ? (
              <div className="wlp-now-playing">
                <div className="wlp-cover-row">
                  <div className="wlp-vinyl">
                    <div className={`wlp-vinyl-disc ${playback.isPlaying ? "spinning" : ""}`}>
                      <img src={nowPlayingTrack.cover} alt="" className="wlp-vinyl-label" />
                    </div>
                    <div className="wlp-vinyl-sleeve">
                      <img src={nowPlayingTrack.cover} alt="" className="wlp-sleeve-img" />
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
                      {/* Native Queue Mode (Step 3): table pill only for a
                          real Walbox-request match — no fake attribution on
                          manually-started Spotify tracks. */}
                      {currentRequest && (
                        <div className="wlp-table-pill">TAVOLO {currentRequest.table}</div>
                      )}
                    </div>
                    <h1 className="wlp-title">{nowPlayingTrack.title}</h1>
                    <h2 className="wlp-artist">{nowPlayingTrack.artist}</h2>
                    {currentRequest?.dedication && (
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

        {nowPlayingTrack && (
          <div className="wlp-progress-wrap">
            <div className="wlp-progress-track">
              <div
                className="wlp-progress-fill"
                style={{ width: `${playback.duration > 0 ? (playback.progress / playback.duration) * 100 : 0}%` }}
              />
            </div>
            <div className="wlp-time-row">
              {playbackStale ? (
                <span>In attesa del brano…</span>
              ) : (
                <>
                  <span>{formatTime(playback.progress)}</span>
                  <span>{formatTime(playback.duration)}</span>
                </>
              )}
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
