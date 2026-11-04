# Rapporto SMS OTP per Walbox (Supabase phone auth) - letto il 2026-11-04
Legenda: [V] verificato su fonte letta oggi; [D] dedotto; NV = NON VERIFICATO.
Nota: WebFetch riassume le pagine con un modello piccolo, quindi anche i [V] vanno ricontrollati a mano prima di pagare.

## 1. Fornitori Supabase e Send SMS Hook
[V] Fornitori nativi (https://supabase.com/docs/guides/auth/phone-login): MessageBird (oggi Bird), Twilio (Programmable Messaging e Verify), Vonage, TextLocal (community). WhatsApp solo con Twilio/Twilio Verify. Config da Dashboard > Auth > Providers (hosted).
[V] Send SMS Hook (https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook): sostituisce l'invio SMS di Supabase; Supabase passa utente + OTP al tuo codice, tu invii con qualsiasi fornitore; risposta 200 vuota = ok. Due forme: funzione Postgres (2 s max, errori non ritentati) o endpoint HTTP/Edge Function (5 s inclusi i retry, retry su 429/503 fino a 3, payload max 20KB) (https://supabase.com/docs/guides/auth/auth-hooks).
[V] Piani: pagina pricing Supabase elenca "send custom email/SMS" sia in Free sia in Pro (https://supabase.com/pricing); la pagina auth-hooks dice Free e Pro.

## 2. Prezzi per SMS verso +39
| Fornitore | Prezzo | Minimo/canone | Integrazione | Fonte |
|---|---|---|---|---|
| Twilio Programmable Messaging | [V] $0,0927/segmento (+$0,001 se fallito) | nessun canone listato; sender/numero NV | nativa | https://www.twilio.com/en-us/sms/pricing/it (2026-11-04) |
| Twilio Verify | [V] $0,05/verifica riuscita + canale SMS. Il canale $0,0083 e' tariffa USA; canale Italia NV ([D] circa $0,09, quindi totale ~$0,14 per verifica riuscita) | nessun minimo; sconti da 100k/mese | nativa (Verify) | https://www.twilio.com/en-us/verify/pricing |
| Vonage | NV (pagina 403/404) | NV | nativa | - |
| Bird/MessageBird | NV (pagina non raggiungibile). Stime di terzi 5-10 centesimi: non affidabili | NV | nativa | - |
| Plivo (extra) | [V] $0,086 TIM/Vodafone/Wind, $0,0926 ho./Coop/spusu | nessun minimo listato | hook | https://www.plivo.com/sms/pricing/it/ |
| SMSBOX (FR, extra) | [V] EUR 0,079 (pack 250 = EUR 19,75), 0,0747 (500 = 37,36), 0,0715 (950 = 67,95) IVA esclusa; crediti validi 12 mesi, senza abbonamento | pack minimo ~235-250 SMS | hook | https://www.smsbox.net/en/pricing-sending-sms-it |
| Skebby (IT) | NV. Fonti datate: da EUR 25 per 500 SMS "Basic"; abbonamenti da EUR 29/mese per 500 SMS. Pagina prezzi ufficiale non letta | ricarica da ~EUR 25 (dato vecchio) | hook; API REST developers.skebby.it | ricerca web, non ufficiale |
| Aruba SMS, OVH, Brevo, ClickSend | NV (pagine 404 o nessun prezzo Italia trovato) | NV | hook | - |

## 3. Costi/limiti propri di Supabase
[V] Limite SMS di default: 30 SMS/ora per progetto (non per utente), configurabile in Auth > Rate Limits o Management API `rate_limit_sms_sent` (https://supabase.com/docs/guides/auth/rate-limits). Rischio: un picco del giovedi' con piu' di 30 accessi/ora si blocca (429); alzarlo ma con captcha.
[V] Invio OTP: finestra minima 60 s per utente (default); `/otp` limitato per IP 30 per 5 minuti; `/verify` 30 per 5 min per IP. OTP scade dopo 1 ora di default (phone-login doc).
[V] MAU: Free 50.000, Pro 100.000, poi $0,00325/MAU (https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users). Irrilevante per Walbox.
[V, ATTENZIONE] La pagina pricing mostra "Phone auth (Advanced MFA - Phone)": non incluso nel Free, $75/mese primo progetto (Pro/Team) (https://supabase.com/pricing; https://supabase.com/docs/guides/auth/auth-mfa/phone). La doc dice che e' il costo di Phone MFA e NON chiarisce se copra anche il login con telefono. NV: da chiarire con Supabase support o provando su un progetto di test (non in produzione) prima di decidere. Se il login via telefono richiedesse i $75/mese, pesa molto piu' degli SMS.
[V] CAPTCHA: hCaptcha e Cloudflare Turnstile, da Dashboard > Auth > Bot and Abuse Protection (https://supabase.com/docs/guides/auth/auth-captcha). La pagina cita sign-in/sign-up/reset; non cita il phone OTP esplicitamente, ma la doc phone-login raccomanda il captcha per limitare i costi SMS. Piano: NV.

## 4. Italia: mittente alfanumerico
[V parziale] Delibera AGCOM 12/23/CIR (2023) introduce il Registro Alias: l'alias va registrato su https://alias.agcom.it prima dell'uso; chi registra deve essere iscritto al ROC (ricerca web, non letta la delibera). Guida: https://alias.agcom.it/docs/guida_registrazione_alias.pdf (NON letta). Notizie: blocco del traffico estero annullato da tribunale (2024), sanzioni 2025 poi annullate: situazione in movimento. Nessuna delibera 2024 trovata.
[V] SMSBOX: il mittente personalizzato va "dichiarato e validato in anticipo".
NV: tempi e documenti per "WALRUS". [D] In pratica registra il fornitore italiano per conto del cliente; l'alias va dichiarato dalla societa' (serve P.IVA/ROC o passare da un fornitore gia' autorizzato). Senza alias il messaggio parte da numero generico: funziona, e' la scelta piu' semplice per V1. Chiedere al fornitore scelto la procedura e i tempi per iscritto.

## 5. Anti-abuso
| Protezione | Dove | Inclusa nel prezzo |
|---|---|---|
| CAPTCHA Turnstile/hCaptcha | Supabase Dashboard > Auth > Bot and Abuse Protection + site key nel frontend (V) | Turnstile gratuito [D]; piano Supabase NV |
| Rate limit SMS/ora progetto, per IP, per utente | Dashboard > Auth > Rate Limits (V) | si' |
| Intervallo minimo 60 s (`max_frequency`) | default 60 s (V); nome `max_frequency` in config.toml per self-host/CLI [D], non citato nella pagina letta | si' |
| Scadenza OTP | default 1 ora (V); [D] meglio ridurla a 5-10 min | si' |
| Solo +39 | Twilio Console > Messaging > Settings > Geo Permissions, solo da console, modifiche immediate, errore 21408 sui paesi bloccati; nessuna tariffa menzionata (V) https://www.twilio.com/docs/messaging/guides/sms-geo-permissions. Con hook: filtro `phone.startsWith('+39')` nel codice [D] | si' |
| Verify Fraud Guard | incluso nella tariffa base Verify (V) | si' |
| Tetto spesa | Twilio usage triggers / ricarica manuale prepagata [D] | - |

## 6. Stima mensile (solo SMS, prezzi V; USD salvo dove indicato)
| SMS/mese | Twilio Prog. Messaging | Twilio Verify (D, ~$0,14) | Plivo via hook | SMSBOX via hook (EUR) |
|---|---|---|---|---|
| 100 | $9,27 | ~$14 | ~$8,6 | ~7,9 (pack 250 = 19,75 una tantum, validita' 12 mesi) |
| 300 | $27,8 | ~$42 | ~$25,8 | ~23,7 |
| 600 | $55,6 | ~$84 | ~$51,6 | ~44,8 |
Skebby, Vonage, Bird: NV. Aggiungere eventuale costo Supabase phone (NV, vedi punto 3) e IVA.

## 7. Raccomandazione [D, basata su quanto sopra]
Principale V1: Twilio Programmable Messaging nativo in Supabase. Motivo: integrazione senza codice (credenziali in Dashboard), prezzo noto e verificato ($0,0927), Geo Permissions per bloccare tutto tranne l'Italia. A 100-600 SMS costa ~$9-56/mese. Verify costa circa 50% in piu' ma da' Fraud Guard automatico; solo se temi il pumping piu' che il costo.
Alternativa: fornitore italiano/EU via Send SMS Hook (Edge Function ~30 righe): Skebby (da verificare prezzo e alias) o SMSBOX/Plivo, circa 15% in meno e alias WALRUS gestito in Italia. Costa piu' lavoro e manutenzione.
Sempre: Turnstile + rate limit SMS tarato (es. 60/ora) + Geo Permissions +39 + tetto di spesa.
Da fare prima di decidere: (1) chiarire se il login telefono richiede l'add-on $75/mese; (2) leggere la guida AGCOM alias; (3) prezzi ufficiali Vonage/Bird/Skebby con un account o un commerciale (non fatto: vietato creare account).
