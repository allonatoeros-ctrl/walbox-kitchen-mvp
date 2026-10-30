import { useEffect, useRef, useState } from 'react';
import {
  CUSTOMER_NAME_MAX,
  KITCHEN_NOTE_MAX,
  appendNotePrefix,
  checkoutMissing,
  isValidCustomerName,
  normalizeCustomerName,
} from '../../lib/kitchenCheckout';
import {
  PICKUP_FULFILLMENT,
  PICKUP_WINDOWS,
  bookablePickupSlotGroups,
  isPickupSlotBookable,
} from '../../lib/kitchenPickup';
import './CustomerCheckout.css';

// Checkout cliente in un solo schermo (Customer Experience V2), dentro il drawer del sacco:
//   1. nome (protagonista) → 2. dove lo mangi (qui / via / ritiro con orario) → 3. note cucina
//   (opzionali, sempre aperte) → 4. come paghi.
// Il tap su "COME PAGHI?" crea l'ordine (S5): niente più CONFERMA → nome → pagamento in tre step.
// Puramente presentazionale: validazione finale e creazione ordine restano in
// CustomerKitchenMenu.handleSubmit; qui solo UI, focus sul campo mancante e microcopy.

// RITIRO AL WALRUS (2026-10-28): valore UI 'pickup'; al server va takeaway + orario
// (kitchenPickup.toServerFulfillment, in CustomerKitchenMenu.handleSubmit).
const FULFILLMENT_OPTIONS = [
  { value: 'eat_here', label: 'MANGIO QUI', sub: 'ti chiamiamo' },
  { value: 'takeaway', label: 'PORTO VIA', sub: 'impacchettiamo' },
  { value: PICKUP_FULFILLMENT, label: 'RITIRO AL WALRUS', sub: "scegli l'orario, passi e lo prendi" },
];

// Le fasce si ricalcolano ogni 30 secondi: un checkout lasciato aperto non propone orari scaduti.
const PICKUP_CLOCK_MS = 30000;

const PAY_OPTIONS = [
  { value: 'online', label: 'PAGO ORA', sub: 'dal telefono, va dritto in cucina' },
  { value: 'counter', label: 'PAGO AL BANCO', sub: 'ti diamo un codice, paghi in cassa' },
];

const MISSING_TEXT = {
  name: 'Scrivi il tuo nome (almeno 2 caratteri)',
  fulfillment: 'Dicci se mangi qui o porti via',
  pickup_slot: 'Scegli a che ora passi a ritirare',
};

function readyText(missing, name) {
  if (missing.length === 0) return `${name}, il Tricheco approva: si parte! 🦭`;
  if (missing.length === 2) {
    return missing[1] === 'pickup_slot'
      ? "Due dritte e si parte: il tuo nome e l'orario del ritiro."
      : 'Due dritte e si parte: il tuo nome e dove lo mangi.';
  }
  if (missing[0] === 'name') return 'Quasi! Ti manca solo il nome.';
  if (missing[0] === 'pickup_slot') return "Quasi! Ti manca solo l'orario del ritiro.";
  return 'Quasi! Ti manca solo: qui o via?';
}

export default function CustomerCheckout({
  customerName,
  onNameChange,
  fulfillmentType,
  onFulfillmentChange,
  pickupSlot,
  onPickupSlotChange,
  note,
  onNoteChange,
  submitting,
  kitchenOpen,
  total,
  orderError,
  issue,
  onPay,
}) {
  const nameRef = useRef(null);
  const noteRef = useRef(null);
  const nameBlockRef = useRef(null);
  const fulfillmentRef = useRef(null);
  const pickupRef = useRef(null);
  // "Adesso" per le fasce di ritiro (ora di Roma calcolata in kitchenPickup), aggiornato di continuo.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), PICKUP_CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);
  const pickupGroups = bookablePickupSlotGroups(now);
  const pickupAvailable = pickupGroups.some((g) => g.slots.length > 0);
  const isPickup = fulfillmentType === PICKUP_FULFILLMENT;
  const slotOk = isPickup && isPickupSlotBookable(pickupSlot, now);
  // Un `issue` già presente quando il drawer si riapre è vecchio: non va riproposto.
  const [initialSeq] = useState(issue?.seq ?? 0);
  const liveIssue = issue && issue.seq !== initialSeq ? issue : null;

  const name = normalizeCustomerName(customerName);
  const missing = checkoutMissing({ name: customerName, fulfillmentType, pickupSlot, now });
  const ready = missing.length === 0;
  const nameValid = isValidCustomerName(customerName);
  const showNameError = liveIssue?.field === 'name' && !nameValid;

  // Un tap su "PAGO …" con qualcosa che manca non invia: porta il cliente sul campo giusto e lo
  // scuote (classe tolta a fine animazione, solo DOM: nessuno stato React).
  useEffect(() => {
    if (!liveIssue) return;
    const blocks = { name: nameBlockRef.current, fulfillment: fulfillmentRef.current, pickup_slot: pickupRef.current ?? fulfillmentRef.current };
    const block = blocks[liveIssue.field] ?? fulfillmentRef.current;
    const target = liveIssue.field === 'name'
      ? nameRef.current
      : block?.querySelector('button:not([disabled])');
    if (target) {
      target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      target.focus({ preventScroll: true });
    }
    if (block) {
      block.classList.remove('cx-shake');
      void block.offsetWidth; // riavvia l'animazione se si tocca più volte di fila
      block.classList.add('cx-shake');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue]);

  const addNotePrefix = (prefix) => {
    onNoteChange(appendNotePrefix(note, prefix));
    window.requestAnimationFrame(() => {
      const el = noteRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <section className="cx" data-testid="customer-checkout" aria-label="Chiudi l'ordine">
      {/* 1 — NOME: il protagonista. */}
      <div className="cx-block cx-name" ref={nameBlockRef} data-testid="customer-name-step" onAnimationEnd={(e) => e.currentTarget.classList.remove('cx-shake')}>
        <label className="cx-title" htmlFor="customer-name-input">COME TI CHIAMI?</label>
        <p className="cx-help" id="cx-name-help">Ti chiamiamo così quando è pronto.</p>
        <div className="cx-name-row">
          <input
            id="customer-name-input"
            ref={nameRef}
            type="text"
            className={`cx-name-input${nameValid ? ' cx-name-input--ok' : ''}`}
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Il tuo nome"
            maxLength={CUSTOMER_NAME_MAX}
            autoComplete="given-name"
            enterKeyHint="done"
            disabled={submitting}
            aria-describedby="cx-name-help cx-name-status"
            aria-invalid={showNameError || undefined}
            data-testid="customer-name-input"
          />
        </div>
        <div id="cx-name-status" aria-live="polite" className="cx-name-status">
          {showNameError ? (
            <span className="cx-error" role="alert" data-testid="customer-name-error">{MISSING_TEXT.name}</span>
          ) : null}
        </div>
      </div>

      {/* 2 — DOVE LO MANGI: richiesta resa esplicita (nessun default silenzioso). */}
      <div
        className="cx-block"
        data-testid="checkout-fulfillment"
        ref={fulfillmentRef}
        onAnimationEnd={(e) => e.currentTarget.classList.remove('cx-shake')}
      >
        <div className="cx-title" id="cx-where-label">DOVE LO MANGI?</div>
        <div className="cx-where" role="group" aria-labelledby="cx-where-label">
          {FULFILLMENT_OPTIONS.map((opt) => {
            const pickupOpt = opt.value === PICKUP_FULFILLMENT;
            // Ritiro senza fasce rimaste oggi: spento, ma resta visibile con la spiegazione sotto.
            const off = pickupOpt && !pickupAvailable;
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={`fulfillment-${opt.value}`}
                aria-pressed={fulfillmentType === opt.value}
                onClick={() => onFulfillmentChange(opt.value)}
                disabled={submitting || off}
                aria-describedby={off ? 'cx-pickup-off' : undefined}
                className={`cx-where-btn${pickupOpt ? ' cx-where-btn--wide' : ''}${fulfillmentType === opt.value ? ' cx-where-btn--on' : ''}`}
              >
                <span className="cx-where-text">
                  <span className="cx-where-title">{opt.label}</span>
                  <span className="cx-where-sub">{off ? 'per oggi le fasce sono finite' : opt.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        {!pickupAvailable && (
          <p className="cx-pickup-off" id="cx-pickup-off" data-testid="pickup-unavailable">
            Ritiro con orario: oggi le fasce sono finite (pranzo {PICKUP_WINDOWS[0].start}–{PICKUP_WINDOWS[0].end},
            sera {PICKUP_WINDOWS[1].start}–{PICKUP_WINDOWS[1].end}). Scegli PORTO VIA o MANGIO QUI.
          </p>
        )}
        {liveIssue?.field === 'fulfillment' && !fulfillmentType && (
          <span className="cx-error" role="alert" data-testid="fulfillment-error">{MISSING_TEXT.fulfillment}</span>
        )}

        {/* 2b — ORARIO DEL RITIRO: solo le fasce ancora prenotabili (anticipo minimo in kitchenPickup). */}
        {isPickup && (
          <div
            className="cx-pickup"
            ref={pickupRef}
            data-testid="pickup-slots"
            onAnimationEnd={(e) => e.currentTarget.classList.remove('cx-shake')}
          >
            <div className="cx-pickup-title" id="cx-pickup-label">A CHE ORA PASSI?</div>
            {pickupAvailable ? (
              pickupGroups.filter((g) => g.slots.length > 0).map((g) => (
                <div key={g.id} className="cx-pickup-group" role="group" aria-label={`Ritiro ${g.label.toLowerCase()}`}>
                  <div className="cx-pickup-group-name">{g.label}</div>
                  <div className="cx-pickup-grid">
                    {g.slots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`cx-slot${slotOk && pickupSlot === slot ? ' cx-slot--on' : ''}`}
                        aria-pressed={slotOk && pickupSlot === slot}
                        onClick={() => onPickupSlotChange(slot)}
                        disabled={submitting}
                        data-testid={`pickup-slot-${slot.replace(':', '')}`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <p className="cx-pickup-off" data-testid="pickup-none-left">
                Per oggi le fasce di ritiro sono finite. Scegli PORTO VIA o MANGIO QUI.
              </p>
            )}
            {slotOk ? (
              <div className="cx-pickup-ok" data-testid="pickup-slot-chosen">Ritiro alle {pickupSlot}: te lo teniamo pronto.</div>
            ) : liveIssue?.field === 'pickup_slot' ? (
              <span className="cx-error" role="alert" data-testid="pickup-slot-error">{MISSING_TEXT.pickup_slot}</span>
            ) : null}
          </div>
        )}
      </div>

      {/* 3 — NOTE CUCINA: sempre aperte e in vista (2026-10-28), allergie prima di tutto. */}
      <div className="cx-block cx-notes" data-testid="kitchen-notes">
        <label className="cx-title cx-notes-title" htmlFor="kitchen-note-input">NOTE PER LA CUCINA</label>
        <p className="cx-help cx-notes-help">Allergie, intolleranze, «senza cipolla»: scrivilo qui, il cuoco lo legge sulla comanda.</p>
        <div className="cx-chips cx-notes-chips" role="group" aria-label="Scorciatoie note">
          <button type="button" className="cx-chip cx-chip--warn" onClick={() => addNotePrefix('ALLERGIA: ')} data-testid="note-chip-allergy">
            ⚠ ALLERGIA
          </button>
          <button type="button" className="cx-chip" onClick={() => addNotePrefix('SENZA ')} data-testid="note-chip-senza">
            SENZA…
          </button>
        </div>
        <textarea
          id="kitchen-note-input"
          ref={noteRef}
          className="cx-note-input"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Es. allergia al glutine, senza cipolla, ben cotto…"
          maxLength={KITCHEN_NOTE_MAX}
          rows={3}
          aria-describedby="cx-note-help"
          data-testid="kitchen-note-input"
        />
        <div className="cx-note-foot">
          <span id="cx-note-help">La cucina la legge sulla comanda.</span>
          <span>{note.length}/{KITCHEN_NOTE_MAX}</span>
        </div>
      </div>

      {/* 4 — TOTALE + COME PAGHI: sempre agganciati in basso, il tap su una corsia invia l'ordine. */}
      <div className="cx-footer">
        {orderError && (
          <div className="cx-order-error" role="alert" data-testid="order-submit-error">
            {orderError.toUpperCase()}
          </div>
        )}
        {kitchenOpen ? (
          <div data-testid="pay-lane-step" role="group" aria-labelledby="cx-pay-label">
            <div className="cx-pay-head">
              <span className="cx-title" id="cx-pay-label">COME PAGHI?</span>
              <span className="cx-total" data-testid="checkout-total"><small>TOTALE</small>{total.toFixed(2).replace('.', ',')}&nbsp;€</span>
            </div>
            <div
              key={ready ? 'ready' : 'idle'}
              className={`cx-status${ready ? ' cx-status--ready' : ''}`}
              id="cx-pay-status"
              aria-live="polite"
              data-testid="checkout-status"
            >
              {readyText(missing, name)}
            </div>
            <div className="cx-pay-grid">
              {PAY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`cx-pay${ready ? '' : ' cx-pay--idle'}`}
                  data-testid={`pay-lane-${opt.value}`}
                  onClick={() => onPay(opt.value)}
                  disabled={submitting}
                  aria-describedby="cx-pay-status"
                >
                  <span className="cx-pay-text">
                    <span className="cx-pay-title">{opt.label}</span>
                    <span className="cx-pay-sub">{opt.sub}</span>
                  </span>
                  <span className="cx-pay-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            {submitting && <div className="cx-sending" role="status" data-testid="pay-lane-sending">INVIO IN CORSO…</div>}
          </div>
        ) : (
          <>
            <div className="cx-pay-head">
              <span className="cx-title">COME PAGHI?</span>
              <span className="cx-total" data-testid="checkout-total"><small>TOTALE</small>{total.toFixed(2).replace('.', ',')}&nbsp;€</span>
            </div>
            <button
              type="button"
              className="cx-pay cx-pay--closed"
              disabled
              data-testid="submit-order-btn"
            >
              CUCINA CHIUSA
            </button>
            <div className="cx-foot-hint">Riprova più tardi — lo staff ha chiuso la cucina.</div>
          </>
        )}
      </div>
    </section>
  );
}
