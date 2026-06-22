# WALBOX — IF REBUILD BLUEPRINT
> Usare solo se l'audit decide REBUILD.  
> Obiettivo: creare nuovo progetto pulito senza perdere il valore già costruito.

---

## Principio

Rebuild non significa ricominciare da zero mentalmente.

Significa:

```text
nuovo contenitore pulito + logica utile migrata + legacy lasciato fuori
```

---

## Nome progetto consigliato

Opzioni:

```text
walbox-venue-os-v1
walbox-kitchen-v1
walbox-service-os-v1
```

Consigliato:

```text
walbox-venue-os-v1
```

Perché mantiene la direzione futura senza perdere la priorità Kitchen.

---

## Scope nuovo progetto V1

Costruire solo:

- customer QR menu;
- customer order flow;
- customer order status;
- staff login;
- staff dashboard;
- kitchen/KDS dashboard;
- menu availability;
- storico ordini;
- report giornaliero base;
- basic TV/live channel placeholder, se già utile al Walrus;
- Supabase integration pulita.

Non costruire ora:

- payment API;
- loyalty;
- quiz;
- mission night;
- CRM;
- POS/fiscale;
- magazzino;
- multi-locale complesso.

---

## Architettura consigliata

```text
src/
  app/
    router/
    providers/
  features/
    customer-menu/
    customer-order-status/
    staff-dashboard/
    kitchen-display/
    menu-management/
    daily-report/
    venue-tv/
  shared/
    components/
    hooks/
    utils/
    styles/
  lib/
    supabase/
    auth/
  data/
    mock/
  tests/
```

---

## Route consigliate

```text
/                         landing/internal redirect
/kitchen                  customer QR menu
/kitchen/status/:orderId  customer order status
/staff/login              staff login
/staff                    staff dashboard
/tv                       venue live channel
```

---

## Modello dati minimo V1

```text
Venue
MenuItem
MenuCategory
MenuAvailability
Order
OrderItem
OrderStatus
PaymentStatusManual
StaffUser
StaffAction
DailyReport
```

PaymentStatusManual non è payment provider.

Serve solo per:

```text
pay_at_counter / paid_manual / unpaid / cancelled
```

---

## Migrazione dal repo attuale

Prima di creare codice nuovo, Claude deve produrre una tabella:

| Asset/logica | File origine | Migrare? | Motivo | Rischio |
|---|---|---:|---|---|

Categorie da valutare:

- componenti customer menu;
- componenti order status;
- staff dashboard;
- hooks Supabase;
- auth staff;
- Playwright tests;
- kitchen assets;
- Walrus TV assets;
- CSS/design tokens;
- mock data utili.

---

## Criteri per copiare codice

Copiare solo se:

- è già testato;
- è leggibile;
- ha confini chiari;
- non porta legacy inutile;
- non richiede mezzo repo per funzionare.

Riscrivere se:

- componente troppo grande;
- CSS troppo accoppiato;
- stato confuso;
- Supabase/localStorage mischiati;
- route vecchie integrate male.

---

## Stop condition rebuild

Non creare nuovo progetto finché non esistono:

1. audit repo attuale;
2. decisione REBUILD motivata;
3. migration map;
4. architettura target;
5. lista file da copiare;
6. lista file da lasciare fuori;
7. approvazione Eros.

---

## Prompt operativo per Claude — Rebuild Blueprint Phase

```md
Modalità REBUILD BLUEPRINT ONLY.
Non creare nuovo progetto.
Non scrivere codice.
Leggi `00_CLAUDE_START_HERE.md`, `02_DECISION_MATRIX.md` e `04_IF_REBUILD_BLUEPRINT.md`.
Produci:
1. architettura target;
2. migration map dal repo attuale;
3. lista cosa copiare;
4. lista cosa riscrivere;
5. lista cosa lasciare fuori;
6. primo comando/procedura per creare il progetto, ma senza eseguirlo.
Fermati per approvazione.
```
