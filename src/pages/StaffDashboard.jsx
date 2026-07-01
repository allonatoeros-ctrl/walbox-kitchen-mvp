import { useState, useEffect, useRef } from "react";
import {
  getVenueSettings,
  savePlaybackState,
  saveVenueSettings,
  prioritizeRequest,
  resetToDemoState,
  MOOD_EMOJIS
} from "../data/mockData";
import { useRealtimeRequests, updateStatus, setPlaying, closeAllActiveRequests } from "../hooks/useSongRequests";
import { playTrack, getStoredToken, getCurrentPlayback, pauseTrack, resumeTrack } from "../services/spotifyApi";
import { supabase } from "../lib/supabaseClient";

// Playback is considered stale (staff device offline / Spotify closed) if
// playback_state hasn't been updated in this many ms — avoids showing a
// frozen fake percentage.
const PLAYBACK_STALE_MS = 15000;

export default function StaffDashboard() {
  const requests = useRealtimeRequests();
  const [remotePlayback, setRemotePlayback] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [settings, setSettings] = useState({ queuePaused: false });
  const [cooldown, setCooldown] = useState(0);
  const [spotifyWarning, setSpotifyWarning] = useState(null);

  // Reaction triggering
  const handleTriggerReaction = (type) => {
    const reaction = { type, timestamp: Date.now() };
    localStorage.setItem("walbox_tv_reaction", JSON.stringify(reaction));
    // Trigger storage event manually for same window updates (debugging)
    window.dispatchEvent(new StorageEvent("storage", {
      key: "walbox_tv_reaction",
      newValue: JSON.stringify(reaction)
    }));
    setCooldown(15);
  };

  // Auto-dismiss Spotify warning after 5s
  useEffect(() => {
    if (!spotifyWarning) return;
    const t = setTimeout(() => setSpotifyWarning(null), 5000);
    return () => clearTimeout(t);
  }, [spotifyWarning]);

  // Cooldown timer decrement
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Sync venue settings (queue pause) from localStorage — unrelated to playback
  const syncState = () => {
    setSettings(getVenueSettings());
  };

  useEffect(() => {
    syncState();

    const handleStorage = (e) => {
      if (e.key && e.key.startsWith("walbox_")) {
        syncState();
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Real Spotify playback state, written by this same device's polling (Step 1)
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
        .channel('realtime:playback_state:staff')
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

  const playbackStale = !remotePlayback || (now - new Date(remotePlayback.updated_at).getTime() > PLAYBACK_STALE_MS);
  const playback = playbackStale
    ? { isPlaying: false, progress: 0, duration: 0 }
    : {
        isPlaying: !!remotePlayback.is_playing,
        progress: Math.round((remotePlayback.progress_ms || 0) / 1000),
        duration: Math.round((remotePlayback.duration_ms || 0) / 1000),
      };

  // DISABLED (Step 1 — real Spotify polling): questo timer simulava
  // l'avanzamento del progress in localStorage, scollegato da cosa
  // Spotify riproduce davvero. Sostituito dal polling reale su
  // getCurrentPlayback() -> tabella Supabase playback_state qui sotto.
  // Lasciato commentato (non cancellato) per tracciabilità, in attesa
  // che lo Step 2 (TV Poster che legge playback_state) sia verificato.
  //
  // useEffect(() => {
  //   if (!playback.isPlaying || !playback.currentRequestId) return;
  //
  //   const interval = setInterval(() => {
  //     const freshPlayback = getPlaybackState();
  //     if (!freshPlayback.isPlaying || !freshPlayback.currentRequestId) return;
  //
  //     const nextProgress = freshPlayback.progress + 1;
  //     if (nextProgress >= freshPlayback.duration) {
  //       // Track completed -> trigger next
  //       skipToNext();
  //     } else {
  //       savePlaybackState({
  //         ...freshPlayback,
  //         progress: nextProgress
  //       });
  //     }
  //   }, 1000);
  //
  //   return () => clearInterval(interval);
  // }, [playback.isPlaying, playback.currentRequestId]);

  // Poll real Spotify playback state and persist it to Supabase (playback_state, id=1)
  // so the TV Poster (Step 2) can read the real progress/duration/is_playing.
  useEffect(() => {
    const pollPlayback = async () => {
      try {
        const pb = await getCurrentPlayback();
        // No active device / nothing playing / stale token -> don't overwrite
        // real data with false zeros, just skip this tick.
        if (!pb || !pb.item) return;

        const { error } = await supabase.from('playback_state').upsert({
          id: 1,
          progress_ms: pb.progress_ms,
          duration_ms: pb.item.duration_ms,
          is_playing: pb.is_playing,
          updated_at: new Date().toISOString(),
        });
        if (error) console.error('[playback_state] upsert failed:', error);
      } catch (err) {
        console.error('[playback_state] Spotify poll failed:', err);
      }
    };

    const intervalId = setInterval(pollPlayback, 4000);
    return () => clearInterval(intervalId);
  }, []);

  // Derived state lists
  const pendingRequests = requests.filter((r) => r.status === "pending");
  const approvedQueue = requests.filter((r) => r.status === "approved");
  
  // Find current request info — source of truth is Supabase status='playing'
  const currentRequest = requests.find((r) => r.status === "playing");

  const handleSkipToNext = async () => {
    const nextApproved = approvedQueue[0];
    if (!nextApproved) return;

    const uri = nextApproved.song?.spotify_uri;
    const hasToken = !!getStoredToken();

    if (!uri) {
      setSpotifyWarning('⚠️ Brano senza link Spotify. Avvialo manualmente.');
    } else if (!hasToken) {
      setSpotifyWarning('⚠️ Spotify non collegato. Apri /spotify-test e fai login.');
    } else {
      try {
        await playTrack(uri);
      } catch (err) {
        console.warn('Spotify playTrack failed:', err);
        setSpotifyWarning('⚠️ Spotify non raggiunto. Avvia il brano manualmente.');
      }
    }

    try { await setPlaying(nextApproved.id); } catch (err) { console.error('setPlaying failed:', err); }
  };

  // Keep a live ref to handleSkipToNext so the auto-skip effect below can
  // call the latest version without needing it in its dependency array
  // (it's a new function reference every render).
  const handleSkipToNextRef = useRef(handleSkipToNext);
  useEffect(() => {
    handleSkipToNextRef.current = handleSkipToNext;
  });

  // Auto-advance to the next approved song when the current one ends
  // naturally (real Spotify progress reaching real duration), reusing the
  // same handleSkipToNext used by the manual "SALTA" button — no separate
  // skip logic. Detection is based only on remotePlayback (progress_ms/
  // duration_ms/is_playing), the raw Supabase row, not the stale-adjusted
  // `playback` derived above.
  const prevRemotePlaybackRef = useRef(null);
  const autoSkipTriggeredRef = useRef(false);

  useEffect(() => {
    if (!remotePlayback) return;

    const prev = prevRemotePlaybackRef.current;
    prevRemotePlaybackRef.current = remotePlayback;
    if (!prev) return;

    const duration = remotePlayback.duration_ms;
    const progress = remotePlayback.progress_ms;

    // Once clearly mid-track again (playing, well before the end), re-arm
    // the guard so a future natural end can trigger another auto-skip.
    if (remotePlayback.is_playing && duration > 0 && (duration - progress) > 3000) {
      autoSkipTriggeredRef.current = false;
      return;
    }

    if (autoSkipTriggeredRef.current) return;

    // Previous tick was playing and within ~3s of the end of the track.
    const prevWasNearEnd =
      prev.is_playing &&
      prev.duration_ms > 0 &&
      (prev.duration_ms - prev.progress_ms) <= 3000;

    // Natural end: either playback stopped (no next-up on Spotify's own
    // queue) or progress reset to a lower value (a new track started).
    // A manual pause mid-track never satisfies prevWasNearEnd, so it never
    // triggers this branch.
    const trackEndedNaturally =
      prevWasNearEnd && (!remotePlayback.is_playing || progress < prev.progress_ms);

    if (trackEndedNaturally) {
      autoSkipTriggeredRef.current = true;
      handleSkipToNextRef.current();
    }
  }, [remotePlayback]);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Play / Pause toggle — commands real Spotify playback; playback_state
  // (Supabase) will reflect the change on the next staff-device poll tick.
  const togglePlay = async () => {
    const hasToken = !!getStoredToken();
    if (!hasToken) {
      setSpotifyWarning('⚠️ Spotify non collegato. Apri /spotify-test e fai login.');
      return;
    }
    try {
      if (playback.isPlaying) {
        await pauseTrack();
      } else {
        await resumeTrack();
      }
    } catch (err) {
      console.error('togglePlay failed:', err);
      setSpotifyWarning('⚠️ Spotify non raggiunto. Controlla il device.');
    }
  };

  // Toggle submission pause
  const togglePauseSubmissions = () => {
    const updated = { ...settings, queuePaused: !settings.queuePaused };
    saveVenueSettings(updated);
  };

  // Clear all queue / reset
  const handleClearQueue = async () => {
    if (window.confirm("Sei sicuro di voler svuotare tutta la coda e resettare la sessione?")) {
      try {
        await closeAllActiveRequests();
      } catch (err) {
        console.error('closeAllActiveRequests failed:', err);
      }
      savePlaybackState({ isPlaying: false, progress: 0, duration: 0, currentRequestId: null });
    }
  };

  const handleResetDemo = () => {
    resetToDemoState();
  };

  // Mood color utility
  const getMoodColor = (mood) => {
    switch (mood) {
      case "party": return "var(--accent-primary)";
      case "chill": return "var(--accent-secondary)";
      case "energetic": return "var(--accent-glow)";
      case "romantic": return "hsl(340, 90%, 50%)";
      case "retro": return "hsl(35, 90%, 55%)";
      default: return "var(--text-secondary)";
    }
  };

  return (
    <>
    {spotifyWarning && (
      <div style={{
        position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(255,200,0,0.4)',
        color: '#ffd700', padding: '10px 24px', borderRadius: '8px',
        fontSize: '13px', fontWeight: '700', zIndex: 9999,
        backdropFilter: 'blur(8px)', pointerEvents: 'none'
      }}>
        {spotifyWarning}
      </div>
    )}
    <div className="dashboard-container">
      {/* 1. COLUMN: PENDING APPROVALS */}
      <div className="dashboard-col">
        <div className="dashboard-col-header pending">
          <h2>Al bancone chiedono</h2>
          <span className="glass-panel" style={{ padding: "2px 8px", fontSize: "12px", background: "rgba(255,255,255,0.05)" }}>
            {pendingRequests.length} in attesa
          </span>
        </div>
        
        <div className="dashboard-col-content">
          {pendingRequests.length === 0 ? (
            <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
              Nessuna richiesta in attesa. ☕
            </div>
          ) : (
            pendingRequests.map((req) => (
              <div 
                key={req.id} 
                className="staff-card" 
                style={{ borderLeft: `3px solid ${getMoodColor(req.mood)}` }}
              >
                <div className="staff-card-header">
                  <span className="table-badge" style={{ padding: "3px 8px", fontSize: "10px" }}>
                    Tavolo {req.table}{req.nickname ? ` • ${req.nickname}` : ""}
                  </span>
                  <span style={{ color: getMoodColor(req.mood), fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    {MOOD_EMOJIS[req.mood]} {req.mood}
                  </span>
                </div>

                <div className="staff-card-body">
                  <img 
                    src={req.song.cover} 
                    alt="" 
                    className="staff-card-cover" 
                  />
                  <div style={{ flex: 1, minWidth: "0" }}>
                    <h4 className="staff-card-title">{req.song.title}</h4>
                    <p className="staff-card-artist">{req.song.artist}</p>
                  </div>
                </div>

                {req.dedication && (
                  <p className="staff-card-dedication" style={{ borderLeftColor: getMoodColor(req.mood) }}>
                    &ldquo;{req.dedication}&rdquo;
                  </p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "4px" }}>
                  <button
                    onClick={() => updateStatus(req.id, 'approved')}
                    className="btn-approve"
                  >
                    Metti in scaletta
                  </button>
                  <button
                    onClick={() => updateStatus(req.id, 'rejected')}
                    className="btn-reject"
                  >
                    Scarta
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 2. COLUMN: ACTIVE UPCOMING QUEUE */}
      <div className="dashboard-col">
        <div className="dashboard-col-header queue">
          <h2>In scaletta</h2>
          <span className="glass-panel" style={{ padding: "2px 8px", fontSize: "12px", background: "rgba(255,255,255,0.05)" }}>
            {approvedQueue.length} brani successivi
          </span>
        </div>
        
        <div className="dashboard-col-content">
          {approvedQueue.length === 0 ? (
            <div className="glass-panel" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
              Nessun brano in coda. Le richieste approvate appariranno qui.
            </div>
          ) : (
            approvedQueue.map((req, idx) => (
              <div 
                key={req.id} 
                className="staff-card" 
                style={{ 
                  flexDirection: "row", 
                  alignItems: "center", 
                  gap: "12px", 
                  padding: "10px 14px",
                  borderLeft: `3px solid ${getMoodColor(req.mood)}`
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: "800", color: "var(--text-secondary)", width: "16px", textAlign: "center" }}>
                  {idx + 1}
                </span>
                
                <img 
                  src={req.song.cover} 
                  alt="" 
                  className="staff-card-cover" 
                  style={{ width: "36px", height: "36px", borderRadius: "4px" }}
                />
                
                <div style={{ flex: 1, minWidth: "0" }}>
                  <h4 className="staff-card-title" style={{ fontSize: "13px" }}>{req.song.title}</h4>
                  <p className="staff-card-artist" style={{ fontSize: "11px" }}>
                    {req.nickname ? `${req.nickname} • T.${req.table}` : `Tavolo ${req.table}`} • {req.song.artist}
                  </p>
                </div>

                {/* Queue Control Buttons */}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    onClick={() => prioritizeRequest(req.id, -1)}
                    disabled
                    style={{ opacity: 0.35, cursor: "not-allowed" }}
                    className="icon-btn-queue"
                    title="Riordino coda non ancora collegato a Supabase — in arrivo"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                  </button>
                  <button
                    onClick={() => prioritizeRequest(req.id, 1)}
                    disabled
                    style={{ opacity: 0.35, cursor: "not-allowed" }}
                    className="icon-btn-queue"
                    title="Riordino coda non ancora collegato a Supabase — in arrivo"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </button>
                  <button
                    onClick={() => updateStatus(req.id, 'rejected')}
                    className="icon-btn-queue remove"
                    title="Rimuovi"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. COLUMN: NOW PLAYING & SETTINGS */}
      <div className="dashboard-col">
        <div className="dashboard-col-header player">
          <h2>Sul piatto ora</h2>
        </div>

        <div className="dashboard-col-content" style={{ overflowY: "auto", gap: "20px" }}>
          
          {/* DJ DECK CONTAINER */}
          <div className="dj-deck" style={{ 
            borderColor: currentRequest ? getMoodColor(currentRequest.mood) : "var(--glass-border)",
            boxShadow: currentRequest ? `0 15px 40px rgba(0,0,0,0.6), 0 0 25px ${getMoodColor(currentRequest.mood)}15` : "none"
          }}>
            {currentRequest ? (
              <>
                <span style={{ fontSize: "10px", color: "var(--accent-glow)", fontWeight: "800", letterSpacing: "3px", textTransform: "uppercase" }}>
                  LIVE STREAM FEED 📻
                </span>
                
                {/* Vinyl Spinner */}
                <div className={`dj-deck-vinyl ${playback.isPlaying ? "vinyl-spin" : ""}`}>
                  <img 
                    src={currentRequest.song.cover} 
                    alt={currentRequest.song.title} 
                    className="dj-deck-cover"
                  />
                  {/* Vinyl center pin */}
                  <div style={{
                    position: "absolute",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "#08090f",
                    border: "2px solid rgba(255,255,255,0.2)",
                    zIndex: 3
                  }}></div>
                </div>

                <div style={{ width: "100%", textAlign: "center" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: "800", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0" }}>
                    {currentRequest.song.title}
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px", marginBottom: "0" }}>
                    {currentRequest.song.artist}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "8px", justifyContent: "center", width: "100%" }}>
                  <span className="table-badge" style={{ padding: "4px 10px", fontSize: "11px" }}>
                    Tavolo {currentRequest.table}
                  </span>
                  <span className="table-badge" style={{ 
                    padding: "4px 10px", 
                    fontSize: "11px",
                    color: getMoodColor(currentRequest.mood),
                    borderColor: getMoodColor(currentRequest.mood)
                  }}>
                    {MOOD_EMOJIS[currentRequest.mood]} {currentRequest.mood.toUpperCase()}
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px", marginTop: "5px" }}>
                  <div className="progress-bar-container" style={{ height: "5px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${playback.duration > 0 ? (playback.progress / playback.duration) * 100 : 0}%`,
                        background: getMoodColor(currentRequest.mood)
                      }}
                    ></div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)" }}>
                    {playbackStale ? (
                      <span>In attesa del device Spotify…</span>
                    ) : (
                      <>
                        <span>{formatTime(playback.progress)}</span>
                        <span>{formatTime(playback.duration)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Control Panel buttons */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "5px", width: "100%", justifyContent: "center" }}>
                  <button 
                    onClick={togglePlay}
                    className="btn-play-pause"
                    style={{
                      background: getMoodColor(currentRequest.mood),
                      boxShadow: `0 0 15px ${getMoodColor(currentRequest.mood)}50`,
                      color: currentRequest.mood === "chill" || currentRequest.mood === "romantic" ? "white" : "#05070e"
                    }}
                  >
                    {playback.isPlaying ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        PAUSA
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        PLAY
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleSkipToNext}
                    className="btn-skip-next"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                    SALTA
                  </button>
                </div>
              </>
            ) : (
              <div style={{ padding: "40px 10px", display: "flex", flexDirection: "column", gap: "12px", textAlign: "center", alignItems: "center" }}>
                <span style={{ fontSize: "40px" }}>🎵</span>
                <h3 style={{ margin: "0" }}>Nessun brano attivo</h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0" }}>
                  Approva un brano nella colonna a sinistra, oppure clicca sul bottone sotto per caricare la coda dimostrativa.
                </p>
                {approvedQueue.length > 0 && (
                  <button
                    onClick={handleSkipToNext}
                    className="btn-primary"
                    style={{ alignSelf: "center", marginTop: "10px" }}
                  >
                    Avvia Riproduzione 🚀
                  </button>
                )}
              </div>
            )}
          </div>

          {/* VENUE CONTROL SETTINGS */}
          <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Control Room Walrus</h3>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "13px" }}>Blocca Richieste</strong>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Sospendi temporaneamente l'invio dai tavoli</p>
              </div>
              <button 
                onClick={togglePauseSubmissions}
                className="glass-panel" 
                style={{ 
                  padding: "6px 12px", 
                  fontSize: "12px",
                  borderColor: settings.queuePaused ? "var(--accent-primary)" : "var(--glass-border)",
                  color: settings.queuePaused ? "var(--accent-primary)" : "var(--text-primary)",
                  background: settings.queuePaused ? "rgba(255, 0, 127, 0.05)" : "transparent"
                }}
              >
                {settings.queuePaused ? "Sospeso ⏸️" : "Attivo 🟢"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "15px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button 
                onClick={handleClearQueue}
                className="btn-secondary" 
                style={{ padding: "8px", fontSize: "12px", color: "var(--accent-primary)" }}
              >
                Chiudi serata 🗑️
              </button>
              <button 
                onClick={handleResetDemo}
                className="btn-secondary" 
                style={{ padding: "8px", fontSize: "12px", color: "var(--accent-glow)" }}
              >
                Carica serata demo 🔄
              </button>
            </div>
          </div>

          {/* HYPE TRIGGER / STAFF REACTIONS */}
          <div className="glass-panel staff-reaction-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "15px", border: "1px solid rgba(255, 0, 127, 0.15)" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                Hype Trigger ⚡
              </h3>
              <p style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Lancia un'animazione temporanea sulla Live TV
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
              <div className="reaction-buttons-grid">
                <button
                  onClick={() => handleTriggerReaction("hype")}
                  disabled={cooldown > 0}
                  className={`btn-reaction btn-reaction-hype ${cooldown > 0 ? "disabled" : ""}`}
                >
                  Sta Salendo Male ⚡
                </button>
                <button
                  onClick={() => handleTriggerReaction("party")}
                  disabled={cooldown > 0}
                  className={`btn-reaction btn-reaction-party ${cooldown > 0 ? "disabled" : ""}`}
                >
                  Mi Dissocio 🔴
                </button>
                <button
                  onClick={() => handleTriggerReaction("cheers")}
                  disabled={cooldown > 0}
                  className={`btn-reaction btn-reaction-cheers ${cooldown > 0 ? "disabled" : ""}`}
                >
                  Brindisi dei Trichechi 🦭
                </button>
              </div>
              
              {cooldown > 0 && (
                <div className="reaction-cooldown-bar">
                  <div className="cooldown-progress-fill" style={{ width: `${(cooldown / 15) * 100}%` }}></div>
                  <span className="cooldown-text">Cooldown attivo: {cooldown}s</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
    </>
  );
}
