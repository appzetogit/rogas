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
import { RoutesView } from "./RoutesView";
import { Home, Route as RouteIcon, Banknote, User, Package, MapPin, Phone, History, AlertTriangle, LogOut } from "lucide-react";
import { useDeliveryStore } from "../store/useDeliveryStore";
import { useDeliveryNotificationContext } from "../../Food/context/DeliveryNotificationContext";
import apiClient, { dmbDeliveryAPI, deliveryAPI } from "../../../services/api";
import { useDMBTracking } from "../hooks/useDMBTracking";
import { clearModuleAuth } from "@food/utils/auth";
import { toast } from "sonner";

function NewDeliveryDashboard({ children }) {
  useDMBTracking();
  const [stats, setStats] = useState(INITIAL_DRIVER_STATS);
  const [orders, setOrders] = useState([]);
  const [stops, setStops] = useState([]);
  const [shifts, setShifts] = useState(INITIAL_SHIFTS);
  const [pickupFirstModalOpen, setPickupFirstModalOpen] = useState(false);
  const [appLogo, setAppLogo] = useState(null);

  useEffect(() => {
    const fetchAppConfig = async () => {
      try {
        const response = await apiClient.get("/api/v1/app-config/delivery_app");
        if (response.data?.success && response.data?.data?.logoUrl) {
          setAppLogo(response.data.data.logoUrl);
        }
      } catch (err) {
        console.error("Failed to fetch app config", err);
      }
    };
    fetchAppConfig();
  }, []);

  const isOnline = useDeliveryStore((state) => state.isOnline);
  const toggleOnlineAction = useDeliveryStore((state) => state.toggleOnline);
  const setOnlineAction = useDeliveryStore((state) => state.setOnline);
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
    if (pathname.includes('/routes') || pathname.includes('/history')) return 'routes';
    if (pathname.includes('/route')) return 'route';
    if (pathname.includes('/earn') || pathname.includes('/pocket')) return 'earnings';
    if (pathname.includes('/profile')) return 'profile';
    return 'home';
  };

  const [currentScreen, setCurrentScreen] = useState(getScreenFromPath(location.pathname));
  const [isRouteAccepted, setIsRouteAccepted] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const selectedOrderIdRef = useRef(null);
  const [backScreen, setBackScreen] = useState("route");
  const [selectedRouteStop, setSelectedRouteStop] = useState(null);

  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId;
  }, [selectedOrderId]);

  const activeOrder = orders.find(o => o.id === selectedOrderId)
    || (selectedRouteStop ? (() => {
        const stop = selectedRouteStop;
        const isPickup = stop.type === 'pickup' || stop.type === 'P';
        return {
          id: stop.orderId || stop.id || (stop.vendorId ? `vendor_${stop.vendorId}` : 'route-stop'),
          // Vendor fields (for PickupVerification)
          vendorName: isPickup ? stop.name : (stop.vendorName || ''),
          vendorAddress: isPickup ? stop.address : (stop.vendorAddress || ''),
          vendorPhone: stop.phone || 'N/A',
          vendorLat: stop.lat || null,
          vendorLng: stop.lng || null,
          // New slot-based fields
          vendorId: stop.vendorId || null,
          slot: stop.slot || stop.deliverySlot || null,
          vendorStatus: stop.vendorStatus || 'scheduled',
          orderCount: stop.orderCount || 1,
          collectionPin: stop.collectionPin || null,
          // Customer fields (for DeliveryConfirmation)
          customerName: !isPickup ? stop.name : 'Customer',
          customerAddress: !isPickup ? stop.address : '',
          customerPhone: stop.phone || 'N/A',
          customerLat: stop.lat || null,
          customerLng: stop.lng || null,
          // Common fields
          status: isPickup ? 'ready_for_pickup' : 'picked_up',
          pin: stop.collectionPin || '----',
          deliveryPin: stop.deliveryPin || '----',
          riderEarning: stop.riderEarning || 0,
          boxCount: stop.orderCount || 1,
          items: stop.orderCount
            ? [{ id: 1, name: 'Meal Boxes', quantity: stop.orderCount, checked: false }]
            : [{ id: 1, name: 'Meal Box', quantity: 1, checked: false }]
        };
      })()
    : null)
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
            vendorName: o.vendorId?.restaurantName || '',
            vendorAddress: o.vendorId?.addressLine1 || 'Vendor Address',
            vendorPhone: o.vendorId?.phone || "N/A",
            vendorLat: o.vendorId?.location?.latitude || o.vendorId?.location?.coordinates?.[1] || null,
            vendorLng: o.vendorId?.location?.longitude || o.vendorId?.location?.coordinates?.[0] || null,
            customerName: o.userId?.name || '',
            customerAddress: o.deliveryAddress?.addressLine1 || o.deliveryAddress?.city || 'Customer Address',
            customerLat: o.deliveryAddress?.location?.latitude || o.deliveryAddress?.location?.coordinates?.[1] || null,
            customerLng: o.deliveryAddress?.location?.longitude || o.deliveryAddress?.location?.coordinates?.[0] || null,
            customerPhone: o.userId?.phone || "N/A",
            deliveryInstructions: o.deliveryInstructions || "",
            boxCount: o.meals?.reduce((acc, m) => acc + (m.quantity || 1), 0) || 1,
            status: o.status,
            deliveryPin: o.deliveryPin,
            pin: o.pin,
            riderEarning: o.riderEarning || 0,
            pickupTimeStr: o.deliverySlot,
            dropTimeStr: "Before " + (o.deliverySlot === 'lunch' ? '13:00' : '19:00'),
            pickedUpAt: o.pickedUpAt,
            vendorId: o.vendorId?._id || o.vendorId || null,
            slot: o.deliverySlot || null
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
    setBackScreen("route");
    if (activeOrder?.status === "ready_for_pickup") {
      setCurrentScreen("pickup");
    } else if (activeOrder?.status === "picked_up") {
      setCurrentScreen("delivery");
    } else {
      setCurrentScreen("route");
    }
  };

  const handleConfirmPickup = async () => {
    // Clear the active selection lock so the new route stops (deliveries) can load completely
    setSelectedOrderId(null);
    selectedOrderIdRef.current = null;
    
    // Go back to the route screen so the driver can see their delivery tasks
    setCurrentScreen("route");
    
    // Optimistic UI updates
    setOrders(prev => prev.map(o => ({ ...o, status: "picked_up" })));
    setStops(prev => prev.map(s => {
      if (s.type === "pickup" || s.type === "P") return { ...s, status: "COMPLETED" };
      if (s.type === "delivery" || s.type === "D") return { ...s, status: "READY" };
      return s;
    }));
    
    // Fetch live route from backend to get the actual delivery stops and correct earning amounts
    await fetchActiveRoute();
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

  const handleLogout = async () => {
    try {
      // 1. Sync offline state on backend & store
      setOnlineAction(false);
      try {
        await dmbDeliveryAPI.goOffline();
      } catch (err) {
        console.warn("Failed to set offline in backend during logout:", err?.response?.data?.message || err.message);
      }

      // 2. Call backend logout API to clean up JWT and FCM token
      let fcmToken = null;
      let platform = "web";
      try {
        if (typeof window !== "undefined" && window.flutter_inappwebview) {
          platform = "mobile";
          const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
          for (const handlerName of handlerNames) {
            try {
              const t = await window.flutter_inappwebview.callHandler(handlerName, { module: "delivery" });
              if (t && typeof t === "string" && t.length > 20) {
                fcmToken = t.trim();
                break;
              }
            } catch (e) {}
          }
        }
      } catch (e) {}

      try {
        await deliveryAPI.logout(null, fcmToken, platform);
      } catch (err) {
        console.warn("Backend logout API failed:", err?.response?.data?.message || err.message);
      }
    } catch (e) {
      console.error("Error in logout cleanup:", e);
    } finally {
      // 3. Clear auth module state, token from localStorage
      clearModuleAuth("delivery");
      localStorage.removeItem("app:isOnline");

      // 4. Disconnect socket
      if (socket && driverId) {
        socket.emit("leave_driver_room", driverId);
      }

      // 5. Toast and Redirect
      toast.success("Logged out successfully");
      navigate("/food/delivery/login", { replace: true });
    }
  };

  const handleSelectOrder = (stopOrId) => {
    const stop = typeof stopOrId === 'object'
      ? stopOrId
      : stops.find(s => s.id === stopOrId || s.orderId === stopOrId);

    // Guard: if stop is already completed, don't open pickup/delivery page
    if (stop) {
      const stopStatus = String(stop.status || '').toLowerCase();
      if (stopStatus === 'completed' || stopStatus === 'delivered' || stopStatus === 'done') {
        toast.info('This stop has already been completed.');
        return;
      }
    }

    if (stop && (stop.type === 'delivery' || stop.type === 'D')) {
      const hasPendingPickup = stops.some(s => (s.type === 'pickup' || s.type === 'P') && s.status !== 'COMPLETED' && s.status !== 'completed');
      if (stop.awaitingPickup || hasPendingPickup) {
        setPickupFirstModalOpen(true);
        return;
      }
    }

    const stopKey = stop ? (stop.orderId || stop.id || (stop.vendorId ? `vendor_${stop.vendorId}` : null)) : stopOrId;
    setSelectedOrderId(stopKey);
    if (stop) {
      setSelectedRouteStop(stop);
      setBackScreen("routes");
      if (stop.type === 'pickup' || stop.type === 'P') {
        setCurrentScreen('pickup');
      } else {
        setCurrentScreen('delivery');
      }
    }
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
      case "routes":
        return <RoutesView
          onSelectStop={handleSelectOrder}
        />;
      case "route":
        const totalEarnings = orders.reduce((sum, o) => sum + (o.riderEarning || 0), 0);
        return <RouteView
          stops={stops}
          onAcceptRoute={handleAcceptRoute}
          isAccepted={isRouteAccepted}
          onNextStep={handleNextRouteStep}
          activeOrder={activeOrder}
          routeMetadata={routeMetadata}
          totalEarnings={totalEarnings}
        />;
      case "pickup":
        return <PickupVerification
          order={activeOrder}
          onGoBack={() => setCurrentScreen(backScreen)}
          onConfirmPickup={handleConfirmPickup}
          onReportIssue={handleReportIssue}
        />;
      case "delivery":
        return <DeliveryConfirmation
          order={activeOrder}
          orders={orders}
          stops={stops}
          onSelectOrder={handleSelectOrder}
          onGoBack={() => setCurrentScreen(backScreen)}
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
          onLogout={handleLogout}
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
    <div className="flex h-screen overflow-hidden bg-[#F5F5F0] font-sans relative">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-[260px] bg-[#006a5c] text-white h-full flex-shrink-0 shadow-xl z-50">
        <div className="px-6 py-6 flex justify-start pl-8">
          <img 
            src={appLogo || "https://res.cloudinary.com/hmuqqx79/image/upload/v1784878828/app-logos/jptpxhxz6nfk9f5hry1p.jpg"} 
            alt="App Logo" 
            className="w-[100px] h-auto object-contain rounded-lg bg-white shadow-sm p-1" 
          />
        </div>

        <div className="flex-1 px-4 space-y-2 mt-4">
          <button onClick={() => { navigate('/food/delivery/feed'); setCurrentScreen("home"); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${currentScreen === "home" ? "bg-white text-[#006a5c]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}> 
            <Home className="w-5 h-5" /> Home
          </button>
          <button onClick={() => { navigate('/food/delivery/routes'); setCurrentScreen("routes"); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${currentScreen === "routes" ? "bg-white text-[#006a5c]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}> 
            <History className="w-5 h-5" /> Routes
          </button>
          <button onClick={() => { navigate('/food/delivery/route'); setCurrentScreen("route"); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${["route", "pickup", "delivery"].includes(currentScreen) ? "bg-white text-[#006a5c]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}> 
            <RouteIcon className="w-5 h-5" /> Active Route
          </button>
          <button onClick={() => { navigate('/food/delivery/earn'); setCurrentScreen("earnings"); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${currentScreen === "earnings" ? "bg-white text-[#006a5c]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}> 
            <Banknote className="w-5 h-5" /> Earnings
          </button>
          <button onClick={() => { navigate('/food/delivery/profile'); setCurrentScreen("profile"); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${["profile", "shifts"].includes(currentScreen) ? "bg-white text-[#006a5c]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}> 
            <User className="w-5 h-5" /> Profile
          </button>
        </div>

        <div className="p-4 border-t border-white/20 mt-auto">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-all">
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative w-full h-full pb-20 md:pb-0 text-gray-800 !max-w-none !m-0">
        <div className="h-1 bg-[#00604c] w-full sticky top-0 z-50 md:hidden" />
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-4 md:pt-8">

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
                          {newBatchRequest.vendorInfo?.vendorName || newBatchRequest.vendorName || ''}
                        </p>
                        {newBatchRequest.vendorInfo?.vendorAddress && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            📍 {newBatchRequest.vendorInfo.vendorAddress}
                          </p>
                        )}
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

                {/* Total Delivery Earnings */}
                {newBatchRequest.totalEarnings !== undefined && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-800">Est. Delivery Earnings</span>
                    <span className="text-base font-black text-emerald-700">₹{Number(newBatchRequest.totalEarnings).toFixed(2)}</span>
                  </div>
                )}

                {/* Stops Details & Sequence */}
                {newBatchRequest.orders && newBatchRequest.orders.length > 0 && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2 text-left">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Delivery Stops Sequence ({newBatchRequest.orders.length})</p>
                    <div className="max-h-28 overflow-y-auto space-y-2 pr-1 font-sans">
                      {newBatchRequest.orders.map((order, idx) => (
                        <div key={order._id || idx} className="text-xs border-b border-gray-200/60 pb-2 last:border-0 last:pb-0">
                          <p className="font-extrabold text-gray-800">Stop #{idx + 1}: {order.customer?.name || ''}</p>
                          <p className="text-gray-500 mt-0.5">📍 {order.deliveryAddress?.street || 'No Street'}, {order.deliveryAddress?.city || 'No City'}</p>
                          {order.customer?.phone && (
                            <p className="text-gray-400 text-[10px] mt-0.5">📞 {order.customer.phone}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

        {children || renderActiveScreen()}
        </div>
      </main>

      {/* Pickup First modal alert */}
      {pickupFirstModalOpen && (
        <div className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center flex flex-col items-center space-y-4 border border-gray-100 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h3 className="text-lg font-black text-gray-900">Pickup Required</h3>
            
            <p className="text-sm text-gray-600 font-medium leading-relaxed">
              Please pick up the meal box from the vendor first.
            </p>
            
            <button
              onClick={() => setPickupFirstModalOpen(false)}
              className="w-full py-3 bg-[#1F7A63] text-white rounded-2xl font-bold shadow-md hover:bg-[#1f7a63]/90 active:scale-98 transition-all"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full z-45 bg-white pt-2.5 pb-4 border-t border-[#bec9c3] flex justify-around items-center md:hidden">
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
          onClick={() => { navigate('/food/delivery/routes'); setCurrentScreen("routes"); }}
          className={`flex flex-col items-center justify-center text-xs py-1 px-4 rounded-xl transition-all duration-150 ${currentScreen === "routes" ? "bg-[#9ef3d7] text-[#005140] font-extrabold shadow-xs" : "text-[#3e4945] hover:text-[#00604c]"}`}
        >
          <History className="w-4.5 h-4.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Routes</span>
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