// useMatchday.js — MT4 (hook React + funzione pura). Nessun localStorage/JSON/nuova dip.
import { useRef, useState, useEffect, useCallback } from "react";
import { createReplay } from "../engine/replayEngine.js";

// Funzione pura: mappa lo stato di un replay (o snapshot) nello stato esposto dall'hook.
export function snapshotReplayState(r) {
  const s = r.getState();
  return { state: s.state, cursor: s.cursor, total: s.total, standings: s.standings, completed: s.completed };
}

export function useMatchday({ fixtures, events, players, scoring, votes, teams, speedMs = 1000 }) {
  const replayRef = useRef(null);
  if (replayRef.current === null) {
    replayRef.current = createReplay({
      fixtures, events, players, scoring, votes, teams,
      onEvent: (evt, ctx) => { if (evt && !evt.__replayStart) setCurrentEvent(evt); },
    });
  }
  const [state, setState] = useState("idle");
  const [cursor, setCursor] = useState(0);
  const [total, setTotal] = useState(events.length);
  const [currentEvent, setCurrentEvent] = useState(null);
  const [standings, setStandings] = useState([]);
  const timerRef = useRef(null);

  const sync = useCallback(() => {
    const s = replayRef.current.getState();
    setState(s.state); setCursor(s.cursor); setTotal(s.total); setStandings(s.standings);
  }, []);

  const step = useCallback(() => { replayRef.current.step(); sync(); }, [sync]);
  const start = useCallback(() => { replayRef.current.start(); sync(); }, [sync]);
  const pause = useCallback(() => { stopTimer(); replayRef.current.pause(); sync(); }, [sync]);
  const resume = useCallback(() => { replayRef.current.resume(); sync(); }, [sync]);
  const reset = useCallback(() => { stopTimer(); replayRef.current.reset(); setCurrentEvent(null); sync(); }, [sync]);
  const seek = useCallback((n) => { replayRef.current.seek(n); sync(); }, [sync]);

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }

  // Timer UI: avanza di un evento ogni speedMs mentre in running. Cleanup idempotente.
  useEffect(() => {
    if (replayRef.current.getState().state === "running") {
      stopTimer();
      timerRef.current = setInterval(() => {
        const r = replayRef.current;
        if (r.getState().state !== "running") { stopTimer(); return; }
        r.step();
        const s = r.getState();
        setState(s.state); setCursor(s.cursor); setTotal(s.total); setStandings(s.standings);
        if (s.completed) stopTimer();
      }, speedMs);
    }
    return () => stopTimer();
  }, [speedMs, state]);

  useEffect(() => () => { stopTimer(); }, []); // cleanup unmount

  return { state, cursor, total, currentEvent, standings, start, pause, resume, reset, seek, step };
}
