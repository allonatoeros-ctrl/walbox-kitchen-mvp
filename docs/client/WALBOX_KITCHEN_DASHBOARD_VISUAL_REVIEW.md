# Walbox Kitchen - Visual Review Dashboard Staff

Questo documento fornisce una panoramica visiva e funzionale della Dashboard Staff (V1), pensata per spiegare l'operatività di cassa e cucina.

## Elenco Screenshot Creati
Le immagini di riferimento si trovano nella cartella `docs/client/screenshots/`:
- `01-dashboard-overview.png`: Vista generale all'apertura (dipende dagli ordini attivi).
- `02-vista-bancone.png`: Vista dedicata al personale di sala/cassa.
- `03-vista-cucina.png`: Vista dedicata a chi prepara le comande.
- `04-alert.png`: Pannello con gli ordini che richiedono attenzione (es. ritardi).
- `05-storico.png`: Lista degli ordini già consegnati o annullati.
- `06-menu.png`: Gestione rapida delle disponibilità dei prodotti.

## Cosa Vede il Bancone
Nella **Vista Bancone**, lo staff visualizza principalmente due categorie di ordini:
1. **Da Pagare**: Ordini inseriti dai chioschi che prevedono il pagamento in cassa. L'operatore può confermare l'avvenuto pagamento.
2. **Pronti**: Ordini che la cucina ha terminato di preparare, pronti per essere consegnati al cliente.

## Cosa Vede la Cucina
Nella **Vista Cucina**, il personale visualizza esclusivamente gli ordini attivi già pagati o confermati. L'interfaccia è pulita e mostra i prodotti da preparare. Quando un ordine è completato, la cucina lo marca come "Pronto", spostandolo automaticamente nella coda del bancone per la consegna.

## Significato degli Stati Ordine
- **In attesa di pagamento** (`pending_counter_payment`): Ordine creato, ma fermo finché non viene saldato al bancone.
- **Ricevuto** (`received`): L'ordine è confermato e appare in cucina per la preparazione.
- **Pronto** (`ready`): La preparazione è terminata. Il cliente viene avvisato (se previsto) e il bancone può procedere alla consegna.
- **Ritirato/Consegnato** (`delivered`): L'ordine è stato fisicamente consegnato al cliente. Passa nello storico.
- **Annullato** (`cancelled`): L'ordine è stato cancellato (per errore, cliente non presentatosi, ecc.).

## Timer, Alert, Note e Allergie
- **Timer**: Ogni ordine attivo ha un contatore che indica da quanti minuti è in preparazione.
- **Alert**: Se un ordine supera i 10 minuti di attesa, viene segnalato automaticamente nella tab ALERT, evidenziando le criticità.
- **Note e Allergie**: Vengono mostrate in rosso o in modo molto visibile direttamente sulle card dell'ordine in cucina, per garantire la massima attenzione durante la preparazione.

## Cosa Deve Controllare lo Staff Durante il Servizio
- **Bancone**: Deve smaltire rapidamente la coda dei "Da pagare" e consegnare prontamente gli ordini "Pronti".
- **Cucina**: Deve concentrarsi sui ticket attivi, marcando come pronti gli ordini completati per mantenere il flusso.
- **Insieme**: Entrambi i team devono tenere d'occhio i badge in alto (es. alert rossi) e la tab ALERT per intervenire sugli ordini bloccati. La tab MENU permette inoltre di bloccare rapidamente la vendita di prodotti esauriti.

## Cosa Resta Fuori dalla V1
- Pagamenti digitali integrati (gestiti manualmente tramite cassa).
- Gestione automatica del magazzino e tracking preciso delle scorte in tempo reale (la disponibilità è ON/OFF manuale).
- Statistiche avanzate e reportistica di vendite (focus sulla gestione operativa).
- Assegnazione ordini a operatori specifici.
