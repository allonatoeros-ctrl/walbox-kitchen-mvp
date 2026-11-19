import { useEffect } from 'react';
import './WalrusLanding.css';

const CONTACT_NUMBER = '+393517892683';
const PHONE_URL = 'tel:+393517892683';
const WHATSAPP_URL = 'https://wa.me/393517892683?text=' + encodeURIComponent('Ciao Walrus! Vorrei prenotare un tavolo. Data: __ / Ora: __ / Persone: __');
const MENU_URL = '/kitchen';
const INSTAGRAM_URL = 'https://www.instagram.com/thewalruspub_/';
const MAPS_URL = 'https://maps.google.com/maps?cid=5110122499957378973';

const IMAGES = {
  hero: 'https://lh3.googleusercontent.com/grass-cs/AABkmLdHFs68EdgVRxm9jGMYySZy7lVSo8eU3sJYtt0UmCXUBkLJrF74eWiaqHmVEYDHHxlSLkQEr7cTcZ1nFYHThl7gCq1GeeU-u_E2HhN2ev0qolQDJbqUJf3oPdTiashhM2Z8uToAI_12l6Ii=s0',
  bar: 'https://lh3.googleusercontent.com/grass-cs/AABkmLfroMib-cFtHUvLIdO8UU-sInkUhftnj1jN_K0xfcrua5-o8aH5GZb0Xztb-Pxde2NN12rcsf58sYhxuGFvwSkQixes5FliRhD-B3fBKvctjMJnIPWMUPYrxQ2e9uTmivTyW3i-dVbvUGiW=s0',
  interior: 'https://lh3.googleusercontent.com/grass-cs/AABkmLdXJnxwcoVawxu3MP4UvIgdPF64nI4LBGabb7yQj045sz9EJiLNhF6vf2Ch1-r4VHQTJ8hP4eA-iMSK8-zVIGt54HQou9wR6Osd642joIRD5-kA9dm7FAfxAzRGYqK4VUV9E-gt2XbIq44=s0',
  upper: 'https://lh3.googleusercontent.com/grass-cs/AABkmLeU7fd7DrX00bx1IVB3DKuVhA8cQBtMsuo0nC7YMQOspw4bo2spK8mIbaW0bKqqxUJeRsjBwOBMaSRaWHCm5twoWz4KRKvcSlK08eoJJlfL8kTTvQXOB-suwAFHmigNHmSq0U23RflMyHFg=s0'
};

function Arrow() { return <span aria-hidden="true">↗</span>; }
function InstagramIcon() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none"/></svg>; }
function WhatsAppIcon() { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M20.5 11.8a8.5 8.5 0 0 1-12.5 7.5L3 21l1.7-4.8a8.5 8.5 0 1 1 15.8-4.4Z"/><path d="M8.8 8.7c.5 2.5 2.3 4.6 5.3 5.7l1.2-1.3 2.3 1.2c-.5 2.8-3.5 2.8-6.6 1-3.4-2-4.6-5.1-3-6.8Z"/></svg>; }

export default function WalrusLanding() {
  useEffect(() => {
    const oldTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const oldDescription = description?.getAttribute('content');
    document.title = 'The Walrus Pub Melegnano | Cocktail Bar, Kitchen e Prenotazioni';
    description?.setAttribute('content', 'The Walrus Pub a Melegnano: cocktail signature, gin, birre, aperitivo e Walrus Kitchen. Prenota un tavolo su WhatsApp, scopri il menu e ordina con Walbox.');
    return () => {
      document.title = oldTitle;
      if (description && oldDescription !== null && oldDescription !== undefined) description.setAttribute('content', oldDescription);
    };
  }, []);

  return <div className="wl" id="inizio">
    <a className="wl-skip" href="#contenuto">Vai al contenuto</a>
    <div className="wl-topbar"><span>MELEGNANO, ITALIA</span><span>GOOD DRINKS. GOOD FOOD. BAD DECISIONS.</span><span>THE WALRUS PUB</span></div>
    <header className="wl-header">
      <a href="#inizio" className="wl-logo" aria-label="The Walrus Pub, inizio pagina">
        <img src="/assets/kitchen/walrus-pub-logo.webp" alt="" width="44" height="44" />
        <span>THE WALRUS<span className="wl-red">.</span></span>
      </a>
      <nav className="wl-nav" aria-label="Menu di navigazione">
        <a href="#esperienze">Il locale</a>
        <a href="#kitchen">La cucina</a>
        <a href="#dove-siamo">Dove siamo</a>
      </nav>
      <a className="wl-header-book" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">PRENOTA UN TAVOLO <Arrow /></a>
    </header>

    <main id="contenuto">
      <section className="wl-hero">
        <div className="wl-hero-photo">
          <img src={IMAGES.hero} alt="Il nuovo bancone del The Walrus Pub, con neon rosso e atmosfera da cocktail bar" fetchPriority="high"/>
          <div className="wl-photo-shade" />
        </div>
        <div className="wl-hero-content">
          <div className="wl-hero-kicker"><span className="wl-kicker-line"/> COCKTAIL BAR & KITCHEN · MELEGNANO</div>
          <h1>BEVI BENE.<br/>MANGIA <i>FORTE.</i><br/>RESTA <span>FUORI.</span></h1>
          <p className="wl-hero-intro">Un cocktail fatto come si deve. Qualcosa di serio da mangiare. E nessuna voglia di tornare a casa presto.</p>
          <div className="wl-hero-actions">
            <a className="wl-button wl-button-primary" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><WhatsAppIcon/> PRENOTA SU WHATSAPP <Arrow/></a>
            <a className="wl-button wl-button-ghost" href={MENU_URL}>SCOPRI IL MENU <Arrow/></a>
          </div>
        </div>
        <div className="wl-hero-side" aria-hidden="true">EST. MELEGNANO / IL TRICHECO NON DELUDE MAI</div>
        <div className="wl-hero-scroll" aria-hidden="true">SCOPRI IL WALRUS <span>↓</span></div>
      </section>

      <div className="wl-marquee" aria-hidden="true"><div>
        <span>COCKTAIL SIGNATURE <b>✳</b> PESI MASSIMI <b>✳</b> APERITIVI SERI <b>✳</b> GOOD TIMES <b>✳</b> </span>
        <span>COCKTAIL SIGNATURE <b>✳</b> PESI MASSIMI <b>✳</b> APERITIVI SERI <b>✳</b> GOOD TIMES <b>✳</b> </span>
      </div></div>

      <section id="esperienze" className="wl-section wl-experiences" aria-labelledby="wl-experiences-title">
        <div className="wl-section-head">
          <div><p className="wl-label">01 / DUE ANIME, UN SOLO WALRUS</p><h2 id="wl-experiences-title">QUI SI FA <i>SUL SERIO.</i><br/>MA NON TROPPO.</h2></div>
          <p>Dal primo aperitivo all’ultimo giro. Il Walrus è un posto da vivere, non da spiegare.</p>
        </div>
        <div className="wl-experience-grid">
          <article className="wl-experience wl-experience-drinks">
            <img src={IMAGES.bar} alt="L'interno rinnovato del Walrus con il bancone cocktail" loading="lazy"/>
            <div className="wl-experience-shade"/>
            <div className="wl-experience-content">
              <span className="wl-index">01 / IL BERE</span>
              <div><span className="wl-overline">L'APERITIVO È SOLO L'INIZIO</span><h3>COCKTAIL<br/>BAR<span>.</span></h3>
                <p>Cocktail signature, circa 30 gin, bitter, vermouth, whisky e 4 spine a rotazione. DJ set ed eventi quando la serata chiama.</p>
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="wl-text-link">VIVI IL WALRUS SU INSTAGRAM <Arrow/></a>
              </div>
            </div>
          </article>
          <article id="kitchen" className="wl-experience wl-experience-food">
            <img src="/assets/kitchen/menu/panini/panino_porchetta.webp" alt="Uno dei panini della Walrus Kitchen" loading="lazy"/>
            <div className="wl-experience-shade"/>
            <div className="wl-experience-content">
              <span className="wl-index">02 / IL MANGIARE</span>
              <div><span className="wl-overline">QUANDO LA FAME NON SCHERZA</span><h3>WALRUS<br/>KITCHEN<span>.</span></h3>
                <p>Panini, taglieri, cicchetti e i nostri Pesi Massimi. Esplora il menu e ordina direttamente con Walbox.</p>
                <a href={MENU_URL} className="wl-text-link">APRI MENU & ORDINI <Arrow/></a>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="wl-proof" aria-label="La selezione Walrus">
        <div><strong>30<span>+</span></strong><span>GIN IN SELEZIONE<br/>CIRCA</span></div>
        <div><strong>04</strong><span>BIRRE ALLA SPINA<br/>A ROTAZIONE</span></div>
        <div><strong>01</strong><span>POSTO GIUSTO<br/>PER RESTARE</span></div>
      </section>

      <section className="wl-atmosphere">
        <div className="wl-atmosphere-pics">
          <img src={IMAGES.interior} alt="Dettaglio del bancone, luci rosse e nuova atmosfera del The Walrus Pub" loading="lazy"/>
          <img src={IMAGES.upper} alt="Vista degli interni del Walrus Pub rinnovato" loading="lazy"/>
        </div>
        <div className="wl-atmosphere-text"><p className="wl-label">02 / L'ATMOSFERA</p>
          <h2>STREET<br/>NELL'ANIMA.<br/><i>PIÙ PETTINATI.</i></h2>
          <p>Il Walrus ha cambiato faccia, non carattere. Neon rosso, spirito libero, drink ricercati e gente che ha voglia di stare bene.</p>
          <a href={INSTAGRAM_URL} className="wl-inline-button" target="_blank" rel="noopener noreferrer"><InstagramIcon/> GUARDA COSA SUCCEDE <Arrow/></a>
        </div>
      </section>

      <section className="wl-reserve" id="prenota" aria-labelledby="wl-reserve-title">
        <div className="wl-reserve-check" aria-hidden="true"/>
        <div className="wl-reserve-content">
          <p className="wl-label">03 / UN POSTO C'È. O LO TROVIAMO.</p>
          <h2 id="wl-reserve-title">IL TAVOLO?<br/><i>CI PENSIAMO NOI.</i></h2>
          <p>Un aperitivo in compagnia, una cena, un compleanno o una festa privata. Scrivici o chiamaci per organizzare la serata.</p>
          <div className="wl-reserve-actions">
            <a className="wl-button wl-button-light" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><WhatsAppIcon/> PRENOTA SU WHATSAPP <Arrow/></a>
            <a className="wl-button wl-button-outline" href={PHONE_URL}>CHIAMA IL WALRUS <Arrow/></a>
          </div>
          <span className="wl-reserve-fine">La prenotazione è confermata solo dopo la risposta del locale.</span>
        </div>
        <div className="wl-reserve-stamp" aria-hidden="true">THE<br/>WALRUS<br/>PUB</div>
      </section>

      <section className="wl-visit wl-section" id="dove-siamo">
        <div>
          <p className="wl-label">04 / VIENI A TROVARCI</p>
          <h2>CI VEDIAMO<br/>A <i>MELEGNANO.</i></h2>
          <p>Dal drink dopo il lavoro al dopocena. Un salto al Walrus e la serata è già partita.</p>
          <div className="wl-visit-buttons"><a className="wl-button wl-button-primary" href={MAPS_URL} target="_blank" rel="noopener noreferrer">OTTIENI INDICAZIONI <Arrow/></a><a className="wl-button wl-button-ghost" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"><InstagramIcon/> INSTAGRAM <Arrow/></a></div>
        </div>
        <dl className="wl-info">
          <div><dt>LOCALITÀ</dt><dd>Melegnano (MI)</dd></div>
          <div><dt>COCKTAIL BAR</dt><dd>LUN–SAB <strong>17:00 — 02:00</strong><br/>DOM <strong>10:00 — 01:00</strong></dd></div>
          <div><dt>PRENOTAZIONI</dt><dd><a href={PHONE_URL}>{CONTACT_NUMBER} <Arrow/></a></dd></div>
          <div><dt>LA CUCINA</dt><dd><a href={MENU_URL}>SCOPRI GLI ORARI E IL MENU <Arrow/></a></dd></div>
        </dl>
      </section>

      <section className="wl-outro" aria-label="Vai al menu"><span>NON RESTARE A GUARDARE.</span><h2>FAI IL <i>PRIMO PASSO.</i></h2><a href={MENU_URL} className="wl-button wl-button-light">APRI IL MENU WALBOX <Arrow/></a></section>
    </main>

    <footer className="wl-footer">
      <a className="wl-footer-brand" href="#inizio">THE WALRUS<span>.</span></a>
      <span>MELEGNANO · COCKTAIL BAR & KITCHEN</span>
      <div><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">INSTAGRAM ↗</a><a href={PHONE_URL}>CHIAMA ↗</a><a href="#inizio">TORNA SU ↑</a></div>
    </footer>
    <div className="wl-mobile-book"><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><WhatsAppIcon/> PRENOTA SU WHATSAPP <Arrow/></a><a href={MENU_URL}>MENU <Arrow/></a></div>
  </div>;
}
