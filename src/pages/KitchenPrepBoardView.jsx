// PASSIVE KDS V2 — UI condivisa (2026-09-17). Presentazionale pura: prende `orders` come prop,
// non sa da dove vengono (Supabase reale in KitchenPrepBoard.jsx, fixture sintetiche in
// KitchenPrepBoardDemo.jsx). Nessun import di useKitchenOrders/supabaseClient qui: questo file è
// la garanzia strutturale che la route demo resti Supabase-free (isolamento verificato importando
// SOLO questo modulo + le fixture, mai l'hook Supabase).
//
// Layout a 3 fasce:
// - TOP "PRODUZIONE ORA": aggregato PREP_FOOD degli ordini `preparing` (aggregatePrepBoard.now).
// - CENTER "ORDINI IN PREPARAZIONE": max 6 ticket grandi, uno per ordine `preparing`
//   (buildPreparingTickets) — orderCode + food + quantita', allergeni/note sul ticket, nessuna
//   interazione; oltre 6 solo un testo passivo "+N ordini in preparazione".
// - BOTTOM "CARICO IN ARRIVO": aggregato PREP_FOOD degli ordini `received` (aggregatePrepBoard.queue)
//   + totale ordini in attesa.
//
// Drink esclusi ovunque (isGrabServeItem, gia' applicato dentro aggregatePrepBoard/
// buildPreparingTickets). FALLO PESANTE resta atomico (una riga combo, mai scomposto).
import { useEffect, useMemo, useState } from 'react';
import { aggregatePrepBoard, buildPreparingTickets } from '../lib/kitchenPrepAggregation';
import { kitchenMenuItems } from '../data/kitchenMockData';
import { ALLERGEN_LABEL } from '../components/kitchen/AllergenBadges';
import './KitchenPrepBoard.css';

const imageByItemId = new Map(kitchenMenuItems.map((i) => [i.id, i.image]));

function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatBoardDate(date) {
  const weekday = date.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
  const day = date.toLocaleDateString('it-IT', { day: '2-digit' });
  const month = date.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
  const year = date.toLocaleDateString('it-IT', { year: 'numeric' });
  return `${weekday} ${day} ${month} ${year}`.toUpperCase();
}

function formatBoardTime(date) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function ProductThumb({ itemId }) {
  const src = imageByItemId.get(itemId);
  if (!src) {
    return (
      <div className="kpb-thumb kpb-thumb-fallback" aria-hidden="true">
        🍽️
      </div>
    );
  }
  return <img className="kpb-thumb" src={src} alt="" aria-hidden="true" loading="lazy" />;
}

function AggregateRow({ row }) {
  return (
    <li className="kpb-agg-row">
      <ProductThumb itemId={row.itemId} />
      <span className="kpb-agg-name">{row.name}</span>
      <span className="kpb-agg-qty">
        <span className="kpb-x">x</span> {row.quantity}
      </span>
    </li>
  );
}

function TicketAllergens({ allergens, unverified }) {
  if (!unverified && allergens.length === 0) return null;
  return (
    <div className="kpb-ticket-allergens">
      {unverified && <span className="kpb-ticket-badge kpb-ticket-badge-unverified">⚠️ NON VERIFICATI</span>}
      {allergens.map((a) => (
        <span key={a} className="kpb-ticket-badge">
          {ALLERGEN_LABEL[a] ?? a}
        </span>
      ))}
    </div>
  );
}

function PrepTicket({ ticket }) {
  return (
    <article className="kpb-ticket">
      <header className="kpb-ticket-header">
        <span className="kpb-ticket-code">{ticket.orderCode}</span>
        <span className="kpb-ticket-flame" aria-hidden="true">🔥</span>
      </header>
      <ul className="kpb-ticket-items">
        {ticket.items.map((line) => (
          <li key={line.itemId} className="kpb-ticket-item">
            <span className="kpb-ticket-item-name">{line.name}</span>
            <span className="kpb-ticket-item-qty">
              <span className="kpb-x">x</span> {line.quantity}
            </span>
          </li>
        ))}
      </ul>
      <TicketAllergens allergens={ticket.allergens} unverified={ticket.allergensUnverified} />
      {ticket.note && <p className="kpb-ticket-note">📝 {ticket.note}</p>}
    </article>
  );
}

/**
 * `bannerText`: null = nessun banner (board live in produzione). Qualsiasi stringa = banner visibile.
 * `showAudioPrompt`/`onActivateAudio`: overlay "ATTIVA AUDIO" per sbloccare l'AudioContext su un
 * display passivo senza altre interazioni (vedi KitchenPrepBoard.jsx). Entrambi opzionali: la demo
 * Supabase-free (KitchenPrepBoardDemo.jsx) non li passa e resta silenziosa/senza overlay, invariata.
 */
export default function KitchenPrepBoardView({
  orders,
  bannerText = null,
  showAudioPrompt = false,
  onActivateAudio = () => {},
}) {
  const now = useNow();
  const board = useMemo(() => aggregatePrepBoard(orders), [orders]);
  const { tickets, overflowCount } = useMemo(() => buildPreparingTickets(orders), [orders]);

  return (
    <div className="kpb-board">
      {bannerText && <div className="kpb-preview-banner">{bannerText}</div>}
      {showAudioPrompt && (
        <div className="kpb-audio-gate" role="dialog" aria-modal="true" aria-label="Attiva audio nuovi ordini">
          <div className="kpb-audio-gate-card">
            <span className="kpb-audio-gate-icon" aria-hidden="true">🔊</span>
            <p className="kpb-audio-gate-text">Tocca per attivare l'audio dei nuovi ordini</p>
            <button type="button" className="kpb-audio-gate-btn" onClick={onActivateAudio}>
              ATTIVA AUDIO
            </button>
          </div>
        </div>
      )}
      <header className="kpb-header">
        <div className="kpb-header-left">
          <div className="kpb-logo">
            <span className="kpb-logo-mark">🐃</span>
            <div className="kpb-logo-text">
              <span className="kpb-logo-title">WALRUS</span>
              <span className="kpb-logo-subtitle">GOOD FOOD. WILD VIBES.</span>
            </div>
          </div>
          <div className="kpb-divider" aria-hidden="true" />
          <div className="kpb-title-block">
            <span className="kpb-title">KITCHEN DISPLAY</span>
            <span className="kpb-subtitle">PASSIVE KDS &middot; PREPARE TODAY</span>
          </div>
        </div>

        <div className="kpb-header-right">
          <div className="kpb-clock-block">
            <span className="kpb-date">{formatBoardDate(now)}</span>
            <span className="kpb-time">{formatBoardTime(now)}</span>
            <span className="kpb-live">
              <span className="kpb-live-dot" aria-hidden="true" />
              LIVE
            </span>
          </div>
        </div>
      </header>

      <main className="kpb-main">
        <section className="kpb-band kpb-band-top">
          <div className="kpb-band-heading">
            <span className="kpb-band-icon" aria-hidden="true">🔥</span>
            <span className="kpb-band-title">PRODUZIONE ORA</span>
            <span className="kpb-band-count">{board.now.orderCount} ORDINI ATTIVI</span>
          </div>
          {board.now.rows.length > 0 ? (
            <ul className="kpb-agg-list">
              {board.now.rows.map((row) => (
                <AggregateRow key={row.itemId} row={row} />
              ))}
            </ul>
          ) : (
            <p className="kpb-empty">Nessun piatto in preparazione al momento.</p>
          )}
        </section>

        <section className="kpb-band kpb-band-center">
          {tickets.length > 0 ? (
            <div className="kpb-ticket-grid">
              {tickets.map((ticket) => (
                <PrepTicket key={ticket.orderCode} ticket={ticket} />
              ))}
            </div>
          ) : (
            <p className="kpb-empty kpb-empty-center">Nessun ordine in preparazione al momento.</p>
          )}
          {overflowCount > 0 && (
            <p className="kpb-overflow-note">+{overflowCount} ordini in preparazione</p>
          )}
        </section>

        <section className="kpb-band kpb-band-bottom">
          <div className="kpb-band-heading">
            <span className="kpb-band-icon" aria-hidden="true">🕐</span>
            <span className="kpb-band-title">CARICO IN ARRIVO</span>
            <span className="kpb-band-count">{board.queue.orderCount} ORDINI IN ATTESA</span>
          </div>
          {board.queue.rows.length > 0 ? (
            <ul className="kpb-agg-list kpb-agg-list-queue">
              {board.queue.rows.map((row) => (
                <AggregateRow key={row.itemId} row={row} />
              ))}
            </ul>
          ) : (
            <p className="kpb-empty">Nessun ordine in coda.</p>
          )}
        </section>
      </main>
    </div>
  );
}
