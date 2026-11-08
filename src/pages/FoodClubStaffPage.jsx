// WALRUS FOOD CLUB V1 — vista staff (tablet/desktop) su /kitchen/club-staff.
// Sola lettura dei dati Club via RPC SECURITY DEFINER (foodClubStaffApi). Unica scrittura: accendi/spegni
// campagna (solo manager, verificato dal server). Pagamenti e annulli restano in Solo (/kitchen/solo).
// Nessun numero finto: se le RPC falliscono o i dati sono vuoti si mostra uno stato esplicito.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getStaffSession, onAuthStateChange, isKitchenStaff } from '../lib/supabaseAuth';
import { foodClubStaffApi } from '../lib/foodClubApi';
import { formatEuro, formatShortDate, staffCycleLabel, staffTotalVisits } from '../lib/foodClubRules';
import { serviceNightWindow, shiftServiceNight } from '../lib/kitchenServiceRules';
import './FoodClubStaffPage.css';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const TABS = [
  ['panoramica', 'PANORAMICA'],
  ['campagne', 'CAMPAGNE'],
  ['buoni', 'BUONI'],
  ['iscritti', 'ISCRITTI'],
  ['inviti', 'INVITI'],
  ['verifica', 'BUONI IN VERIFICA'],
  ['fine', 'FINE SERVIZIO'],
];

function initialTab() {
  try {
    const t = new URLSearchParams(window.location.search).get('tab');
    return TABS.some(([k]) => k === t) ? t : 'panoramica';
  } catch {
    return 'panoramica';
  }
}

function errorText(err, ctx) {
  const msg = String(err?.message || '');
  if (msg.includes('not_staff_for_venue')) return 'Questo account non risulta staff del Walrus.';
  if (msg.includes('manager_only')) return ctx === 'release' ? 'Solo il manager può liberare un buono.' : 'Solo il responsabile può accendere o spegnere la campagna.';
  return 'Dati del Club non disponibili in questo momento. Riprova tra poco.';
}

const n = (v) => Number(v) || 0;
const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
  : '—');
const fmtNight = (d) => (d ? formatShortDate(`${String(d).slice(0, 10)}T12:00:00Z`) : '—');

/** Somma di tutti i numeri in un oggetto (per lo stato vuoto: tutto zero = Club senza attività). */
function deepNumericSum(value) {
  if (typeof value === 'number') return Math.abs(value);
  if (value && typeof value === 'object') return Object.values(value).reduce((s, v) => s + deepNumericSum(v), 0);
  const asNum = typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Math.abs(Number(value)) : 0;
  return asNum;
}

/**
 * Caricamento di una RPC. `call` deve essere stabile (useCallback). Ritorna { status, data, error, reload }.
 * Durante un ricaricamento resta visibile l'ultimo dato (nessun lampeggio); lo stato si deriva dal render.
 */
function useRpc(call) {
  const [nonce, setNonce] = useState(0);
  const [res, setRes] = useState({ call: null, nonce: -1, data: null, error: null });
  useEffect(() => {
    let alive = true;
    call().then(
      (data) => { if (alive) setRes({ call, nonce, data, error: null }); },
      (error) => { if (alive) setRes({ call, nonce, data: null, error }); }
    );
    return () => { alive = false; };
  }, [call, nonce]);
  const reload = useCallback(() => setNonce((x) => x + 1), []);
  const fresh = res.call === call && res.nonce === nonce;
  const status = !fresh ? 'loading' : res.error ? 'error' : 'ready';
  return { status, data: res.data, error: fresh ? res.error : null, reload };
}

function Loading() {
  return <div className="fcs-state" data-testid="fcs-loading">Caricamento…</div>;
}
function ErrorBox({ error, onRetry }) {
  return (
    <div className="fcs-state fcs-state--error" data-testid="fcs-error">
      {errorText(error)}
      {onRetry && <button type="button" className="fcs-btn fcs-btn--small" onClick={onRetry}>RIPROVA</button>}
    </div>
  );
}
function Kpi({ label, value, sub, tone, big = false }) {
  return (
    <div className={`fcs-kpi${big ? ' fcs-kpi--big' : ''}`}>
      <span className="fcs-kpi-label">{label}</span>
      <span className={`fcs-kpi-value${tone ? ` fcs-kpi-value--${tone}` : ''}`}>{value}</span>
      {sub && <span className="fcs-kpi-sub">{sub}</span>}
    </div>
  );
}
function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => n(r[1])));
  return (
    <div className="fcs-bars">
      {rows.map(([label, value]) => (
        <div className="fcs-bar-row" key={label}>
          <span className="fcs-bar-label">{label}</span>
          <div className="fcs-bar-track"><div className="fcs-bar" style={{ width: `${(n(value) / max) * 100}%` }} /></div>
          <span className="fcs-bar-value">{n(value)}</span>
        </div>
      ))}
    </div>
  );
}
function Table({ head, rows, empty, testId }) {
  if (!rows.length) return <div className="fcs-state" data-testid={testId ? `${testId}-empty` : undefined}>{empty}</div>;
  return (
    <div className="fcs-table-wrap">
      <table className="fcs-table" data-testid={testId}>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
function Pill({ tone, children }) {
  return <span className={`fcs-pill${tone ? ` fcs-pill--${tone}` : ''}`}>{children}</span>;
}

/* ---------------- PANORAMICA ---------------- */

function rangeFor(kind) {
  const tonight = serviceNightWindow().night;
  if (kind === '7') return { from: shiftServiceNight(tonight, -6), to: tonight };
  if (kind === 'month') return { from: `${tonight.slice(0, 7)}-01`, to: tonight };
  return { from: shiftServiceNight(tonight, -29), to: tonight };
}

function Overview() {
  const [range, setRange] = useState('30');
  const { from, to } = useMemo(() => rangeFor(range), [range]);
  const q = useRpc(useCallback(() => foodClubStaffApi.overview(from, to), [from, to]));
  const d = q.data;
  // Buoni in verifica oltre 24 h: contano come anomalia. Se la lettura fallisce non rompe la panoramica.
  const held = useRpc(useCallback(() => foodClubStaffApi.heldVouchers(), []));
  const heldOver24 = Array.isArray(held.data) ? held.data.filter((h) => h.over_24h).length : 0;

  const isEmpty = d && deepNumericSum({
    members: d.members, visits: d.visits, vouchers: d.vouchers, referrals: d.referrals,
    funnel: d.funnel, pwa: d.pwa, notifications: d.notifications,
  }) === 0;
  const anomalyCount = (n(d?.anomalies?.unpaid_with_voucher) > 0 ? n(d.anomalies.unpaid_with_voucher) : 0)
    + (n(d?.anomalies?.food_club_errors) > 0 ? n(d.anomalies.food_club_errors) : 0)
    + heldOver24;

  return (
    <>
      <div className="fcs-filters">
        <span className="fcs-filter-label">PERIODO</span>
        {[['7', 'ULTIMI 7 GIORNI'], ['30', 'ULTIMI 30 GIORNI'], ['month', 'MESE CORRENTE']].map(([k, l]) => (
          <button key={k} type="button" className={`fcs-chip${range === k ? ' fcs-chip--active' : ''}`} onClick={() => setRange(k)}>{l}</button>
        ))}
        <span className="fcs-spacer" />
        <span className="fcs-tag" data-testid="fcs-descriptive">Dati reali, descrittivi: non misurano l’effetto del Club</span>
      </div>
      {q.status === 'loading' && !d && <Loading />}
      {q.status === 'error' && <ErrorBox error={q.error} onRetry={q.reload} />}
      {d && (
        <>
          <div className="fcs-note">
            <b>{d.campaign ? `${String(d.campaign.name || 'CAMPAGNA').toUpperCase()} · ${d.campaign.active ? 'ATTIVA' : 'SPENTA'}` : 'NESSUNA CAMPAGNA'}</b>
            {' · '}serate dal {fmtNight(d.range?.from)} al {fmtNight(d.range?.to)} (06:00 → 06:00)
          </div>
          {isEmpty ? (
            <div className="fcs-state fcs-state--big" data-testid="fcs-empty">
              Il Club non ha ancora iscritti.<br /><small>Appena qualcuno si iscrive, qui compaiono i numeri reali.</small>
            </div>
          ) : (
            <div className="fcs-kpis fcs-kpis--main" data-testid="fcs-kpis-main">
              <Kpi big label="Iscritti attivi" value={n(d.members?.total_active)} sub={`+${n(d.members?.new_in_range)} nel periodo · ${n(d.members?.left_total)} usciti`} />
              <Kpi big label="Visite riconosciute" value={n(d.visits?.stamps)} tone="green" sub={`${n(d.visits?.members_with_2plus_nights)} iscritti con 2+ serate`} />
              <Kpi big label="Buoni utilizzati" value={n(d.vouchers?.used)} tone="green" sub={`${n(d.vouchers?.expired)} scaduti · ${n(d.vouchers?.revoked)} revocati`} />
              <Kpi big label="Sconti concessi" value={formatEuro(d.vouchers?.discount_total)} tone="yellow" sub="buoni usati nel periodo" />
            </div>
          )}

          <details className="fcs-more" data-testid="fcs-more">
            <summary>
              <span>ALTRE STATISTICHE</span>
              {anomalyCount > 0 && <span className="fcs-more-badge" data-testid="fcs-more-badge">{anomalyCount} da controllare</span>}
            </summary>
            {!isEmpty && (
              <>
                <div className="fcs-kpis">
                  <Kpi label="Tessere completate" value={n(d.visits?.cards_completed)} sub={`${n(d.visits?.members_with_visit)} iscritti con almeno 1 visita`} />
                  <Kpi label="Buoni emessi" value={n(d.vouchers?.issued)} tone="yellow" sub={`${n(d.vouchers?.available_now)} validi · ${n(d.vouchers?.reserved_now)} riservati ora`} />
                  <Kpi label="Ordini pagati da iscritti" value={n(d.orders?.paid_by_members)} sub={`su ${n(d.orders?.paid_total)} pagati nel periodo`} />
                  <Kpi label="Ordini dall’app" value={n(d.orders?.paid_customer_app)} sub={`${n(d.orders?.paid_staff)} al banco · ${n(d.orders?.paid_unknown_source)} senza fonte`} />
                </div>

                <div className="fcs-section-title">Iscrizione (utenti distinti)</div>
                <Bars rows={[
                  ['Vista intro Club', d.funnel?.club_intro_view],
                  ['Inizio iscrizione', d.funnel?.join_start],
                  ['SMS inviato', d.funnel?.otp_sent],
                  ['Iscrizione completata', d.funnel?.join_done],
                  ['Accesso da altro dispositivo', d.funnel?.login_done],
                  ['Buono applicato al carrello', d.funnel?.voucher_applied_cart],
                ]} />

                <div className="fcs-cols">
                  <div>
                    <div className="fcs-section-title">App e notifiche</div>
                    <Bars rows={[
                      ['Invito installazione', d.pwa?.invite_shown],
                      ['Tocco “installa”', d.pwa?.install_cta_click],
                      ['App installata (Android)', d.pwa?.app_installed_android],
                      ['Prima apertura da app', d.pwa?.first_standalone_open],
                      ['Notifiche permesse', d.pwa?.push_granted],
                      ['Notifiche negate', d.pwa?.push_denied],
                    ]} />
                  </div>
                  <div>
                    <div className="fcs-section-title">Notifiche Club</div>
                    <Bars rows={[
                      ['In coda', d.notifications?.queued],
                      ['Inviate', d.notifications?.sent],
                      ['Aperte', d.notifications?.opened],
                      ['Saltate', d.notifications?.skipped],
                      ['Fallite', d.notifications?.failed],
                    ]} />
                  </div>
                </div>
              </>
            )}

            <div className="fcs-section-title">Da tenere d’occhio</div>
            <div className="fcs-kpis fcs-kpis--3">
              <Kpi label="Buoni in verifica oltre 24 h" value={heldOver24} tone={heldOver24 ? 'red' : 'green'} sub="vedi Buoni in verifica" />
              <Kpi label="Ordini con buono non pagati" value={n(d.anomalies?.unpaid_with_voucher)} tone={n(d.anomalies?.unpaid_with_voucher) ? 'red' : 'green'} sub="vedi Fine servizio" />
              <Kpi label="Errori Club registrati" value={n(d.anomalies?.food_club_errors)} tone={n(d.anomalies?.food_club_errors) ? 'red' : 'green'} sub="nel periodo" />
              <Kpi label="Inviti" value={n(d.referrals?.rewarded)} sub={`${n(d.referrals?.pending)} in attesa · ${n(d.referrals?.capped)} oltre il limite`} />
            </div>
            <p className="fcs-help">Numeri descrittivi sugli iscritti: senza un gruppo di confronto non dicono quanti ritorni ha “creato” il Club (D-8).</p>
          </details>
        </>
      )}
    </>
  );
}

/* ---------------- CAMPAGNE ---------------- */

function onOff(v) { return v ? 'acceso' : 'spento'; }

function campaignRules(c) {
  return [
    ['Timbro', `1 per serata con food ≥ ${formatEuro(c.stamp_min_food)}`],
    ['Tessera', `${n(c.stamps_required)} serate diverse entro ${n(c.window_days)} giorni dalla prima`],
    ['Buono', `${formatEuro(c.voucher_value)} su food ≥ ${formatEuro(c.voucher_min_food)}, valido ${n(c.voucher_valid_days)} giorni`],
    ['Ordine con buono dà timbro', c.stamp_on_voucher_order ? 'sì (D-3, proposta)' : 'no (D-3, proposta)', true],
    ['Rimborso riaccredita il buono', c.refund_recredits_voucher ? 'sì (D-2 da decidere)' : 'no, resta usato (D-2 da decidere)', true],
    ['Timbri retroattivi', n(c.retroactive_days) > 0 ? `${n(c.retroactive_days)} giorni (D-13 da decidere)` : 'spento (D-13 da decidere)', true],
    ['Porta un amico', `${onOff(c.referral_enabled)} (D-14 da decidere)`, true],
    ['Timbro di benvenuto', `${onOff(c.welcome_stamp_enabled)} (D-4 da decidere)`, true],
  ];
}

function Campaigns() {
  const q = useRpc(useCallback(() => foodClubStaffApi.campaigns(), []));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = Array.isArray(q.data) ? q.data : [];

  const toggle = async (c) => {
    const next = !c.active;
    const text = next
      ? `Accendere "${c.name}"? I clienti iniziano a vedere il Club e a raccogliere timbri.`
      : `Spegnere "${c.name}"? Il Club smette di dare timbri; i buoni già emessi restano validi.`;
    if (!window.confirm(text)) return;
    setBusy(c.id); setMsg(null);
    try {
      await foodClubStaffApi.setCampaignActive(c.id, next);
      setMsg({ tone: 'ok', text: next ? 'Campagna accesa.' : 'Campagna spenta.' });
      q.reload();
    } catch (err) {
      setMsg({ tone: 'error', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  if (q.status === 'loading' && !q.data) return <Loading />;
  if (q.status === 'error') return <ErrorBox error={q.error} onRetry={q.reload} />;
  return (
    <>
      {msg && <div className={`fcs-note fcs-note--${msg.tone}`} data-testid="fcs-campaign-msg">{msg.text}</div>}
      {list.length === 0 && <div className="fcs-state">Nessuna campagna configurata.</div>}
      <div className="fcs-camps">
        {list.map((c) => (
          <div className={`fcs-camp${c.active ? ' fcs-camp--on' : ''}`} key={c.id} data-testid="fcs-campaign">
            <div className="fcs-camp-head">
              <span className="fcs-camp-name">{String(c.name || c.id).toUpperCase()}</span>
              <Pill tone={c.active ? 'g' : null}>{c.active ? 'ATTIVA' : 'SPENTA'}</Pill>
              <span className="fcs-spacer" />
              <button
                type="button"
                className={`fcs-btn${c.active ? ' fcs-btn--danger' : ''}`}
                disabled={busy === c.id}
                onClick={() => toggle(c)}
                data-testid="fcs-campaign-toggle"
              >
                {busy === c.id ? 'ATTENDI…' : c.active ? 'SPEGNI CAMPAGNA' : 'ACCENDI CAMPAGNA'}
              </button>
            </div>
            <div className="fcs-camp-dates">
              {c.starts_at ? `dal ${formatShortDate(c.starts_at)}` : 'senza data di inizio'}
              {c.ends_at ? ` · al ${formatShortDate(c.ends_at)}` : ' · senza data di fine'}
            </div>
            <dl className="fcs-rules">
              {campaignRules(c).map(([k, v, open]) => (
                <div className="fcs-rule" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}{open && <span className="fcs-open"> DA DECIDERE</span>}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="fcs-help">Accendere o spegnere è riservato al responsabile. Le regole si cambiano solo dall’amministratore, non da qui.</p>
    </>
  );
}

/* ---------------- BUONI ---------------- */

const VOUCHER_STATUS = {
  available: ['VALIDO', null],
  reserved: ['RISERVATO', 'y'],
  used: ['USATO', 'g'],
  expired: ['SCADUTO', 'r'],
  revoked: ['REVOCATO', 'r'],
};
const VOUCHER_SOURCE = { card: 'tessera', referral: 'invito', manual: 'manuale' };

function Vouchers() {
  const [status, setStatus] = useState(null);
  const q = useRpc(useCallback(() => foodClubStaffApi.vouchers(status), [status]));
  const rows = Array.isArray(q.data) ? q.data : [];
  return (
    <>
      <div className="fcs-filters">
        <span className="fcs-filter-label">STATO</span>
        {[[null, 'TUTTI'], ...Object.entries(VOUCHER_STATUS).map(([k, [l]]) => [k, l])].map(([k, l]) => (
          <button key={l} type="button" className={`fcs-chip${status === k ? ' fcs-chip--active' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {q.status === 'loading' && !q.data && <Loading />}
      {q.status === 'error' && <ErrorBox error={q.error} onRetry={q.reload} />}
      {q.status !== 'error' && q.data && (
        <Table
          testId="fcs-vouchers"
          head={['Codice', 'Cliente', 'Valore', 'Emesso', 'Scade', 'Stato', 'Ordine', 'Origine']}
          empty="Nessun buono."
          rows={rows.map((v) => {
            const [label, tone] = VOUCHER_STATUS[v.status] || [String(v.status || '—').toUpperCase(), null];
            const order = v.order_code
              ? `${v.order_code} · ${v.order_paid ? 'pagato' : v.order_status === 'cancelled' ? 'annullato' : 'da pagare'}`
              : '—';
            return [
              <b key="c">{v.code}</b>,
              `${v.member_name || 'Iscritto'} ${v.phone_masked || ''}`.trim(),
              formatEuro(v.value),
              formatShortDate(v.issued_at),
              formatShortDate(v.expires_at),
              <Pill key="s" tone={tone}>{label}</Pill>,
              order,
              VOUCHER_SOURCE[v.source] || v.source || '—',
            ];
          })}
        />
      )}
      <p className="fcs-help">Sola lettura. Il buono si scala da solo nell’ordine: lo staff vede “BUONO” sulla comanda e incassa il totale già scontato.</p>
    </>
  );
}

/* ---------------- ISCRITTI ---------------- */

function Members() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState(null);
  const q = useRpc(useCallback(() => foodClubStaffApi.members(search), [search]));
  const rows = Array.isArray(q.data) ? q.data : [];
  return (
    <>
      <form
        className="fcs-filters"
        onSubmit={(e) => { e.preventDefault(); setSearch(draft.trim() || null); }}
      >
        <span className="fcs-filter-label">CERCA</span>
        <input
          className="fcs-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nome o ultime cifre del telefono"
          aria-label="Cerca iscritto"
        />
        <button type="submit" className="fcs-chip">CERCA</button>
        {search && <button type="button" className="fcs-chip" onClick={() => { setDraft(''); setSearch(null); }}>AZZERA</button>}
      </form>
      {q.status === 'loading' && !q.data && <Loading />}
      {q.status === 'error' && <ErrorBox error={q.error} onRetry={q.reload} />}
      {q.status !== 'error' && q.data && (
        <Table
          testId="fcs-members"
          head={['Nome', 'Telefono', 'Iscritto', 'Giro attuale', 'Visite totali', 'Tessera scade', 'Buoni (validi / usati)', 'Ultimo ordine', 'Promo', 'Avvisi', 'Stato']}
          empty={search ? 'Nessun iscritto trovato.' : 'Il Club non ha ancora iscritti.'}
          rows={rows.map((m) => [
            m.display_name || '—',
            m.phone_masked || '—',
            formatShortDate(m.joined_at),
            staffCycleLabel(m),
            staffTotalVisits(m),
            m.card_expires_at ? formatShortDate(m.card_expires_at) : '—',
            `${n(m.vouchers_available)} / ${n(m.vouchers_used)}`,
            m.last_order_at ? formatShortDate(m.last_order_at) : '—',
            m.marketing ? 'sì' : 'no',
            m.notif_club ? 'sì' : 'no',
            m.status === 'left' ? <Pill key="s" tone="r">USCITO</Pill> : <Pill key="s" tone="g">ATTIVO</Pill>,
          ])}
        />
      )}
      <p className="fcs-help">Dati minimi: il telefono è sempre mascherato.</p>
    </>
  );
}

/* ---------------- INVITI ---------------- */

const REFERRAL_STATUS = { pending: ['IN ATTESA', 'y'], rewarded: ['PREMIATO', 'g'], capped: ['OLTRE IL LIMITE', null], void: ['ANNULLATO', 'r'] };

function Referrals() {
  const q = useRpc(useCallback(() => foodClubStaffApi.referrals(), []));
  const rows = Array.isArray(q.data) ? q.data : [];
  if (q.status === 'loading' && !q.data) return <Loading />;
  if (q.status === 'error') return <ErrorBox error={q.error} onRetry={q.reload} />;
  return (
    <>
      <div className="fcs-note"><b>PORTA UN AMICO</b> · in V1 è implementato ma spento finché non si decide (D-14). Lo stato attuale è nella scheda Campagne.</div>
      <Table
        testId="fcs-referrals"
        head={['Stato', 'Creato', 'Premiato', 'Chi invita', 'Invitato']}
        empty="Nessun invito registrato."
        rows={rows.map((r) => {
          const [label, tone] = REFERRAL_STATUS[r.status] || [String(r.status || '—').toUpperCase(), null];
          return [
            <Pill key="s" tone={tone}>{label}</Pill>,
            formatShortDate(r.created_at),
            r.rewarded_at ? formatShortDate(r.rewarded_at) : '—',
            `${r.inviter_name || 'Iscritto'} ${r.inviter_phone || ''}`.trim(),
            `${r.invitee_name || 'Iscritto'} ${r.invitee_phone || ''}`.trim(),
          ];
        })}
      />
    </>
  );
}

/* ---------------- BUONI IN VERIFICA ---------------- */

const RELEASE_MIN_NOTE = 10;
const RELEASE_REASON = {
  note_too_short: `La nota deve avere almeno ${RELEASE_MIN_NOTE} caratteri.`,
  too_early: 'Non sono ancora passate 24 ore: il buono non si può liberare a mano.',
  not_reserved: 'Il buono non è più riservato: nulla da liberare.',
  charge_succeeded: 'Risulta un pagamento riuscito su questo ordine: il buono non si libera.',
  order_paid: 'L’ordine risulta pagato: il buono non si libera.',
  paid_evidence: 'SumUp ha segnalato questo ordine come pagato: il buono non si libera.',
  order_not_closed: 'L’ordine non è annullato: il buono non si libera.',
  voucher_not_found: 'Buono non trovato.',
  payments_changed: 'I pagamenti dell’ordine sono cambiati nel frattempo: riprova.',
};

function HeldVouchers() {
  const q = useRpc(useCallback(() => foodClubStaffApi.heldVouchers(), []));
  const { reload } = q;
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const rows = Array.isArray(q.data) ? q.data : [];
  const over = rows.filter((h) => h.over_24h);
  const noteOk = note.trim().length >= RELEASE_MIN_NOTE;

  const open = (h) => { setTarget(h); setNote(''); setResult(null); };
  const confirmRelease = async () => {
    if (!target || !noteOk || busy) return;
    setBusy(true); setResult(null);
    try {
      const res = await foodClubStaffApi.resolveHeldVoucher(target.voucher_id, note.trim());
      if (res?.ok) {
        setResult({ tone: 'ok', text: res.voucher_status === 'expired' ? 'Buono liberato (risulta scaduto).' : 'Buono liberato: è di nuovo disponibile al cliente.' });
        setTarget(null); setNote('');
      } else {
        setResult({ tone: 'error', text: RELEASE_REASON[res?.reason] || `Non liberato (${res?.reason || 'motivo sconosciuto'}).` });
      }
      reload();
    } catch (err) {
      setResult({ tone: 'error', text: errorText(err, 'release') });
    } finally {
      setBusy(false);
    }
  };

  if (q.status === 'loading' && !q.data) return <Loading />;
  if (q.status === 'error') return <ErrorBox error={q.error} onRetry={reload} />;
  return (
    <>
      <div className="fcs-kpis fcs-kpis--3">
        <Kpi label="Buoni in verifica" value={rows.length} tone={rows.length ? 'yellow' : 'green'} sub="riservati su ordini annullati" />
        <Kpi label="Oltre 24 ore" value={over.length} tone={over.length ? 'red' : 'green'} sub="da controllare su SumUp" />
        <Kpi label="Entro 24 ore" value={rows.length - over.length} sub="li controlla il sistema" />
      </div>
      <div className="fcs-note">
        {rows.length
          ? <><b>COSA SONO</b> · buoni fermi perché l’ordine è stato annullato dopo aver chiesto il pagamento online. Di solito si sbloccano da soli; oltre 24 ore li libera a mano un manager, dopo aver controllato SumUp.</>
          : <><b>TUTTO A POSTO</b> · nessun buono in verifica.</>}
        <button type="button" className="fcs-btn fcs-btn--small fcs-note-btn" onClick={reload}>AGGIORNA</button>
      </div>
      {result && <div className={`fcs-note fcs-note--${result.tone}`} data-testid="fcs-held-result">{result.text}</div>}
      <div className="fcs-end-list" data-testid="fcs-held">
        {rows.map((h) => (
          <div className={`fcs-end-row${h.over_24h ? ' fcs-end-row--past' : ''}`} key={h.voucher_id} data-testid="fcs-held-row" data-over24={h.over_24h ? 'true' : 'false'}>
            <div className="fcs-end-id">
              <b>{h.order_code || '—'}</b>
              <span>{h.order_status === 'payment_abandoned' ? 'pagamento abbandonato' : 'annullato'} · {fmtDateTime(h.order_created_at)}</span>
              {h.over_24h && <span className="fcs-end-past">OLTRE 24 H — CONTROLLA SU SUMUP</span>}
            </div>
            <div className="fcs-end-tag">
              <Pill tone="y">BUONO {formatEuro(h.value).replace(',00', '')}</Pill>
              <span className="fcs-end-code">{h.voucher_code} · scade {formatShortDate(h.expires_at)}</span>
            </div>
            <div className="fcs-end-amt">
              <small>ORE DAL RIFERIMENTO</small>
              <b>{n(h.hours_since_reference).toLocaleString('it-IT', { maximumFractionDigits: 1 })} h</b>
              <small>{h.seal_last_reason ? `ultimo esito: ${h.seal_last_reason}` : 'non ancora controllato'}{h.has_succeeded_charge ? ' · PAGAMENTO RIUSCITO' : ''}</small>
            </div>
            <div className="fcs-end-act">
              {h.over_24h && !h.has_succeeded_charge && (
                <button type="button" className="fcs-btn fcs-btn--danger" onClick={() => open(h)} data-testid="fcs-held-release">LIBERA A MANO</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {target && (
        <form
          className="fcs-held-form"
          data-testid="fcs-held-form"
          onSubmit={(e) => { e.preventDefault(); confirmRelease(); }}
        >
          <div className="fcs-held-warn"><b>PRIMA CONTROLLA</b> nella dashboard SumUp che l’ordine #{target.order_code} non risulti pagato.</div>
          <label className="fcs-held-label" htmlFor="fcs-held-note">NOTA (obbligatoria, almeno {RELEASE_MIN_NOTE} caratteri)</label>
          <textarea
            id="fcs-held-note"
            className="fcs-input fcs-held-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. controllato su SumUp, ordine non pagato"
            data-testid="fcs-held-note"
          />
          <div className="fcs-held-actions">
            <button type="submit" className="fcs-btn fcs-btn--danger" disabled={!noteOk || busy} data-testid="fcs-held-confirm">
              {busy ? 'ATTENDI…' : 'CONFERMA: LIBERA IL BUONO'}
            </button>
            <button type="button" className="fcs-btn" onClick={() => { setTarget(null); setNote(''); }} disabled={busy}>ANNULLA</button>
          </div>
        </form>
      )}
      <p className="fcs-help">Solo il manager può liberare un buono, solo dopo 24 ore, sempre con una nota. Se il cliente avesse pagato in ritardo, il sistema lo riconosce comunque e non lo sconta due volte.</p>
    </>
  );
}

/* ---------------- FINE SERVIZIO ---------------- */

const ORDER_STATUS_LABEL = {
  pending_counter_payment: 'paga al banco',
  received: 'in cucina',
  preparing: 'in preparazione',
  ready: 'pronto',
  delivered: 'ritirato',
};

function EndOfService() {
  const q = useRpc(useCallback(() => foodClubStaffApi.unpaidOrders(), []));
  const { reload } = q;
  useEffect(() => {
    const id = setInterval(reload, 30000);
    return () => clearInterval(id);
  }, [reload]);
  const rows = Array.isArray(q.data) ? q.data : [];
  const due = rows.reduce((s, o) => s + n(o.total), 0);
  const withVoucher = rows.filter((o) => o.voucher_code).length;
  const past = rows.filter((o) => o.older_than_tonight).length;

  if (q.status === 'loading' && !q.data) return <Loading />;
  if (q.status === 'error') return <ErrorBox error={q.error} onRetry={reload} />;
  return (
    <>
      <div className="fcs-kpis fcs-kpis--3">
        <Kpi label="Ordini ancora da pagare" value={rows.length} tone={rows.length ? 'yellow' : 'green'} sub={past ? `${past} di serate precedenti` : 'tutti di questa serata'} />
        <Kpi label="Ancora da incassare" value={formatEuro(due)} />
        <Kpi label="Con buono Club riservato" value={withVoucher} tone={withVoucher ? 'yellow' : null} />
      </div>
      <div className="fcs-note">
        {rows.length
          ? <><b>PRIMA DI CHIUDERE</b> · ogni ordine ancora aperto va incassato o annullato in Solo. Annullare un ordine con buono rilascia il buono al cliente, con la stessa scadenza.</>
          : <><b>TUTTO CHIUSO</b> · nessun ordine da incassare: nessun buono rimasto riservato.</>}
        <button type="button" className="fcs-btn fcs-btn--small fcs-note-btn" onClick={reload}>AGGIORNA</button>
      </div>
      <div className="fcs-end-list" data-testid="fcs-unpaid">
        {rows.map((o) => {
          const discount = n(o.discount_amount);
          const isClub = !!o.voucher_code;
          return (
            <div className={`fcs-end-row${o.older_than_tonight ? ' fcs-end-row--past' : ''}`} key={o.order_id} data-testid="fcs-unpaid-row">
              <div className="fcs-end-id">
                <b>{o.order_code || '—'}</b>
                <span>{o.nickname || 'Cliente'} · {ORDER_STATUS_LABEL[o.status] || o.status} · {fmtDateTime(o.created_at)}</span>
                {o.older_than_tonight && <span className="fcs-end-past">SERATA PRECEDENTE · {fmtNight(o.service_night)}</span>}
              </div>
              <div className="fcs-end-tag">
                {isClub && <Pill tone="y">BUONO −{formatEuro(discount).replace(',00', '')}</Pill>}
                {isClub && <span className="fcs-end-code">{o.voucher_code}</span>}
              </div>
              <div className="fcs-end-amt">
                <small>DA INCASSARE</small>
                <b>{formatEuro(o.total)}</b>
                {discount > 0 && <small><s>{formatEuro(n(o.total) + discount)}</s></small>}
              </div>
              <div className="fcs-end-act">
                <button type="button" className="fcs-btn" onClick={() => navigate('/kitchen/solo')}>APRI IN SOLO</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="fcs-help">Pagato e Annulla si fanno in Solo con i pulsanti di sempre: il buono si consuma o torna al cliente da solo.</p>
    </>
  );
}

/* ---------------- PAGINA ---------------- */

export default function FoodClubStaffPage() {
  const [authChecked, setAuthChecked] = useState(() => import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true');
  const [tab, setTab] = useState(initialTab);

  // Stesso guard di Solo: sessione staff + membership venue, fail-closed verso il login.
  useEffect(() => {
    if (import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true') return undefined;
    let subscription;
    try {
      getStaffSession()
        .then(async (session) => {
          if (!session) { navigate('/kitchen/login'); return; }
          try {
            const ok = await isKitchenStaff('walrus-main');
            if (!ok) { navigate('/kitchen/login'); return; }
            setAuthChecked(true);
          } catch {
            navigate('/kitchen/login');
          }
        })
        .catch(() => navigate('/kitchen/login'));
      subscription = onAuthStateChange((s) => { if (!s) navigate('/kitchen/login'); }).data.subscription;
    } catch {
      navigate('/kitchen/login');
    }
    return () => subscription?.unsubscribe();
  }, []);

  const selectTab = (k) => {
    setTab(k);
    try { window.history.replaceState({}, '', k === 'panoramica' ? '/kitchen/club-staff' : `/kitchen/club-staff?tab=${k}`); } catch { /* noop */ }
  };

  if (!authChecked) return null;

  return (
    <div className="fcs-page">
      <header className="fcs-header">
        <span className="fcs-brand">WALBOX KITCHEN</span>
        <span className="fcs-title">CLUB</span>
        <span className="fcs-spacer" />
        <button type="button" className="fcs-btn" data-testid="fcs-back-solo" onClick={() => navigate('/kitchen/solo')}>← TORNA A SOLO</button>
      </header>
      <nav className="fcs-tabs" aria-label="Sezioni Club">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={`fcs-tab${tab === k ? ' fcs-tab--active' : ''}${k === 'fine' ? ' fcs-tab--end' : ''}`}
            aria-pressed={tab === k}
            onClick={() => selectTab(k)}
          >
            {l}
          </button>
        ))}
      </nav>
      <main className="fcs-body">
        {tab === 'panoramica' && <Overview />}
        {tab === 'campagne' && <Campaigns />}
        {tab === 'buoni' && <Vouchers />}
        {tab === 'iscritti' && <Members />}
        {tab === 'inviti' && <Referrals />}
        {tab === 'verifica' && <HeldVouchers />}
        {tab === 'fine' && <EndOfService />}
      </main>
    </div>
  );
}
