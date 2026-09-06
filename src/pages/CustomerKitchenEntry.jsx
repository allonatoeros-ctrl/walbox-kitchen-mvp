import { useEffect } from "react";

/**
 * Legacy route /kitchen/entry.
 *
 * Kitchen non ha tavoli: non esiste piu' nessun form di ingresso
 * (numero tavolo / asporto). La route resta solo per compatibilita'
 * con QR o link vecchi e reindirizza subito al menu cliente /kitchen.
 */
export default function CustomerKitchenEntry() {
  useEffect(() => {
    window.history.replaceState({}, "", "/kitchen");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  return null;
}
