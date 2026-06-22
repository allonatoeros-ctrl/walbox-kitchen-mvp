import React, { useState, useEffect } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { kitchenOrderStatuses } from '../data/kitchenMockData';
import './KitchenTvScreen.css';

const getDisplayName = (order) => {
  return order.nickname || order.table || 'Sconosciuto';
};

const getElapsedMinutes = (dateString) => {
  if (!dateString) return 0;
  const readyTime = new Date(dateString);
  const now = new Date();
  const diffMs = now - readyTime;
  return Math.floor(diffMs / 60000);
};

const isJustReady = (order) => {
  if (!order.readyAt) return false;
  return getElapsedMinutes(order.readyAt) < 3; // within 3 minutes
};

const KitchenTvScreen = () => {
  const { orders } = useKitchenOrders();

  // Ensure orders is an array
  const validOrders = Array.isArray(orders) ? orders : [];

  const readyOrders = validOrders
    .filter(o => o.status === 'ready')
    .slice(0, 5);

  const cookingOrders = validOrders.filter(o =>
    o.status === 'received' ||
    o.status === 'preparing' ||
    o.status === 'pending_counter_payment'
  );

  // Auto refresh for "APPENA FATTO" recalculation
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000); // 30 sec
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="kitchen-tv-container">
      {/* Background texture overlay */}
      <div className="tv-noise-overlay"></div>

      <header className="tv-header">
        <div className="tv-header-left">
          <div className="paper-note top-left-note">
            <span className="note-text-large">RITIRA AL BANCO</span>
            <span className="note-text-small">SE NON LO RITIRI CE LO MANGIAMO NOI</span>
          </div>
        </div>

        <div className="tv-header-center">
          <img src="/assets/kitchen-tv/walrus-kitchen-tv-logo.png" alt="The Walrus Kitchen TV" className="tv-brand-logo" />
        </div>

        <div className="tv-header-right">
          <div className="red-note top-right-note">
            <span className="note-text-small">QUI NON SI PRENDE PRENOTAZIONE,</span>
            <span className="note-text-large">SI PRENDE SOLO FAME.</span>
          </div>
        </div>
      </header>

      <main className="tv-main">
        <section className="tv-ready-section">
          <h3 className="section-title">PRONTI AL BANCO</h3>

          {readyOrders.length > 0 ? (
            <div className="ready-tickets-grid">
              {readyOrders.map(order => (
                <div key={order.id} className={`ready-ticket ${isJustReady(order) ? 'just-ready' : ''}`}>
                  <div className="ticket-header">
                    <span className="ticket-code">{order.orderCode}</span>
                    {isJustReady(order) && <span className="badge-just-ready">APPENA FATTO</span>}
                  </div>
                  <div className="ticket-body">
                    <span className="ticket-name">{getDisplayName(order)}</span>
                    {order.items && order.items.length > 0 && (
                      <span className="ticket-items-count">{order.items.length} pz.</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-title">NESSUN ORDINE PRONTO</span>
              <span className="empty-subtitle">APPENA ESCE, LO URLIAMO QUI.</span>
            </div>
          )}
        </section>

        <aside className="tv-cooking-section">
          <h3 className="section-title">IN COTTURA</h3>

          {cookingOrders.length > 0 ? (
            <div className="cooking-list">
              {cookingOrders.map(order => (
                <div key={order.id} className="cooking-row">
                  <div className="cooking-row-left">
                    <span className="cooking-code">{order.orderCode}</span>
                    <span className="cooking-name">{getDisplayName(order)}</span>
                  </div>
                  <div className="cooking-row-right">
                    <span className="status-label" style={{ backgroundColor: kitchenOrderStatuses[order.status]?.color || '#444' }}>
                      {kitchenOrderStatuses[order.status]?.label || order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-title">CUCINA IN SILENZIO</span>
              <span className="empty-subtitle">PER ORA.</span>
            </div>
          )}
        </aside>
      </main>

      <div className="tv-lower-blocks">
        <div className="promo-block">
          <div className="promo-badge">SOLO PER STOMACI FORTI</div>
          <h4 className="promo-title">COMBO PORCHERIA SERIA</h4>
          <p className="promo-desc">Burger porchetta + patatine rustiche + birra media</p>
          <div className="promo-price">
            <span className="price-old">18,50€</span>
            <span className="price-new">15,90€</span>
          </div>
        </div>

        <div className="jukebox-bridge">
          <div className="jukebox-header">
            <span className="juke-pre">MENTRE ASPETTI,</span>
            <span className="juke-action">METTI UN PEZZO</span>
          </div>
          <div className="jukebox-playing">
            <div className="play-circle-icon">▶</div>
            <div className="song-info">
              <span className="now-playing-label">NOW PLAYING ON JUKEBOX</span>
              <span className="song-title">FUOCO AL BANCONE</span>
              <span className="song-artist">STATICA MARINA</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="tv-footer">
        <div className="marquee-container">
          <div className="marquee-content">
            <span>GRAZIE PER LA PAZIENZA E PER IL BUONUMORE</span>
            <span className="separator">★</span>
            <span>IL NOSTRO CIBO È FATTO AL MOMENTO, NON AL MICROONDE</span>
            <span className="separator">★</span>
            <span>BIRRA FREDDA, CUCINA CALDA, ATMOSFERA ROVENTE</span>
            <span className="separator">★</span>
            <span>DOMANDE? ALLERGIE? CHIEDI ALLO STAFF. NO CAPRICCI, SOLO COSE SERIE.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default KitchenTvScreen;
