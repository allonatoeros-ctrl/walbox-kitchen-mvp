// Test mirato — Kitchen Analytics V1, selettore service night (Gate 1 approvato da Eros
// 2026-09-21, vedi ai-ops/reports/kitchen-analytics-service-night-selector-audit-20260921.md).
//
// Verifica isLiveServiceNight (src/hooks/useKitchenPayments.js): la funzione pura che decide se
// il poll 15s deve restare attivo. Regola: polling SOLO sulla serata live/corrente, mai su una
// notte storica selezionata dallo staff.
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/kitchen-analytics-service-night-selector.test.mjs
//
// Stesso pattern di tests/unit/p0a-kitchen-sync.test.mjs: Vite in middleware mode per caricare
// l'hook con la sua risoluzione reale (import estensionless), senza mockare supabaseClient — la
// funzione testata non lo tocca, e supabaseClient.js non fallisce a caricamento senza env (vedi
// il Proxy lazy in quel file).
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { isLiveServiceNight } = await server.ssrLoadModule(
  path.join(ROOT, 'src/hooks/useKitchenPayments.js')
);
const { serviceNightWindow, shiftServiceNight } = await server.ssrLoadModule(
  path.join(ROOT, 'src/lib/kitchenServiceRules.js')
);

const now = new Date('2026-09-21T20:00:00+02:00'); // dentro la serata 21/09
const todayNight = serviceNightWindow(now).night;
const yesterdayNight = shiftServiceNight(todayNight, -1);

// 1. nessun parametro (default) = sempre live, qualunque sia l'ora.
assert.equal(isLiveServiceNight(undefined, now), true, 'nightParam assente deve essere sempre live');
assert.equal(isLiveServiceNight(null, now), true, 'nightParam null deve essere sempre live');
console.log('PASS 1: nightParam assente/null -> sempre live');

// 2. una notte esplicita ma uguale a "oggi" resta live (poll attivo se l'utente sceglie
//    esplicitamente la data corrente dal date-picker).
assert.equal(isLiveServiceNight(todayNight, now), true, 'notte esplicita = oggi deve restare live');
console.log('PASS 2: notte esplicita coincidente con oggi -> live');

// 3. una notte passata NON è live: il poll deve fermarsi.
assert.equal(isLiveServiceNight(yesterdayNight, now), false, 'una notte passata non deve mai essere live');
console.log('PASS 3: notte storica -> non live (poll fermo)');

// 4. il rollover 06:00 sposta "oggi" senza che nightParam cambi: alle 05:00 di domani la serata
//    corrente è ancora quella di ieri sera (cutoff 06:00 Europe/Rome).
const beforeCutoff = new Date('2026-09-22T05:00:00+02:00');
assert.equal(
  isLiveServiceNight(null, beforeCutoff),
  true,
  'alle 05:00 la serata live deve essere ancora quella aperta la sera prima'
);
assert.equal(
  serviceNightWindow(beforeCutoff).night,
  todayNight,
  'controllo di coerenza: la finestra live alle 05:00 deve restare la serata di ieri sera'
);
console.log('PASS 4: rollover 06:00 rispettato senza bisogno di aggiornare nightParam');

await server.close();
console.log('\nKitchen Analytics — selettore service night: tutti i controlli mirati superati.');
