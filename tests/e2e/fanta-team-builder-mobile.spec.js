import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/*
 * FantaWalrus Team Builder — QA reale mobile (390x844), Guest Mode.
 *
 * Copre i blocker della sprint "Real User QA V1":
 *  - tap su slot vuoto del campo -> picker filtrato per ruolo -> selezione
 *    valida -> picker chiuso -> slot aggiornato (nessun tap extra richiesto
 *    per "tornare al campo")
 *  - modulo fisso 4-3-3: nessuno slot extra oltre il modulo, anche quando
 *    l'engine (scoreEngine.js) permetterebbe più giocatori per reparto
 *  - tentativi invalidi (limite 3 per club) bloccati via tile disabilitata,
 *    non via errore silenzioso
 *  - salvataggio formazione valida
 *
 * Guest Mode è locale (nessun account, nessuna sync cloud garantita — vedi
 * FantaGuestPrompt.jsx): il salvataggio prova comunque la RPC Supabase reale
 * (saveRosterV1), quindi il test tollera sia l'esito cloud sia il fallback
 * locale, senza assumere quale dei due accada in questo ambiente di rete.
 */

const SCREENSHOT_DIR = 'test-results/fanta-team-builder-mobile';

test.use({ viewport: { width: 390, height: 844 } });

// Roster deterministico, entro il limite di 3 giocatori per club, con un
// tentativo deliberatamente invalido (4° DIF Juventus) per verificare il
// blocco "MAX 3 CLUB".
const STARTERS = {
  GK: ['p_011'], // MIL
  DEF: ['p_002', 'p_003', 'p_004', 'p_012'], // JUV x3 + MIL
  MID: ['p_015', 'p_025', 'p_034'], // MIL, INT, LAZ
  FWD: ['p_027', 'p_028', 'p_036'], // INT, INT, LAZ
};
const INVALID_CLUB_LIMIT_PLAYER = { id: 'p_005', role: 'DEF' }; // 4° JUV, deve restare disabilitato
const BENCH = ['p_021', 'p_013', 'p_022', 'p_016'];

async function saveFailureScreenshot(page, name) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function assertVisible(page, locator, label, expected) {
  try {
    await expect(locator).toBeVisible({ timeout: 5000 });
  } catch (err) {
    await saveFailureScreenshot(page, label.replace(/\s+/g, '-'));
    console.log(`[FAIL] ${label} — expected: ${expected} — actual: elemento non visibile/non trovato`);
    throw err;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('guest -> fonda club -> seleziona 4-3-3 -> blocca tentativi invalidi -> panchina -> salva', async ({ page }) => {
  test.setTimeout(90_000); // saveRosterV1 fa fino a 11 round-trip Supabase sequenziali

  // --- Guest Mode ---
  await page.goto('/fanta/guest');
  await page.getByTestId('fanta-guest-enter-cta').click();

  // --- Entry / tesseramento ---
  await assertVisible(page, page.getByTestId('fanta-entry-page'), 'entry page dopo guest mode', 'pagina /fanta/entry visibile');
  await page.getByTestId('fanta-entry-team-name-input').fill('QA Real User FC');
  await page.getByTestId('fanta-entry-crest-crest_01').click();
  await page.getByTestId('fanta-entry-tessera-cta').click();

  // --- Team Builder ---
  await assertVisible(page, page.getByTestId('fanta-team-page'), 'team builder dopo tesseramento', 'pagina /fanta/team visibile');

  // Modulo di default esplicito 4-3-3, nessuno switch modulo in V1.
  await expect(page.locator('[aria-label="Modulo 4-3-3"]')).toBeVisible();

  // --- Selezione titolari per ruolo: tap slot vuoto -> picker filtrato -> chiusura automatica ---
  for (const [role, ids] of Object.entries(STARTERS)) {
    for (let index = 0; index < ids.length; index++) {
      const playerId = ids[index];
      const slot = page.getByTestId(`fanta-pitch-slot-${role}-${index}`);
      await assertVisible(page, slot, `slot vuoto ${role} #${index} prima della selezione`, `slot ${role}-${index} presente e vuoto`);
      await expect(slot).toHaveAttribute('data-state', 'empty');
      await slot.click();

      const picker = page.getByTestId('fanta-team-starters-picker');
      await assertVisible(page, picker, `picker titolari aperto per ruolo ${role}`, 'bottom-sheet TITOLARI visibile');

      // Il picker deve aprirsi già filtrato sul ruolo dello slot toccato.
      const roleChip = page.getByTestId(`fanta-team-starters-picker-role-${role}`);
      await expect(roleChip).toHaveAttribute('aria-pressed', 'true');

      const tile = page.getByTestId(`fanta-team-starters-picker-player-${playerId}`);
      await assertVisible(page, tile, `tile giocatore ${playerId} nel picker ${role}`, `tile ${playerId} presente e abilitata`);
      await expect(tile).toBeEnabled();
      await tile.click();

      // Selezione valida -> picker chiuso automaticamente, nessun tap extra sulla X.
      try {
        await expect(picker).toBeHidden({ timeout: 5000 });
      } catch (err) {
        await saveFailureScreenshot(page, `picker-non-chiuso-${role}-${index}`);
        console.log(`[FAIL] picker non si chiude dopo selezione ${playerId} (${role}) — expected: bottom-sheet nascosto — actual: ancora visibile`);
        throw err;
      }

      // Slot aggiornato sul campo.
      const expectedState = role === 'GK' ? 'gk' : 'filled';
      try {
        await expect(slot).toHaveAttribute('data-state', expectedState, { timeout: 5000 });
      } catch (err) {
        await saveFailureScreenshot(page, `slot-non-aggiornato-${role}-${index}`);
        console.log(`[FAIL] slot ${role}-${index} non aggiornato dopo selezione — expected: data-state="${expectedState}" — actual: valore diverso`);
        throw err;
      }
    }
  }

  // --- Nessuno slot extra oltre il modulo (4-3-3 fisso) ---
  for (const [role, count] of Object.entries({ GK: 1, DEF: 4, MID: 3, FWD: 3 })) {
    const slots = page.locator(`[data-testid^="fanta-pitch-slot-${role}-"]`);
    await expect(slots).toHaveCount(count);
  }

  // --- Tentativo invalido: 4° giocatore dello stesso club (MAX 3 CLUB) ---
  // Riapro il picker DIF da uno slot già pieno non è possibile (il tap su
  // slot pieno rimuove); verifico invece che il giocatore extra dello stesso
  // club resti disabilitato quando il picker DIF è ancora raggiungibile
  // (prima di riempire l'ultimo slot DIF avremmo già visto p_005 disabilitato
  // — verifica diretta qui riaprendo il picker dal filtro TITOLARI/ruolo
  // tramite lo slot GK, poi passando al filtro DIF, senza toccare selezioni valide).
  await page.getByTestId('fanta-pitch-slot-GK-0').click(); // slot pieno -> rimuove GK (rollback dopo verifica)
  await expect(page.getByTestId('fanta-pitch-slot-GK-0')).toHaveAttribute('data-state', 'empty');
  await page.getByTestId('fanta-pitch-slot-GK-0').click(); // riapre il picker sul ruolo GK
  const starterPicker = page.getByTestId('fanta-team-starters-picker');
  await assertVisible(page, starterPicker, 'picker riaperto per verifica limite club', 'bottom-sheet TITOLARI visibile');
  await page.getByTestId(`fanta-team-starters-picker-role-${INVALID_CLUB_LIMIT_PLAYER.role}`).click();
  const invalidTile = page.getByTestId(`fanta-team-starters-picker-player-${INVALID_CLUB_LIMIT_PLAYER.id}`);
  await assertVisible(page, invalidTile, '4° giocatore JUV nel picker DIF', 'tile p_005 presente ma disabilitata (MAX 3 club)');
  try {
    await expect(invalidTile).toBeDisabled();
  } catch (err) {
    await saveFailureScreenshot(page, 'club-limit-non-bloccato');
    console.log('[FAIL] limite 3 per club non applicato — expected: tile p_005 disabled — actual: tile abilitata (selezionabile)');
    throw err;
  }
  await page.getByTestId('fanta-team-starters-picker-close').click();
  await expect(page.getByTestId('fanta-pitch-slot-GK-0')).toHaveAttribute('data-state', 'empty');

  // Ripristino il portiere titolare rimosso durante la verifica.
  await page.getByTestId('fanta-pitch-slot-GK-0').click();
  await page.getByTestId('fanta-team-starters-picker-player-p_011').click();
  await expect(page.getByTestId('fanta-pitch-slot-GK-0')).toHaveAttribute('data-state', 'gk');

  await assertVisible(page, page.getByTestId('fanta-team-validation'), 'nota validazione formazione', 'formazione valida dopo 11 titolari');
  await expect(page.getByTestId('fanta-team-validation')).toContainText('Formazione valida');

  // --- Panchina ---
  for (let index = 0; index < BENCH.length; index++) {
    const playerId = BENCH[index];
    const slot = page.getByTestId(`fanta-bench-slot-${index}`);
    await slot.click();
    const picker = page.getByTestId('fanta-team-bench-picker');
    await assertVisible(page, picker, `picker panchina aperto per slot ${index}`, 'bottom-sheet PANCHINA visibile');
    const tile = page.getByTestId(`fanta-team-bench-picker-player-${playerId}`);
    await assertVisible(page, tile, `tile giocatore panchina ${playerId}`, `tile ${playerId} presente e abilitata`);
    await tile.click();
    await expect(picker).toBeHidden();
    await expect(slot).not.toHaveAttribute('data-state', 'empty');
  }

  // --- Salvataggio ---
  const saveCta = page.getByTestId('fanta-team-save-cta');
  await expect(saveCta).toBeEnabled();
  await saveCta.click();

  // Guest Mode è locale by design: la RPC cloud (saveRosterV1) può fallire
  // per teamId non-UUID. Tollero entrambi gli esiti, verifico solo che lo
  // stato di salvataggio si risolva (non resti bloccato in "in corso").
  try {
    await expect(page.getByTestId('fanta-team-cta-sub')).not.toHaveText('Completa gli 11 titolari per salvare', { timeout: 30_000 });
    await expect(saveCta).not.toContainText('SALVATAGGIO IN CORSO', { timeout: 30_000 });
  } catch (err) {
    await saveFailureScreenshot(page, 'salvataggio-non-risolto');
    const actual = await page.getByTestId('fanta-team-cta-sub').textContent().catch(() => '(non leggibile)');
    console.log(`[FAIL] salvataggio non si risolve — expected: stato salvato o errore cloud esplicito — actual: "${actual}"`);
    throw err;
  }
});
