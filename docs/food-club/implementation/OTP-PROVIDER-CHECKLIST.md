# OTP / SMS — checklist di collaudo provider (Food Club V1)

_Creato: 2026-11-09 (sessione cloud). Nessun SMS inviato da Claude. Ogni passo con il provider reale è un gate di Eros._
Codice: `src/lib/foodClubOtp.js` (flusso e traduzione errori, test `src/lib/foodClubOtp.test.js`),
`src/hooks/useFoodClubIdentity.js`, `src/components/foodclub/PhoneOtpForm.jsx`, `normalizeItalianPhone` in
`src/lib/foodClubRules.js`. Server: `food_club_verified_phone()` accetta solo `phone_confirmed_at` valorizzato.

## 0. Decisioni prima di iniziare (NEEDS_DECISION, Eros)
- D-10/D-16: fornitore SMS (Twilio, MessageBird, Vonage, Textlocal… tra quelli supportati da Supabase Auth) e budget
  mensile. Stima da fare con Eros: iscrizioni attese × (1 SMS + reinvii) + accessi da nuovo telefono.
- Mittente: alfanumerico ("WALRUS") o numero. In Italia il mittente alfanumerico va registrato presso il fornitore
  (tempi variabili): verificare con il fornitore scelto.
- Testo SMS (template Supabase Auth, `{{ .Code }}`): proposta «Walrus Food Club: il tuo codice è {{ .Code }}. Non
  condividerlo.» (max 160 caratteri GSM, niente emoji per non passare a UCS-2).

## 1. Configurazione Supabase Auth (progetto di produzione, solo Eros dal dashboard)
| Voce | Valore atteso | Perché |
|---|---|---|
| Phone provider | abilitato con il fornitore scelto | senza, `signInWithOtp` → `phone_provider_disabled` (app: «Gli SMS non sono attivi…») |
| **Confirm phone** | **attivo** | **bloccante per il lancio**: senza, `phone_confirmed_at` non prova il possesso del numero |
| OTP expiry | 300–600 s (proposta 600) | il codice deve sopravvivere a un SMS in ritardo, non di più |
| OTP length | 6 | `PhoneOtpForm` ha 6 caselle; `confirmOtp` rifiuta lunghezze ≠ 6 |
| Rate limit SMS | default Supabase (proposta: lasciare) | il client mostra «Troppi SMS…» su 429 / `over_sms_send_rate_limit` |
| Intervallo minimo reinvio | 60 s | coincide con il conto alla rovescia del form |
| Anonymous sign-ins | attivo (già usato da Kitchen) | il flusso `phone_change` mantiene lo stesso uid |
| Secure phone change | da verificare | se richiede OTP anche sul vecchio numero, il flusso anonimo→numero cambia |
| Numeri di test (`Test Phone Numbers`) | solo in staging, mai in produzione | in produzione aggirerebbero la verifica |
| CAPTCHA | NEEDS_DECISION | protegge dal pompaggio SMS (costi); se attivo, il client va adattato (oggi non passa `captchaToken`) |

## 2. Prove con un numero di Eros (dopo §1, una per riga, annotare data/ora ed esito)
| # | Prova | Atteso | Esito |
|---|---|---|---|
| 1 | Telefono nuovo, nessun ordine → numero → SMS | SMS entro 30 s, testo corretto, mittente corretto | |
| 2 | Codice giusto | accesso, iscrizione possibile, `phone_confirmed_at` valorizzato | |
| 3 | Codice sbagliato | «Codice sbagliato o scaduto», caselle svuotate | |
| 4 | Codice dopo la scadenza (attendere OTP expiry) | «Codice sbagliato o scaduto» | |
| 5 | Codice già usato (riusarlo dopo un accesso riuscito) | rifiutato | |
| 6 | «Mandamelo di nuovo» prima dei 60 s | pulsante non disponibile (conto «0:59»…) | |
| 7 | 5 reinvii ravvicinati dopo i 60 s | al superamento del limite: «Troppi SMS…», nessun crash | |
| 8 | Il codice del 1° SMS dopo un reinvio | atteso: rifiutato (vale l'ultimo); annotare il comportamento reale | |
| 9 | Ordine da anonimo, poi iscrizione con numero nuovo | stesso uid: ordine e notifiche restano | |
| 10 | Stesso numero da un secondo telefono con un ordine anonimo | accesso con `sms`, biglietto di unione, ordine passa al membro | |
| 11 | Numero fisso o estero | bloccato nell'app («Usa un cellulare italiano»), nessun SMS | |
| 12 | Modalità aereo durante l'invio | «Connessione assente…» | |
| 13 | iPhone: suggerimento del codice sopra la tastiera (`autocomplete=one-time-code`) | il tocco riempie le 6 caselle | |
| 14 | Android: incolla del codice | le 6 caselle si riempiono | |
| 15 | Costo: dashboard del fornitore dopo le prove | numero SMS = numero invii fatti | |

## 3. Cosa è già verificato e cosa no
- **PASS LOCALE Mac** (GoTrue locale, numeri di prova): invio, verifica, codice errato, 429, input non valido,
  `phone_exists`, iscrizione con consensi.
- **PASS cloud 2026-11-09** (unit, Auth finto): normalizzazione solo cellulari, traduzione errori GoTrue (429 e numero
  non valido non diventano più «codice sbagliato»; nuovi messaggi per provider spento, invio fallito, rete),
  scelta `phone_change`/`sms`, biglietto di unione riscattato solo dopo la verifica, conto alla rovescia.
- **NON DIMOSTRATO**: SMS reale, scadenza e consumo reali del codice, comportamento con «Secure phone change», costo.
