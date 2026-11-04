import { useState, useEffect, lazy, Suspense } from "react";
import CustomerKitchenMenu from "./pages/CustomerKitchenMenu";
import CustomerKitchenEntry from "./pages/CustomerKitchenEntry";
import CustomerOrderStatus from "./pages/CustomerOrderStatus";
import CustomerOrderPayment from "./pages/CustomerOrderPayment";
import KitchenStaffRedirect from "./pages/KitchenStaffRedirect";
import KitchenSoloService from "./pages/KitchenSoloService";
import CounterAssistedOrder from "./pages/CounterAssistedOrder";
import KitchenSoloServiceDemo from "./pages/KitchenSoloServiceDemo";
import KitchenStaffDashboardDemo from "./pages/KitchenStaffDashboardDemo";
import KitchenTrainingDemo from "./pages/KitchenTrainingDemo";
import KitchenLogin from "./pages/KitchenLogin";
import KitchenTvScreen from "./pages/KitchenTvScreen";
import KitchenPrepBoard from "./pages/KitchenPrepBoard";
import KitchenPrepBoardDemo from "./pages/KitchenPrepBoardDemo";
import KitchenPrivacy from "./pages/KitchenPrivacy";
import { FOOD_CLUB_ENABLED } from "./lib/foodClubConfig";
import { isPendingFirstStandaloneOpen } from "./lib/pwaInstall";

// WALRUS FOOD CLUB V1: pagine caricate solo quando servono (nessun peso sul menu se il Club è spento).
const FoodClubPage = lazy(() => import("./pages/FoodClubPage"));
const FoodClubStaffPage = lazy(() => import("./pages/FoodClubStaffPage"));

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
    };
  }, []);

  const renderRoute = () => {
    // Club cliente: /kitchen/club e sottopagine (/tessera, /buoni, /amici, /preferenze, /messaggi, /iscriviti, /accedi).
    if (FOOD_CLUB_ENABLED && (currentPath === "/kitchen/club" || currentPath.startsWith("/kitchen/club/"))) {
      return <Suspense fallback={null}><FoodClubPage path={currentPath} /></Suspense>;
    }
    // PWA spec §2.2 p.3: prima apertura dall'icona (start_url /kitchen?src=home) -> "Bentornato" / ritrova la tessera.
    if (FOOD_CLUB_ENABLED && currentPath === "/kitchen" && window.location.search.includes("src=home") && isPendingFirstStandaloneOpen()) {
      return <Suspense fallback={null}><FoodClubPage path="/kitchen/club" /></Suspense>;
    }
    if (FOOD_CLUB_ENABLED && currentPath === "/kitchen/club-staff") {
      return <Suspense fallback={null}><FoodClubStaffPage /></Suspense>;
    }
    switch (currentPath) {
      case "/":
        return <CustomerKitchenEntry />;

      // === KITCHEN MODULE ROUTES ===
      case "/kitchen/entry":
        return <CustomerKitchenEntry />;
      case "/kitchen":
        return <CustomerKitchenMenu />;
      case "/kitchen/payment":
        return <CustomerOrderPayment />;
      case "/kitchen/status":
        return <CustomerOrderStatus />;
      case "/kitchen/staff":
        return <KitchenStaffRedirect />;
      case "/kitchen/solo":
        return <KitchenSoloService />;
      case "/kitchen/cassa":
        return <CounterAssistedOrder />;
      case "/kitchen/solo-demo":
        return <KitchenSoloServiceDemo />;
      case "/kitchen/staff-payments-demo":
        return <KitchenStaffDashboardDemo />;
      case "/kitchen/training":
        return <KitchenTrainingDemo />;
      case "/kitchen/login":
        return <KitchenLogin />;
      case "/kitchen/tv":
        return <KitchenTvScreen />;
      case "/kitchen/promo":
        return <CustomerKitchenEntry />;
      case "/kitchen/prep":
        return <KitchenPrepBoard />;
      case "/kitchen/prep-demo":
        return <KitchenPrepBoardDemo />;
      case "/kitchen/privacy":
        return <KitchenPrivacy />;
      default:
        return <CustomerKitchenEntry />;
    }
  };

  return <>{renderRoute()}</>;
}
