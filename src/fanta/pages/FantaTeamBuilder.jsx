import { useState, useEffect } from 'react';
import TeamCrest, { CREST_PRESETS } from '../components/TeamCrest';
import './FantaEntryTesseramento.css';

const LOCAL_STORAGE_KEY = 'fanta_walrus_team_identity';

export default function FantaTeamBuilder() {
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) setIdentity(JSON.parse(raw));
    } catch (e) {
      setIdentity(null);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) return null;

  if (!identity) {
    window.history.pushState({}, '', '/fanta/entry');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return null;
  }

  const preset = CREST_PRESETS.find((p) => p.id === identity.crest?.id) || null;

  return (
    <div className="fanta-entry">
      <header className="fanta-entry__band">
        <div className="fanta-entry__band-left">
          <div className="fanta-entry__band-titles">
            <span className="fanta-entry__band-title">FANTAWALRUS</span>
            <span className="fanta-entry__band-sub">LA TUA SQUADRA</span>
          </div>
        </div>
        <div className="fanta-entry__band-right">
          <span className="fanta-entry__band-matchday">TEAM BUILDER</span>
        </div>
      </header>

      <section className="fanta-entry__card-wrap">
        <div className="fanta-entry__card">
          <div className="fanta-entry__card-head">
            <span>IDENTITÀ</span>
            <span className="fanta-entry__card-num">{identity.teamId}</span>
          </div>

          <div className="fanta-entry__card-crest">
            <TeamCrest
              shape={preset?.shape}
              pattern={preset?.pattern}
              palette={preset?.palette}
              initial={identity.teamName || 'T'}
              size={125}
              empty={!preset}
              medallion
              goldBorder
            />
          </div>

          <div className="fanta-entry__card-foot">
            <span className="fanta-entry__card-label">NOME</span>
            <span className="fanta-entry__card-name">{(identity.teamName || '').toUpperCase()}</span>
          </div>

          <span className="fanta-entry__card-divider" aria-hidden="true" />
          <span className="fanta-entry__card-season">CREATA {new Date(identity.createdAt).toLocaleString()}</span>
        </div>
      </section>

      <footer className="fanta-entry__cta">
        <span className="fanta-entry__cta-sub">Selezione rosa in arrivo</span>
      </footer>
    </div>
  );
}
