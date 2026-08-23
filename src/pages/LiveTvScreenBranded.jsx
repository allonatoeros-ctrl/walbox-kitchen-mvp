import { useState, useEffect, useRef } from "react";
import { useLiveSettings, resetTakeoverToWebcam } from "../hooks/useLiveSettings";
import { useRealtimeLiveSubmissions } from "../hooks/useLiveSubmissions";
import "./LiveTvScreenBranded.css";

// T5 — LIVE_NIGHT_V0: webcam default view, takeover overlay on
// live_settings.mode==='takeover', poster/safe fallback if no camera or
// mode==='poster'. Takeover auto-hide pattern cloned from
// LiveTvScreenWalrusPoster.jsx (showTakeover + local 7s timer).
//
// Isolated variant of LiveTvScreen.jsx — Creative Brief Variant A "Branded
// Frame" (ai-ops/reports/2026-07-10-creative-brief-live-tv-webcam-layer.md):
// swaps the text-only .lts-corner CTA for a real QR corner box, webcam mode
// only. Camera/takeover/poster logic is untouched, copied verbatim.

export default function LiveTvScreenBranded() {
  const { mode, currentSubmissionId } = useLiveSettings();
  const submissions = useRealtimeLiveSubmissions();

  const [cameraState, setCameraState] = useState("idle"); // idle | granted | denied | unavailable
  const [showTakeover, setShowTakeover] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const prevModeRef = useRef(null);
  const currentSubmissionIdRef = useRef(currentSubmissionId);
  currentSubmissionIdRef.current = currentSubmissionId;

  const currentSubmission = currentSubmissionId
    ? submissions.find((s) => s.id === currentSubmissionId)
    : null;

  useEffect(() => {
    let cancelled = false;

    async function initCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraState("granted");
      } catch (err) {
        console.error("[LiveTvScreenBranded] getUserMedia failed:", err);
        setCameraState("denied");
      }
    }

    initCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (prevModeRef.current === mode) return;
    const prev = prevModeRef.current;
    prevModeRef.current = mode;
    if (mode === "takeover" && prev !== null) {
      setShowTakeover(true);
      const shownSubmissionId = currentSubmissionIdRef.current;
      const timer = setTimeout(() => {
        setShowTakeover(false);
        resetTakeoverToWebcam(shownSubmissionId).catch((err) =>
          console.error("[LiveTvScreenBranded] resetTakeoverToWebcam failed:", err)
        );
      }, 7000);
      return () => clearTimeout(timer);
    }
    if (mode !== "takeover") setShowTakeover(false);
  }, [mode]);

  const posterMode = mode === "poster" || cameraState === "denied" || cameraState === "unavailable";

  return (
    <div className="lts-root">
      {!posterMode && (
        <video ref={videoRef} autoPlay playsInline muted className="lts-webcam" />
      )}

      {posterMode && (
        <div className="ltb-poster">
          <div className="ltb-poster-signature">
            <img
              src="/assets/tv-poster/generated/walrus-w-badge.png"
              alt="Walrus"
              className="ltb-poster-badge"
            />
            <span className="ltb-poster-wordmark">THE WALRUS</span>
          </div>

          <div className="ltb-poster-main">
            <div className="ltb-poster-left">
              <div className="ltb-poster-kicker">· SERATA WALRUS ·</div>
              <h1 className="ltb-poster-headline">
                STASERA<br />COMANDI <span className="ltb-poster-tu">TU</span>
              </h1>
              <p className="ltb-poster-sub">Inquadra il QR e scegli la musica della serata</p>
            </div>

            <div className="ltb-poster-right">
              <div className="ltb-poster-qr-card">
                <img
                  src="/assets/tv-poster/03-sidebar/qr-card-frame.png"
                  alt=""
                  className="ltb-poster-qr-frame"
                />
                <img
                  src="/assets/qr/live-tv/live-tv-entry-qr.svg"
                  alt="QR per entrare al Walrus e ordinare"
                  className="ltb-poster-qr-overlay"
                />
              </div>
            </div>
          </div>

          <div className="ltb-poster-corner">THE WALRUS · SHUFFLE NIGHT</div>
        </div>
      )}

      {!posterMode && !showTakeover && (
        <div className="ltb-corner">
          <img
            src="/assets/tv-poster/generated/walrus-w-badge.png"
            alt="Walrus"
            className="ltb-badge"
          />
          <div className="ltb-qr-box">
            <img
              src="/assets/tv-poster/03-sidebar/qr-card-frame.png"
              alt=""
              className="ltb-qr-card-img"
            />
            <img
              src="/assets/qr/live-tv/live-tv-entry-qr.svg"
              alt="QR per entrare al Walrus e ordinare"
              className="ltb-qr-overlay"
            />
          </div>
          <div className="ltb-corner-label">PUNTA · SCANSIONA · SCEGLI</div>
        </div>
      )}

      {showTakeover && currentSubmission && (
        <div className="lts-takeover">
          <h1 className="lts-takeover-nick">{currentSubmission.nickname}</h1>
          <div className="lts-takeover-table">TAVOLO {currentSubmission.table}</div>
          {currentSubmission.dedication && (
            <div className="lts-takeover-dedic">&ldquo;{currentSubmission.dedication}&rdquo;</div>
          )}
          <div className="lts-takeover-brand">DAL BANCONE CON AMORE 🦭</div>
        </div>
      )}
    </div>
  );
}
