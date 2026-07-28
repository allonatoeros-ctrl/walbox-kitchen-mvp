# FANTAWALRUS — PRODUCT DIRECTION & RESEARCH BRIEF V1
id: FANTAWALRUS_PRODUCT_DIRECTION_RESEARCH_BRIEF_V1
project: Walbox / The Walrus Pub
source_type: product-direction + research-brief
status: proposed-direction-for-validation
priority: primary-for-research-run
date: 2026-07-28
owner: Eros + ChatGPT
orchestrator: Hermes
implementation_status: no-code

## 0. Scopo del documento
Blocca una direzione iniziale concreta per il Fantacalcio del Walrus e prepara il lavoro del Research Team Hermes. Non e' ancora una specifica tecnica definitiva e non autorizza la scrittura di codice.

Risponde a 5 domande: (1) che prodotto vogliamo; (2) perche' diverso; (3) come a costo zero/basso; (4) rischi legali/licenza/dati; (5) quali team, ordine, gate.

## 1. Decisione di prodotto proposta — FantaWalrus
Lega stagionale aperta del pub + modalita' Matchday Live (telefono, tavoli, TV).
Equilibrio: 70% competizione reale, 30% spettacolo/ironia/community Walrus.
Non vogliamo: clone Leghe Fantacalcio, gestionale freddo, gioco a singola partita, pay-to-win, dipendenza da API costose, scraping/contenuti non autorizzati.

## 2. Perche' questa direzione
- Lega stagionale: ritorno settimanale, rivalita', community, motivi per tornare, contenuti ricorrenti.
- Matchday Live: punti che cambiano live, sorpassi visibili, confronti tra tavoli, highlight TV, sfottò, coinvolgimento passivo. Riferimenti: Kickbase (live points), FPL (budget/rosa/capitano/trasferimenti/mini-leghe).
- Differenziazione: vivere il fantacalcio nel locale, sui tavoli e sulla TV, come trasmissione del Walrus.

## 3. Pubblico
Primario: clienti abituali, gruppi amici, appassionati calcio/fantacalcio, principianti, iscritti lega.
Secondario: presenti durante partita non iscritti, staff, pubblico TV, community social.
Non-obiettivo: prodotto nazionale/SaaS multi-locale al primo colpo. Prima: lega reale, locale reale, community reale, stagione pilota.

## 4. Modello di gioco proposto
### 4.1 Rosa a budget e disponibilita' multipla
- stesso budget virtuale per squadra; ogni giocatore ha prezzo; stesso calciatore in piu' squadre; limite max giocatori stesso club reale; rosa 15 (11 titolari + 4 riserve); capitano + vice; trasferimenti limitati.
- Perche' non asta: limita iscritti, serve presenza, complessita', ingresso tardivo difficile, complica pilot. Asta = futura lega privata/premium.

### 4.2 Scoring oggettivo (primo MVP)
Eventi verificabili: minuti giocati, gol, assist, clean sheet, parate, rigori parati, rigori sbagliati, ammonizioni, espulsioni, autogol, gol subiti, bonus semplici dichiarati.
NON usare nel primo MVP: voti giornalistici, pagelle proprietarie, algoritmi opachi, scraping piattaforme, >80-100 statistiche difficili.
Principio: ogni punto spiegabile. "Sala VAR" mostra evento, giocatore, variazione, fonte, rettifica, timestamp.

## 5. Game loop
Iscrizione -> creazione squadra -> rosa -> formazione settimanale -> blocco -> Matchday Live -> punteggio provvisorio -> finalizzazione -> classifica -> premi/contenuti Walrus -> giornata successiva.
Frequenza: preparazione giornata, live durante partite, riepilogo dopo, mercato tra giornate, premi settimanali.

## 6. Esperienza utente
- Schermata 1 FantaEntry: QR/link, accesso, nome squadra, stemma fantasy, adesione lega, regole essenziali.
- Schermata 2 La mia squadra: budget, rosa, formazione, panchina, capitano, stato salvata, deadline. Mobile-first, tap semplice, drag-drop solo se affidabile, auto-completamento principianti.
- Schermata 3 Matchday Live: punti provvisori, attivi, eventi recenti, variazione, posizione lega, confronto diretto, stato dati live/provvisorio/definitivo.
- Schermata 4 FantaTV: classifica, sorpassi, miglior giocatore, derby tra tavoli, crollo serata, Wall of Shame, prossimo match, visual leggibile a distanza.
- Staff OS separato: apri/chiudi giornata, vedi squadre, blocco/sblocco formazioni con permessi, correggi solo con evidence, finalizza, gestisci contestazioni, sospendi classifica live, pubblichi highlight TV.

## 7. Elementi distintivi Walrus
- Tavolo Derby: due squadre del locale si affrontano, TV evidenzia.
- Wall of Shame: premi ironici no impatto competitivo (Panchina criminale, Capitano sbagliato, Peggior acquisto, Miracolato, Tricheco d'oro, Crollo del minuto).
- Sala VAR: log pubblico eventi/rettifiche.
- Matchday Broadcast: rotazione editoriale classifica->sorpasso->evento->derby->premio ironico->prossima partita.
- Walrus Cards (futuro, non vertical slice): Morso del Tricheco, Panchina Senza Vergogna, Ultimo Giro. Non pay-to-win, non copiati.

## 8. Strategia zero-costo / basso costo
- Fase 0 Replay locale: costo dati €0. Giocatori/prezzi JSON, giornata passata, eventi registrati, replay temporizzato, classifica mock calcolata realmente, nessuna API live. Obiettivo: validare UX/scoring/TV/divertimento/team Hermes prima di comprare dati.
- Fase 1 Pilot controllato: import manuale eventi, aggiornamento fine partita, API gratuita con caching, nessuna promessa live perfetto.
- Fase 2 Matchday Live reale: provider selezionato, polling controllato, caching server-side, normalizzazione, rettifiche, monitoraggio quota, fallback manuale, costo approvato.

## 9. Modello iscrizione/monetizzazione (NON approvato)
Opzione A gratuita; B quota per servizio/esperienza (non "montepremi"); C sponsorizzazione. Gate legale obbligatorio prima di quota/premi/pagamenti: parere commercialista/legale. MIMIT: concorsi a premio DPR 430/2001, partecipazione gratuita, adempimenti specifici.

## 10. Proprieta' intellettuale e dati
Non scraping Fantacalcio.it; non copiare regolamenti/testi/prezzi/scoring; no foto giocatori senza licenza; no loghi club automatici; stemmi fantasy originali; dati secondo termini provider; registrare fonte/timestamp/versione. Naming da validare: FantaWalrus / La Walrus Fanta League (disponibilita' dominio/social, conflitto marchio Fantacalcio®, alternative originali).

## 11. Primo vertical slice
8-16 squadre test, 1 giornata passata, roster/prezzi statici, formazione, replay eventi, calcolo reale punti, classifica live, FantaTV. Non incluso: pagamento, premi economici, API live, mercato completo, push, multi-locale, statistiche avanzate, asta, sponsor automation, app nativa.
Definition of Success: nuovo utente crea squadra senza spiegazione; rosa/formazione valida; capisce perche' punteggio cambia; TV leggibile; gruppo test vuole continuare; staff/Eros gestiscono giornata; zero dati pagati; nessun blocco legale/tecnico non dichiarato.

## 12. Architettura iniziale proposta (non decisione definitiva)
Walbox web app: FantaEntry, FantaTeam, FantaMatchday, FantaTV, FantaStaff.
Supabase: leagues, fantasy_teams, fantasy_rosters, lineups, fixtures, football_events, scoring_events, standings, audit_log.
Data Adapter: mock-replay provider, manual provider, future live API provider.
Principio: motore punteggio indipendente da provider. Formato evento interno: {"event_id","fixture_id","player_id","type","minute","source","source_timestamp","status":"provisional"}. Cambio API senza riscrivere il gioco.

## 13. Team necessari (ruoli, non agenti permanenti)
1. Market & Competitor Research; 2. Game Design Research; 3. Data/API Intelligence; 4. Legal & Business Research; 5. Creative Experience Research; 6. Technical Feasibility; 7. QA / Red Team.

## 14. Team operativo per fase (max 3 ruoli attivi)
Fase A Discovery: Product + Research + Legal/Data. Fase B Product Decision: Product + Game Design + Creative. Fase C Technical Design: Architecture/Dev + Data/API + QA. Fase D Vertical Slice: Dev + Creative + QA. Fase E Pilot: Coordinator + QA serata + Staff/Product.
Eros = approval authority (scope, regole, budget, file critici, DB, env/secrets, commit/push/deploy, provider API, pagamenti, premi, comunicazione).

## 15. Mandato Research Team Hermes
Validare/correggere/smentire la direzione senza costruire. Domande: ibrido stagionale+live e' migliore? cosa crea ritorno locale? (il brief prosegue con ulteriori domande da rispondere nella synthesis).

## 21. Verdetto iniziale
DIRECTION: GO_TO_RESEARCH. PRODUCT: FantaWalrus. MODEL: seasonal league + Matchday Live. POSITIONING: competition + pub entertainment. FIRST BUILD: zero-cost replay vertical slice. CURRENT PHASE: research and decision. CODE: NOT AUTHORIZED.

## Riferimenti esterni citati nel brief
- API-Football pricing: Free 100 req/giorno; Pro 19 USD/mese 7.500 req/giorno. https://www.api-football.com/pricing/
- API-Football guida/rate limit: https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage ; https://www.api-football.com/news/post/how-ratelimit-works
- Supabase pricing: Free 50.000 MAU, 500 MB DB, 2M messaggi Realtime, 500.000 Edge Function. https://supabase.com/pricing
- Vercel pricing: Hobby 0 USD personale/non commerciale; Pro da 20 USD/mese. https://vercel.com/pricing ; https://vercel.com/docs/plans/hobby
- MIMIT manifestazioni a premio: https://www.mimit.gov.it/it/mercato-e-consumatori/concorrenza-e-commercio/manifestazioni-a-premio ; /concorsi-a-premio
- Fantacalcio® Termini giugno 2026: https://www.fantacalcio.it/termini-e-condizioni
