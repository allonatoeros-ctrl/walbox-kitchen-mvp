# WALRUS FOOD CLUB V1 — Rapporto F0 (prerequisiti)

_2026-11-04 · F0 approvata da Eros, F1 NON approvata · nessuna modifica a produzione, migration, push o deploy._
Prove solo su uno stack Supabase locale **isolato** (`walbox-f0-auth`, porte +1000, fermato a fine prova; repo e stack del
repo non toccati). Evidenze in `f0/`: `RAPPORTO-F0-AUTH.md`, `out.txt`, `run.mjs`, `20261104000000_f0_schema.sql`
(schema di prova, NON è una migration del progetto), `RAPPORTO-SMS.md`.
Legenda: **V** = verificato (prova o codice) · **D** = dedotto/proposta.

## Verdetto: PARZIALE

Sul piano tecnico la regola D-6 si può realizzare con Supabase. Restano da verificare su produzione due cose: l'opzione
"Confirm phone" e il costo del login con telefono. Senza queste verifiche F3 non può partire.

| # | Verifica | Esito | Sintesi |
|---|---|---|---|
| 1 | Come funziona oggi Anonymous Auth | PASS (V) | 4 punti del client chiamano `signInAnonymously()` (`useKitchenOrders.js:588`, `useOrderPaymentFlow.js:64`, `usePromoPassIssue.js:26`, `useWebPushSubscription.js:78`). Ordini, push e promo pass sono legati a `customer_id = auth.uid()`. Il config locale del repo ha gli anonimi **spenti** (`enable_anonymous_sign_ins = false`): non coincide con la produzione. |
| 2 | Conversione anonimo → telefono verificato (locale) | PASS (V) | `updateUser({phone})` + `verifyOtp(type 'phone_change')`: **stesso uid**, `is_anonymous=false`, ordini e push restano suoi, il JWT è aggiornato senza refresh (E1, E2, E6). |
| 3 | Secondo dispositivo, stesso numero | PASS (V) | `signInWithOtp` + `verifyOtp(type 'sms')` sul dispositivo B danno lo **stesso uid** e vedono ordini e tessera. Le due sessioni restano attive insieme (E3). |
| 4 | Migration locali/remote (sola lettura) | PASS (V) | `migration list --linked`: 71 su 71 allineate, nessuna solo locale o solo remota. La v3 (`20261028121000`) e la retention (`20261030140000`) **sono in produzione**. |
| 5 | Fornitori SMS, costi, anti-abuso | PARZIALE | Twilio nativo $0,0927/SMS verso +39 (V, pagina ufficiale). Gli altri prezzi in parte non verificati. Dubbio aperto: la voce Supabase "Advanced MFA – Phone" a $75/mese (vedi §2). |
| 6 | Preservare ordini, notifiche e dati | PASS con condizioni | Stesso dispositivo: nulla da copiare (stesso uid). Altro dispositivo: ordini anonimi uniti con il "biglietto di unione" (E4, V). Restano 3 punti da progettare (§3). |
| 7 | Riesame D-1…D-12 | FATTO | §4: 3 decisioni chiuse, 4 nuove. |

## 1. Problemi trovati

| ID | Problema | Gravità | Stato |
|---|---|---|---|
| P1 | Con `[auth.sms] enable_confirmations = false` (il valore del config del repo), `updateUser({phone})` su un anonimo **assegna il numero senza OTP** (run 1, V in locale). Chiunque potrebbe prendersi il numero di un altro, e il vero proprietario riceverebbe poi `phone_exists`. Viola la regola "nessun accesso ai premi altrui". | **Bloccante** | Da controllare in produzione (Dashboard → Auth → Phone → "Confirm phone"). Da qui non si legge. |
| P2 | Su un dispositivo anonimo, `updateUser` con un numero già registrato fallisce con HTTP 422 `phone_exists` "A user with this phone number has already been registered" (V). Il client deve gestire il caso passando all'accesso con OTP (`signInWithOtp`). | Media | Gestibile nel flusso (§3). |
| P3 | Un `signInWithOtp` fatto su un dispositivo anonimo crea un utente nuovo o accede a quello esistente. Gli ordini dell'anonimo restano orfani e non c'è un'unione automatica (E7, V). | Media | Soluzione: biglietto di unione (E4, V). |
| P4 | Il biglietto di unione è un **segreto al portatore**: un altro utente con telefono verificato che lo intercetta entro 10 minuti può riscattarlo (E5d, V). | Media | Soluzione proposta, non provata: legare il biglietto all'hash del numero che si sta verificando e accettarlo solo se coincide con `auth.users.phone` di chi lo riscatta. |
| P5 | Il client non si aggiorna se cambia utente: `useKitchenOrders.js:827-831` rifà il caricamento su `SIGNED_IN` solo se prima non c'era sessione. La lista `LS_OWNED_IDS_KEY` in localStorage resta del vecchio uid (V, dal codice). | Media | Da sistemare in F3/F4: dopo il cambio di uid ricaricare ordini e tessera e riassociare la push. |
| P6 | Limite Supabase di default: 30 SMS/ora per progetto (dedotto dalla documentazione). Un giovedì affollato può arrivare all'errore 429. | Media | Alzare il limite in produzione (gate Eros) insieme a CAPTCHA e blocco dei prefissi non +39. |
| P7 | Push con lo stesso `endpoint` passata dall'anonimo all'utente telefono: **non provata**. Dal codice la RPC `kitchen_push_subscription_claim` riassegna l'endpoint al nuovo proprietario (audit, V solo da lettura). | Bassa | Prova E2E locale in F3. |
| P8 | L'anonimo d'origine resta in `auth.users` dopo l'unione. La retention lo cancella da sola dopo 90 giorni, perché non ha più ordini (D). Il suo vecchio token resta valido fino alla scadenza. | Bassa | Accettabile: sul dispositivo la sessione viene sostituita. |

Rischio già noto, ora **chiuso**: la retention cancella solo gli utenti con `is_anonymous = true`
(`20261030140000…:101-115`, V). Un membro col telefono verificato non è più anonimo e non viene cancellato.

## 2. SMS: costi e anti-abuso (dettaglio in `f0/RAPPORTO-SMS.md`)

| Fornitore | Prezzo verso +39 | Integrazione | Fonte |
|---|---|---|---|
| Twilio Programmable Messaging | $0,0927/SMS | nativa Supabase | V |
| Twilio Verify | $0,05/verifica + SMS (≈ $0,14 totale) | nativa | totale D; Fraud Guard incluso |
| Plivo | ≈ $0,086/SMS | Send SMS Hook | V |
| SMSBOX | €0,079/SMS (pacchetto 250) | Send SMS Hook | V |
| Skebby, Vonage, Bird, Aruba | non verificati | hook / nativa | — |

Costo stimato (solo SMS, Twilio): 100 SMS ≈ $9, 300 ≈ $28, 600 ≈ $56 al mese.
**Da chiarire prima di scegliere:** la pagina prezzi Supabase elenca "Advanced MFA – Phone" a $75/mese. Probabilmente
riguarda solo il secondo fattore (MFA) e non il login con telefono (D, non verificato). Va confermato col supporto
Supabase o con la documentazione del piano attuale.
Anti-abuso proposto: CAPTCHA Turnstile su Supabase Auth, solo prefissi +39 (Geo Permissions di Twilio), limite SMS/ora
tarato sul giovedì, un invio ogni 60 s per numero, scadenza OTP abbassata (es. 5-10 min), tetto di spesa sul fornitore.
Mittente "WALRUS": serve la registrazione nel Registro Alias AGCOM (tempi e requisiti non verificati). Per la V1 si usa
il mittente generico del fornitore.

## 3. Flusso proposto per identità e dati (per F3, non implementato)

1. **Primo accesso, numero nuovo**: l'anonimo corrente fa `updateUser({phone})` + OTP `phone_change`. Lo uid resta lo
   stesso, quindi ordini, push e promo pass restano senza copiare nulla (V).
2. **Numero già registrato** (`phone_exists`) o **dispositivo nuovo**: se il dispositivo ha una sessione anonima con
   ordini, prima si chiama `create_merge_ticket(phone)`, con il biglietto tenuto solo in memoria. Poi `signInWithOtp` +
   OTP `sms`, che porta allo uid del membro (V). Infine `redeem_merge_ticket`, che sposta ordini e push
   dell'anonimo nella stessa transazione (V, con il legame al numero di P4 ancora da provare).
3. **Ordini precedenti all'iscrizione**: vengono associati solo se `customer_id` = uid membro, oppure se sono passati
   col biglietto. Mai tramite `order_code` o nickname. Se generano timbri retroattivi è la **D-13**.
4. **Precondizioni di produzione (gate Eros, F3)**: "Confirm phone" attivo, provider SMS configurato, CAPTCHA, limiti
   SMS, anonimi lasciati attivi.

## 4. Riesame D-1…D-12 con le regole confermate

| ID | Stato | Nota |
|---|---|---|
| D-1 PCP mai pagato | APERTA | Invariata. Proposta: nessun rilascio automatico; pannello di fine servizio. |
| D-2 Rimborso dopo l'uso | APERTA | Proposta: riaccredito con la scadenza originale. |
| D-3 Ordine col buono dà il timbro? | APERTA | Le regole confermate non lo dicono. Proposta: sì, con il food calcolato prima dello sconto (il buono va comunque su un ordine ≥ 12 €). |
| D-4 Timbro di benvenuto | APERTA → **dipende da D-14** | Esiste solo con "Porta un amico", che non è nelle regole confermate. |
| D-5 MENU food+bevanda | APERTA | Serve per sapere se un ordine arriva a 10/12 € di food. |
| **D-6 Cambio dispositivo** | **CHIUSA** | Identità = telefono verificato; recupero automatico obbligatorio in V1 (fattibile: §3). |
| D-7 Serata del timbro | APERTA | "Serate diverse" confermato. Proposta: `created_at`, serata 06:00→06:00 Europe/Rome. |
| D-8 Misurazione | APERTA | Invariata. |
| **D-9 Soglie ed economia** | **CHIUSA** | 2 visite ≥ 10 € in serate diverse entro 30 gg → buono 5 €; uso su un ordine successivo ≥ 12 € di food. |
| D-10 Fornitore SMS | QUASI CHIUSA | Proposta: Twilio nativo. Mancano il chiarimento sui $75 e il budget mensile. |
| D-11 Testi e privacy | APERTA, più ampia | Ora si raccoglie anche il **numero di telefono**: informativa e base giuridica da rivedere col legale. |
| D-12 Campagna 2 (50 €) | APERTA | Non è nelle regole confermate. Proposta: fuori dalla V1. |
| **Ordini dello staff esclusi** | **CHIUSA** | Già nel piano: colonna `source` scritta dalla RPC (F1). |
| **Nessun doppio uso** | **CHIUSA** | Già nel piano: indici unici + UPDATE condizionato + test di concorrenza (F2). |

**Nuove decisioni (NEEDS_DECISION):**
- **D-13** Gli ordini pagati **prima** dell'iscrizione generano timbri? Proposta: sì, ma solo quelli entro i 30 giorni
  precedenti, dello stesso uid (o passati col biglietto), creati dal cliente e pagati.
- **D-14** "Porta un amico" resta nella V1? Proposta: rimandarlo alla V2 (meno superficie di abuso al lancio).
- **D-15** Il cliente cambia **numero di telefono**: in V1 nessun cambio self-service; ci pensa lo staff su richiesta.
  Da decidere anche il rischio di un numero riassegnato dall'operatore a un'altra persona.
- **D-16** Budget SMS mensile e tetto di spesa (es. 50 €/mese) e chi gestisce l'account del fornitore SMS.

## 5. Prossimi passi (solo con nuova approvazione)

1. Eros verifica sul dashboard di produzione "Confirm phone" e il piano Supabase (voce $75), e decide D-13…D-16 e le
   aperte.
2. Poi Gate 1 di F1 (base dati): la prova del biglietto legato al numero (P4) va nei test locali di F1/F3.

Modello/effort: F1 a subagent Sonnet medium con brief completo; F2 e F3 (soldi, identità) in sessione principale con
`/effort high`.
