import { useState, useEffect, useCallback } from 'react';

/**
 * Fullscreen API toggle per un elemento DOM (via ref). Sincronizza `isFullscreen` con lo stato
 * reale del browser tramite l'evento fullscreenchange, cosi' il chiamante resta corretto anche
 * se l'utente esce con ESC invece che dal bottone. `isSupported` e' false se l'API non esiste
 * (permessi/iframe/browser non compatibile): in quel caso `toggleFullscreen` e' un no-op sicuro
 * e il chiamante e' responsabile di un fallback (es. classe CSS "kiosk").
 */
export function useFullscreenToggle(targetRef) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isSupported = typeof document !== 'undefined'
    && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
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
    const el = targetRef.current;
    if (!el) return;
    const current = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (!current) {
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
  }, [targetRef, isSupported]);

  return { isFullscreen, isSupported, toggleFullscreen };
}
