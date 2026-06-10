import { useState, useEffect, useCallback, useRef } from "react";
import { dmbCustomerAPI } from "@food/api";

const SLOT_LABELS = { breakfast: "Breakfast ☀️", lunch: "Lunch 🌤️", dinner: "Dinner 🌙" };

const getUTCFormatDateStr = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getISTTodayStr = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

const getISTTomorrowStr = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const tomorrowDate = new Date(Date.now() + 86400000);
  return formatter.format(tomorrowDate);
};

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", color: "bg-[#E8F3F0] text-primary", icon: "schedule", canManage: true },
  preparing: { label: "Preparing 🔥", color: "bg-amber-100 text-amber-700", icon: "soup_kitchen", canManage: false },
  ready: { label: "Ready ✓", color: "bg-blue-100 text-blue-700", icon: "check_circle", canManage: false },
  out_for_delivery: { label: "On the Way 🛵", color: "bg-purple-100 text-purple-700", icon: "local_shipping", canManage: false },
  delivered: { label: "Delivered ✅", color: "bg-green-100 text-green-700", icon: "done_all", canManage: false },
  skipped: { label: "Skipped", color: "bg-red-100 text-red-600", icon: "cancel", canManage: false },
};

// ─── Module-level cache (survives tab switches within a session) ────────────
// Structure: { upcoming: { data, fetchedAt }, past: { data, fetchedAt } }
const _ordersCache = { upcoming: null, past: null };
const CACHE_TTL_MS = 60_000; // 1 minute

function getCached(type) {
  const entry = _ordersCache[type];
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) { _ordersCache[type] = null; return null; }
  return entry.data;
}

function setCached(type, data) {
  _ordersCache[type] = { data, fetchedAt: Date.now() };
}

export function clearOrdersCache() {
  _ordersCache.upcoming = null;
  _ordersCache.past = null;
}

// ─── Skeleton card ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-[20px] p-4 shadow-sm border border-[#f0eded] animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="h-3 bg-slate-200 rounded w-32" />
        <div className="h-5 bg-slate-200 rounded-full w-20" />
      </div>
      <div className="h-5 bg-slate-200 rounded w-3/4" />
      <div className="h-3 bg-slate-100 rounded w-1/3" />
      <div className="h-px bg-[#f0eded]" />
      <div className="flex justify-between items-center">
        <div className="h-4 bg-slate-100 rounded w-24" />
        <div className="h-8 bg-slate-100 rounded-xl w-28" />
      </div>
    </div>
  );
}

export function OrdersScreen({ onGoBack, onTrackLive, onGoToProfile, onShowNotificationToast, socket }) {
  const [activeTab, setActiveTab] = useState("Upcoming");
  const cacheKey = activeTab === "Upcoming" ? "upcoming" : "past";

  // ── Initialise from cache immediately to avoid spinner flash ──────────────
  const [orders, setOrders] = useState(() => getCached(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !getCached(cacheKey));
  const [ratedOrders, setRatedOrders] = useState([]);

  // ─── Manage Sheet State ──────────────────────────────────────────────────
  const [manageOrder, setManageOrder] = useState(null);
  const [manageMode, setManageMode] = useState(null);
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pauseDays, setPauseDays] = useState(1);

  // ─── Load orders (stale-while-revalidate) ────────────────────────────────
  const loadOrders = useCallback(async (type, { bustCache = false } = {}) => {
    const key = type === "Upcoming" ? "upcoming" : "past";
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) { setOrders([]); setLoading(false); return; }

      // Serve cache instantly, then revalidate in background
      if (!bustCache) {
        const hit = getCached(key);
        if (hit) {
          setOrders(hit);
          setLoading(false);
          // fall through to background revalidate (no spinner)
        }
      }

      const res = await dmbCustomerAPI.getMyOrders(key);
      if (res.data?.success) {
        const fresh = res.data.orders ?? [];
        setCached(key, fresh);
        setOrders(fresh);
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when tab changes; initialise from cache synchronously first
  useEffect(() => {
    const hit = getCached(cacheKey);
    if (hit) { setOrders(hit); setLoading(false); }
    else { setOrders([]); setLoading(true); }
    loadOrders(activeTab);
  }, [activeTab, loadOrders]);

  // ─── Socket: real-time status + daily menu updates ───────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleStatusUpdate = (data) => {
      setOrders(prev =>
        prev.map(o =>
          o.orderId === data.orderId || String(o._id) === String(data._id)
            ? { ...o, status: data.status }
            : o
        )
      );
      // Keep cache in sync so next tab switch reflects reality
      const key = activeTab === "Upcoming" ? "upcoming" : "past";
      const cached = getCached(key);
      if (cached) {
        const updated = cached.map(o =>
          o.orderId === data.orderId || String(o._id) === String(data._id)
            ? { ...o, status: data.status }
            : o
        );
        setCached(key, updated);
      }
      const label = STATUS_CONFIG[data.status]?.label || data.status;
      onShowNotificationToast?.(`🔔 Order ${data.orderId} → ${label}`);
    };

    const handleDailyMenuUpdated = () => {
      loadOrders(activeTab, { bustCache: true });
    };

    socket.on("order_status_updated", handleStatusUpdate);
    socket.on("daily_menu_updated", handleDailyMenuUpdated);
    return () => {
      socket.off("order_status_updated", handleStatusUpdate);
      socket.off("daily_menu_updated", handleDailyMenuUpdated);
    };
  }, [socket, activeTab, loadOrders, onShowNotificationToast]);

  // ─── Manage sheet helpers ─────────────────────────────────────────────────
  const openManage = useCallback((order) => {
    setManageOrder(order);
    setManageMode("actions");
    setSelectedMealIds(order.meals?.map(m => m.mealPlanId || m._id) ?? []);
  }, []);

  const closeManage = useCallback(() => {
    setManageOrder(null);
    setManageMode(null);
    setAvailableMeals([]);
    setSelectedMealIds([]);
  }, []);

  const handleSkip = useCallback(async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.skipDailyOrder(manageOrder._id);
      // Optimistic update — no need to refetch
      setOrders(prev => prev.map(o =>
        o._id === manageOrder._id ? { ...o, status: "skipped" } : o
      ));
      const key = activeTab === "Upcoming" ? "upcoming" : "past";
      const cached = getCached(key);
      if (cached) setCached(key, cached.map(o =>
        o._id === manageOrder._id ? { ...o, status: "skipped" } : o
      ));
      onShowNotificationToast?.("✅ Order skipped. Credit will be added to your wallet.");
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to skip order");
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, activeTab, onShowNotificationToast, closeManage]);

  const handlePause = useCallback(async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.pauseSubscription(
        manageOrder.subscriptionId,
        pauseDays,
        "Customer requested pause"
      );
      onShowNotificationToast?.(`⏸️ Subscription paused for ${pauseDays} day${pauseDays > 1 ? "s" : ""}`);
      loadOrders(activeTab, { bustCache: true });
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to pause subscription");
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, pauseDays, activeTab, loadOrders, onShowNotificationToast, closeManage]);

  const openChangeMeal = useCallback(async () => {
    if (!manageOrder?.vendor?.name) { setManageMode("change_meal"); return; }
    try {
      const vendorId = manageOrder.vendorId || manageOrder._id;
      const res = await dmbCustomerAPI.getVendorMenu(vendorId);
      setAvailableMeals(res.data?.meals ?? res.data?.plans ?? []);
    } catch { /* show empty state */ }
    setManageMode("change_meal");
  }, [manageOrder]);

  const handleChangeMeal = useCallback(async () => {
    if (!manageOrder || selectedMealIds.length === 0) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.changeDailyOrderMeal(manageOrder._id, selectedMealIds);
      onShowNotificationToast?.("✅ Meal updated for this delivery!");
      loadOrders(activeTab, { bustCache: true });
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to change meal");
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, selectedMealIds, activeTab, loadOrders, onShowNotificationToast, closeManage]);

  const toggleMealSelection = useCallback((id) => {
    setSelectedMealIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  // ─── Date helpers (stable, defined once) ─────────────────────────────────
  const formatDate = useCallback((date) =>
    new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }), []);

  const isTomorrow = useCallback((date) => {
    const orderDateStr = getUTCFormatDateStr(date);
    return orderDateStr === getISTTomorrowStr();
  }, []);

  const isToday = useCallback((date) => {
    const orderDateStr = getUTCFormatDateStr(date);
    return orderDateStr === getISTTodayStr();
  }, []);

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button
          onClick={onGoBack}
          className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"
        >
          arrow_back
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">My Orders</h1>
        <div className="w-8" />
      </header>

      <main className="px-5 pt-20">
        {/* Tabs */}
        <div className="flex border-b border-[#bec9c3] mb-5">
          {["Upcoming", "Past"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-grow py-3 text-center font-bold text-sm transition-colors ${activeTab === tab
                ? "text-primary border-b-2 border-primary-container"
                : "text-on-surface-variant hover:text-on-surface"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          // Skeleton — matches real card shape, no layout shift
          <section className="space-y-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </section>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-on-surface-variant">
            <span className="material-symbols-outlined text-[56px] text-[#bec9c3]">receipt_long</span>
            <p className="text-[15px] font-semibold text-center">
              {activeTab === "Upcoming" ? "No upcoming deliveries" : "No past orders yet"}
            </p>
            <p className="text-[13px] text-center">
              {activeTab === "Upcoming"
                ? "Subscribe to a meal plan to get started!"
                : "Your completed orders will appear here."}
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            {orders.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.scheduled;
              const mealName = order.meals?.[0]?.name || "Meal";
              const extraMeals = (order.meals?.length ?? 1) - 1;
              const isPast = activeTab === "Past";
              const isTomorrowOrder = isTomorrow(order.deliveryDate);
              const isTodayOrder = isToday(order.deliveryDate);

              let dateStr = "";
              if (isTodayOrder) dateStr = "TODAY";
              else if (isTomorrowOrder) dateStr = "TOMORROW";
              else {
                const d = new Date(order.deliveryDate);
                dateStr = `${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}`;
              }
              const slotStr = (order.deliverySlot || "LUNCH").toUpperCase();

              return (
                <div key={order._id || order.orderId} className="bg-white rounded-[20px] p-4 shadow-sm mb-3 border border-[#f0eded]">
                  {/* Top: Date + Status Badge */}
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-[12px] font-bold text-[#5c6e68] tracking-wider uppercase font-sans">
                      {dateStr} · {slotStr}
                    </p>
                    <span className={`font-bold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider font-sans text-white ${order.status === "skipped" ? "bg-red-500" : "bg-[#2a7a62]"
                      }`}>
                      {order.status === "skipped" ? "SKIPPED" : order.status === "scheduled" ? "SCHEDULED" : "ACTIVE"}
                    </span>
                  </div>

                  {/* Meal Name */}
                  <h4 className="text-[18px] font-bold text-[#1b1c1c] leading-tight mb-1">
                    {mealName}
                    {extraMeals > 0 && (
                      <span className="text-[14px] text-gray-500 font-medium ml-1">+{extraMeals}</span>
                    )}
                  </h4>

                  {/* Customer Name */}
                  <div className="flex items-center gap-1.5 mb-4">
                    <span className="material-symbols-outlined text-[16px] text-[#5c6e68]">person</span>
                    <span className="text-[14px] text-[#5c6e68]">{order.userId?.name || "Maria K."}</span>
                  </div>

                  <div className="h-[1px] bg-[#f0eded] w-full mb-3" />

                  {/* Bottom Action Row */}
                  <div className="flex items-center justify-between">
                    {isPast || order.status === "skipped" ? (
                      <div className="flex items-center gap-1.5 text-[#5c6e68]">
                        <span className={`material-symbols-outlined text-[18px] ${order.status === "skipped" ? "text-red-500" : ""}`}>
                          {order.status === "skipped" ? "cancel" : "history"}
                        </span>
                        <span className={`text-[14px] font-medium ${order.status === "skipped" ? "text-red-500" : ""}`}>
                          {order.status === "skipped" ? "Skipped" : "Completed"}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[#006a5c]">
                        <span className="material-symbols-outlined text-[18px]">{statusCfg.icon}</span>
                        <span className="text-[14px] font-medium">
                          {statusCfg.label.replace(/ [🔥✓🛵✅]/gu, "")}
                        </span>
                      </div>
                    )}

                    {!isPast && order.status !== "skipped" ? (
                      <button
                        onClick={() => onTrackLive(order)}
                        className="text-[#006a5c] border border-[#006a5c] rounded-xl px-4 py-1.5 text-[13px] font-medium hover:bg-[#e8f3f0] active:scale-95 transition-all flex items-center gap-1"
                      >
                        Track Live <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    ) : isPast && order.status !== "skipped" ? (
                      <button
                        onClick={() => {
                          setRatedOrders(prev =>
                            prev.includes(order.orderId) ? prev : [...prev, order.orderId]
                          );
                          onShowNotificationToast?.(
                            ratedOrders.includes(order.orderId) ? "Already rated!" : "⭐ Thanks for rating!"
                          );
                        }}
                        className={`border rounded-xl px-4 py-1.5 text-[13px] font-medium active:scale-95 transition-all flex items-center gap-1 ${ratedOrders.includes(order.orderId)
                          ? "text-[#006a5c] border-[#006a5c]"
                          : "text-gray-500 border-gray-300"
                          }`}
                      >
                        {ratedOrders.includes(order.orderId) ? "Rated" : "Rate"}{" "}
                        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>

      {/* ─── Manage Bottom Sheet ──────────────────────────────────────────── */}
      {manageOrder && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closeManage}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl w-full max-w-[390px] mx-auto px-5 pt-5 pb-10 animate-slideUp"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-[#ddd] rounded-full mx-auto mb-4" />

            {manageMode === "actions" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-1">Manage Delivery</h2>
                <p className="text-[13px] text-on-surface-variant mb-1 font-medium">
                  {manageOrder.meals?.[0]?.name || "Meal"}
                </p>
                <p className="text-[12px] text-on-surface-variant mb-5">
                  {formatDate(manageOrder.deliveryDate)} · {SLOT_LABELS[manageOrder.deliverySlot] || ""}
                  {isTomorrow(manageOrder.deliveryDate) && (
                    <span className="ml-2 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">TOMORROW</span>
                  )}
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => setManageMode("confirm_skip")}
                    className="w-full flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-red-500 text-[22px]">cancel</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-bold text-on-surface">Skip This Delivery</p>
                      <p className="text-[12px] text-on-surface-variant font-medium">Wallet credit will be applied</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
                  </button>

                  <button
                    onClick={openChangeMeal}
                    className="w-full flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl hover:bg-blue-100 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-blue-500 text-[22px]">swap_horiz</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-bold text-on-surface">Change Meal</p>
                      <p className="text-[12px] text-on-surface-variant font-medium">Switch to a different meal option</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
                  </button>

                  <button
                    onClick={() => setManageMode("pause")}
                    className="w-full flex items-center gap-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl hover:bg-amber-100 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined text-amber-600 text-[22px]">pause_circle</span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-bold text-on-surface">Pause Subscription</p>
                      <p className="text-[12px] text-on-surface-variant font-medium">Pause for 1–2 days</p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant text-[18px]">chevron_right</span>
                  </button>
                </div>

                <button onClick={closeManage} className="w-full mt-4 py-3 text-center text-[14px] font-bold text-on-surface-variant">
                  Cancel
                </button>
              </>
            )}

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Skip This Delivery?</h2>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  Your {formatDate(manageOrder.deliveryDate)} delivery will be skipped and the day's amount will be credited to your wallet.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setManageMode("actions")} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant hover:bg-slate-50">
                    Go Back
                  </button>
                  <button
                    onClick={handleSkip}
                    disabled={loadingAction}
                    className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Confirm Skip
                  </button>
                </div>
              </>
            )}

            {manageMode === "pause" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Pause Subscription</h2>
                <p className="text-[13px] text-on-surface-variant mb-5">Select how many days to pause your subscription.</p>
                <div className="flex gap-3 mb-6">
                  {[1, 2].map(d => (
                    <button
                      key={d}
                      onClick={() => setPauseDays(d)}
                      className={`flex-1 py-4 rounded-2xl font-bold text-[15px] border-2 transition-all active:scale-95 ${pauseDays === d
                        ? "border-primary bg-[#e8f3f0] text-primary"
                        : "border-[#e4e2e1] bg-white text-on-surface-variant hover:bg-slate-50"
                        }`}
                    >
                      {d} Day{d > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setManageMode("actions")} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">
                    Go Back
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={loadingAction}
                    className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Pause {pauseDays} Day{pauseDays > 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}

            {manageMode === "change_meal" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Change Meal</h2>
                <p className="text-[13px] text-on-surface-variant mb-4">Choose meals for this delivery from the vendor's menu.</p>

                {availableMeals.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center mb-5">
                    <span className="material-symbols-outlined text-[36px] text-slate-300 mb-2">restaurant_menu</span>
                    <p className="text-[13px] text-slate-500 font-medium">No alternate meals available from this vendor right now.</p>
                    <p className="text-[12px] text-slate-400 mt-1">Current selection will be kept.</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
                    {availableMeals.map(meal => {
                      const id = meal._id || meal.id;
                      const isSelected = selectedMealIds.includes(id);
                      return (
                        <button
                          key={id}
                          onClick={() => toggleMealSelection(id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${isSelected ? "border-primary bg-[#e8f3f0]" : "border-[#e4e2e1] bg-white hover:bg-slate-50"
                            }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "border-primary bg-primary" : "border-[#ccc]"
                            }`}>
                            {isSelected && <span className="material-symbols-outlined text-white text-[12px]">check</span>}
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-on-surface">{meal.name}</p>
                            <p className="text-[11px] text-on-surface-variant font-medium">₹{meal.pricePerDay || meal.price || "—"}/day</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setManageMode("actions")} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">
                    Go Back
                  </button>
                  <button
                    onClick={handleChangeMeal}
                    disabled={loadingAction || selectedMealIds.length === 0}
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    Confirm Change
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}