import './KitchenPrivacy.css';

// Informativa privacy cliente (GDPR art. 13) — Fase 1 privacy, 2026-10-30. Pagina statica, nessuna
// chiamata di rete. I dati del titolare NON sono inventati: restano segnaposto `[[DA COMPILARE: ...]]`
// (classe kpv-todo, evidenziati in giallo) finché Eros non li fornisce. Testo da far rivedere a un
// consulente privacy prima della pubblicazione definitiva.
const Todo = ({ children }) => <span className="kpv-todo">[[DA COMPILARE: {children}]]</span>;

export default function KitchenPrivacy() {
  return (
    <main className="kpv" data-testid="kitchen-privacy">
      <div className="kpv-wrap">
        <a className="kpv-back" href="/kitchen">← Torna al menu</a>
        <h1>INFORMATIVA PRIVACY</h1>
        <p className="kpv-updated">Ordini dal telefono · The Walrus Pub · aggiornata al 30 ottobre 2026</p>

        <h2>CHI TRATTA I TUOI DATI</h2>
        <p>
          Il titolare del trattamento è il locale: <Todo>ragione sociale, P.IVA, indirizzo, email</Todo>.
        </p>

        <h2>QUALI DATI USIAMO</h2>
        <ul>
          <li><strong>Nome o nickname</strong> che scrivi nel checkout: serve per chiamarti quando l'ordine è pronto e compare sulla TV del locale.</li>
          <li><strong>Note per la cucina</strong>, se le scrivi.</li>
          <li><strong>Allergie e intolleranze</strong> che scegli di scrivere nelle note: sono dati relativi alla salute, facoltativi e forniti da te. Li usiamo solo per preparare il tuo ordine, li vede solo la cucina/lo staff e vengono cancellati con le note dopo 30 giorni. Nel dubbio avvisa anche il personale.</li>
          <li><strong>Ordine e importi</strong>: piatti, quantità, totale, orario di ritiro, stato del pagamento.</li>
          <li><strong>Pagamento online</strong>: lo gestisce SumUp. Il locale non vede né conserva i dati della tua carta, riceve solo l'esito del pagamento.</li>
          <li><strong>Sessione anonima</strong>: un identificativo tecnico, senza email né password, che ci permette di collegare l'ordine al tuo telefono.</li>
          <li><strong>Notifiche push</strong>, solo se le attivi: l'indirizzo tecnico del tuo browser per avvisarti quando l'ordine è pronto.</li>
          <li><strong>Memoria del browser</strong> (localStorage): ricorda il tuo carrello e i tuoi ordini su questo telefono. Non è un cookie di tracciamento.</li>
        </ul>

        <h2>PERCHÉ E CON QUALE BASE</h2>
        <ul>
          <li>Prendere e preparare il tuo ordine, e farti pagare: esecuzione del servizio che chiedi (contratto).</li>
          <li>Obblighi fiscali e contabili sui pagamenti: obbligo di legge.</li>
          <li>Sicurezza e prevenzione degli abusi (ordini falsi, spam): interesse legittimo del locale.</li>
          <li>Avviso quando l'ordine è pronto: solo con il tuo consenso, che puoi ritirare quando vuoi.</li>
          <li>Allergie e intolleranze scritte nelle note: solo per preparare il tuo ordine, sulla base del tuo consenso esplicito, che dai quando le scrivi (art. 9.2.a GDPR).</li>
        </ul>

        <h2>CHI RICEVE I DATI</h2>
        <p>
          Per far funzionare il servizio ci appoggiamo a fornitori che trattano i dati per nostro conto:
          Supabase (database e accesso), Vercel (hosting del sito) e SumUp (pagamenti). Il personale del
          locale vede ordini, nomi e note per prepararli. Non vendiamo i tuoi dati.
        </p>

        <h2>PER QUANTO TEMPO</h2>
        <ul>
          <li>Nickname e note: 30 giorni.</li>
          <li>Dati contabili dei pagamenti: secondo la legge (10 anni), nei sistemi fiscali del locale.</li>
          <li>Notifiche push: finché non le disattivi, e comunque al massimo 180 giorni.</li>
        </ul>

        <h2>COOKIE E PROFILAZIONE</h2>
        <p>Nessun cookie di tracciamento, nessuna pubblicità, nessuna profilazione.</p>

        <h2>I TUOI DIRITTI</h2>
        <p>
          Puoi chiedere di accedere ai tuoi dati, correggerli, cancellarli, limitarne l'uso o opporti, e
          ritirare il consenso alle notifiche. Scrivi a <Todo>contatto per i diritti privacy</Todo> indicando
          il codice ordine e il nome usato. Se pensi che i tuoi dati non siano trattati correttamente puoi
          fare reclamo al Garante per la protezione dei dati personali: <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer">garanteprivacy.it</a>.
        </p>

        <h2>ETÀ MINIMA</h2>
        <p>Il servizio è pensato per chi ha almeno 14 anni.</p>

        <a className="kpv-back" href="/kitchen">← Torna al menu</a>
      </div>
    </main>
  );
}
