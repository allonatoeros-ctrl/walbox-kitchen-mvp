import { useState, useEffect } from "react";
import CustomerKitchenMenu from "./pages/CustomerKitchenMenu";
import CustomerKitchenEntry from "./pages/CustomerKitchenEntry";
import CustomerOrderStatus from "./pages/CustomerOrderStatus";
import CustomerOrderPayment from "./pages/CustomerOrderPayment";
import KitchenStaffRedirect from "./pages/KitchenStaffRedirect";
import KitchenPayments from "./pages/KitchenPayments";
import KitchenSoloService from "./pages/KitchenSoloService";
import CounterAssistedOrder from "./pages/CounterAssistedOrder";
import KitchenSoloServiceDemo from "./pages/KitchenSoloServiceDemo";
import KitchenStaffDashboardDemo from "./pages/KitchenStaffDashboardDemo";
import KitchenTrainingDemo from "./pages/KitchenTrainingDemo";
import KitchenLogin from "./pages/KitchenLogin";
import KitchenTvScreen from "./pages/KitchenTvScreen";
import KitchenPrepBoard from "./pages/KitchenPrepBoard";
import KitchenPrepBoardDemo from "./pages/KitchenPrepBoardDemo";

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
      case "/kitchen/payments":
        return <KitchenPayments />;
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
      default:
        return <CustomerKitchenEntry />;
    }
  };

  return <>{renderRoute()}</>;
}
