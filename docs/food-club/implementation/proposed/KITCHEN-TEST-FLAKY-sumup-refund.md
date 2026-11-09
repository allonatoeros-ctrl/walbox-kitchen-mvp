# Proposta (file Kitchen, NON applicata): stabilizzare `tests/unit/sumup-refund-reliability.test.mjs`

_2026-11-09, sessione cloud. Serve un task dedicato approvato da Eros: il file è Kitchen e non è stato modificato._

## Sintomo
- Cloud (Node 22.23, Vite 8.0.16): **10/20** esecuzioni fallite; tutti i 9 casi passano, poi il processo di test
  termina con **SIGSEGV** (`failureType: testCodeFailure`, `signal: SIGSEGV`) dopo `server.close()`.
- Mac (dal handoff): 21/30 in un percorso, 30/30 in un altro, con «Vite chiuso durante la scansione dipendenze».

## Causa (verificata per esclusione)
`createServer({ server: { middlewareMode: true } })` avvia in background la scansione/ottimizzazione delle
dipendenze (codice nativo di Vite 8). Il test dura ~0,4 s: `after()` chiude il server mentre la scansione è ancora in
corso e il processo cade alla chiusura. Gli altri 17 file con lo stesso schema durano di più e non mostrano il problema
(8/8 verdi ciascuno, misurati nello stesso container).

## Correzione proposta (una riga, nessun cambio di comportamento testato)
```diff
   server = await createServer({
     root: ROOT,
     configFile: false,
     logLevel: 'error',
     plugins: [mockSupabasePlugin],
     ssr: { noExternal: ['@supabase/supabase-js'] },
     server: { middlewareMode: true },
+    optimizeDeps: { noDiscovery: true, include: [] },
   });
```
Il test usa solo `ssrLoadModule`: l'ottimizzazione delle dipendenze per il browser non serve.

## Prova (copia del file con la sola riga aggiunta, fuori da `tests/`)
| Variante | Node | Esecuzioni | Fallite |
|---|---|---|---|
| originale | 22.23 | 20 | 10 (tutte SIGSEGV) |
| con `optimizeDeps.noDiscovery` | 22.23 | 50 | 0 |
| originale (`node --test`) | 24.22 | 15 | 8 |
| originale (eseguito direttamente) | 24.22 | 15 | 3 (Segmentation fault / Aborted) |
| con `optimizeDeps.noDiscovery` (eseguito direttamente) | 24.22 | 15 | 0 |

Comando: `for i in $(seq 1 20); do node --test tests/unit/sumup-refund-reliability.test.mjs | grep -q '^# fail 0' || echo FAIL; done`.

## Altri test segnalati
- `tests/unit/sumup-reconcile-sweep.test.mjs`: con **Node 22** 15 casi su 29 vengono annullati («Promise resolution
  is still pending but the event loop has already resolved», deterministico); con **Node 24** 29/29. Non è una
  regressione: è la versione di Node. La CI e il Mac usano Node 24; nel cloud serve Node 24 (vedi CLOUD_HANDOFF §5).
- `tests/unit/kitchen-analytics-service-night-selector.test.mjs`: 8/8 falliti, deterministico (data fissa,
  preesistente). Non intermittente: serve un task Kitchen separato.
- Gli E2E reali Kitchen (`tests/e2e-real/kitchen-real-order.spec.js`) cercano `.pm-list .pc-cta:not(.pmx-menu-cta)`, che
  nel menu attuale non esiste più (i pulsanti sono «Aggiungi <piatto>, panino · <prezzo>»): selettore vecchio,
  preesistente. Lo spec Food Club usa `getByRole('button', { name: /^Aggiungi Pulled Pork, panino/ })`.
