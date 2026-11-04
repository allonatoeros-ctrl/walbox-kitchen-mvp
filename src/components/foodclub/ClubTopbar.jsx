// WALRUS FOOD CLUB V1 — barra superiore delle pagine Club: freccia indietro + titolo + logo.
import { spaNavigate } from '../../lib/spaNavigate';
import './FoodClub.css';

export default function ClubTopbar({ title, back = '/kitchen', onBack = null }) {
  const goBack = () => {
    if (onBack) onBack();
    else spaNavigate(back);
  };
  return (
    <div className="fc-topbar">
      <button type="button" className="fc-back" onClick={goBack} aria-label="Indietro">
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
          <path d="M21 12H5m6-6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
        </svg>
      </button>
      <span className="fc-topbar-title">{title}</span>
      <img className="fc-topbar-logo" src="/assets/kitchen/walrus-pub-logo-nero.webp" alt="The Walrus Pub" width="130" height="18" />
    </div>
  );
}
