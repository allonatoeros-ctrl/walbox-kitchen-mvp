import { useEffect } from 'react';
import './WalrusLanding.css';

const MENU_URL = '/kitchen';
const INSTAGRAM_URL = 'https://www.instagram.com/thewalruspub_/';
const MAPS_URL = 'https://maps.google.com/maps?cid=5110122499957378973';
const PHONE_URL = 'tel:+393517892683';

function Arrow({ diagonal = false }) {
  return <span className="wl-arrow" aria-hidden="true">{diagonal ? '↗' : '→'}</span>;
}

export default function WalrusLanding() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute('content');
    document.title = 'The Walrus Pub Melegnano | Cocktail Bar & Kitchen';
    description?.setAttribute('content', 'The Walrus Pub, nel cuore di Melegnano: cocktail signature, gin, birre alla spina e Walrus Kitchen. Scopri il locale, consulta il menu e ordina con Walbox.');
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== null && previousDescription !== undefined) {
        description.setAttribute('content', previousDescription);
      }
    };
  }, []);

  return (
    <div className="walrus-landing" id="inizio">
      <a className="wl-skip" href="#contenuto">Vai al contenuto</a>
      <header className="wl-header">
        <a className="wl-brand" href="#inizio" aria-label="The Walrus Pub, torna all'inizio">
          <img src="/assets/kitchen/walrus-logo-w.webp" alt="" />
          <span>THE WALRUS<span className="wl-brand-point">.</span></span>
        </a>
        <nav aria-label="Navigazione principale">
          <a href="#cocktail-bar">Cocktail Bar</a>
          <a href="#cucina">Kitchen</a>
          <a className="wl-nav-cta" href={MENU_URL}>Menu e ordini <Arrow diagonal /></a>
        </nav>
      </header>

      <main id="contenuto">
        <section className="wl-hero" aria-labelledby="wl-title">
          <div className="wl-hero-copy">
            <p className="wl-eyebrow"><span className="wl-dot" /> MELEGNANO · COCKTAIL BAR & KITCHEN</p>
            <h1 id="wl-title">IL WALRUS <br />NON SI SPIEGA.<br /><em>SI VIVE.</em></h1>
            <p className="wl-hero-lead">Un drink fatto bene, qualcosa di serio da mangiare e la serata che prende la piega giusta. Nel cuore di Melegnano.</p>
            <div className="wl-actions">
              <a className="wl-btn wl-btn-primary" href="#cocktail-bar">Scopri il cocktail bar <Arrow /></a>
              <a className="wl-btn wl-btn-secondary" href={MENU_URL}>Apri il menu / Ordina <Arrow diagonal /></a>
            </div>
            <p className="wl-hero-note">Cocktail signature · 30 gin circa · 4 spine a rotazione · Pesi Massimi</p>
          </div>
          <div className="wl-hero-art" aria-hidden="true">
            <div className="wl-art-tile">
              <div className="wl-art-halo"><span>W</span></div>
              <div className="wl-art-side">THE WALRUS PUB / MELEGNANO</div>
              <div className="wl-art-stamp">DRINKS<br />FOOD<br />GOOD<br />TIMES</div>
            </div>
            <div className="wl-art-floor" />
          </div>
          <div className="wl-scroll">SCOPRI IL WALRUS <span aria-hidden="true">↓</span></div>
        </section>

        <div className="wl-ticker" aria-hidden="true">
          <span>GOOD DRINKS · REAL FOOD · GOOD TIMES · THE WALRUS · </span>
          <span>GOOD DRINKS · REAL FOOD · GOOD TIMES · THE WALRUS · </span>
        </div>

        <section className="wl-experiences" aria-labelledby="wl-experiences-title">
          <div className="wl-section-header">
            <p className="wl-eyebrow">DUE ANIME. UN SOLO POSTO.</p>
            <h2 id="wl-experiences-title">SCEGLI DA <em>DOVE INIZIARE.</em></h2>
          </div>
          <div className="wl-card-grid">
            <article className="wl-experience wl-bar-card" id="cocktail-bar">
              <div className="wl-card-graphic" aria-hidden="true"><span className="wl-neon-outline">W</span></div>
              <div className="wl-card-overlay">
                <span className="wl-card-index">01 / IL PUB</span>
                <div>
                  <p className="wl-card-kicker">IL PRIMO DRINK NON SI SCORDA.</p>
                  <h3>COCKTAIL<br />BAR.</h3>
                  <p>Signature originali, una selezione di gin, bitter, vermouth e whisky. Aperitivo, dopocena ed eventi in un locale rinnovato.</p>
                  <a className="wl-card-link" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Scopri il Walrus su Instagram <Arrow diagonal /></a>
                </div>
              </div>
            </article>
            <article className="wl-experience wl-kitchen-card" id="cucina">
              <div className="wl-food-images" aria-hidden="true">
                <img src="/assets/kitchen/menu/panini/panino_porchetta.webp" alt="" loading="lazy" />
                <img src="/assets/kitchen/menu/tagliere/tagliere_pace_fatta.webp" alt="" loading="lazy" />
              </div>
              <div className="wl-card-overlay">
                <span className="wl-card-index">02 / LA CUCINA</span>
                <div>
                  <p className="wl-card-kicker">QUANDO LA FAME SI FA SERIA.</p>
                  <h3>WALRUS<br />KITCHEN.</h3>
                  <p>Panini, Pesi Massimi, taglieri e molto altro. Il menu aggiornato è su Walbox: guardi, scegli e ordini direttamente.</p>
                  <a className="wl-card-link" href={MENU_URL}>Apri menu e ordini Walbox <Arrow diagonal /></a>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="wl-manifesto" aria-label="L'atmosfera del Walrus">
          <p className="wl-eyebrow">IL TRICHECO NON DELUDE MAI</p>
          <p>STREET NELL'ANIMA.<br /><em>UN PO' PIÙ PETTINATI.</em></p>
          <span>Dal drink dopo il lavoro al tavolo con gli amici. E quando c'è musica, si alza il volume.</span>
        </section>

        <section className="wl-visit" id="dove-siamo" aria-labelledby="wl-visit-title">
          <div>
            <p className="wl-eyebrow">CI VEDIAMO AL WALRUS</p>
            <h2 id="wl-visit-title">NEL CUORE<br />DI <em>MELEGNANO.</em></h2>
            <p>Passa per un aperitivo, fermati a cena o raggiungici per il dopocena. Per tavoli e feste, chiamaci.</p>
          </div>
          <div className="wl-visit-details">
            <div><span>DOVE</span><strong>Melegnano (MI)</strong></div>
            <div><span>COCKTAIL BAR</span><strong>Lun–Sab 17:00–02:00<br />Dom 10:00–01:00</strong></div>
            <div><span>CONTATTI</span><a href={PHONE_URL}>351 789 2683 <Arrow diagonal /></a></div>
            <div className="wl-visit-actions">
              <a className="wl-btn wl-btn-primary" href={MAPS_URL} target="_blank" rel="noopener noreferrer">Indicazioni <Arrow diagonal /></a>
              <a className="wl-btn wl-btn-secondary" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram <Arrow diagonal /></a>
            </div>
          </div>
        </section>

        <section className="wl-bottom-cta" aria-labelledby="wl-bottom-title">
          <p className="wl-eyebrow">LA FAME CHIAMA?</p>
          <h2 id="wl-bottom-title">IL MENU È <em>QUI.</em></h2>
          <a className="wl-btn wl-btn-primary" href={MENU_URL}>Entra in Walbox <Arrow diagonal /></a>
        </section>
      </main>

      <footer className="wl-footer">
        <span>© {new Date().getFullYear()} THE WALRUS PUB · MELEGNANO</span>
        <a href="#inizio">Torna su ↑</a>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram ↗</a>
      </footer>
    </div>
  );
}
