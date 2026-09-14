# Walbox Kitchen — Pilot Night Checklist

> Aggiornato: 2026-06-24
> Versione: V1-P6 (flusso bancone/ritiro, Supabase dual-write)

---

## 1. Automated Check

Eseguire **prima di ogni serata pilot** dalla macchina di sviluppo:

```bash
npm run pilot:check
```

### Cosa fa:
1. Verifica che `.env.local` esista e contenga `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
2. Verifica connettività Supabase (GET anonimo, nessuna scrittura)
3. Esegue `npm run build` (build pulita)
4. Esegue `npm run test:e2e` (21 test Playwright su porta 5174)

### Risultato atteso:

```
── Node.js
  ✓ PASS  Node version (18.x.x o superiore)

── .env.local
  ✓ PASS  .env.local exists

── Environment variables
  ✓ PASS  VITE_SUPABASE_URL is set
  ✓ PASS  VITE_SUPABASE_ANON_KEY is set

── Supabase connectivity
  ✓ PASS  Supabase endpoint reachable (HTTP 200)

────────────────────────────────────────────
  Preflight: 5 passed, 0 failed
  PREFLIGHT OK — proceeding to build and E2E tests.

✓ Build passed
✓ 21 tests passed
```

### Se fallisce:
- `FAIL .env.local` → controlla che il file esista nella root del progetto
- `FAIL VITE_SUPABASE_*` → aggiungi le variabili in `.env.local`
- `FAIL Supabase endpoint` → controlla connessione internet o stato Supabase dashboard
- `FAIL Build` → `npm run build` separatamente per vedere l'errore
- `FAIL E2E` → `npm run test:e2e:ui` per vedere qual test fallisce

**Non partire se `npm run pilot:check` non è verde.**

---

## 2. Supabase Manual Check

Accedere a [supabase.com](https://supabase.com) → progetto Walbox.

### Tabelle richieste (verificare che esistano e siano accessibili):
- `kitchen_orders` — ordini Kitchen
- `kitchen_menu_items` — menu items
- `staff_users` — account staff (o tabella auth configurata)

### Verifica RLS:
- Anon può leggere `kitchen_menu_items` → `SELECT` aperto ✓
- Anon non può scrivere ordini senza auth
- Staff autenticato può fare `INSERT` / `UPDATE` su `kitchen_orders`

### Account staff:
- Creare o verificare almeno 1 account staff su Supabase Auth
- Email: `staff@thewalrus.it` (o email concordata)
- Password: comunicata verbalmente al team, non scritta qui
- Verificare login su `/kitchen/staff` PRIMA della serata

---

## 3. QR Code Manual Check

Il QR cliente Kitchen punta direttamente al menu (Kitchen non ha tavoli):

```
https://<dominio-prod>/kitchen
```

### Verifica:
- Scansionare il QR con iPhone (Safari)
- Verificare che il menu si apra direttamente su `/kitchen`, senza passare per nessuna form nome/tavolo

---

## 4. Device Reali

### iPhone cliente (customer flow):
- [ ] `/kitchen` si apre e carica il menu direttamente
- [ ] Ordine completabile in meno di 90 secondi
- [ ] `/kitchen/status` mostra stato aggiornato
- [ ] CTA verde "IL TUO ORDINE È PRONTO" visibile quando status = `ready`
- [ ] Notifica vibrazione funziona (se implementata)

### Tablet / PC staff (kitchen/counter flow):
- [ ] `/kitchen/staff` richiede login → staff si autentica correttamente
- [ ] Tab BANCONE mostra ordini `pending_counter_payment`
- [ ] Bottone PAGATO funziona → ordine passa a `received`
- [ ] Tab CUCINA mostra ordini `received` e `preparing`
- [ ] Bottone INIZIA e PRONTO funzionano
- [ ] Tab BANCONE mostra ordini `ready` con bottone RITIRATO
- [ ] Tab ALERT mostra ordini lenti dopo 10 min
- [ ] Tab MENU permette di marcare item esauriti

### Rete del locale:
- [ ] Wi-Fi funzionante in tutte le zone tavoli
- [ ] Staff e cliente sulla stessa rete o entrambi con accesso internet
- [ ] Sync cross-device verificata: ordine creato da cliente visibile su dashboard staff entro 5 secondi

---

## 5. Go / No-Go

### ✅ GO — si parte se:
- `npm run pilot:check` → tutti PASS
- Staff riesce a loggarsi su `/kitchen/staff`
- Almeno 1 QR funziona end-to-end (cliente → ordine → staff vede ordine)
- Wi-Fi stabile in sala

### 🛑 NO-GO — rimandare se:
- `npm run pilot:check` fallisce su env o Supabase
- Staff non riesce ad autenticarsi
- Nessun QR funziona
- Ordine cliente non appare mai nel dashboard staff
- Build fallisce

---

## 6. Fallback Serata

### Se sync cross-device non funziona (ordini non arrivano a staff):
1. Verificare connessione internet su entrambi i device
2. Ricaricare la pagina staff (`F5` o pull-to-refresh)
3. Se Supabase è down: **attivare modalità locale** — gli ordini sono salvati in localStorage e visibili riaprendo `/kitchen/staff` sullo stesso device del cliente
4. In extremis: ordini verbali al bancone, Kitchen in pausa

### Se staff non riesce a loggarsi:
1. Verificare credenziali su Supabase Auth dashboard
2. Resettare password da Supabase dashboard → "Send password reset email"
3. Fallback: usare il bypass E2E solo in sviluppo (`VITE_E2E_BYPASS_STAFF_AUTH=true`), **mai in produzione**

### Se QR sbagliato / rotto:
1. Rimandare il link corretto `/kitchen` via WhatsApp al tavolo
2. Aggiornare il QR fisico dopo la serata

### Se menu non si aggiorna (item esauriti non visibili ai clienti):
1. Staff toglie manualmente dalla tab MENU
2. Verificare sync Supabase `kitchen_menu_items`
3. In fallback: comunicare verbalmente al bancone

---

> Questo file è parte del repository Walbox. Non contiene segreti o credenziali.
> Aggiornare dopo ogni serata pilot con le lezioni apprese.
