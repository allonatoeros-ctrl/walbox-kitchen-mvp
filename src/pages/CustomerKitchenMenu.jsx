import { useState, useEffect, useRef } from 'react';
import { kitchenCategoryPromos, kitchenBeerPairing, FALLO_PESANTE_INCLUDED_SIDE_ID } from '../data/kitchenMockData';
import { useCustomerSession } from '../hooks/useCustomerSession';
import { useKitchenOrders, rememberOwnedOrderId, getOwnedOrderIds } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import { useKitchenServiceState } from '../hooks/useKitchenServiceState';
import KitchenCategoryTabs from '../components/kitchen/KitchenCategoryTabs';
import PesiMassimiSection from '../components/kitchen/PesiMassimiSection';
import PaniniSection from '../components/kitchen/PaniniSection';
import CicchettiSection from '../components/kitchen/CicchettiSection';
import InsalatoneSection from '../components/kitchen/InsalatoneSection';
import TartareSection from '../components/kitchen/TartareSection';
import BirreSection from '../components/kitchen/BirreSection';
import TagliereSection from '../components/kitchen/TagliereSection';
import BevandeSection from '../components/kitchen/BevandeSection';
import AllergenBadges from '../components/kitchen/AllergenBadges';
import { buildIncludedBeersNote, isEveningServiceActive } from '../lib/kitchenServiceRules';
import { loadCart, saveCart, clearCart, reconcileCartItems } from '../lib/kitchenCart';
import { kitchenPesiMassimiCombos } from '../data/kitchenMockData';
import './CustomerKitchenMenu.css';

// Flat SVG icons — matching the reference flat icon style (using currentColor for dynamic fill)
const CATEGORY_SVGS = {
  panini: (
    <svg width="38" height="30" viewBox="0 0 38 30" fill="none">
      <path d="M4,10 C4,5.5 10,2 19,2 C28,2 34,5.5 34,10 H4 Z M12.5,6.5 L13,5.5 L13.5,6.5 L13,7 Z M18.5,5 L19,4 L19.5,5 L19,5.5 Z M24.5,6.5 L25,5.5 L25.5,6.5 L25,7 Z" fill="currentColor" fillRule="evenodd" />
      <path d="M2,13.5 H36 V15.5 C36,17 33,17.5 31,17.5 C29,17.5 28,16 26,16 C24,16 23,17.5 21,17.5 C19,17.5 18,16 16,16 C14,16 13,17.5 11,17.5 C9,17.5 8,16 6,16 C4,16 2,16.5 2,15 Z" fill="currentColor" />
      <rect x="4" y="20" width="30" height="4" rx="2" fill="currentColor" />
      <path d="M4,26 C4,25 6,25 19,25 C32,25 34,25 34,26 V27 C34,28.5 29,30 19,30 C9,30 4,28.5 4,27 Z" fill="currentColor" />
    </svg>
  ),
  patatine: (
    <svg width="30" height="36" viewBox="0 0 30 36" fill="none">
      <rect x="6" y="5" width="4" height="13" rx="1.5" transform="rotate(-10 8 11.5)" fill="currentColor" />
      <rect x="11" y="2" width="4.5" height="16" rx="2" fill="currentColor" />
      <rect x="16" y="4" width="4.5" height="14" rx="2" transform="rotate(5 18.25 11)" fill="currentColor" />
      <rect x="21" y="7" width="4" height="11" rx="1.5" transform="rotate(15 23 12.5)" fill="currentColor" />
      <path d="M5,15 C9,18 21,18 25,15 L22.5,33 C22.2,34.5 21,35 15,35 C9,35 7.8,34.5 7.5,33 Z M15,21.5 A3.5,3.5 0 1,0 15,28.5 A3.5,3.5 0 1,0 15,21.5 Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  ),
  birre: (
    <svg width="22" height="36" viewBox="0 0 22 36" fill="none">
      <rect x="9" y="1" width="4" height="2" rx="0.5" fill="currentColor" />
      <path d="M9.5,3 H12.5 V11 C12.5,11.5 13,12 17,15 V33 C17,34.5 15.5,35 11,35 C6.5,35 5,34.5 5,33 V15 C9,12 9.5,11.5 9.5,11 Z M7,19 V26 H15 V19 Z M9.5,6 V7.5 H12.5 V6 Z" fill="currentColor" fillRule="evenodd" />
    </svg>
  ),
  combo: (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path d="M18 2 C19.5 9 24.5 12 34 13 C25.5 17 26 23.5 28 33 C20 28 16 28 8 33 C10 23.5 10.5 17 2 13 C11.5 12 16.5 9 18 2 Z" fill="currentColor" />
    </svg>
  ),
  bbq: (
    <svg width="38" height="20" viewBox="0 0 38 20" fill="none">
      <rect x="1" y="4" width="6" height="12" rx="2" fill="currentColor" />
      <rect x="0" y="7" width="3" height="6" rx="1" fill="currentColor" />
      <rect x="31" y="4" width="6" height="12" rx="2" fill="currentColor" />
      <rect x="35" y="7" width="3" height="6" rx="1" fill="currentColor" />
      <rect x="7" y="9" width="24" height="2" fill="currentColor" />
    </svg>
  ),
  cicchetti: (
    <svg width="14" height="36" viewBox="0 0 14 36" fill="none">
      <rect x="6" y="1" width="2" height="33" rx="1" fill="currentColor" />
      <circle cx="7" cy="10" r="5.5" fill="currentColor" />
      <circle cx="7" cy="21" r="5.5" fill="currentColor" />
      <path d="M3.5,32 H10.5 L7,36 Z" fill="currentColor" />
    </svg>
  ),
  insalatone: (
    <svg width="36" height="30" viewBox="0 0 36 30" fill="none">
      <path d="M2,14 H34 C34,22.5 27,28.5 18,28.5 C9,28.5 2,22.5 2,14 Z" fill="currentColor" />
      <path d="M4,14 C4,8 10,4 18,4 C26,4 32,8 32,14 Z" fill="currentColor" opacity="0.4" />
      <path d="M18,4 C20.5,7 20.5,10 17,12.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  ),
  tartare: (
    <svg width="34" height="30" viewBox="0 0 34 30" fill="none">
      <ellipse cx="17" cy="19" rx="15" ry="8.5" fill="currentColor" />
      <ellipse cx="17" cy="15.5" rx="11" ry="5.5" fill="currentColor" opacity="0.5" />
      <circle cx="17" cy="9.5" r="3" fill="currentColor" />
    </svg>
  ),
};

// Icona categoria TAGLIERI (fallback coerente, nessun asset fotografico generato):
// tagliere + 3 fette — 1 sola tab cliente, raggruppa i 3 taglieri (decisione Eros 2026-09-10).
CATEGORY_SVGS.tagliere = (
  <svg width="36" height="26" viewBox="0 0 36 26" fill="none">
    <rect x="1" y="3" width="34" height="20" rx="7" fill="currentColor" />
    <circle cx="10" cy="13" r="3.2" fill="currentColor" opacity="0.45" />
    <circle cx="18" cy="10" r="3.2" fill="currentColor" opacity="0.45" />
    <circle cx="26" cy="14" r="3.2" fill="currentColor" opacity="0.45" />
  </svg>
);
// Icona categoria CONTORNI (2026-09-19): riusa l'icona `patatine` già disegnata — stesso
// mondo (fritto/contorno), nessun asset nuovo generato. `patatine` non è più una categoria
// di navigazione (vedi MENU_CATEGORIES), quindi l'icona non è condivisa con nulla di attivo.
CATEGORY_SVGS.contorni = CATEGORY_SVGS.patatine;
CATEGORY_SVGS.bevande = (
  <svg width="24" height="34" viewBox="0 0 24 34" fill="none">
    <path d="M4,8 L20,8 L18,32 C17.8,33 17,33.5 12,33.5 C7,33.5 6.2,33 6,32 Z" fill="currentColor" />
    <rect x="13" y="1" width="2.4" height="12" rx="1.2" transform="rotate(12 14.2 7)" fill="currentColor" />
  </svg>
);

// Categorie del menu completo — Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED, Page 4
// (`MENU — CATEGORIE` 166:2). PATATINE / COMBO non sono più navigazione primaria:
// restano nei dati, non nel menu. BIRRE riesposta come categoria primaria cliente
// (BEER SPRINT V1, 2026-09-14, decisione Eros: posizionata prima di BEVANDE, nessun
// frame Figma dedicato per questa voce di nav).
const MENU_CATEGORIES = [
  { key: 'panini', label: 'PANINI', icon: CATEGORY_SVGS.panini },
  { key: 'bbq', label: 'PESI MASSIMI', icon: CATEGORY_SVGS.bbq },
  { key: 'cicchetti', label: 'CICCHETTI', icon: CATEGORY_SVGS.cicchetti },
  { key: 'insalatone', label: 'INSALATONE', icon: CATEGORY_SVGS.insalatone },
  { key: 'tartare', label: 'TARTARE', icon: CATEGORY_SVGS.tartare },
  { key: 'tagliere', label: 'TAGLIERI', icon: CATEGORY_SVGS.tagliere },
  // CONTORNI esposta come categoria cliente (2026-09-19, decisione Eros): oggi contiene la
  // sola Patate al Forno (`item-058`, €5), che è anche il contorno incluso nel FALLO PESANTE.
  // Nessuna sezione dedicata: cade sulla card generica in fondo a questo file, come le
  // categorie senza componente proprio.
  { key: 'contorni', label: 'CONTORNI', icon: CATEGORY_SVGS.contorni },
  { key: 'birre', label: 'BIRRE', icon: CATEGORY_SVGS.birre },
  { key: 'bevande', label: 'BEVANDE', icon: CATEGORY_SVGS.bevande },
];

// Panini in evidenza sulla Home (Figma 140:2 / 140:12). `photoBg` = PHOTO BG del frame.
const HOME_FEATURED = [
  { id: 'item-014', photoBg: '#fdf7f1' }, // 146:2
  { id: 'item-017', photoBg: '#f9f0e8' }, // 146:3
];

// Item presenti a catalogo ma nascosti al SOLO menu cliente. Non vengono rimossi da
// `kitchenMenuItems`: restano ordinabili dalla cassa staff (`/kitchen/cassa`) e restano nel
// catalogo server, quindi nessun ordine storico e nessuna riga `kitchen_menu_items` cambia.
//
// BIRRA UNICA — TEMPORANEO (2026-09-19, decisione Eros): a menu cliente resta la sola
// Krombacher Pils (`item-057`). Le 6 bottiglie Keiler/Lupulus sono nascoste qui. Per
// riportarle a menu basta svuotare questo array — insieme a `kitchenBeerPairing`
// (kitchenMockData.js) e al sottotitolo della categoria BIRRE qui sotto, che sono le altre
// due metà della stessa decisione.
const CUSTOMER_HIDDEN_ITEM_IDS = [];


// AUTO-SELLING V1 (BEER SPRINT V1 §5/§7-D): ordine di priorità quando il sacco
// contiene più categorie food mappate — un solo suggerimento principale, mai
// una lista. Stesso ordine delle categorie nel menu (panini prima, tartare per
// ultima), scelta arbitraria ma stabile e prevedibile.
const BEER_PAIRING_CATEGORY_PRIORITY = ['panini', 'bbq', 'cicchetti', 'tagliere', 'insalatone', 'tartare'];

// Nessun suggerimento se il sacco ha già una birra (standalone o già inclusa in
// un FALLO PESANTE via `includesBeerId`), se nessuna categoria food nel sacco ha
// un pairing configurato, o se la birra consigliata non è ordinabile (prezzo non
// confermato / esaurita) — mai un CTA morto, mai un doppione della birra già presa.
//
// 2026-09-19: due esclusioni in più, per la stessa ragione (mai un CTA che aggiunge al sacco
// qualcosa che il cliente non può avere): una birra NASCOSTA al menu cliente
// (`CUSTOMER_HIDDEN_ITEM_IDS`) non viene mai suggerita, e una birra `evening_only` non viene
// suggerita fuori dal suo orario di servizio — la stessa regola che blocca la sua CTA in
// BirreSection e il FALLO PESANTE in PesiMassimiSection.
function findRecommendedBeer(orderItems, menuItems) {
  if (orderItems.some((o) => o.includesBeerId)) return null;

  const cartCategories = orderItems
    .map((o) => menuItems.find((i) => i.id === o.id)?.category)
    .filter(Boolean);
  if (cartCategories.includes('birre')) return null;

  const byItemBeerId = orderItems
    .map((o) => kitchenBeerPairing.byItem[o.id])
    .find(Boolean);
  const beerId = byItemBeerId
    || kitchenBeerPairing.byCategory[
      BEER_PAIRING_CATEGORY_PRIORITY.find((cat) => cartCategories.includes(cat))
    ];
  if (!beerId) return null;

  if (CUSTOMER_HIDDEN_ITEM_IDS.includes(beerId)) return null;

  const beer = menuItems.find((i) => i.id === beerId);
  if (!beer || beer.price == null || beer.available === false) return null;
  if (beer.availability === 'evening_only' && !isEveningServiceActive()) return null;
  return beer;
}

function drawerIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('birra') || n.includes('pils')) return '🍺';
  if (n.includes('patat')) return '🍟';
  return '🍔';
}

function getCategoryTitle(cat) {
  if (cat === 'panini') return <>I PANINI DA <span style={{ color: 'var(--k-orange)' }}>SPACCO</span></>;
  if (cat === 'patatine') return <>FRITTO <span style={{ color: 'var(--k-orange)' }}>TERAPEUTICO</span></>;
  if (cat === 'birre') return <>SETI <span style={{ color: 'var(--k-orange)' }}>IMPLACABILI</span></>;
  if (cat === 'combo') return <>COMBO <span style={{ color: 'var(--k-orange)' }}>LETALI</span></>;
  if (cat === 'bbq') return <>PESI <span style={{ color: 'var(--k-orange)' }}>MASSIMI</span></>;
  if (cat === 'tagliere') return <>TAGLI<span style={{ color: 'var(--k-orange)' }}>ERI</span></>;
  if (cat === 'bevande') return <>BEVANDE</>;
  if (cat === 'contorni') return <>CON<span style={{ color: 'var(--k-orange)' }}>TORNI</span></>;
  return cat.toUpperCase();
}

function getCategorySubtitle(cat) {
  if (cat === 'bbq') return 'Affumicato, esagerato, senza scuse. Roba da mangiare con le mani.';
  if (cat === 'panini') return 'Quelli seri. Almeno loro.';
  if (cat === 'cicchetti') return 'MORTAZZA · LARDO & NOCI · SCAMORZA & CIPOLLE · CIAPPI VEG';
  if (cat === 'insalatone') return 'CAESAR · SALMON · VEGGY';
  if (cat === 'tartare') return 'CRUDA E CONTENTA · DOLCE MA CRUDA';
  if (cat === 'tagliere') return 'SALUMI SERISSIMI · FORMAGGI DISCUTIBILI · PACE FATTA';
  if (cat === 'birre') return 'KEILER HELLES · LAND-PILS · KELLERBIER · WEISSE · DUNKEL WEISSE · LUPULUS';
  if (cat === 'contorni') return 'PATATE AL FORNO';
  if (cat === 'bevande') return 'ACQUA · PEPSI 33CL · PEPSI ZERO · SEVEN UP · SCHWEPPES LEMON · SCHWEPPES TONICA';
  return null;
}

// Stesso stile dei messaggi d'errore staff (KitchenSoloService.jsx), riformulati in tono
// cliente: l'RPC è condivisa, i codici errore sono gli stessi.
const CUSTOMER_PROMO_ERROR_MESSAGES = {
  invalid_promo_code:       'Codice non valido',
  order_not_found:          'Ordine non trovato',
  not_authorized_for_order: 'Codice non applicabile a questo ordine',
  order_already_has_promo:  'Promo già applicata a questo ordine',
  order_already_paid:       'Ordine già pagato — sconto non applicabile',
  promo_code_not_found:     'Codice non trovato',
  promo_already_redeemed:   'Codice già usato',
  promo_venue_mismatch:     'Codice non valido per questo locale',
  promo_no_eligible_item:   'Codice valido solo sui Pesi Massimi',
};

function customerPromoErrorText(err) {
  const message = err?.message ?? '';
  const match = Object.keys(CUSTOMER_PROMO_ERROR_MESSAGES).find((key) => message.includes(key));
  return match ? CUSTOMER_PROMO_ERROR_MESSAGES[match] : 'Codice promo non applicato — riprova';
}

// Stesso pattern SPA-navigate di CustomerOrderStatus.jsx (pushState + popstate sintetico, letto
// dal router in App.jsx). Follow-up UX (2026-09-18): la destinazione post-ordine è ora la pagina
// pagamento dedicata (CONFERMA ORDINE → PAGINA PAGAMENTO → STATUS), non più /kitchen/status
// direttamente — il bivio cassa/online si sceglie lì, /kitchen/status resta il "dopo".
function navigateToOrderPayment(orderId) {
  const path = `/kitchen/payment?orderId=${orderId}`;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Cleanup cliente (2026-09-18): stessa retro-compatibilità di CustomerOrderStatus.jsx —
// una sessione aperta prima del registro `walbox_kitchen_my_order_ids` aveva solo la chiave
// legacy a id singolo.
function ownedOrderIdsWithLegacy() {
  const ids = getOwnedOrderIds();
  try {
    const legacyId = localStorage.getItem('walbox_kitchen_last_order_id');
    if (legacyId && !ids.includes(legacyId)) ids.push(legacyId);
  } catch {
    // best-effort: niente storage disponibile, resta solo il registro corrente
  }
  return ids;
}

// Step nome cliente (2026-09-19): il codice ordine non viene mai generato prima che il cliente
// abbia detto come si chiama. Riusa il campo `nickname` gia' esistente (sessione localStorage +
// colonna gia' presente lato ordine): nessuna tabella, nessuna migration.
const GUEST_NICKNAME = 'Ospite Walrus';
const CUSTOMER_NAME_MAX = 24;
const CUSTOMER_NAME_MIN = 2;

export function normalizeCustomerName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOMER_NAME_MAX);
}

export function isValidCustomerName(value) {
  const name = normalizeCustomerName(value);
  return name.length >= CUSTOMER_NAME_MIN && name !== GUEST_NICKNAME;
}

export default function CustomerKitchenMenu() {
  const { session, saveSession } = useCustomerSession();
  // scope cliente: vedi CustomerOrderStatus — persistenza locale limitata agli ordini propri.
  const { addOrder, redeemPromo, orders } = useKitchenOrders({ scope: 'customer' });
  const { menuItems } = useKitchenMenu();
  // KITCHEN_OPEN_CLOSE_V1: menu resta sempre navigabile, solo l'invio ordine e' bloccato quando
  // lo staff chiude. Enforcement reale lato server (kitchen_customer_create_order); questo e'
  // solo il segnale UI, cosi' il cliente non arriva mai fino al submit per scoprirlo.
  const { isOpen: kitchenOpen } = useKitchenServiceState();

  const CATEGORIES = MENU_CATEGORIES;

  const [view, setView] = useState('home');
  const [activeCategory, setActiveCategory] = useState('panini');
  // IL SACCO sopravvive a refresh, back/forward e riapertura pagina (2026-09-16). Si parte dallo
  // snapshot salvato: righe, quantita', birra scelta del FALLO PESANTE, nota e scelta di ritiro.
  // Nome/prezzo NON vengono dallo snapshot, li rimette il catalogo (vedi l'effect di riconciliazione).
  const restoredCart = useRef(loadCart()).current;
  const [orderItems, setOrderItems] = useState([]);
  const [cartRestored, setCartRestored] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerNote, setCustomerNote] = useState(restoredCart.note);
  // Se il sacco ripristinato porta con se' una nota, il pannello parte aperto: una nota salvata
  // ma nascosta dietro un accordion chiuso, per il cliente, e' una nota persa.
  const [notesOpen, setNotesOpen] = useState(Boolean(restoredCart.note));
  const [promoOpen, setPromoOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Step nome: si apre al tap su CONFERMA ORDINE, prima di qualsiasi chiamata ad addOrder().
  const [nameStepOpen, setNameStepOpen] = useState(false);
  const [customerName, setCustomerName] = useState(
    () => (isValidCustomerName(session.nickname) ? normalizeCustomerName(session.nickname) : '')
  );
  const [nameError, setNameError] = useState(null);
  const [bannerOrderId, setBannerOrderId] = useState(null);
  const [promoCode, setPromoCode] = useState('');
  const [orderError, setOrderError] = useState(null);
  // Customer Checkout V1 (2026-09-13): unica scelta obbligatoria nel drawer, nessun default —
  // l'invio resta disabilitato finché il cliente non la sceglie esplicitamente. Il pagamento non
  // si sceglie più qui: vive sulla pagina pagamento dedicata (/kitchen/payment, follow-up UX 2026-09-18).
  const [fulfillmentType, setFulfillmentType] = useState(restoredCart.fulfillmentType); // 'eat_here' | 'takeaway'

  // Banner "hai un ordine attivo" (cleanup cliente, 2026-09-18): deve riflettere lo STATO reale
  // dell'ordine, non solo la presenza di una chiave locale — un cancelled/delivered non deve mai
  // continuare ad alimentarlo. `orders` è già reattivo (poll 10s + realtime + storage event), quindi
  // il banner sparisce non appena lo stato arriva, senza permanenza artificiale.
  useEffect(() => {
    const owned = ownedOrderIdsWithLegacy();
    if (!owned.length) { setBannerOrderId(null); return; }
    const mine = orders.filter((o) => owned.includes(o.id));
    const active = mine.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
    if (!active.length) { setBannerOrderId(null); return; }
    const mostRecent = active.reduce((best, o) => (new Date(o.createdAt) > new Date(best.createdAt) ? o : best));
    setBannerOrderId(mostRecent.id);
  }, [orders]);

  // Ripristino del SACCO: si aspetta il catalogo e si ricostruisce ogni riga dai dati CORRENTI,
  // cosi' un prezzo cambiato o un piatto esaurito non rientrano dal carrello vecchio. Il totale
  // e' sempre ricalcolato da queste righe, mai letto dallo snapshot.
  useEffect(() => {
    if (cartRestored || !menuItems?.length) return;
    const { items } = reconcileCartItems(restoredCart.items, menuItems, kitchenPesiMassimiCombos);
    if (items.length) setOrderItems(items);
    setCartRestored(true);
  }, [cartRestored, menuItems, restoredCart]);

  // Persistenza: ogni modifica al sacco viene salvata. Parte solo dopo il ripristino, altrimenti
  // il primo render (carrello ancora vuoto) sovrascriverebbe lo snapshot che sta per essere letto.
  // Un carrello svuotato a mano viene salvato vuoto: e' un'azione esplicita del cliente.
  useEffect(() => {
    if (!cartRestored) return;
    saveCart({ items: orderItems, note: customerNote, fulfillmentType }, undefined);
  }, [cartRestored, orderItems, customerNote, fulfillmentType]);

  // I piatti senza prezzo restano visibili con `PREZZO IN ARRIVO` (CTA disabilitata):
  // nessun prezzo inventato, nessuna categoria vuota nel menu approvato.
  const customerItems = menuItems.filter((i) => !CUSTOMER_HIDDEN_ITEM_IDS.includes(i.id));
  const visibleItems = customerItems.filter((i) => i.category === activeCategory);

  const pesiMassimiItems = customerItems.filter((i) => i.category === 'bbq');

  // FALLO PESANTE — regola corretta dopo rimozione Krombacher (correzione Eros 2026-09-22):
  // catalogo reale delle birre a scelta incluse nel combo, le 6 bottiglie rimaste (Krombacher
  // esclusa). Filtro per tag `birre-v1`, non per id fisso.
  const falloPesanteSide = menuItems.find((i) => i.id === FALLO_PESANTE_INCLUDED_SIDE_ID) ?? null;
  const falloPesanteBeerOptions = menuItems.filter(
    (i) => i.category === 'birre' && i.tags?.includes('birre-v1'),
  );
  const featuredItems = HOME_FEATURED
    .map(({ id, photoBg }) => {
      const item = customerItems.find((i) => i.id === id);
      return item ? { ...item, photoBg } : null;
    })
    .filter(Boolean);

  // Back navigation locale (HOME → CATEGORIE → LISTA): ogni avanzamento pusha
  // una history entry con { view } sullo stesso pathname /kitchen; il back
  // browser/gesture e i back-button UI leggono/consumano la stessa history
  // (vedi popstate listener sotto), senza toccare il router in App.jsx.
  const openMenu = (category) => {
    setActiveCategory(category);
    setView('menu');
    window.history.pushState({ view: 'menu', category }, '', '/kitchen');
    window.scrollTo({ top: 0 });
  };

  const enterMenu = () => {
    setView('categories');
    window.history.pushState({ view: 'categories' }, '', '/kitchen');
    window.scrollTo({ top: 0 });
  };

  // Cambio categoria dalla tab strip: è navigazione laterale dentro la stessa
  // vista `menu`, non un livello più profondo, quindi NON pusha una entry (il
  // back resterebbe intrappolato a rifare le categorie una per una). Serve però
  // un `replaceState`: senza, `history.state.category` restava fermo alla
  // categoria di ingresso e al reload veniva ripristinata quella sbagliata.
  const selectCategoryTab = (category) => {
    setActiveCategory(category);
    window.history.replaceState({ view: 'menu', category }, '', '/kitchen');
  };

  // Il listener popstate vive per tutta la vita del componente ma deve leggere
  // lo stato corrente, non quello catturato al mount.
  const viewRef = useRef(view);
  const cartOpenRef = useRef(cartOpen);
  const activeCategoryRef = useRef(activeCategory);
  viewRef.current = view;
  cartOpenRef.current = cartOpen;
  activeCategoryRef.current = activeCategory;

  useEffect(() => {
    if (window.location.pathname !== '/kitchen') return undefined;

    // Al rientro su /kitchen (back dal browser, o ritorno da /kitchen/status) il
    // browser ripristina la entry con il suo { view } e il componente si rimonta:
    // va ADOTTATO, non sovrascritto, altrimenti si torna alla schermata sbagliata
    // e il back successivo sembra andare avanti invece che indietro.
    const restored = window.history.state;
    if (restored?.view) {
      setView(restored.view);
      if (restored.category) setActiveCategory(restored.category);
    } else {
      window.history.replaceState({ view: 'home' }, '', '/kitchen');
    }

    // Ogni back deve ripristinare anche la categoria della entry, altrimenti si
    // torna sì alla LISTA ma su una categoria diversa da quella che si stava
    // guardando.
    const restoreEntry = (state) => {
      setView(state?.view || 'home');
      if (state?.category) setActiveCategory(state.category);
      window.scrollTo({ top: 0 });
    };

    const handlePopState = (event) => {
      if (window.location.pathname !== '/kitchen') return;

      // Con il drawer aperto il back lo chiude e basta (gesture standard per una
      // bottom sheet): rimettiamo la entry appena consumata così la schermata
      // sotto non si muove.
      if (cartOpenRef.current) {
        setCartOpen(false);
        window.history.pushState(
          { view: viewRef.current, category: activeCategoryRef.current },
          '',
          '/kitchen',
        );
        return;
      }

      restoreEntry(event.state);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Righe MENU — CATEGORIE (Figma 166:2): conteggio e foto reali dai dati menu,
  // nessun valore inventato — foto = primo item con `image` in quella categoria.
  const categoryRows = CATEGORIES.map((cat) => {
    const items = customerItems.filter((i) => i.category === cat.key);
    const photo = items.find((i) => i.image)?.image || null;
    return { ...cat, count: items.length, photo };
  });



  // `baseId`: id reale da inviare a Supabase (`itemId`, vedi handleSubmit). Per la
  // maggior parte dei prodotti coincide con `id`; FALLO PESANTE con birra scelta
  // (BEER SPRINT V1 Fase E) usa un `id` composito solo per distinguere le righe
  // carrello per birra, ma `baseId` resta il vero id del combo — vedi
  // PesiMassimiSection.jsx per il razionale completo.
  const addItem = (item) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        return prev.map((o) => o.id === item.id ? { ...o, qty: o.qty + 1 } : o);
      }
      return [...prev, { id: item.id, baseId: item.baseId || item.id, name: item.name, price: item.price, qty: 1, image: item.image, includesBeerId: item.includesBeerId }];
    });
  };

  const removeItem = (id) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === id);
      if (!existing) return prev;
      if (existing.qty === 1) return prev.filter((o) => o.id !== id);
      return prev.map((o) => o.id === id ? { ...o, qty: o.qty - 1 } : o);
    });
  };

  const removeAllOfItem = (id) => setOrderItems((prev) => prev.filter((o) => o.id !== id));

  const total = orderItems.reduce((sum, o) => sum + o.price * o.qty, 0);
  const itemCount = orderItems.reduce((sum, o) => sum + o.qty, 0);
  const recommendedBeer = findRecommendedBeer(orderItems, menuItems);

  // CONFERMA ORDINE non invia piu' direttamente: apre lo step nome. Il codice ordine nasce
  // solo dopo il submit dello step (vedi confirmCustomerName).
  const openNameStep = () => {
    if (orderItems.length === 0 || submitting || !fulfillmentType || !kitchenOpen) return;
    setNameError(null);
    setNameStepOpen(true);
  };

  const confirmCustomerName = () => {
    const name = normalizeCustomerName(customerName);
    if (!isValidCustomerName(name)) {
      setNameError('Scrivi il tuo nome (almeno 2 caratteri)');
      return;
    }
    setCustomerName(name);
    saveSession(session.table, name);
    setNameError(null);
    setNameStepOpen(false);
    handleSubmit(name);
  };

  const handleSubmit = async (confirmedName) => {
    // Invio bloccato finché il cliente non sceglie esplicitamente dove mangia — nessun default
    // silenzioso. Il pagamento non è più un gate qui: si sceglie su /kitchen/payment.
    if (orderItems.length === 0 || submitting || !fulfillmentType) return;
    // KITCHEN_OPEN_CLOSE_V1: difesa in profondità — il bottone è già disabilitato quando la
    // cucina è chiusa, ma un client stale (tab aperta da prima della chiusura) potrebbe arrivare
    // comunque qui. La RPC rifiuta comunque con 'kitchen_closed'; questo blocco evita solo la
    // chiamata inutile e mostra subito il messaggio corretto.
    if (!kitchenOpen) {
      setOrderError('LA CUCINA È CHIUSA — NON PUOI INVIARE ORDINI ORA');
      return;
    }
    // Il nome è obbligatorio: senza, si torna allo step nome e nessun ordine viene creato.
    const nickname = normalizeCustomerName(confirmedName ?? customerName);
    if (!isValidCustomerName(nickname)) {
      setNameStepOpen(true);
      return;
    }
    setSubmitting(true);
    setOrderError(null);
    // P0-2: la birra inclusa va PRIMA della nota del cliente — e' la prima cosa che la cucina
    // deve leggere sulla comanda, non una riga persa in fondo a un testo libero.
    const noteParts = [buildIncludedBeersNote(orderItems, menuItems), customerNote.trim()].filter(Boolean);
    const newOrder = {
      nickname,
      items: orderItems.map((o) => ({ itemId: o.baseId || o.id, name: o.name, quantity: o.qty, price: o.price })),
      total,
      note: noteParts.length > 0 ? noteParts.join(' \u00B7 ') : null,
      status: 'pending_counter_payment',
      paymentStatus: 'pending_counter_payment',
      paidAt: null,
      fulfillmentType,
    };
    // "ORDINE PRESO" è mostrato solo se addOrder() conferma una persistenza server reale
    // (id/order_code arrivano dalla RPC): se fallisce, il carrello resta intatto per il retry
    // e non viene mai mostrato un ordine fantasma (F02 — Phantom Order).
    const result = await addOrder(newOrder);
    if (!result.ok) {
      // La cucina puo' essere stata chiusa nel frattempo (race tra apertura pagina e submit): la
      // RPC alza 'kitchen_closed', il messaggio resta specifico invece del generico "riprova".
      const closedByServer = result.error?.message?.includes('kitchen_closed');
      setOrderError(closedByServer ? 'LA CUCINA È CHIUSA — NON PUOI INVIARE ORDINI ORA' : 'Ordine non inviato — riprova');
      setSubmitting(false);
      return;
    }
    const createdOrder = result.order;
    // Unico punto in cui il sacco viene svuotato in automatico: ordine confermato dal server.
    // Su fallimento (sopra) il carrello resta intatto, com'e' sempre stato.
    clearCart();
    try { localStorage.setItem('walbox_kitchen_last_order_id', createdOrder.id); } catch { }
    // P0 privacy (2026-09-16): registra l'ordine come proprio di QUESTO dispositivo. È l'unica
    // prova di proprietà che /kitchen/status accetta — senza, la pagina mostra l'empty state,
    // mai l'ordine di un altro cliente.
    rememberOwnedOrderId(createdOrder.id);

    // Il codice promo si redime solo dopo che l'ordine esiste davvero (mai prima): così il
    // pass non viene mai consumato per un ordine che poi risulta non creato. Se il redeem
    // fallisce l'ordine resta comunque valido a prezzo pieno — non blocca mai il cliente.
    // L'esito non è mostrato in questo task (Promo Redemption UI su /kitchen/status fuori scope,
    // vedi ai-ops/reports/kitchen-customer-journey-ux-deep-dive.md P0-1).
    const code = promoCode.trim();
    if (code && redeemPromo && createdOrder.id) {
      await redeemPromo(createdOrder.id, code);
    }

    // Destinazione post-ordine (follow-up UX 2026-09-18): CONFERMA ORDINE → PAGINA PAGAMENTO
    // DEDICATA → STATUS. Il pagamento — online o al banco — si sceglie sulla pagina pagamento,
    // mai in una schermata di conferma in-page.
    setSubmitting(false);
    navigateToOrderPayment(createdOrder.id);
  };

  useEffect(() => {
    if (cartOpen && orderItems.length === 0) setCartOpen(false);
    if (!cartOpen && nameStepOpen) setNameStepOpen(false);
  }, [orderItems.length, cartOpen, nameStepOpen]);

  // Sacco svuotato (cestino, o ultima riga rimossa): cadono anche nota e scelta di ritiro.
  // Sono contestuali a QUEL sacco — una nota "senza cipolla" sopravvissuta a un carrello
  // buttato finirebbe sull'ordine successivo, che magari la cipolla non ce l'ha nemmeno.
  useEffect(() => {
    if (!cartRestored || orderItems.length > 0) return;
    setCustomerNote((prev) => (prev ? '' : prev));
    setFulfillmentType((prev) => (prev ? null : prev));
    setNotesOpen(false);
  }, [cartRestored, orderItems.length]);

  // ── Main menu ─────────────────────────────────────────────────────────
  // La schermata di conferma in-page "ORDINE RICEVUTO" è stata rimossa (Il Sacco Pulito,
  // 2026-09-13): dopo l'invio si va sulla pagina pagamento dedicata (vedi handleSubmit,
  // follow-up UX 2026-09-18), che copre codice + bivio pagamento senza duplicarli in-page.
  return (
    <div className="kitch-page">
      <style>{`
        /* Card svg icons: dark color on cream background */
        .kitch-card-img svg {
          color: #1c1a14 !important;
        }
      `}</style>

      {/* KITCHEN_OPEN_CLOSE_V1: banner cucina chiusa — sempre visibile, su tutte le view, il menu
          resta comunque navigabile. Zero interazione: informa soltanto, il blocco vero è sulla
          CTA di invio (vedi CONFERMA ORDINE) e sulla RPC server-side. */}
      {!kitchenOpen && (
        <div
          data-testid="kitchen-closed-banner"
          style={{
            position: 'sticky', top: 0, zIndex: 81, width: '100%',
            background: '#1c1a14', borderBottom: '2px solid #e03c2c',
            padding: '10px 14px', textAlign: 'center',
          }}
        >
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 14, letterSpacing: '1px', color: '#ff9a8c' }}>
            LA CUCINA È CHIUSA — NIENTE NUOVI ORDINI AL MOMENTO
          </span>
        </div>
      )}

      {/* Active order banner */}
      {bannerOrderId && (
        <button
          style={{
            position: 'sticky', top: 0, zIndex: 80, width: '100%',
            display: 'block', background: '#f05a24', border: 'none', cursor: 'pointer',
            padding: '10px 14px', textAlign: 'left',
          }}
          onClick={() => {
            const url = `/kitchen/status?orderId=${bannerOrderId}`;
            window.history.pushState({}, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        >
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 13, letterSpacing: '1.5px', color: '#fff' }}>
            HAI UN ORDINE ATTIVO → SEGUI IL TUO ORDINE
          </span>
        </button>
      )}

      {/* Header — Figma 111:59 (banner) + 111:63 cornice + 111:60/61/62 claim + 111:64 rule.
          Il banner ha il vecchio claim stampato: 111:60 lo copre, 111:62 scrive quello nuovo. */}
      <header className="kh-header">
        <img
          src="/assets/kitchen/01_header_walrus_kitchen.webp"
          alt="Walrus Kitchen"
          className="kh-header-img"
        />
        <span className="kh-header-frame" aria-hidden="true" />
        <span className="kh-header-claim-cover" aria-hidden="true" />
        <span className="kh-header-claim-rule" aria-hidden="true" />
        <p className="kh-header-claim">PANINI SERI. PERSONALITÀ DISCUTIBILE.</p>
        <span className="kh-header-baseline" aria-hidden="true" />
      </header>

      {/* ── HOME (Figma 111:58 — Walrus Kitchen Home V3.4 PHOTO MENU) ── */}
      {view === 'home' && (
        <>
          <div className="kh-intro">
            <p className="kh-intro-title">OGGI TI FACCIAMO VENIRE FAME.</p>
            <p className="kh-intro-sub">Pesi Massimi, panini seri e il resto della faccenda.</p>
          </div>

          {/* Hero PESI MASSIMI approvata (128:2) — invariata, solo hero */}
          {pesiMassimiItems.length > 0 && (
            <PesiMassimiSection
              items={pesiMassimiItems}
              heroOnly
              onHeroCta={() => openMenu('bbq')}
            />
          )}

          <div className="kh-section-head">
            <h2 className="kh-section-title">I PANINI DA SPACCO</h2>
            <p className="kh-section-sub">Quelli seri. Almeno loro.</p>
          </div>

          <div className="kh-featured-list">
            {featuredItems.map((item) => {
              const soldOut = item.available === false;
              const noPrice = item.price == null;
              return (
                <article key={item.id} className="kh-card">
                  <div className="kh-card-photo" style={{ background: item.photoBg }}>
                    {item.image && <img src={item.image} alt={item.name} />}
                  </div>
                  <div className="kh-card-accent" />
                  <h3 className="kh-card-name">{item.name.toUpperCase()}</h3>
                  <p className="kh-card-ingredients">{item.ingredients}</p>
                  <p className="kh-card-desc">{item.description}</p>
                  <div className="kh-card-rule" />
                  <span className="kh-card-price">
                    {noPrice ? 'PREZZO IN ARRIVO' : `€${item.price.toFixed(2).replace('.', ',')}`}
                  </span>
                  <button
                    type="button"
                    className="kh-btn-want"
                    disabled={soldOut || noPrice}
                    onClick={() => addItem(item)}
                  >
                    {soldOut ? 'ESAURITO' : 'LO VOGLIO'}
                  </button>
                </article>
              );
            })}
          </div>

          <button type="button" className="kh-cta-outline" onClick={() => openMenu('panini')}>
            VEDI TUTTI I PANINI →
          </button>

          <div className="kh-menu-block">
            <p className="kh-menu-block-title">ADESSO ENTRA NEL MENU.</p>
            <p className="kh-menu-block-sub">Panini · Pesi Massimi · Cicchetti · Insalatone · Tartare · Taglieri · Birre · Bevande</p>
            <button type="button" className="kh-btn-menu" onClick={enterMenu}>
              ENTRA NEL MENU →
            </button>
          </div>
        </>
      )}

      {/* ── MENU — CATEGORIE (Figma 166:2) ── */}
      {view === 'categories' && (
        <div className="kh-cat-screen">
          <div className="kh-cat-topbar">
            <button
              type="button"
              className="kh-cat-back"
              onClick={() => window.history.back()}
            >
              ← INDIETRO
            </button>
            <span className="kh-cat-topbar-label">MENU</span>
          </div>

          <h2 className="kh-cat-title">IL MENU</h2>
          <p className="kh-cat-subtitle">Panini · Pesi Massimi · Cicchetti · Insalatone · Tartare · Taglieri · Birre · Bevande</p>

          <div className="kh-cat-list">
            {categoryRows.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className="kh-cat-row"
                onClick={() => openMenu(cat.key)}
              >
                <div className={`kh-cat-photo${cat.key === 'bbq' ? ' kh-cat-photo--dark' : ''}`}>
                  {cat.photo && <img src={cat.photo} alt="" />}
                </div>
                <div className="kh-cat-accent" />
                <div className="kh-cat-text">
                  <span className="kh-cat-name">{cat.label}</span>
                  <span className="kh-cat-count">{cat.count} {cat.count === 1 ? 'VOCE' : 'VOCI'}</span>
                </div>
                <span className="kh-cat-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── MENU COMPLETO ── */}
      {view === 'menu' && (
      <>
      <div className="kh-menu-topbar">
        <button type="button" className="kh-btn-back" onClick={() => window.history.back()}>
          ← INDIETRO
        </button>
        <span className="kh-menu-topbar-label">{CATEGORIES.find((c) => c.key === activeCategory)?.label || 'MENU'}</span>
      </div>

      {/* Promo hero card */}
      {activeCategory !== 'bbq' && kitchenCategoryPromos[activeCategory] ? (
        <div className="kitch-promo-wrapper">
          <img
            src={kitchenCategoryPromos[activeCategory].image}
            alt={kitchenCategoryPromos[activeCategory].alt || ''}
            style={{ width: '100%', borderRadius: '28px', display: 'block' }}
          />
        </div>
      ) : null}

      {/* Category tabs */}
      <KitchenCategoryTabs
        categories={CATEGORIES}
        activeKey={activeCategory}
        onSelect={selectCategoryTab}
      />

      {/* Section title */}
      {activeCategory !== 'bbq' && (
        <>
          <div className="kitch-section-title">{getCategoryTitle(activeCategory)}</div>
          {getCategorySubtitle(activeCategory) && (
            <div className="kitch-section-subtitle">{getCategorySubtitle(activeCategory)}</div>
          )}
        </>
      )}

      {/* Menu items */}
      {activeCategory === 'bbq' && visibleItems.length > 0 && (
        <PesiMassimiSection
          items={visibleItems}
          onAdd={addItem}
          includedSide={falloPesanteSide}
          beerOptions={falloPesanteBeerOptions}
        />
      )}
      {activeCategory === 'panini' && visibleItems.length > 0 && (
        <PaniniSection items={visibleItems} onAdd={addItem} />
      )}
      {activeCategory === 'cicchetti' && visibleItems.length > 0 && (
        <CicchettiSection items={visibleItems} onAdd={addItem} />
      )}
      {activeCategory === 'insalatone' && visibleItems.length > 0 && (
        <InsalatoneSection items={visibleItems} onAdd={addItem} />
      )}
      {activeCategory === 'tartare' && visibleItems.length > 0 && (
        <TartareSection items={visibleItems} onAdd={addItem} />
      )}
      {activeCategory === 'birre' && visibleItems.length > 0 && (
        <BirreSection items={visibleItems} onAdd={addItem} />
      )}
      {activeCategory === 'tagliere' && visibleItems.length > 0 && (
        <TagliereSection items={visibleItems} onAdd={addItem} />
      )}
      {activeCategory === 'bevande' && visibleItems.length > 0 && (
        <BevandeSection items={visibleItems} onAdd={addItem} />
      )}
      {visibleItems.length === 0 && (
        <div className="kitch-menu-empty">NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA</div>
      )}
      {activeCategory !== 'bbq' && activeCategory !== 'panini' && activeCategory !== 'cicchetti' && activeCategory !== 'insalatone' && activeCategory !== 'tartare' && activeCategory !== 'birre' && activeCategory !== 'tagliere' && activeCategory !== 'bevande' && visibleItems.length > 0 && visibleItems.every((item) => item.available === false) && (
        <div className="kitch-menu-soldout-banner">AL MOMENTO È TUTTO ESAURITO</div>
      )}
      {activeCategory !== 'bbq' && activeCategory !== 'panini' && activeCategory !== 'cicchetti' && activeCategory !== 'insalatone' && activeCategory !== 'tartare' && activeCategory !== 'birre' && activeCategory !== 'tagliere' && activeCategory !== 'bevande' && (
      <div className="kitch-menu-list">
        {visibleItems.map((item) => (
          <div key={item.id} className="kitch-card" style={item.available === false ? { opacity: 0.6 } : undefined}>
            <div className="kitch-card-img" style={{ overflow: 'hidden', position: 'relative' }}>
              {item.available === false && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(14,12,8,0.55)',
                  zIndex: 2,
                }}>
                  <span style={{
                    fontSize: '13px', fontWeight: 900, letterSpacing: '0.12em',
                    color: '#f5ead8', background: 'rgba(180,40,20,0.85)',
                    padding: '4px 10px', borderRadius: '6px',
                  }}>ESAURITO</span>
                </div>
              )}
              {item.image
                ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (CATEGORY_SVGS[item.category] ?? CATEGORY_SVGS.panini)}
            </div>
            <div className="kitch-card-content">
              <div className="kitch-card-header">
                <div className="kitch-card-name">{item.name.toUpperCase()}</div>
                <span className="kitch-card-icon">🦭</span>
              </div>
              <div className="kitch-card-desc">{item.description}</div>
              <AllergenBadges allergens={item.allergens} />
              <div className="kitch-card-footer">
                <div className={`kitch-card-price${item.price == null ? ' kitch-card-price--soon' : ''}`}>
                  {item.price == null ? 'PREZZO IN ARRIVO' : `€${item.price.toFixed(2).replace('.', ',')}`}
                </div>
                <button
                  className="kitch-btn-lo-voglio"
                  onClick={() => addItem(item)}
                  disabled={item.available === false || item.price == null}
                  style={item.available === false || item.price == null ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >{item.available === false ? 'ESAURITO' : 'LO VOGLIO'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
      </>
      )}

      {/* Bottom cart bar */}
      <div className="kitch-bottom-spacer" />
      <div className="kitch-bottom-bar">
        <div className="kitch-bottom-card">
          <div
            className="kitch-bottom-left"
            onClick={() => { if (itemCount > 0) setCartOpen(true); }}
            role="button"
            aria-label="Apri carrello"
          >
            <div className="kitch-cart-icon-wrap">
              <svg className="kitch-cart-svg" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 7h2.5l3.8 14.5h12.4l3-10.5H10.5" stroke="#e8ddb8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="13.5" cy="27" r="2" fill="#e8ddb8"/>
                <circle cx="23" cy="27" r="2" fill="#e8ddb8"/>
              </svg>
              <div className="kitch-cart-badge">{itemCount}</div>
            </div>
            <div className="kitch-bottom-text-wrap">
              <div className="kitch-bottom-title">
                {itemCount === 0 ? '0 ROBE NEL SACCO' : itemCount === 1 ? '1 ROBA NEL SACCO' : `${itemCount} ROBE NEL SACCO`}
              </div>
              <div className="kitch-bottom-total">€{total.toFixed(2).replace('.', ',')}</div>
            </div>
          </div>
          <button
            className="kitch-btn-vai"
            onClick={() => { if (itemCount > 0) setCartOpen(true); }}
            disabled={itemCount === 0}
            style={itemCount === 0 ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
          >
            {itemCount === 0 ? 'AGGIUNGI QUALCOSA' : "VAI ALL'ORDINE"}
          </button>
        </div>
      </div>

      {/* Backdrop */}
      {cartOpen && <div className="kitch-backdrop" onClick={() => setCartOpen(false)} />}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="kitch-drawer">
          <div className="kitch-drawer-handle" />
          <div className="kitch-drawer-header">
            <div className="kitch-drawer-title">IL TUO SACCO</div>
            <button className="kitch-drawer-close" onClick={() => setCartOpen(false)}>×</button>
          </div>
          <div className="kitch-drawer-body">
            <div className="kitch-drawer-items-list">
              {orderItems.map((o) => (
                <div key={o.id} className="kitch-drawer-row">
                  <div className="kitch-drawer-row-img">
                    {o.image ? (
                      <img
                        src={o.image}
                        alt={o.name}
                        className="kitch-drawer-row-photo"
                      />
                    ) : (
                      drawerIcon(o.name)
                    )}
                  </div>
                  <div className="kitch-drawer-row-content">
                    <div className="kitch-drawer-row-name">{o.name.toUpperCase()}</div>
                    <div className="kitch-drawer-row-price">€{o.price.toFixed(2).replace('.', ',')}</div>
                  </div>
                  <div className="kitch-drawer-row-controls">
                    <button className="kitch-qty-btn" onClick={() => removeItem(o.id)}>−</button>
                    <span className="kitch-qty-num">{o.qty}</span>
                    <button className="kitch-qty-btn" onClick={() => addItem(o)}>+</button>
                    <button className="kitch-trash-btn" onClick={() => removeAllOfItem(o.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            {/* AUTO-SELLING V1 — suggerimento birra contestuale (BEER SPRINT V1 §5/§7-D).
                Un solo suggerimento, mai un motore di raccomandazione: aggiungere è un
                click esplicito del cliente, nessun add automatico. */}
            {recommendedBeer && (
              <div className="kitch-pairing-banner" data-testid="beer-pairing-banner">
                <div className="kitch-pairing-copy">
                  <span className="kitch-pairing-label">CI STA BENE UNA BIRRA?</span>
                  <span className="kitch-pairing-name">
                    {recommendedBeer.name.toUpperCase()}
                    {recommendedBeer.choiceLabel ? ` · ${recommendedBeer.choiceLabel}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="kitch-pairing-add"
                  onClick={() => addItem(recommendedBeer)}
                  data-testid="beer-pairing-add"
                >
                  +€{recommendedBeer.price.toFixed(2).replace('.', ',')}
                </button>
              </div>
            )}

            {/* DOVE LO MANGI? — unica domanda del drawer (Il Sacco Pulito, 2026-09-13).
                Il pagamento non si sceglie più qui: vive su /kitchen/payment. */}
            <div className="kitch-fulfillment-wrap" data-testid="checkout-fulfillment">
              <div className="kitch-fulfillment-label">DOVE LO MANGI?</div>
              <div className="kitch-fulfillment-grid">
                {[
                  { value: 'eat_here', label: 'MANGIO QUI', sub: 'ti chiamiamo', emoji: '🍽️' },
                  { value: 'takeaway', label: 'PORTO VIA', sub: 'impacchettiamo', emoji: '🥡' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    data-testid={`fulfillment-${opt.value}`}
                    onClick={() => setFulfillmentType(opt.value)}
                    disabled={submitting}
                    className={`kitch-fulfillment-card ${fulfillmentType === opt.value ? 'kitch-fulfillment-card--selected' : ''}`}
                  >
                    <span className="kitch-fulfillment-card-emoji" aria-hidden="true">{opt.emoji}</span>
                    <span className="kitch-fulfillment-card-title">{opt.label}</span>
                    <span className="kitch-fulfillment-card-sub">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* EXTRA — note e codice promo, secondarie e collassate di default. */}
            <div className="kitch-extra-wrap">
              <button
                type="button"
                className={`kitch-extra-chip ${notesOpen ? 'kitch-extra-chip--open' : ''}`}
                onClick={() => setNotesOpen((v) => !v)}
              >
                <span aria-hidden="true">{notesOpen ? '⊖' : '⊕'}</span> NOTE PER LA CUCINA
              </button>
              {notesOpen && (
                <div>
                  <textarea
                    className="kitch-extra-field"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Allergie, variazioni…"
                    maxLength={200}
                    rows={3}
                    style={{ resize: 'none' }}
                  />
                  <div className="kitch-extra-counter">{customerNote.length}/200</div>
                </div>
              )}

              <button
                type="button"
                className={`kitch-extra-chip ${promoOpen ? 'kitch-extra-chip--open' : ''}`}
                onClick={() => setPromoOpen((v) => !v)}
              >
                <span aria-hidden="true">{promoOpen ? '⊖' : '⊕'}</span> HO UN CODICE
              </button>
              {promoOpen && (
                <input
                  type="text"
                  className="kitch-extra-field kitch-extra-field--promo"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Il tuo codice"
                  maxLength={20}
                  disabled={submitting}
                  data-testid="promo-code-input"
                />
              )}
            </div>

            <div className="kitch-drawer-footer">
              {orderError && (
                <div
                  data-testid="order-submit-error"
                  style={{
                    margin: '0 0 12px',
                    padding: '12px 16px',
                    background: 'rgba(224,60,44,0.15)',
                    border: '2px solid #e03c2c',
                    borderRadius: '12px',
                    textAlign: 'center',
                    color: '#ff9a8c',
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  {orderError.toUpperCase()}
                </div>
              )}
              <div className="kitch-drawer-total-row">
                <div className="kitch-drawer-total-label">TOTALE</div>
                <div className="kitch-drawer-total-value">€{total.toFixed(2).replace('.', ',')}</div>
              </div>
              {nameStepOpen ? (
                /* Step nome: ultimo passo prima della creazione dell'ordine (e quindi del codice). */
                <div data-testid="customer-name-step">
                  <label className="kitch-fulfillment-label" htmlFor="customer-name-input">
                    COME TI CHIAMI?
                  </label>
                  <input
                    id="customer-name-input"
                    type="text"
                    className="kitch-extra-field"
                    value={customerName}
                    onChange={(e) => { setCustomerName(e.target.value); if (nameError) setNameError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmCustomerName(); }}
                    placeholder="Il tuo nome"
                    maxLength={CUSTOMER_NAME_MAX}
                    autoComplete="given-name"
                    autoFocus
                    disabled={submitting}
                    data-testid="customer-name-input"
                  />
                  {nameError && (
                    <div className="kitch-secure-hint" data-testid="customer-name-error">{nameError}</div>
                  )}
                  <button
                    className="kitch-btn-submit"
                    onClick={confirmCustomerName}
                    aria-label="Continua"
                    disabled={submitting || !isValidCustomerName(customerName)}
                    data-testid="customer-name-continue"
                    style={(submitting || !isValidCustomerName(customerName)) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  >
                    {submitting ? 'INVIO IN CORSO…' : 'CONTINUA'}
                  </button>
                  <div className="kitch-secure-hint">Serve alla cucina per chiamarti: A42 · {normalizeCustomerName(customerName) || 'il tuo nome'}</div>
                </div>
              ) : (
                <>
                  <button
                    className="kitch-btn-submit"
                    onClick={openNameStep}
                    aria-label="Invia ordine"
                    disabled={submitting || !fulfillmentType || !kitchenOpen}
                    data-testid="submit-order-btn"
                    style={(submitting || !fulfillmentType || !kitchenOpen) ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                  >
                    {submitting ? 'INVIO IN CORSO…' : !kitchenOpen ? 'CUCINA CHIUSA' : 'CONFERMA ORDINE'}
                  </button>
                  <div className="kitch-secure-hint">
                    {!kitchenOpen ? 'Riprova più tardi — lo staff ha chiuso la cucina.' : fulfillmentType ? 'Paghi dopo: al banco o dal telefono.' : 'Prima dicci: qui o via?'}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
