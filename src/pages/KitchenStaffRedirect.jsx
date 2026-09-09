import { useEffect } from "react";

/**
 * Legacy route /kitchen/staff.
 *
 * Solo Service (/kitchen/solo) e' l'unica UI operativa staff Kitchen (STAFF UX
 * CONSOLIDATION FASE 1). La route resta solo per compatibilita' con bookmark/
 * link vecchi e reindirizza a /kitchen/solo, che applica il proprio guard.
 *
 * Usa una navigazione reale (location.replace), non history.replaceState +
 * popstate sintetico: quest'ultimo pattern e' soggetto a una race — l'effect
 * di questo componente (figlio) puo' girare prima dell'effect di App.jsx che
 * registra il listener "popstate" (genitore, montato dopo per via dell'ordine
 * bottom-up degli effect React), lasciando l'evento senza ascoltatori e la
 * pagina bianca sull'URL nuovo. Una navigazione reale non dipende da quel
 * listener.
 */
export default function KitchenStaffRedirect() {
  useEffect(() => {
    window.location.replace("/kitchen/solo");
  }, []);

  return null;
}
