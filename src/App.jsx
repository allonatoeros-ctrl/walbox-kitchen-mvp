import { useState, useEffect } from "react";
import CustomerEntry from "./pages/CustomerEntry";
import CustomerRequest from "./pages/CustomerRequest";
import StaffDashboard from "./pages/StaffDashboard";
import LiveTvScreenWalrusPoster from "./pages/LiveTvScreenWalrusPoster";
import CustomerKitchenMenu from "./pages/CustomerKitchenMenu";
import CustomerKitchenEntry from "./pages/CustomerKitchenEntry";
import CustomerOrderStatus from "./pages/CustomerOrderStatus";
import KitchenStaffDashboard from "./pages/KitchenStaffDashboard";
import KitchenLogin from "./pages/KitchenLogin";
import KitchenTvScreen from "./pages/KitchenTvScreen";
import SpotifyTestPanel from "./pages/SpotifyTestPanel";
import StaffLogin from "./pages/StaffLogin";
import { getStaffSession, onAuthStateChange } from "./lib/supabaseAuth";
import FantaEntryTesseramento from "./fanta/pages/FantaEntryTesseramento";
import { initializeStorage } from "./data/mockData";

// Custom Link helper component for internal navigation without full-page reloads
function NavLink({ to, activePath, children }) {
  const isActive = activePath === to || 
    (to === "/" && activePath === "/entry") || 
    (to === "/entry" && activePath === "/");

  const handleClick = (e) => {
    e.preventDefault();
    window.history.pushState({}, "", to);
    // Trigger popstate event to let App component know the URL changed
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <a href={to} onClick={handleClick} className={isActive ? "active" : ""}>
      {children}
    </a>
  );
}

// P0-2-R3 (F2): gate /staff — solo sessione non-anonima (staff reale). Il verdetto
// AUTORITATIVO di "staff" resta sulla policy DB is_staff_for_venue (F0/F4); qui blocchiamo
// solo l'accesso anonimo dal frontend. NOTA: getStaffSession() consente qualsiasi account
// non-anonimo (F-SEC-1); la sicurezza completa richiede F0/F4/F5 (tabella staff + policy IS_STAFF).
function StaffRouteGuard() {
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStaffSession().then((s) => {
      if (cancelled) return;
      setSession(s);
      setChecked(true);
    });
    const { data: { subscription } } = onAuthStateChange((s) => {
      setSession(s);
      setChecked(true);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (!checked) return null;
  return session ? <StaffDashboard /> : <StaffLogin />;
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    // Initial storage structure initialization
    initializeStorage();

    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  // Simple client-side routing logic
  const renderRoute = () => {
    switch (currentPath) {
      // === JUKEBOX MODULE ROUTES ===
      case "/":
      case "/entry":
        return <CustomerEntry />;
      case "/request":
        return <CustomerRequest />;
      case "/staff":
        return <StaffRouteGuard />;

      // === TV / POSTER ROUTES ===
      case "/tv":
      case "/tv-poster":
      case "/live-tv":
        return <LiveTvScreenWalrusPoster />;

      // === KITCHEN MODULE ROUTES ===
      case "/kitchen/entry":
        return <CustomerKitchenEntry />;
      case "/kitchen":
        return <CustomerKitchenMenu />;
      case "/kitchen/status":
        return <CustomerOrderStatus />;
      case "/kitchen/staff":
        return <KitchenStaffDashboard />;
      case "/kitchen/login":
        return <KitchenLogin />;
      case "/kitchen/tv":
        return <KitchenTvScreen />;
      case "/spotify-test":
        return <SpotifyTestPanel />;
      case "/fantawalrus":
        return <FantaEntryTesseramento />;
      default:
        // Redirect/fall-through default
        return <CustomerEntry />;
    }
  };

  return (
    <>
      {/* P1.4 — Dev Quick Link Bar: visibile SOLO in sviluppo (Vite lo rimuove in prod) */}
      {import.meta.env.DEV && currentPath === "/staff" && (
        <nav className="dev-navigation">
          <strong style={{ color: "white", marginRight: "10px" }}>⚡ DEV ROUTING:</strong>
          <NavLink to="/entry" activePath={currentPath}>Entry (Cliente)</NavLink>
          <NavLink to="/request?table=4" activePath={currentPath}>Request (Tavolo 4)</NavLink>
          <NavLink to="/staff" activePath={currentPath}>Staff Dashboard</NavLink>
          <NavLink to="/tv-poster" activePath={currentPath}>Poster TV</NavLink>
          
          <button 
            onClick={() => {
              if (window.confirm("Resettare tutti i dati alle impostazioni di fabbrica (demo)?")) {
                localStorage.clear();
                window.location.reload();
              }
            }}
            style={{ 
              marginLeft: "auto", 
              background: "rgba(255, 0, 127, 0.1)", 
              borderColor: "rgba(255, 0, 127, 0.3)", 
              color: "var(--accent-primary)" 
            }}
          >
            Reset Demo 🔄
          </button>
        </nav>
      )}

      {/* Render selected component */}
      {renderRoute()}
    </>
  );
}
