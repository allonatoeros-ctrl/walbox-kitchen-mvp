import { useState, useEffect, useCallback } from 'react';

function currentFullscreenElement() {
  return typeof document !== 'undefined'
    ? (document.fullscreenElement || document.webkitFullscreenElement)
    : null;
}

/**
 * Tenta requestFullscreen() su document.documentElement, fuori da React (nessun hook necessario).
 * Pensato per i click di navigazione (Cassa/Storico, 2026-09-22): il target e' sempre l'intero
 * documento — mai l'elemento della singola pagina/overlay — cosi' lo stato fullscreen sopravvive
 * a una navigazione SPA (pushState) o all'apertura di un overlay successivo, che altrimenti
 * smonterebbero l'elemento fullscreenato e farebbero uscire automaticamente dalla fullscreen.
 * Fire-and-forget: un rifiuto (nessun gesture utente, browser non supportato) viene solo loggato.
 */
export function requestFullscreenBestEffort() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (currentFullscreenElement()) return;
  try {
    const result = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
    if (result?.catch) result.catch((err) => console.warn('[Walbox] Fullscreen request failed', err));
  } catch (err) {
    console.warn('[Walbox] Fullscreen request failed', err);
  }
}

/**
 * Fullscreen API sull'intero documento (document.documentElement, mai un elemento di singola
 * pagina/overlay — vedi requestFullscreenBestEffort sopra). Sincronizza `isFullscreen` con lo
 * stato reale del browser tramite l'evento fullscreenchange, cosi' il chiamante resta corretto
 * anche se l'utente esce con ESC invece che dal bottone, o se la fullscreen e' stata avviata dal
 * click di navigazione sulla pagina precedente (stato letto subito all'init, non solo agli eventi
 * successivi). `isSupported` e' false se l'API non esiste (permessi/iframe/browser non
 * compatibile): in quel caso `toggleFullscreen` e' un no-op sicuro e il chiamante e' responsabile
 * di un fallback (es. classe CSS "kiosk").
 */
export function useFullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(() => !!currentFullscreenElement());
  const isSupported = typeof document !== 'undefined'
    && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!currentFullscreenElement());
    }
    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!isSupported) return;
    const el = document.documentElement;
    try {
      if (!currentFullscreenElement()) {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (err) {
      console.warn('[Walbox] Fullscreen toggle failed', err);
    }
  }, [isSupported]);

  return { isFullscreen, isSupported, toggleFullscreen };
}
