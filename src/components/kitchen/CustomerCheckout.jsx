import { useEffect, useRef, useState } from 'react';
import {
  CUSTOMER_NAME_MAX,
  KITCHEN_NOTE_MAX,
  NICKNAME_QUICK_PICKS,
  appendNotePrefix,
  checkoutMissing,
  isValidCustomerName,
  normalizeCustomerName,
  pickNickname,
} from '../../lib/kitchenCheckout';
import './CustomerCheckout.css';

// Checkout cliente in un solo schermo (Customer Experience V2), dentro il drawer del sacco:
//   1. nome (protagonista) → 2. dove lo mangi → 3. note cucina (opzionali) → 4. come paghi.
// Il tap su "COME PAGHI?" crea l'ordine (S5): niente più CONFERMA → nome → pagamento in tre step.
// Puramente presentazionale: validazione finale e creazione ordine restano in
// CustomerKitchenMenu.handleSubmit; qui solo UI, focus sul campo mancante e microcopy.

const FULFILLMENT_OPTIONS = [
  { value: 'eat_here', label: 'MANGIO QUI', sub: 'ti chiamiamo', emoji: '🍽️' },
  { value: 'takeaway', label: 'PORTO VIA', sub: 'impacchettiamo', emoji: '🥡' },
];

const PAY_OPTIONS = [
  { value: 'online', label: 'PAGO ORA', sub: 'dal telefono, va dritto in cucina', emoji: '💳' },
  { value: 'counter', label: 'PAGO AL BANCO', sub: 'ti diamo un codice, paghi in cassa', emoji: '🧾' },
];

const MISSING_TEXT = {
  name: 'Scrivi il tuo nome (almeno 2 caratteri)',
  fulfillment: 'Dicci se mangi qui o porti via',
};

function readyText(missing, name) {
  if (missing.length === 0) return `${name}, il Tricheco approva: si parte! 🦭`;
  if (missing.length === 2) return 'Due dritte e si parte: il tuo nome e dove lo mangi.';
  return missing[0] === 'name' ? 'Quasi! Ti manca solo il nome.' : 'Quasi! Ti manca solo: qui o via?';
}

export default function CustomerCheckout({
  customerName,
  onNameChange,
  fulfillmentType,
  onFulfillmentChange,
  note,
  onNoteChange,
  notesOpen,
  onNotesOpenChange,
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
  const [rolling, setRolling] = useState(false);
  // Un `issue` già presente quando il drawer si riapre è vecchio: non va riproposto.
  const [initialSeq] = useState(issue?.seq ?? 0);
  const liveIssue = issue && issue.seq !== initialSeq ? issue : null;

  const name = normalizeCustomerName(customerName);
  const missing = checkoutMissing({ name: customerName, fulfillmentType });
  const ready = missing.length === 0;
  const nameValid = isValidCustomerName(customerName);
  const showNameError = liveIssue?.field === 'name' && !nameValid;

  // Un tap su "PAGO …" con qualcosa che manca non invia: porta il cliente sul campo giusto e lo
  // scuote (classe tolta a fine animazione, solo DOM: nessuno stato React).
  useEffect(() => {
    if (!liveIssue) return;
    const block = liveIssue.field === 'name' ? nameBlockRef.current : fulfillmentRef.current;
    const target = liveIssue.field === 'name' ? nameRef.current : fulfillmentRef.current?.querySelector('button');
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

  const rollName = () => {
    onNameChange(pickNickname(customerName));
    setRolling(true);
    window.setTimeout(() => setRolling(false), 450);
  };

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
          <button
            type="button"
            className={`cx-dice${rolling ? ' cx-dice--rolling' : ''}`}
            onClick={rollName}
            disabled={submitting}
            aria-label="Scegli un nome a sorpresa"
            data-testid="customer-name-dice"
          >
            <span aria-hidden="true">🎲</span>
          </button>
        </div>
        <div className="cx-chips" role="group" aria-label="Nomi veloci">
          {NICKNAME_QUICK_PICKS.map((n) => (
            <button
              key={n}
              type="button"
              className="cx-chip"
              onClick={() => onNameChange(n)}
              disabled={submitting}
              data-testid="customer-name-chip"
            >
              {n}
            </button>
          ))}
        </div>
        <div id="cx-name-status" aria-live="polite" className="cx-name-status">
          {showNameError ? (
            <span className="cx-error" role="alert" data-testid="customer-name-error">{MISSING_TEXT.name}</span>
          ) : nameValid ? (
            <span className="cx-hello" data-testid="customer-name-hello">Piacere, {name}! 🦭</span>
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
          {FULFILLMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-testid={`fulfillment-${opt.value}`}
              aria-pressed={fulfillmentType === opt.value}
              onClick={() => onFulfillmentChange(opt.value)}
              disabled={submitting}
              className={`cx-where-btn${fulfillmentType === opt.value ? ' cx-where-btn--on' : ''}`}
            >
              <span className="cx-where-emoji" aria-hidden="true">{opt.emoji}</span>
              <span className="cx-where-text">
                <span className="cx-where-title">{opt.label}</span>
                <span className="cx-where-sub">{opt.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {liveIssue?.field === 'fulfillment' && !fulfillmentType && (
          <span className="cx-error" role="alert" data-testid="fulfillment-error">{MISSING_TEXT.fulfillment}</span>
        )}
      </div>

      {/* 3 — NOTE CUCINA: opzionali, sempre raggiungibili. Una nota già scritta resta visibile. */}
      <div className="cx-block cx-notes">
        <button
          type="button"
          className={`cx-notes-toggle${notesOpen ? ' cx-notes-toggle--open' : ''}`}
          aria-expanded={notesOpen}
          aria-controls="cx-notes-panel"
          onClick={() => onNotesOpenChange(!notesOpen)}
          data-testid="kitchen-note-toggle"
        >
          <span className="cx-notes-icon" aria-hidden="true">{notesOpen ? '−' : '+'}</span>
          <span className="cx-notes-name">NOTE PER LA CUCINA</span>
          <span className="cx-notes-hint">
            {note.trim() ? '✓ scritta' : 'allergie, senza…'}
          </span>
        </button>
        {notesOpen && (
          <div id="cx-notes-panel" className="cx-notes-panel">
            <div className="cx-chips" role="group" aria-label="Scorciatoie note">
              <button type="button" className="cx-chip cx-chip--warn" onClick={() => addNotePrefix('ALLERGIA: ')} data-testid="note-chip-allergy">
                <span aria-hidden="true">⚠️</span> ALLERGIA
              </button>
              <button type="button" className="cx-chip" onClick={() => addNotePrefix('SENZA ')} data-testid="note-chip-senza">
                <span aria-hidden="true">🚫</span> SENZA…
              </button>
            </div>
            <label className="cx-sr-only" htmlFor="kitchen-note-input">Note per la cucina</label>
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
        )}
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
              <span className="cx-total" data-testid="checkout-total"><small>TOTALE</small>€{total.toFixed(2).replace('.', ',')}</span>
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
                  <span className="cx-pay-emoji" aria-hidden="true">{opt.emoji}</span>
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
              <span className="cx-total" data-testid="checkout-total"><small>TOTALE</small>€{total.toFixed(2).replace('.', ',')}</span>
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
