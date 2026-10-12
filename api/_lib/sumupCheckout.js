// S4 (T4, docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md): una sola libreria per leggere e disattivare un checkout SumUp.
//
// Estratta da api/kitchen-staff-sumup-close-for-counter.js (F2) e api/kitchen-cancel-with-payment-check.js (F3),
// che ne avevano due copie identiche, e riusata dal nuovo api/kitchen-customer-switch-to-counter.js (e in S6 dallo
// sweep dei 5 minuti). Comportamento invariato rispetto alle copie, con in piu' i timeout di api/CLAUDE.md regola 5:
// un timeout e' un errore di rete, quindi resta "incerto" (mai "non pagato").

export const SUMUP_GET_TIMEOUT_MS = 5000;
export const SUMUP_DELETE_TIMEOUT_MS = 5000;

const SUMUP_CHECKOUTS_URL = 'https://api.sumup.com/v0.1/checkouts';

// GET autoritativo + controllo checkout_reference (= attempt.id): mai agire su un riferimento non verificato.
// Ritorna { outcome: 'ok', data } oppure { outcome: 'unknown' }.
export async function getCheckoutVerified({ sumupApiKey, providerRef, attemptId, logTag, fetchImpl = fetch }) {
  let checkout;
  try {
    const sumupRes = await fetchImpl(`${SUMUP_CHECKOUTS_URL}/${providerRef}`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
      signal: AbortSignal.timeout(SUMUP_GET_TIMEOUT_MS),
    });
    checkout = await sumupRes.json();
    if (!sumupRes.ok) {
      console.error(`[${logTag}] SumUp GET checkout failed`, sumupRes.status, checkout);
      return { outcome: 'unknown' };
    }
  } catch (err) {
    console.error(`[${logTag}] unexpected error fetching checkout`, err);
    return { outcome: 'unknown' };
  }

  if (checkout?.checkout_reference !== attemptId) {
    console.error(`[${logTag}] checkout_reference mismatch`, {
      attemptId, expected: attemptId, got: checkout?.checkout_reference,
    });
    return { outcome: 'unknown' };
  }

  return { outcome: 'ok', data: checkout };
}

// DELETE del checkout + GET di verifica. Un esito del DELETE (anche 2xx/404) non prova da solo la chiusura: l'unica
// prova e' un GET successivo che riporta EXPIRED/CANCELLED. Ritorna: 'indeterminate' (5xx/rete/timeout sul DELETE),
// 'unknown' (GET di verifica non affidabile), 'paid' (+ data), 'closed' (EXPIRED/CANCELLED), 'unverified' (altro).
export async function deactivateAndVerify({ sumupApiKey, providerRef, attemptId, logTag, fetchImpl = fetch }) {
  try {
    const delRes = await fetchImpl(`${SUMUP_CHECKOUTS_URL}/${providerRef}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sumupApiKey}` },
      signal: AbortSignal.timeout(SUMUP_DELETE_TIMEOUT_MS),
    });
    if (delRes.status >= 500) {
      console.error(`[${logTag}] SumUp DELETE checkout returned 5xx — fail-closed`, delRes.status);
      return { kind: 'indeterminate' };
    }
  } catch (err) {
    console.error(`[${logTag}] SumUp DELETE checkout errored — fail-closed`, err);
    return { kind: 'indeterminate' };
  }

  const verify = await getCheckoutVerified({ sumupApiKey, providerRef, attemptId, logTag, fetchImpl });
  if (verify.outcome === 'unknown') {
    return { kind: 'unknown' };
  }
  if (verify.data.status === 'PAID') {
    return { kind: 'paid', data: verify.data };
  }
  if (verify.data.status === 'EXPIRED' || verify.data.status === 'CANCELLED') {
    return { kind: 'closed' };
  }
  console.error(`[${logTag}] checkout still not closed after DELETE — fail-closed`, verify.data.status);
  return { kind: 'unverified' };
}

// Fetch GET con timeout, da iniettare in recoverSumupProviderRef (List per checkout_reference).
export function sumupGetFetchWithTimeout(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(SUMUP_GET_TIMEOUT_MS) });
}
