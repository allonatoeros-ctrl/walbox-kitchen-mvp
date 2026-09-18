# WALBOX KITCHEN — CUSTOMER PAYMENT & ORDER LIFECYCLE CHECKPOINT

**Data:** 2026-09-18  
**Stato:** DECISIONI RACCOLTE / NON ANCORA IMPLEMENTATO  
**Scope:** Customer payment flow + SumUp recovery + customer active orders + staff queue cleanup  
**Next gate:** audit read-only del flusso corrente prima di modificare codice

---

## 1. Obiettivo

Correggere il lifecycle cliente/staff degli ordini Kitchen, in particolare:

- scelta del metodo di pagamento;
- gestione SumUp non completato;
- pulizia degli ordini chiusi;
- visibilità persistente del codice ordine;
- supporto a più ordini attivi dello stesso cliente/account.

Non introdurre nuovi stati ordine se quelli esistenti sono sufficienti.

---

## 2. Nuovo flow pagamento cliente

### Flow desiderato

```text
CARRELLO
→ CONFERMA ORDINE
→ COME VUOI PAGARE?
   ├─ PAGA IN CASSA
   └─ PAGA ONLINE
```

### A. PAGA IN CASSA

```text
ordine creato
→ pending_counter_payment
→ messaggio chiaro: VAI IN CASSA
→ staff conferma pagamento
→ received
```

### B. PAGA ONLINE

```text
ordine creato
→ scelta PAGA ONLINE
→ SumUp Hosted Checkout
→ pagamento confermato
→ received
→ cliente vede ORDINE RICEVUTO
```

La scelta del metodo deve avvenire **prima della normale pagina di tracking/stato ordine**.

---

## 3. SumUp abbandonato / non concluso

### Problema corrente

```text
ordine creato
→ cliente apre SumUp
→ pagamento non completato
→ ordine resta pending/appeso
→ UI può mostrare stato non sincronizzato
→ cliente rimane con ordine attivo senza recovery chiaro
```

### Comportamento richiesto

Un pagamento SumUp non concluso NON deve lasciare il cliente bloccato.

Lo stato cliente deve diventare esplicito:

```text
PAGAMENTO NON COMPLETATO
```

Azioni disponibili:

- RIPROVA SUMUP
- PAGA IN CASSA
- ANNULLA ORDINE, se previsto dal prodotto

Il Payment Hub può mantenere più payment attempt per lo stesso ordine.

---

## 4. Ordine annullato dallo staff

Scenario:

```text
ordine arriva a pending_counter_payment
→ cliente non paga
→ staff annulla ordine
→ status = cancelled
```

Regola:

### Cliente
- l'ordine deve sparire dalla coda attiva;
- deve sparire la CTA "Vai al tuo ordine";
- non deve restare come ordine pendente/appeso.

### Staff
- l'ordine `cancelled` deve sparire dalla coda operativa;
- può restare solo nello STORICO come ordine annullato.

### Regola generale

```text
ATTIVI:
pending_counter_payment
received
preparing
ready

CHIUSI:
delivered
cancelled
```

Gli ordini CHIUSI non devono apparire nelle code operative attive.

---

## 5. Ordine ritirato / delivered

Quando lo staff porta un ordine a:

```text
delivered
```

il cliente non deve più vedere:

- ordine nella coda attiva;
- "Vai al tuo ordine";
- indicatori che facciano pensare che esista ancora un ordine aperto.

Può eventualmente essere visibile solo in uno storico futuro, fuori dallo scope operativo corrente.

---

## 6. Codice ordine sempre grande e visibile

Problema:

dopo la conferma il codice ordine può perdere visibilità o sparire.

Decisione UX:

> Il codice ordine è il riferimento principale del cliente e deve restare sempre grande, leggibile e dominante fino alla chiusura dell'ordine.

Deve essere chiaramente visibile durante:

```text
pending_counter_payment
received
preparing
ready
```

Esempio:

```text
W-8F1T2

IN PREPARAZIONE
```

Solo con:

```text
delivered
cancelled
```

l'ordine esce dalla coda attiva.

---

## 7. Più ordini dallo stesso account

Un cliente/account può avere più ordini contemporaneamente.

Non deve esistere un solo "ordine corrente" che sostituisce il precedente.

La UI deve mostrare gli ordini attivi:

```text
W-8F1T2
IN PREPARAZIONE

W-9K4P7
PRONTO AL RITIRO

W-2M6Q1
VAI IN CASSA
```

Regole:

- uno sotto l'altro;
- codice grande per ciascun ordine;
- stato indipendente;
- CTA indipendente quando necessaria;
- `delivered` e `cancelled` vengono rimossi dalla lista attiva.

---

## 8. Cosa NON cambiare senza evidence

Non partire da:

- nuovi stati ordine;
- redesign del Payment Hub;
- nuovo backend pagamenti;
- modifica architetturale SumUp non necessaria;
- DB migration prima dell'audit;
- deploy/push diretto.

L'architettura corrente possiede già:

```text
pending_counter_payment
received
preparing
ready
delivered
cancelled
```

e Payment Hub supporta payment attempt multipli.

---

## 9. Acceptance criteria

### AC1 — scelta pagamento
Dopo "Conferma ordine" compare chiaramente:

```text
PAGA IN CASSA
PAGA ONLINE
```

### AC2 — SumUp success
Pagamento SumUp completato:

```text
→ payment confirmed
→ received
→ ordine visibile normalmente
```

### AC3 — SumUp abandon
Pagamento SumUp non completato:

```text
→ niente loop/non-sync senza uscita
→ recovery visibile
→ retry / cassa / eventuale annullamento
```

### AC4 — staff cancel
Staff annulla un ordine non pagato:

```text
→ sparisce dalla coda cliente
→ sparisce dalla coda operativa staff
→ resta eventualmente nello storico
```

### AC5 — delivered
Ordine ritirato:

```text
→ sparisce dagli ordini attivi cliente
→ sparisce "Vai al tuo ordine"
```

### AC6 — order code
Per ogni ordine attivo:

```text
CODICE ORDINE sempre grande e visibile
```

### AC7 — multi-order
Due o più ordini dello stesso cliente:

```text
→ tutti visibili contemporaneamente
→ uno sotto l'altro
→ stati indipendenti
```

---

## 10. Prossima mossa

### Fase 1 — AUDIT READ-ONLY

Verificare nel repo corrente:

1. dove viene creato l'ordine;
2. quando avviene il redirect a `CustomerOrderStatus`;
3. come viene memorizzato l'ordine cliente;
4. come funziona oggi "Vai al tuo ordine";
5. come vengono filtrati `delivered` e `cancelled`;
6. cosa succede al ritorno da SumUp senza pagamento;
7. come viene determinato il `non sync`;
8. come la dashboard staff filtra gli ordini attivi;
9. se l'attuale storage cliente supporta già più order ID.

Output dell'audit:

```text
CURRENT FLOW
ROOT CAUSE per ciascun bug
FILES TO CHANGE
DB CHANGE REQUIRED: YES/NO
RISKS
IMPLEMENTATION PLAN MINIMO
```

Solo dopo l'audit si passa alla patch.
