import { useState, useEffect, useRef } from "react";
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
import { Home, Route as RouteIcon, Banknote, User, Package, MapPin, Phone } from "lucide-react";
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
  const driverId = useDeliveryStore((state) => state.driverId); // FIX: get driverId from store
  const currentStats = { ...stats, online: isOnline };

  // FIX: Keep isOnline in a ref so socket callbacks always get fresh value
  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const location = useLocation();
  const navigate = useNavigate();

  const getScreenFromPath = (pathname) => {
    if (pathname.includes('/route')) return 'route';
    if (pathname.includes('/earn') || pathname.includes('/pocket')) return 'earnings';
    if (pathname.includes('/profile')) return 'profile';
    return 'home';
  };

  const [currentScreen, setCurrentScreen] = useState(getScreenFromPath(location.pathname));
  const [isRouteAccepted, setIsRouteAccepted] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const selectedOrderIdRef = useRef(null);

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId;
  }, [selectedOrderId]);

  const activeOrder = orders.find(o => o.id === selectedOrderId)
    || orders.find(o => o.status === "picked_up" || o.status === "out_for_delivery")
    || orders[0];

  useEffect(() => {
    const screen = getScreenFromPath(location.pathname);
    if (screen === 'route' && ['pickup', 'delivery', 'cannot_deliver'].includes(currentScreen)) return;
    if (screen === 'profile' && ['shifts'].includes(currentScreen)) return;
    setCurrentScreen(screen);
  }, [location.pathname]);

  // ─── FIX: Join driver socket room on mount & when driverId changes ──────────
  const {
    newBatchRequest,
    clearNewBatchRequest,
    orderStatusUpdate,
    clearOrderStatusUpdate,
    socket, // FIX: get socket from context (add this to your context if not already)
    joinDriverRoom // FIX: or expose joinDriverRoom from context
  } = useDeliveryNotificationContext();

  useEffect(() => {
    if (!driverId) return;

    // FIX: Join the delivery room so server can reach this driver
    // Try multiple ways depending on how your context exposes the socket
    if (typeof joinDriverRoom === 'function') {
      joinDriverRoom(driverId);
    } else if (socket) {
      const roomName = `delivery:${driverId}`;
      socket.emit('join_driver_room', driverId);
      console.log('[SOCKET] Joined driver room:', roomName);

      // FIX: Rejoin on reconnect — socket.id changes after reconnect
      socket.on('reconnect', () => {
        socket.emit('join_driver_room', driverId);
        console.log('[SOCKET] Rejoined driver room after reconnect:', roomName);
      });

      return () => {
        socket.off('reconnect');
        socket.emit('leave_driver_room', driverId);
      };
    }
  }, [driverId, socket]);

  // ─── FIX: When going online, also rejoin the socket room ────────────────────
  const handleToggleOnline = async () => {
    toggleOnlineAction();
    const goingOnline = !isOnline;
    try {
      if (goingOnline) {
        await dmbDeliveryAPI.goOnline();
        // FIX: Rejoin socket room when going online
        if (socket && driverId) {
          socket.emit('join_driver_room', driverId);
          console.log('[SOCKET] Rejoined room after going online');
        }
      } else {
        await dmbDeliveryAPI.goOffline();
        // Leave room when going offline so no requests come through
        if (socket && driverId) {
          socket.emit('leave_driver_room', driverId);
          console.log('[SOCKET] Left room after going offline');
        }
      }
    } catch (err) {
      console.error("Failed to sync online status:", err?.response?.data?.message || err.message);
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
            vendorLat: o.vendorId?.location?.latitude || o.vendorId?.location?.coordinates?.[1] || null,
            vendorLng: o.vendorId?.location?.longitude || o.vendorId?.location?.coordinates?.[0] || null,
            customerName: o.userId?.name || 'Customer',
            customerAddress: o.deliveryAddress?.addressLine1 || o.deliveryAddress?.city || 'Customer Address',
            customerLat: o.deliveryAddress?.location?.latitude || o.deliveryAddress?.location?.coordinates?.[1] || null,
            customerLng: o.deliveryAddress?.location?.longitude || o.deliveryAddress?.location?.coordinates?.[0] || null,
            customerPhone: o.userId?.phone || "N/A",
            deliveryInstructions: o.deliveryInstructions || "",
            boxCount: o.meals?.reduce((acc, m) => acc + (m.quantity || 1), 0) || 1,
            status: o.status,
            deliveryPin: o.deliveryPin,
            pin: o.pin,
            pickupTimeStr: o.deliverySlot,
            dropTimeStr: "Before " + (o.deliverySlot === 'lunch' ? '13:00' : '19:00'),
            pickedUpAt: o.pickedUpAt
          }));
          setOrders(prev => {
            const lockedId = selectedOrderIdRef.current;
            if (lockedId) {
               // Payment screen is open. Don't replace the list, just update statuses so UI doesn't crash.
               return prev.map(oldOrder => {
                 const fresh = mappedOrders.find(mo => mo.id === oldOrder.id);
                 return fresh ? fresh : { ...oldOrder, status: "delivered" };
               });
            }
            return mappedOrders;
          });
          setStops(prev => selectedOrderIdRef.current ? prev : (res.data.stops || []));
          setRouteMetadata(prev => selectedOrderIdRef.current ? prev : {
            vendorName: res.data.vendorName || '',
            vendorAddress: res.data.vendorAddress || '',
            vendorPhone: res.data.vendorPhone || '',
            vendorLocation: res.data.vendorLocation || null,
            slotType: res.data.slotType || '',
            totalMealBoxCount: res.data.totalMealBoxCount || 0,
            stopsCount: res.data.stopsCount || 0,
            deliveryDeadline: res.data.deliveryDeadline || null
          });
        } else {
          setOrders(prev => {
             if (selectedOrderIdRef.current) {
                return prev.map(o => ({ ...o, status: "delivered" }));
             }
             return [];
          });
          setStops(prev => selectedOrderIdRef.current ? prev : []);
          setRouteMetadata(prev => selectedOrderIdRef.current ? prev : null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch dynamic route:", err);
    }
  };

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptedBatchDetails, setAcceptedBatchDetails] = useState(null);
  const [routeMetadata, setRouteMetadata] = useState(null);

  const fetchDashboardStats = async () => {
    try {
      const res = await dmbDeliveryAPI.getDashboardStats();
      if (res.data?.success) {
        setStats(prev => ({
          ...prev,
          ...res.data.data
        }));
      }
    } catch (error) {
      console.error("Failed to fetch dashboard stats", error);
    }
  };

  useEffect(() => {
    fetchActiveRoute();
    fetchDashboardStats();
    const syncOnlineStatus = async () => {
      try {
        if (isOnline) await dmbDeliveryAPI.goOnline();
      } catch (err) {
        console.warn("Could not sync online status:", err?.response?.data?.message || err.message);
      }
    };
    syncOnlineStatus();
  }, []);

  useEffect(() => {
    if (orderStatusUpdate) {
      fetchActiveRoute();
      fetchDashboardStats();
      clearOrderStatusUpdate();
    }
  }, [orderStatusUpdate]);

  // ─── FIX: Show request modal regardless of online state ─────────────────────
  // The server already filtered by online status — if request arrived, show it.
  // Previous code had isRiderOnline() stale closure bug that blocked display.
  const handleAcceptBatch = async () => {
    if (!newBatchRequest || !newBatchRequest.batchId) return;
    try {
      setIsAccepting(true);
      const res = await dmbDeliveryAPI.acceptBatch(newBatchRequest.batchId);
      if (res.data?.success) {
        const otp = res.data.batch?.otp || res.data.otp;
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
    setStops(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: "READY" } : s));
  };

  const handleNextRouteStep = () => {
    if (activeOrder?.status === "ready_for_pickup") {
      setCurrentScreen("pickup");
    } else if (activeOrder?.status === "picked_up") {
      setCurrentScreen("delivery");
    } else {
      setCurrentScreen("route");
    }
  };

  const handleConfirmPickup = () => {
    setOrders(prev => prev.map(o => ({ ...o, status: "picked_up" })));
    setStops(prev => prev.map(s => {
      if (s.type === "pickup" || s.type === "P") return { ...s, status: "COMPLETED" };
      if (s.type === "delivery" || s.type === "D") return { ...s, status: "READY" };
      return s;
    }));
    setCurrentScreen("delivery");
  };

  const handleConfirmDelivered = async (cashCollected) => {
    if (!activeOrder) return;
    setOrders(prev => prev.map(o => o.id === activeOrder.id ? { ...o, status: "delivered" } : o));
    setStops(prev => prev.map(s => s.orderId === activeOrder.id ? { ...s, status: "COMPLETED" } : s));
    
    // Refresh live stats from backend to reflect new delivery earnings and COD wallet
    await fetchDashboardStats();

    const remainingOrders = orders.filter(o => o.id !== activeOrder.id && o.status !== "delivered");
    if (remainingOrders.length > 0) {
      setSelectedOrderId(remainingOrders[0].id);
      setCurrentScreen("delivery");
    } else {
      setSelectedOrderId(null);
      setCurrentScreen("earnings");
      // Now that the lock is lifted, fetch the active route fully so it clears empty batch
      fetchActiveRoute();
    }
  };

  const handleReportIssue = () => setCurrentScreen("cannot_deliver");

  const handleSubmitFailure = (report) => {
    if (!activeOrder) return;
    setOrders(prev => prev.map(o => o.id === activeOrder.id ? {
      ...o,
      status: "failed",
      failedReason: report.reason,
      failedDisposal: report.disposal,
      failedNote: report.note,
      failedPhoto: report.photoUrl
    } : o));
    setStops(prev => prev.map(s => s.orderId === activeOrder.id ? { ...s, status: "FAILED" } : s));
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
            if (isRouteAccepted) setCurrentScreen("pickup");
            else setCurrentScreen("route");
          }}
        />;
      case "route":
        return <RouteView
          stops={stops}
          onAcceptRoute={handleAcceptRoute}
          isAccepted={isRouteAccepted}
          onNextStep={handleNextRouteStep}
          activeOrder={activeOrder}
          routeMetadata={routeMetadata}
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
          orders={orders}
          stops={stops}
          onSelectOrder={setSelectedOrderId}
          onGoBack={() => setCurrentScreen("route")}
          onConfirmDelivered={handleConfirmDelivered}
          onOpenChat={() => setCurrentScreen("shifts")}
          onReportIssue={handleReportIssue}
        />;
      case "cannot_deliver":
        return <CannotDeliverReport
          order={activeOrder}
          onGoBack={() => {
            if (activeOrder?.status === "picked_up") setCurrentScreen("delivery");
            else setCurrentScreen("pickup");
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
          onUpdateStats={(newHrs) => setStats(v => ({ ...v, hoursLogged: newHrs }))}
        />;
      case "demand":
        return <DemandHeatmapView
          onNavigateToUrsynow={() => {
            alert("Routing GPS navigation to Ursynów demand hub...");
            setCurrentScreen("route");
          }}
        />;
      default:
        return <DashboardHome
          stats={currentStats}
          toggleOnline={handleToggleOnline}
          activeOrder={activeOrder}
          onNavigateToPickup={() => setCurrentScreen("pickup")}
        />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] pb-24 text-gray-800 font-sans relative">
      <div className="h-1 bg-[#00604c] w-full sticky top-0 z-50" />

      <main className="max-w-md mx-auto px-4 pt-4">

        {/* ─── FIX: New Batch Request Modal ─────────────────────────────────── */}
        {newBatchRequest && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

              {/* Header */}
              <div className="bg-[#00604c] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                    <Package className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white/70 text-xs font-medium uppercase tracking-wider">New Pickup Request</p>
                    <h3 className="text-white text-lg font-bold leading-tight">Orders Ready!</h3>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">

                {/* Vendor info */}
                {newBatchRequest.vendorInfo && (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-[#00604c] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Pickup from</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {newBatchRequest.vendorInfo?.vendorName || newBatchRequest.vendorName || 'Vendor'}
                        </p>
                      </div>
                    </div>
                    {(newBatchRequest.vendorInfo?.vendorPhone || newBatchRequest.vendorPhone) && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-[#00604c] shrink-0" />
                        <p className="text-sm text-gray-600">
                          {newBatchRequest.vendorInfo?.vendorPhone || newBatchRequest.vendorPhone}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#f0fdf7] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#00604c]">
                      {newBatchRequest.totalMealBoxCount || newBatchRequest.boxCount || newBatchRequest.totalOrders || '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Meal boxes</p>
                  </div>
                  <div className="bg-[#f0fdf7] rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-[#00604c] capitalize">
                      {newBatchRequest.slotType || newBatchRequest.slot || '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Slot</p>
                  </div>
                </div>

                {/* FIX: Show clear offline warning if driver is offline */}
                {!isOnline && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <p className="text-amber-700 text-xs font-medium text-center">
                      ⚠️ You are offline — go online to accept deliveries
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-5 pb-5 flex gap-3">
                <button
                  disabled={isAccepting}
                  onClick={clearNewBatchRequest}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm active:scale-95 transition-transform"
                >
                  Ignore
                </button>
                <button
                  disabled={isAccepting || !isOnline}
                  onClick={handleAcceptBatch}
                  className="flex-1 py-3 rounded-xl bg-[#00604c] text-white font-semibold text-sm active:scale-95 transition-transform disabled:opacity-50"
                >
                  {isAccepting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Accepting...
                    </span>
                  ) : "Accept Route"}
                </button>
              </div>
            </div>
          </div>
        )}

        {renderActiveScreen()}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full z-45 bg-white pt-2.5 pb-4 border-t border-[#bec9c3] flex justify-around items-center">
        <button
          onClick={() => {
            if (currentScreen === "cannot_deliver" && activeOrder?.status === "picked_up") {
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

        <button
          onClick={() => { navigate('/food/delivery/route'); setCurrentScreen("route"); }}
          className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${["route", "pickup", "delivery"].includes(currentScreen) ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
        >
          <RouteIcon className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Route</span>
        </button>

        <button
          onClick={() => { navigate('/food/delivery/earn'); setCurrentScreen("earnings"); }}
          className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${currentScreen === "earnings" ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
        >
          <Banknote className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Earn</span>
        </button>

        <button
          onClick={() => { navigate('/food/delivery/profile'); setCurrentScreen("profile"); }}
          className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${["profile", "shifts"].includes(currentScreen) ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
        >
          <User className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Profile</span>
        </button>
      </nav>
    </div>
  );
}

export { NewDeliveryDashboard as default };