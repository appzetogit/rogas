import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  INITIAL_DRIVER_STATS,
  INITIAL_ORDERS,
  INITIAL_STOPS,
  INITIAL_SHIFTS
} from "./data";
import { DashboardHome } from "./DashboardHome";
import { RouteView } from "./RouteView";
import { PickupVerification } from "./PickupVerification";
import { DeliveryConfirmation } from "./DeliveryConfirmation";
import { CannotDeliverReport } from "./CannotDeliverReport";
import { EarningsView } from "./EarningsView";
import { ProfileView } from "./ProfileView";
import { MyShiftsView } from "./MyShiftsView";
import { DemandHeatmapView } from "./DemandHeatmapView";
import { Home, Route as RouteIcon, Banknote, User } from "lucide-react";
import { useDeliveryStore } from "../store/useDeliveryStore";
import { useDeliveryNotificationContext } from "../../Food/context/DeliveryNotificationContext";
import { dmbDeliveryAPI } from "../../../services/api";

function NewDeliveryDashboard() {
  const [stats, setStats] = useState(INITIAL_DRIVER_STATS);
  const [orders, setOrders] = useState([]);
  const [stops, setStops] = useState([]);
  const [shifts, setShifts] = useState(INITIAL_SHIFTS);
  const isOnline = useDeliveryStore((state) => state.isOnline);
  const toggleOnlineAction = useDeliveryStore((state) => state.toggleOnline);
  const currentStats = { ...stats, online: isOnline };
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Initialize screen based on current URL path
  const getScreenFromPath = (pathname) => {
    if (pathname.includes('/route')) return 'route';
    if (pathname.includes('/earn') || pathname.includes('/pocket')) return 'earnings';
    if (pathname.includes('/profile')) return 'profile';
    return 'home'; // default to home for /feed or /
  };

  const [currentScreen, setCurrentScreen] = useState(getScreenFromPath(location.pathname));
  const [isRouteAccepted, setIsRouteAccepted] = useState(false);
  const activeOrder = orders[0];

  // Keep screen in sync if URL changes externally (e.g. browser back button)
  useEffect(() => {
    const screen = getScreenFromPath(location.pathname);
    // Don't override sub-screens like 'pickup', 'delivery', etc. if we are on the 'route' base path
    if (screen === 'route' && ['pickup', 'delivery', 'cannot_deliver'].includes(currentScreen)) return;
    if (screen === 'profile' && ['shifts'].includes(currentScreen)) return;
    
    setCurrentScreen(screen);
  }, [location.pathname]);

  const handleToggleOnline = async () => {
    // Toggle UI immediately so it feels responsive
    toggleOnlineAction();
    const goingOnline = !isOnline; // after toggle
    try {
      if (goingOnline) {
        await dmbDeliveryAPI.goOnline();
      } else {
        await dmbDeliveryAPI.goOffline();
      }
    } catch (err) {
      console.error("Failed to sync online status with backend:", err?.response?.data?.message || err.message);
      // Don't revert UI — backend sync will retry on next load
    }
  };

  const fetchActiveRoute = async () => {
    try {
      const res = await dmbDeliveryAPI.getRoute();
      if (res.data?.success) {
        if (res.data.orders?.length > 0) {
          const mappedOrders = res.data.orders.map(o => ({
            id: o._id,
            vendorName: o.vendorId?.restaurantName || 'Vendor',
            vendorAddress: o.vendorId?.addressLine1 || 'Vendor Address',
            vendorPhone: o.vendorId?.phone || "N/A",
            customerName: o.userId?.name || 'Customer',
            customerAddress: o.deliveryAddress?.addressLine1 || o.deliveryAddress?.city || 'Customer Address',
            customerPhone: o.userId?.phone || "N/A",
            deliveryInstructions: o.deliveryInstructions || "",
            boxCount: o.meals?.reduce((acc, m) => acc + (m.quantity || 1), 0) || 1,
            status: o.status,
            pickupTimeStr: o.deliverySlot,
            dropTimeStr: "Before " + (o.deliverySlot === 'lunch' ? '13:00' : '19:00')
          }));
          setOrders(mappedOrders);
          setStops(res.data.stops);
        } else {
          setOrders([]);
          setStops([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch dynamic route:", err);
    }
  };

  useEffect(() => {
    fetchActiveRoute();
    // Sync online status with backend on load
    const syncOnlineStatus = async () => {
      try {
        if (isOnline) {
          await dmbDeliveryAPI.goOnline();
        }
      } catch (err) {
        console.warn("Could not sync online status with backend:", err?.response?.data?.message || err.message);
      }
    };
    syncOnlineStatus();
  }, []);

  const { newBatchRequest, clearNewBatchRequest } = useDeliveryNotificationContext();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedBatchDetails, setAcceptedBatchDetails] = useState(null);

  const handleAcceptBatch = async () => {
    if (!newBatchRequest || !newBatchRequest.batchId) return;
    try {
      setIsAccepting(true);
      const res = await dmbDeliveryAPI.acceptBatch(newBatchRequest.batchId);
      if (res.data?.success) {
        const otp = res.data.batch?.otp || res.data.otp;
        alert(`Batch accepted! OTP to show vendor: ${otp}`);
        setAcceptedBatchDetails({ ...newBatchRequest, otp });
        clearNewBatchRequest();
        await fetchActiveRoute();
        setCurrentScreen("route");
      }
    } catch (err) {
      alert("Failed to accept batch: " + (err.response?.data?.message || err.message));
      clearNewBatchRequest();
    } finally {
      setIsAccepting(false);
    }
  };
  const handleAcceptRoute = () => {
    setIsRouteAccepted(true);
    setStops(
      (prev) => prev.map((s, idx) => idx === 0 ? { ...s, status: "READY" } : s)
    );
  };
  const handleNextRouteStep = () => {
    if (activeOrder.status === "ready_for_pickup") {
      setCurrentScreen("pickup");
    } else if (activeOrder.status === "picked_up") {
      setCurrentScreen("delivery");
    } else {
      setCurrentScreen("route");
    }
  };
  const handleConfirmPickup = () => {
    if (!activeOrder) return;
    setOrders(
      (prev) => prev.map((o) => o.id === activeOrder.id ? { ...o, status: "picked_up" } : o)
    );
    setStops(
      (prev) => prev.map((s) => {
        if (s.orderId === activeOrder.id && s.type === "pickup") {
          return { ...s, status: "COMPLETED" };
        }
        if (s.orderId === activeOrder.id && s.type === "delivery") {
          return { ...s, status: "READY" };
        }
        return s;
      })
    );
    setCurrentScreen("delivery");
  };
  const handleConfirmDelivered = (cashCollected) => {
    if (!activeOrder) return;
    setOrders(
      (prev) => prev.map((o) => o.id === activeOrder.id ? { ...o, status: "delivered" } : o)
    );
    setStops(
      (prev) => prev.map((s) => s.orderId === activeOrder.id ? { ...s, status: "COMPLETED" } : s)
    );
    setStats((prev) => ({
      ...prev,
      todayDeliveries: prev.todayDeliveries + 1,
      todayEarned: prev.todayEarned + 18,
      // base pay
      todayTips: prev.todayTips + 5,
      // extra tips
      weeklyBonusProgress: Math.min(10, prev.weeklyBonusProgress + 1)
    }));
    setCurrentScreen("earnings");
  };
  const handleReportIssue = () => {
    setCurrentScreen("cannot_deliver");
  };
  const handleSubmitFailure = (report) => {
    if (!activeOrder) return;
    setOrders(
      (prev) => prev.map(
        (o) => o.id === activeOrder.id ? {
          ...o,
          status: "failed",
          failedReason: report.reason,
          failedDisposal: report.disposal,
          failedNote: report.note,
          failedPhoto: report.photoUrl
        } : o
      )
    );
    setStops(
      (prev) => prev.map(
        (s) => s.orderId === activeOrder.id ? { ...s, status: "FAILED" } : s
      )
    );
    setCurrentScreen("route");
  };
  const handleResetSimulator = () => {
    setStats(INITIAL_DRIVER_STATS);
    setOrders(INITIAL_ORDERS);
    setStops(INITIAL_STOPS);
    setShifts(INITIAL_SHIFTS);
    setIsRouteAccepted(false);
    setCurrentScreen("home");
  };
  const renderActiveScreen = () => {
    switch (currentScreen) {
      case "home":
        return <DashboardHome
          stats={currentStats}
          toggleOnline={handleToggleOnline}
          activeOrder={activeOrder}
          onNavigateToPickup={() => {
            if (isRouteAccepted) {
              setCurrentScreen("pickup");
            } else {
              setCurrentScreen("route");
            }
          }}
        />;
      case "route":
        return <RouteView
          stops={stops}
          onAcceptRoute={handleAcceptRoute}
          isAccepted={isRouteAccepted}
          onNextStep={handleNextRouteStep}
          activeOrder={activeOrder}
        />;
      case "pickup":
        return <PickupVerification
          order={activeOrder}
          onGoBack={() => setCurrentScreen("route")}
          onConfirmPickup={handleConfirmPickup}
          onReportIssue={handleReportIssue}
        />;
      case "delivery":
        return <DeliveryConfirmation
          order={activeOrder}
          onGoBack={() => setCurrentScreen("route")}
          onConfirmDelivered={handleConfirmDelivered}
          onOpenChat={() => setCurrentScreen("shifts")}
          onReportIssue={handleReportIssue}
        />;
      case "cannot_deliver":
        return <CannotDeliverReport
          order={activeOrder}
          onGoBack={() => {
            if (activeOrder.status === "picked_up") {
              setCurrentScreen("delivery");
            } else {
              setCurrentScreen("pickup");
            }
          }}
          onSubmitFailure={handleSubmitFailure}
        />;
      case "earnings":
        return <EarningsView stats={currentStats} />;
      case "profile":
        return <ProfileView
          stats={currentStats}
          onViewShifts={() => setCurrentScreen("shifts")}
          onLogout={handleResetSimulator}
        />;
      case "shifts":
        return <MyShiftsView
          initialShifts={shifts}
          stats={currentStats}
          onGoBack={() => setCurrentScreen("profile")}
          onUpdateStats={(newHrs) => setStats((v) => ({ ...v, hoursLogged: newHrs }))}
        />;
      case "demand":
        return <DemandHeatmapView
          onNavigateToUrsynow={() => {
            alert("Routing GPS navigation to Ursyn\xF3w demand hub...");
            setCurrentScreen("route");
          }}
        />;
      default:
        return <DashboardHome stats={currentStats} toggleOnline={handleToggleOnline} activeOrder={activeOrder} onNavigateToPickup={() => setCurrentScreen("pickup")} />;
    }
  };
  return <div className="min-h-screen bg-[#F5F5F0] pb-24 text-gray-800 font-sans relative">
      
      {
    /* Visual Header Grid Accent Line */
  }
      <div className="h-1 bg-[#00604c] w-full sticky top-0 z-50" />


      {/* Main Container Frame holding responsive applet body */}
      <main className="max-w-md mx-auto px-4 pt-4">
        {newBatchRequest && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold text-[#00604c] mb-2">New Orders Ready!</h3>
              <p className="text-gray-600 mb-4 text-sm">
                Vendor has marked {newBatchRequest.totalOrders} orders as ready for pickup.
              </p>
              <div className="flex gap-3">
                <button
                  disabled={isAccepting}
                  onClick={clearNewBatchRequest}
                  className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold"
                >
                  Ignore
                </button>
                <button
                  disabled={isAccepting}
                  onClick={handleAcceptBatch}
                  className="flex-1 py-2 rounded-lg bg-[#00604c] text-white font-semibold"
                >
                  {isAccepting ? "Accepting..." : "Accept Route"}
                </button>
              </div>
            </div>
          </div>
        )}
        {renderActiveScreen()}
      </main>

      {
    /* Shared High-legibility Tactical Bottom Navigator Tab Bar */
  }
      <nav className="fixed bottom-0 left-0 w-full z-45 bg-white pt-2.5 pb-4 border-t border-[#bec9c3] flex justify-around items-center">
        {
    /* HOME Button */
  }
        <button
    onClick={() => {
      if (currentScreen === "cannot_deliver" && activeOrder.status === "picked_up") {
        setCurrentScreen("delivery");
      } else {
        navigate('/food/delivery/feed');
        setCurrentScreen("home");
      }
    }}
    className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${currentScreen === "home" ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
  >
          <Home className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Home</span>
        </button>

        {
    /* ROUTE Button */
  }
        <button
    onClick={() => {
      navigate('/food/delivery/route');
      setCurrentScreen("route");
    }}
    className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${currentScreen === "route" || currentScreen === "pickup" || currentScreen === "delivery" ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
  >
          <RouteIcon className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Route</span>
        </button>

        {
    /* EARN Button */
  }
        <button
    onClick={() => {
      navigate('/food/delivery/earn');
      setCurrentScreen("earnings");
    }}
    className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${currentScreen === "earnings" ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
  >
          <Banknote className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Earn</span>
        </button>

        {
    /* PROFILE Button */
  }
        <button
    onClick={() => {
      navigate('/food/delivery/profile');
      setCurrentScreen("profile");
    }}
    className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${currentScreen === "profile" || currentScreen === "shifts" ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
  >
          <User className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Profile</span>
        </button>
      </nav>
    </div>;
}
export {
  NewDeliveryDashboard as default
};
