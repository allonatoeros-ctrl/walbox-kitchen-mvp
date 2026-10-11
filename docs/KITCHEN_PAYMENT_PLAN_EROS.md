Sì. Il piano originale per la “cassa” non era semplicemente aggiungere SumUp. Era costruire un vero lifecycle pagamenti a due corsie: banco oppure online, senza mai confondere soldi e stato dell’ordine.
Il problema che volevamo risolvere era questo: oggi un ordine, un tentativo di pagamento e quello che vede lo staff possono divergere. Il piano stabilisce invece una regola netta: SumUp decide cosa è successo ai soldi; Walbox decide cosa può succedere all’ordine. Redirect/webhook non bastano: il pagamento online deve essere verificato server-side. WALBOX_KITCHEN_PAYMENT_HANDOFF_…
Il flusso finale che avevamo pensato
CLIENTE CONFERMA ORDINE
        ↓
COME VUOI PAGARE?
        │
        ├── PAGA AL BANCO
        │      ↓
        │ pending_counter_payment
        │      ↓
        │ staff lo vede subito
        │      ↓
        │ incasso banco
        │      ↓
        │ received
        │
        └── PAGA ONLINE
               ↓
          pending_online_payment
               ↓
          staff NON lo vede
               │
               ├── PAID verificato → received → staff lo vede
               ├── FAILED → riprova online
               ├── PASSA AL BANCO → pending_counter_payment
               ├── abbandonato → payment_abandoned
               └── stato incerto → rimane nascosto
Questa è proprio la state machine target del piano. WALBOX_KITCHEN_PAYMENT_HANDOFF_…
Piano totale S0 → S7
Fase
Cosa fa
Stato attuale
S0
Disegno delle regole e delle due corsie
✅ FATTO
S0.5
Hardening sicurezza/pagamenti F1–F7
✅ FATTO
S1
Impedire agli ordini online non pagati di apparire a staff/Solo/TV
✅ FATTO
S2
Nuovi stati DB + idempotenza + trigger di sicurezza
✅ FATTO LOCALMENTE, 54/54 PASS
S3
Nuove RPC e vera state machine DB
⏭️ PROSSIMO BLOCCO
S4
API/server che orchestrano online ↔ banco
🟡 PARZIALE
S5
Nuova esperienza cliente “Come vuoi pagare?”
❌ DA FARE
S6
Chiusura automatica ordini online abbandonati + smoke SumUp
❌ DA FARE
S7
Eliminazione vecchi flussi legacy
❌ PER ULTIMO
Il piano principale è esplicitamente S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7; F1–F7 erano solo un blocco intermedio S0.5, non sostituivano il piano. WALBOX_KITCHEN_PAYMENT_HANDOFF_…
Cosa abbiamo già costruito davvero
S0 — design: deciso che chi sceglie banco resta nella corsia banco; gli online abbandonati diventano payment_abandoned; un pagamento tardivo non va perso; la compatibilità legacy resta temporaneamente; i casi limite possono essere recuperati dal back-office. WALBOX_KITCHEN_PAYMENT_HANDOFF_…
S1 — staff hardening: gli stati online pending sono esclusi dalle superfici operative tramite allow-list; realtime/Solo/Alert/TV sono stati preparati per non far comparire ordini che il locale non deve ancora preparare. WALBOX_KITCHEN_PAYMENT_HANDOFF_…
S0.5 — sicurezza pagamenti: abbiamo già protetto importi, ownership, URL checkout, webhook, timeout, recovery dei checkout duplicati e permessi RPC. L’amount integrity e il grant hardening risultavano applicati anche a Supabase Production; vari hardening applicativi invece erano ancora locali e non deployati. WALBOX_KITCHEN_PAYMENT_HANDOFF_… WALBOX_KITCHEN_PAYMENT_HANDOFF_…
E avevamo già un Payment Hub funzionante con SumUp: Hosted Checkout, webhook, verifica server-side, ledger pagamenti, refund, idempotenza e un E2E sandbox riuscito. WWALBOX_PAYMENT_HUB_SUMUP_ONLIN… WWALBOX_PAYMENT_HUB_SUMUP_ONLIN…
Dove siamo arrivati adesso con S2
Questa è la cosa appena completata.
S2 aggiunge:
pending_online_payment
payment_abandoned
client_request_id
unique index per impedire doppi ordini dello stesso cliente/request
indice sugli online pending
trigger che impedisce transizioni pericolose. kitchen-s2-migration-a-online-p…
E ora non è più solo “scritta”: l’abbiamo testata realmente su PostgreSQL 17.6 con 54/54 PASS. Compatibilità legacy, I1, I2, I3 e unique index sono tutti passati. Production non è stata toccata. kitchen-s2-migration-a-online-p…
Quindi oggi la fotografia corretta è:
FOUNDATION PAYMENT HUB        ✅
SICUREZZA/HARDENING           ✅
S0 DESIGN                     ✅
S1 STAFF VISIBILITY           ✅
S2 DB STRUCTURE               ✅ locale, pronta per Gate Production
S3 DB LIFECYCLE / RPC         ⏭️
S4 API ORCHESTRATION          🟡
S5 CUSTOMER CHECKOUT UX       ❌
S6 ABANDON / E2E              ❌
S7 LEGACY CLEANUP             ❌
Cosa manca perché “la cassa” sia davvero quella che avevamo immaginato
S3 è il pezzo decisivo adesso.
Deve creare/completare la logica che fa davvero funzionare le due corsie:
kitchen_customer_create_order_v2(payment_lane, client_request_id): se banco crea pending_counter_payment; se online crea pending_online_payment; doppio tap → stesso ordine.
kitchen_payment_confirm: un online verificato PAID passa atomicamente pending_online_payment → received.
kitchen_order_switch_to_counter: passaggio sicuro online → banco.
kitchen_order_mark_payment_abandoned: chiusura degli online abbandonati.
E bisogna allineare attempt_start, record_counter e reconciliation. WALBOX_KITCHEN_PAYMENT_HANDOFF_…
Poi S5 porta tutto davanti al cliente:
MENU
→ CONFERMA ORDINE
→ NOME
→ COME VUOI PAGARE?
L’ordine server-side nasce solo dopo che il cliente sceglie banco oppure online.
