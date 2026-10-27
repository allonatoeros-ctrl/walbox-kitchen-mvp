import { useState, useEffect, useRef, useMemo } from 'react';
import { kitchenCategoryPromos, kitchenBeerPairing, FALLO_PESANTE_INCLUDED_SIDE_ID } from '../data/kitchenMockData';
import { useCustomerSession } from '../hooks/useCustomerSession';
import { useKitchenOrders, rememberOwnedOrderId, getOwnedOrderIds } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import { useKitchenServiceState } from '../hooks/useKitchenServiceState';
import { startSumupCheckout, rememberCounterPaymentChoice } from '../hooks/useOrderPaymentFlow';
import {
  STATUS_PA,
  cartFingerprint,
  getOrCreateClientRequestId,
  clearClientRequestId,
  resolveCreateOutcome,
  onlineErrorMessage,
} from '../lib/kitchenOnlineLane';
import KitchenCategoryTabs from '../components/kitchen/KitchenCategoryTabs';
import MenuHero from '../components/kitchen/MenuHero';
import PesiMassimiSection from '../components/kitchen/PesiMassimiSection';
import PaniniSection from '../components/kitchen/PaniniSection';
import CicchettiSection from '../components/kitchen/CicchettiSection';
import InsalatoneSection from '../components/kitchen/InsalatoneSection';
import TartareSection from '../components/kitchen/TartareSection';
import BirreSection from '../components/kitchen/BirreSection';
import TagliereSection from '../components/kitchen/TagliereSection';
import PosterCard from '../components/kitchen/PosterCard';
import BevandeSection from '../components/kitchen/BevandeSection';
import CustomerCheckout from '../components/kitchen/CustomerCheckout';
import AnniversaryBanner from '../components/kitchen/AnniversaryBanner';
import EventSideChip from '../components/kitchen/EventSideChip';
import { checkoutMissing, isValidCustomerName, normalizeCustomerName } from '../lib/kitchenCheckout';
import { buildIncludedBeersNote, isEveningServiceActive } from '../lib/kitchenServiceRules';
import { isEventModeActive, filterEventMenuItems, excludeEventOnlyItems, shouldSuggestEventSide, EVENT_CATEGORY, EVENT_CATEGORIES, EVENT_SIDE_ITEM_ID } from '../lib/kitchenEventMode';
import { loadCart, saveCart, clearCart, reconcileCartItems } from '../lib/kitchenCart';
import { formatPrice } from '../lib/kitchenPrice';
import { kitchenPesiMassimiCombos } from '../data/kitchenMockData';
import './CustomerKitchenMenu.css';

// Categorie del menu completo — Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED, Page 4
// (`MENU — CATEGORIE` 166:2). PATATINE / COMBO non sono più navigazione primaria:
// restano nei dati, non nel menu. BIRRE riesposta come categoria primaria cliente
// (BEER SPRINT V1, 2026-09-14, decisione Eros: posizionata prima di BEVANDE, nessun
// frame Figma dedicato per questa voce di nav).
const MENU_CATEGORIES = [
  { key: 'bbq', label: 'PESI MASSIMI' },
  { key: 'panini', label: 'PANINI' },
  { key: 'cicchetti', label: 'CICCHETTI' },
  { key: 'insalatone', label: 'INSALATONE' },
  { key: 'tartare', label: 'TARTARE' },
  { key: 'tagliere', label: 'TAGLIERI' },
  // CONTORNI esposta come categoria cliente (2026-09-19, decisione Eros): oggi contiene la
  // sola Patate al Forno (`item-058`, €5), che è anche il contorno incluso nel FALLO PESANTE.
  // Nessuna sezione dedicata: cade sulla card generica in fondo a questo file, come le
  // categorie senza componente proprio.
  { key: 'contorni', label: 'CONTORNI' },
  { key: 'birre', label: 'BIRRE' },
  { key: 'bevande', label: 'BEVANDE' },
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


// Auto-selling V1 (BEER SPRINT V1 §5/§7-D): ordine di priorità quando il sacco
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

// Titolo da manifesto su 2 righe (riga 2 gialla). Solo copy già presente nell'app (vecchi titoli);
// dove non c'è una seconda riga approvata resta una riga sola: niente testi inventati.
function getPosterTitle(cat) {
  if (cat === 'panini') return ['PANINI', 'DA SPACCO'];
  if (cat === 'patatine') return ['FRITTO', 'TERAPEUTICO'];
  if (cat === 'birre') return ['SETI', 'IMPLACABILI'];
  if (cat === 'combo') return ['COMBO', 'LETALI'];
  if (cat === 'bbq') return ['PESI', 'MASSIMI'];
  return [(MENU_CATEGORIES.find((c) => c.key === cat)?.label || String(cat)).toUpperCase(), null];
}

function getCategorySubtitle(cat) {
  if (cat === 'bbq') return 'Affumicato, esagerato, senza scuse. Roba da mangiare con le mani.';
  if (cat === 'panini') return 'Sette panini, nessuno timido. Scegli con la pancia.';
  if (cat === 'cicchetti') return 'MORTAZZA · LARDO & NOCI · SCAMORZA & CIPOLLE · CIAPPI VEG';
  if (cat === 'insalatone') return 'CAESAR · SALMON · VEGGY';
  if (cat === 'tartare') return 'CRUDA E CONTENTA · DOLCE MA CRUDA';
  if (cat === 'tagliere') return 'SALUMI SERISSIMI · FORMAGGI DISCUTIBILI · PACE FATTA';
  if (cat === 'birre') return 'KEILER HELLES · LAND-PILS · KELLERBIER · WEISSE · DUNKEL WEISSE · LUPULUS';
  if (cat === 'contorni') return 'PATATE AL FORNO';
  if (cat === 'bevande') return 'ACQUA · PEPSI 33CL · PEPSI ZERO · SEVEN UP · SCHWEPPES LEMON · SCHWEPPES TONICA';
  return null;
}

// Stesso pattern SPA-navigate di CustomerOrderStatus.jsx (pushState + popstate sintetico, letto
// dal router in App.jsx). S5 (Payment Lifecycle V2): la scelta BANCO/ONLINE avviene qui, prima
// della creazione dell'ordine, quindi la destinazione post-ordine è sempre /kitchen/status (al
// banco: codice da mostrare; online: pannello pagamento con RIPROVA / PAGA AL BANCO).
function navigateToOrderStatus(orderId) {
  const path = `/kitchen/status?orderId=${orderId}`;
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

export default function CustomerKitchenMenu() {
  const { session, saveSession } = useCustomerSession();
  // scope cliente: vedi CustomerOrderStatus — persistenza locale limitata agli ordini propri.
  const { addOrder, orders } = useKitchenOrders({ scope: 'customer' });
  const { menuItems: catalogItems } = useKitchenMenu();
  // KITCHEN_OPEN_CLOSE_V1: menu resta sempre navigabile, solo l'invio ordine e' bloccato quando
  // lo staff chiude. Enforcement reale lato server (kitchen_customer_create_order); questo e'
  // solo il segnale UI, cosi' il cliente non arriva mai fino al submit per scoprirlo.
  const { isOpen: kitchenOpen } = useKitchenServiceState();

  // Modalità evento (15 anni): letta una volta al mount, perché la navigazione interna
  // riscrive l'URL senza query. Vedi src/lib/kitchenEventMode.js.
  const [eventMode] = useState(() => isEventModeActive(window.location.search));
  // A modalità spenta gli item della festa non esistono: il menu è quello di prima dell'anniversario.
  const menuItems = useMemo(() => (eventMode ? catalogItems : excludeEventOnlyItems(catalogItems)), [eventMode, catalogItems]);
  const CATEGORIES = eventMode ? MENU_CATEGORIES.filter((c) => EVENT_CATEGORIES.includes(c.key)) : MENU_CATEGORIES;

  // Si apre su PESI MASSIMI (`bbq`); in evento resta la categoria evento.
  const [activeCategory, setActiveCategory] = useState(eventMode ? EVENT_CATEGORY : 'bbq');
  // IL SACCO sopravvive a refresh, back/forward e riapertura pagina (2026-09-16). Si parte dallo
  // snapshot salvato: righe, quantita', birra scelta del FALLO PESANTE, nota e scelta di ritiro.
  // Nome/prezzo NON vengono dallo snapshot, li rimette il catalogo (vedi l'effect di riconciliazione).
  const [restoredCart] = useState(() => loadCart());
  const [orderItems, setOrderItems] = useState([]);
  const [cartRestored, setCartRestored] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  // Feedback add-to-cart (2026-09-24): toast breve + pulse del sacco + thumbnail che vola.
  const [addedToast, setAddedToast] = useState(null);
  // Nome del panino appena aggiunto mentre il pannello bevande è aperto; null = pannello chiuso.
  // Evento: chip "PATATE AL FORNO" chiuso per la sessione dopo un NO o dopo averle aggiunte
  // (solo memoria React, niente localStorage: al reload si riparte da zero).
  const [sideChipDismissed, setSideChipDismissed] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);
  const [flyers, setFlyers] = useState([]);
  const cartIconRef = useRef(null);
  const pointerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const pulseTimerRef = useRef(null);
  // Contatore monotono per l'id delle thumbnail di feedback add-to-cart (solo lato UI,
  // volatile: non persiste e non finisce mai nel payload ordine).
  const flyerSeqRef = useRef(0);
  const [customerNote, setCustomerNote] = useState(restoredCart.note);
  // Se il sacco ripristinato porta con se' una nota, il pannello parte aperto: una nota salvata
  // ma nascosta dietro un accordion chiuso, per il cliente, e' una nota persa.
  const [notesOpen, setNotesOpen] = useState(Boolean(restoredCart.note));
  const [submitting, setSubmitting] = useState(false);
  // Checkout V2: nome, dove mangi, note e corsia di pagamento stanno in un solo schermo (vedi
  // CustomerCheckout). L'ordine nasce al tap su PAGO ORA / PAGO AL BANCO; se manca il nome o il
  // "dove", `checkoutIssue` porta il cliente sul campo giusto invece di bloccare un bottone.
  const [checkoutIssue, setCheckoutIssue] = useState(null);
  // Lock sincrono anti doppio tap (lo stato `submitting` si aggiorna solo al render successivo).
  const submitLockRef = useRef(false);
  const [customerName, setCustomerName] = useState(
    () => (isValidCustomerName(session.nickname) ? normalizeCustomerName(session.nickname) : '')
  );
  const [bannerOrderId, setBannerOrderId] = useState(null);
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
    // payment_abandoned (S5) è terminale: non è un "ordine attivo" da seguire.
    const active = mine.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled' && o.status !== STATUS_PA);
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

  // Feedback add-to-cart: memorizza l'ultimo punto di tap (per l'animazione thumbnail)
  // e pulisce i timer al unmount. Nessuna dipendenza nuova, solo listener nativi.
  useEffect(() => {
    const onPointerDown = (e) => { pointerRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // I piatti senza prezzo restano visibili con `PREZZO IN ARRIVO` (CTA disabilitata):
  // nessun prezzo inventato, nessuna categoria vuota nel menu approvato.
  const visibleMenuItems = menuItems.filter((i) => !CUSTOMER_HIDDEN_ITEM_IDS.includes(i.id));
  const customerItems = eventMode ? filterEventMenuItems(visibleMenuItems) : visibleMenuItems;
  const visibleItems = customerItems.filter((i) => i.category === activeCategory);

  const pesiMassimiItems = customerItems.filter((i) => i.category === 'bbq');
  // Evento: l'Orto Cattivo (unico item `panini` del menu evento) sta coi classici, dopo i Pesi Massimi.
  const eventVegPanini = eventMode ? customerItems.filter((i) => i.category === 'panini') : [];
  const eventSandwiches = [...pesiMassimiItems, ...eventVegPanini];
  const eventSide = eventMode ? customerItems.find((i) => i.id === EVENT_SIDE_ITEM_ID) ?? null : null;

  // FALLO PESANTE — regola corretta dopo rimozione Krombacher (correzione Eros 2026-09-22):
  // catalogo reale delle birre a scelta incluse nel combo, le 6 bottiglie rimaste (Krombacher
  // esclusa). Filtro per tag `birre-v1`, non per id fisso.
  const falloPesanteSide = menuItems.find((i) => i.id === FALLO_PESANTE_INCLUDED_SIDE_ID) ?? null;
  const falloPesanteBeerOptions = menuItems.filter(
    (i) => i.category === 'birre' && i.tags?.includes('birre-v1'),
  );
  // Navigazione (Fase 3.4): niente home, la pagina e' sempre il menu con le linguette. Le linguette
  // NON aggiungono voci di history (replaceState): il tasto indietro del telefono non deve
  // attraversare le categorie. Cambio linguetta = pagina in alto, cosi' la prima locandina si vede
  // sotto le chip sticky. replaceState tiene `history.state.category` allineato per il reload.
  // Restyling hero: la hero sta in cima, quindi "in alto" non e' piu' la pagina intera ma l'inizio del
  // menu (sotto la hero, dove stanno le linguette). Se il cliente e' gia' piu' in alto, non si sposta.
  const menuStartRef = useRef(null);
  const scrollToMenuStart = (behavior = 'auto') => {
    const top = menuStartRef.current ? menuStartRef.current.getBoundingClientRect().top + window.scrollY : 0;
    if (window.scrollY > top || behavior === 'smooth') window.scrollTo({ top, behavior });
  };
  const selectCategoryTab = (category) => {
    setActiveCategory(category);
    window.history.replaceState({ view: 'menu', category }, '', '/kitchen');
    scrollToMenuStart();
  };

  // Il listener popstate vive per tutta la vita del componente ma deve leggere
  // lo stato corrente, non quello catturato al mount.
  const cartOpenRef = useRef(cartOpen);
  const activeCategoryRef = useRef(activeCategory);
  const cartCountRef = useRef(0);
  const exitArmedRef = useRef(false);
  const exitTimerRef = useRef(null);
  const [exitHint, setExitHint] = useState(false);
  cartOpenRef.current = cartOpen;
  activeCategoryRef.current = activeCategory;
  cartCountRef.current = orderItems.length;

  // Sacco: salva lo scroll all'apertura e lo rimette alla chiusura. Il back reale del telefono
  // riporta la pagina in cima (hero): cosi' il cliente resta dove era. Il secondo scrollTo (rAF)
  // copre il browser che ripristina lo scroll dell'entry DOPO l'evento popstate.
  const cartScrollYRef = useRef(null);
  useEffect(() => {
    if (cartOpen) {
      cartScrollYRef.current = window.scrollY;
      return undefined;
    }
    const y = cartScrollYRef.current;
    if (y == null) return undefined;
    cartScrollYRef.current = null;
    window.scrollTo({ top: y });
    const raf = window.requestAnimationFrame(() => window.scrollTo({ top: y }));
    return () => window.cancelAnimationFrame(raf);
  }, [cartOpen]);

  useEffect(() => {
    if (window.location.pathname !== '/kitchen') return undefined;

    // Stack voluto: [entry radice, entry menu]. Il primo "indietro" dal menu cade sulla radice:
    // se il sacco non e' vuoto lo intercettiamo (guard leggero, vedi handlePopState).
    // Al rientro su /kitchen (back da /kitchen/status) l'entry ripristinata e' quella del menu
    // (non radice): va adottata, non duplicata. Vecchie entry { view: 'home'|'categories' } -> menu.
    const restored = window.history.state;
    if (restored?.view && !restored.root) {
      if (restored.category && CATEGORIES.some((c) => c.key === restored.category)) {
        setActiveCategory(restored.category);
      }
      window.history.replaceState({ view: 'menu', category: restored.category }, '', '/kitchen');
    } else {
      window.history.replaceState({ view: 'menu', root: true }, '', '/kitchen');
      window.history.pushState({ view: 'menu', category: activeCategoryRef.current }, '', '/kitchen');
    }

    const handlePopState = (event) => {
      if (window.location.pathname !== '/kitchen') return;

      // Con il drawer aperto il back lo chiude e basta (gesture standard per una
      // bottom sheet): rimettiamo la entry appena consumata cosi' la schermata
      // sotto non si muove.
      if (cartOpenRef.current) {
        setCartOpen(false);
        window.history.pushState({ view: 'menu', category: activeCategoryRef.current }, '', '/kitchen');
        return;
      }

      const state = event.state;
      if (state?.root) {
        // Sacco non vuoto: il primo indietro non esce, avvisa; il secondo (entro 3s) esce davvero.
        if (cartCountRef.current > 0 && !exitArmedRef.current) {
          exitArmedRef.current = true;
          setExitHint(true);
          window.history.pushState({ view: 'menu', category: activeCategoryRef.current }, '', '/kitchen');
          clearTimeout(exitTimerRef.current);
          exitTimerRef.current = setTimeout(() => {
            exitArmedRef.current = false;
            setExitHint(false);
          }, 3000);
          return;
        }
        // Sacco vuoto o secondo indietro: l'entry radice e' solo un cuscinetto, si esce davvero.
        window.history.back();
        return;
      }
      if (state?.category && CATEGORIES.some((c) => c.key === state.category)) {
        setActiveCategory(state.category);
      }
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearTimeout(exitTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `baseId`: id reale da inviare a Supabase (`itemId`, vedi handleSubmit). Per la
  // maggior parte dei prodotti coincide con `id`; FALLO PESANTE con birra scelta
  // (BEER SPRINT V1 Fase E) usa un `id` composito solo per distinguere le righe
  // carrello per birra, ma `baseId` resta il vero id del combo — vedi
  // PesiMassimiSection.jsx per il razionale completo.
  const pushCartItem = (item) => {
    setOrderItems((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        return prev.map((o) => o.id === item.id ? { ...o, qty: o.qty + 1 } : o);
      }
      return [...prev, { id: item.id, baseId: item.baseId || item.id, name: item.name, price: item.price, qty: 1, image: item.image, includesBeerId: item.includesBeerId }];
    });
  };

  // Thumbnail che "vola" verso il sacco: parte dall'ultimo punto di tap (pointerdown) e
  // arriva sull'icona del carrello. Solo se il prodotto ha un'immagine e le coordinate
  // sono disponibili; altrimenti resta il feedback toast + pulse.
  const spawnFlyer = (item) => {
    const origin = pointerRef.current;
    const target = cartIconRef.current?.getBoundingClientRect();
    if (!origin || !target || !item.image) return;
    flyerSeqRef.current += 1;
    const id = `fly-${flyerSeqRef.current}`;
    setFlyers((prev) => [...prev, {
      id,
      image: item.image,
      fromX: origin.x,
      fromY: origin.y,
      dx: target.left + target.width / 2 - origin.x,
      dy: target.top + target.height / 2 - origin.y,
    }]);
    window.setTimeout(() => setFlyers((prev) => prev.filter((f) => f.id !== id)), 700);
  };

  // Punto unico di add-to-cart (scheda prodotto, drawer, pairing, FALLO PESANTE):
  // aggiunge al sacco e fa partire il feedback visivo.
  const addItem = (item) => {
    pushCartItem(item);
    setAddedToast({ name: item.name });
    setCartPulse(true);
    spawnFlyer(item);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setAddedToast(null), 1200);
    pulseTimerRef.current = window.setTimeout(() => setCartPulse(false), 600);
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

  // Quantità per id nel sacco (stepper − N + delle locandine; carrello ripristinato da localStorage incluso).
  const qtyById = useMemo(() => Object.fromEntries(orderItems.map((o) => [o.id, o.qty])), [orderItems]);

  const total = orderItems.reduce((sum, o) => sum + o.price * o.qty, 0);
  const itemCount = orderItems.reduce((sum, o) => sum + o.qty, 0);
  // Evento: niente birre in menu, quindi nessun suggerimento birra nel sacco.
  const recommendedBeer = eventMode ? null : findRecommendedBeer(orderItems, menuItems);
  // Evento: chip patate inline (non modale).
  const showSideChip = eventMode && shouldSuggestEventSide({
    cartIds: orderItems.map((o) => o.baseId || o.id),
    sandwichIds: eventSandwiches.map((i) => i.id),
    sideAvailable: Boolean(eventSide) && eventSide.available !== false && eventSide.price != null,
    dismissed: sideChipDismissed,
  });

  const handleSubmit = async (lane) => {
    if (orderItems.length === 0 || submitting || submitLockRef.current) return;
    // KITCHEN_OPEN_CLOSE_V1: difesa in profondità — il bottone è già disabilitato quando la
    // cucina è chiusa, ma un client stale (tab aperta prima della chiusura) potrebbe arrivare
    // comunque qui. La RPC rifiuta comunque con 'kitchen_closed'; questo blocco evita solo la
    // chiamata inutile e mostra subito il messaggio corretto.
    if (!kitchenOpen) {
      setOrderError('LA CUCINA È CHIUSA — NON PUOI INVIARE ORDINI ORA');
      return;
    }
    // Nome e "dove lo mangi" restano obbligatori, senza default silenziosi: se manca qualcosa
    // nessun ordine viene creato e il cliente viene portato sul primo campo mancante.
    const missing = checkoutMissing({ name: customerName, fulfillmentType });
    if (missing.length > 0) {
      setOrderError(null);
      setCheckoutIssue((prev) => ({ field: missing[0], seq: (prev?.seq ?? 0) + 1 }));
      return;
    }
    const nickname = normalizeCustomerName(customerName);
    setCustomerName(nickname);
    saveSession(session.table, nickname);
    setCheckoutIssue(null);
    submitLockRef.current = true;
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
      paidAt: null,
      fulfillmentType,
      // S5: la creazione passa dalla v2. Lo status (banco/online) lo decide e lo restituisce il
      // server; `clientRequestId` resta lo stesso per lo stesso carrello, così un retry dopo un
      // errore di rete non crea un secondo ordine.
      paymentLane: lane,
    };
    newOrder.clientRequestId = getOrCreateClientRequestId(cartFingerprint(newOrder));
    // "ORDINE PRESO" è mostrato solo se addOrder() conferma una persistenza server reale
    // (id/order_code arrivano dalla RPC): se fallisce, il carrello resta intatto per il retry
    // e non viene mai mostrato un ordine fantasma (F02 — Phantom Order).
    const result = await addOrder(newOrder);
    if (!result.ok) {
      // La cucina puo' essere stata chiusa nel frattempo (race tra apertura pagina e submit): la
      // RPC alza 'kitchen_closed', il messaggio resta specifico invece del generico "riprova".
      // Carrello e client_request_id restano com'erano per il retry.
      setOrderError(onlineErrorMessage(result.error, 'Ordine non inviato — riprova'));
      setSubmitting(false);
      submitLockRef.current = false;
      return;
    }
    const createdOrder = result.order;
    // Unico punto in cui il sacco viene svuotato in automatico: ordine confermato dal server.
    // Su fallimento (sopra) il carrello resta intatto, com'e' sempre stato.
    clearCart();
    // Ordine creato: il client_request_id di questo carrello ha finito il suo lavoro.
    clearClientRequestId();
    try { localStorage.setItem('walbox_kitchen_last_order_id', createdOrder.id); } catch { /* storage non disponibile: la prova primaria resta rememberOwnedOrderId */ }
    // P0 privacy (2026-09-16): registra l'ordine come proprio di QUESTO dispositivo. È l'unica
    // prova di proprietà che /kitchen/status accetta — senza, la pagina mostra l'empty state,
    // mai l'ordine di un altro cliente.
    rememberOwnedOrderId(createdOrder.id);
    // Ordine al banco (scelto, o già tale per idempotenza): lo status mostra subito il codice.
    if (createdOrder.status === 'pending_counter_payment') rememberCounterPaymentChoice(createdOrder.id);

    const payableTotal = createdOrder.total;

    // L'esito vero è lo status restituito dal server (idempotenza: "vince il primo"), non la
    // corsia cliccata. Solo un POP scelto come online avvia SumUp; ogni altro caso va allo status.
    if (resolveCreateOutcome(createdOrder.status, lane) === 'start_online') {
      try {
        const started = await startSumupCheckout(createdOrder.id, payableTotal);
        if (started.kind === 'redirect') {
          // Si lascia `submitting` attivo: la pagina sta per cambiare, i bottoni restano spenti.
          window.location.assign(started.url);
          return;
        }
        if (started.kind === 'reloading') return; // scheda vecchia (I-6): si sta ricaricando
      } catch (err) {
        // L'ordine esiste già: lo status offre RIPROVA / PAGA AL BANCO.
        console.warn('[Walbox] avvio pagamento online fallito, si passa allo status', err);
      }
    }

    setSubmitting(false);
    submitLockRef.current = false;
    navigateToOrderStatus(createdOrder.id);
  };

  useEffect(() => {
    if (cartOpen && orderItems.length === 0) setCartOpen(false);
  }, [orderItems.length, cartOpen]);

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
    <div className="kitch-page kitch-page--poster">
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

      {/* Testata (restyling hero): logo originale al centro, menu a sinistra (porta alle linguette),
          carrello a destra con il numero dei pezzi (apre lo stesso sacco del dock in basso). */}
      <header className="kh-brand">
        <button
          type="button"
          className="kh-brand-btn kh-brand-btn--menu"
          aria-label="Vai alle categorie del menu"
          onClick={() => {
            scrollToMenuStart('smooth');
            document.querySelector('.kp-chip.is-active')?.focus({ preventScroll: true });
          }}
        >
          <svg viewBox="0 0 28 24" width="28" height="24" aria-hidden="true">
            <path d="M1 3h26M1 12h26M1 21h26" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" fill="none" />
          </svg>
        </button>
        <img
          src="/assets/kitchen/walrus-pub-logo-nero.webp"
          alt="The Walrus Pub · Food & Drink"
          width="1120"
          height="155"
          className="kh-brand-img"
        />
        <button
          type="button"
          className="kh-brand-btn kh-brand-btn--cart"
          aria-label={itemCount > 0 ? `Apri il sacco: ${itemCount} nel sacco` : 'Il sacco è vuoto'}
          disabled={itemCount === 0}
          onClick={() => setCartOpen(true)}
        >
          <svg viewBox="0 0 32 28" width="30" height="26" aria-hidden="true">
            <path d="M1 2h5l3.2 15h15.6L28 7H8M12 24.2a1.6 1.6 0 1 0 0-.01M23 24.2a1.6 1.6 0 1 0 0-.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          {itemCount > 0 && <span className="kh-brand-badge" aria-hidden="true">{itemCount}</span>}
        </button>
      </header>

      <MenuHero onDiscover={() => { selectCategoryTab('panini'); scrollToMenuStart('smooth'); }} />
      <div ref={menuStartRef} aria-hidden="true" />
      {eventMode && <AnniversaryBanner />}
      {exitHint && (
        <div className="kh-exit-hint" role="status">Hai un ordine in corso. Tocca ancora indietro per uscire.</div>
      )}

      {/* ── MENU COMPLETO ── */}
      <>
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

      {/* Testata categoria da manifesto (mockup B): kicker, titolo Anton su 2 righe, sottotitolo,
          timbro "TUTTI x €" dove il prezzo è unico. Vale anche per PESI MASSIMI (Fase 3.4b). */}
      {(() => {
        const [line1, line2] = getPosterTitle(activeCategory);
        // Panini: il numero nella battuta del mockup ("Sette panini...") segue i panini realmente a menu.
        const NUM_WORDS = ['Zero', 'Un', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci'];
        const sub = activeCategory === 'panini' && NUM_WORDS[visibleItems.length] && visibleItems.length > 1
          ? `${NUM_WORDS[visibleItems.length]} panini, nessuno timido. Scegli con la pancia.`
          : getCategorySubtitle(activeCategory);
        const prices = visibleItems.map((i) => i.price);
        const uniquePrice = visibleItems.length >= 2
          && prices.every((pr) => pr != null && pr !== '' && pr === prices[0]);
        return (
          <header className={`kp-head${uniquePrice ? ' kp-head--stamp' : ''}`}>
            {!kitchenOpen && <div className="kp-kicker">The Walrus · Cucina chiusa</div>}
            <h1 className="kp-title">
              {line1}
              {line2 && ' '}
              {line2 && <em>{line2}</em>}
            </h1>
            {sub && <p className="kp-sub">{sub}</p>}
            {uniquePrice && (
              <div className="kp-stamp" aria-label={`Tutti ${formatPrice(prices[0])}`}>
                <span aria-hidden="true">Tutti<br />{formatPrice(prices[0])}</span>
              </div>
            )}
          </header>
        );
      })()}

      {/* Menu items */}
      {activeCategory === 'bbq' && visibleItems.length > 0 && (
        <PesiMassimiSection
          items={eventMode ? [...visibleItems, ...eventVegPanini] : visibleItems}
          onAdd={addItem}
          hideCombo={eventMode}
          featuredTag={eventMode ? 'anniversario' : null}
          includedSide={falloPesanteSide}
          beerOptions={falloPesanteBeerOptions}
          onRemove={removeItem}
          qtyById={qtyById}
        />
      )}
      {activeCategory === 'panini' && visibleItems.length > 0 && (
        <PaniniSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {activeCategory === 'cicchetti' && visibleItems.length > 0 && (
        <CicchettiSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {activeCategory === 'insalatone' && visibleItems.length > 0 && (
        <InsalatoneSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {activeCategory === 'tartare' && visibleItems.length > 0 && (
        <TartareSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {activeCategory === 'birre' && visibleItems.length > 0 && (
        <BirreSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {activeCategory === 'tagliere' && visibleItems.length > 0 && (
        <TagliereSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {activeCategory === 'bevande' && visibleItems.length > 0 && (
        <BevandeSection items={visibleItems} onAdd={addItem} onRemove={removeItem} qtyById={qtyById} />
      )}
      {visibleItems.length === 0 && (
        <div className="kitch-menu-empty">NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA</div>
      )}
      {activeCategory !== 'bbq' && activeCategory !== 'panini' && activeCategory !== 'cicchetti' && activeCategory !== 'insalatone' && activeCategory !== 'tartare' && activeCategory !== 'birre' && activeCategory !== 'tagliere' && activeCategory !== 'bevande' && visibleItems.length > 0 && visibleItems.every((item) => item.available === false) && (
        <div className="kitch-menu-soldout-banner">AL MOMENTO È TUTTO ESAURITO</div>
      )}
      {activeCategory !== 'bbq' && activeCategory !== 'panini' && activeCategory !== 'cicchetti' && activeCategory !== 'insalatone' && activeCategory !== 'tartare' && activeCategory !== 'birre' && activeCategory !== 'tagliere' && activeCategory !== 'bevande' && (
      <div className="ct-list">
        {visibleItems.map((item, index) => (
          <PosterCard
            key={item.id}
            item={item}
            index={index}
            qty={qtyById?.[item.id] ?? 0}
            onAdd={addItem}
            onRemove={removeItem}
            compact
          />
        ))}
      </div>
      )}
      </>

      {/* Feedback add-to-cart: toast breve + thumbnail che vola verso il sacco. */}
      {addedToast && (
        <div
          className="kitch-add-toast"
          data-testid="add-to-cart-toast"
          role="status"
          style={showSideChip ? { bottom: 'calc(168px + env(safe-area-inset-bottom))' } : undefined}
        >
          {addedToast.name && <span className="kitch-add-toast-name">{addedToast.name.toUpperCase()}</span>}
          <span className="kitch-add-toast-text"> aggiunto al sacco ✓</span>
        </div>
      )}
      {flyers.map((f) => (
        <img
          key={f.id}
          src={f.image}
          alt=""
          aria-hidden="true"
          className="kitch-fly-thumb"
          style={{ left: f.fromX, top: f.fromY, '--fly-dx': `${f.dx}px`, '--fly-dy': `${f.dy}px` }}
        />
      ))}

      {itemCount > 0 && (
        <>
          <div className="kitch-bottom-spacer" style={showSideChip ? { height: 160 } : undefined} />
          <div className="kitch-bottom-bar">
            {showSideChip && (
              <EventSideChip
                item={eventSide}
                onAdd={() => { setSideChipDismissed(true); addItem(eventSide); }}
                onDismiss={() => setSideChipDismissed(true)}
              />
            )}
            {/* Dock "biglietto da bancone" (mockup B): una sola barra rossa a bordo tratteggiato.
                Stessa azione di prima (apre il sacco); solo markup/aspetto cambiano. */}
            <div className={`kitch-bottom-card kb-wrap${cartPulse ? ' kitch-bottom-card--pulse' : ''}`}>
              <button
                type="button"
                className="kitch-btn-vai kb-ticket"
                onClick={() => setCartOpen(true)}
              >
                <span ref={cartIconRef}>{itemCount} · Vai alla cassa</span>
                <span>{`${total.toFixed(2).replace('.', ',')} €`}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Backdrop */}
      {cartOpen && <div className="kitch-backdrop" onClick={() => setCartOpen(false)} />}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="kitch-drawer" role="dialog" aria-modal="true" aria-label="Il tuo sacco">
          <div className="kitch-drawer-handle" />
          <div className="kitch-drawer-header">
            <div className="kitch-drawer-title">IL TUO SACCO</div>
            <button className="kitch-drawer-close" onClick={() => setCartOpen(false)} aria-label="Chiudi il sacco">×</button>
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
                  </div>
                  <div className="kitch-drawer-row-price">{formatPrice(o.price, true)}</div>
                  <div className="kitch-drawer-row-controls">
                    <div className="kitch-qty-pill">
                      <button className="kitch-qty-btn" onClick={() => removeItem(o.id)} aria-label={`Togli uno: ${o.name}`}>−</button>
                      <span className="kitch-qty-num">{o.qty}</span>
                      <button className="kitch-qty-btn" onClick={() => addItem(o)} aria-label={`Aggiungi uno: ${o.name}`}>+</button>
                    </div>
                    <button className="kitch-trash-btn" onClick={() => removeAllOfItem(o.id)} aria-label={`Rimuovi dal sacco: ${o.name}`}>
                      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" />
                      </svg>
                    </button>
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
                  +{formatPrice(recommendedBeer.price, true)}
                </button>
              </div>
            )}

            {/* Checkout V2 — un solo schermo: nome (protagonista), dove lo mangi, note cucina e
                corsia di pagamento. Il tap su PAGO ORA / PAGO AL BANCO crea l'ordine (handleSubmit). */}
            <CustomerCheckout
              customerName={customerName}
              onNameChange={setCustomerName}
              fulfillmentType={fulfillmentType}
              onFulfillmentChange={setFulfillmentType}
              note={customerNote}
              onNoteChange={setCustomerNote}
              notesOpen={notesOpen}
              onNotesOpenChange={setNotesOpen}
              submitting={submitting}
              kitchenOpen={kitchenOpen}
              total={total}
              orderError={orderError}
              issue={checkoutIssue}
              onPay={handleSubmit}
            />
          </div>
        </div>
      )}
    </div>
  );
}
