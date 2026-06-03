import { useState, useEffect } from "react";
import CustomerEntry from "./pages/CustomerEntry";
import CustomerRequest from "./pages/CustomerRequest";
import StaffDashboard from "./pages/StaffDashboard";
import LiveTvScreen from "./pages/LiveTvScreen";
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
      case "/":
      case "/entry":
        return <CustomerEntry />;
      case "/request":
        return <CustomerRequest />;
      case "/staff":
        return <StaffDashboard />;
      case "/tv":
        return <LiveTvScreen />;
      default:
        // Redirect/fall-through default
        return <CustomerEntry />;
    }
  };

  return (
    <>
      {/* Dev Quick Link Bar - Helps switch between screens easily in the same tab */}
      {currentPath === "/staff" && (
        <nav className="dev-navigation">
          <strong style={{ color: "white", marginRight: "10px" }}>⚡ DEV ROUTING:</strong>
          <NavLink to="/entry" activePath={currentPath}>Entry (Cliente)</NavLink>
          <NavLink to="/request?table=4" activePath={currentPath}>Request (Tavolo 4)</NavLink>
          <NavLink to="/staff" activePath={currentPath}>Staff Dashboard</NavLink>
          <NavLink to="/tv" activePath={currentPath}>Live TV Screen</NavLink>
          
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
