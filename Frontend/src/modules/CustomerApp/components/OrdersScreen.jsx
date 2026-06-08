import { useState, useEffect } from "react";
import { dmbCustomerAPI } from "@food/api";

const SLOT_LABELS = { breakfast: "Breakfast ☀️", lunch: "Lunch 🌤️", dinner: "Dinner 🌙" };

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", color: "bg-[#E8F3F0] text-primary", icon: "schedule", canManage: true },
  preparing: { label: "Preparing 🔥", color: "bg-amber-100 text-amber-700", icon: "soup_kitchen", canManage: false },
  ready: { label: "Ready ✓", color: "bg-blue-100 text-blue-700", icon: "check_circle", canManage: false },
  out_for_delivery: { label: "On the Way 🛵", color: "bg-purple-100 text-purple-700", icon: "local_shipping", canManage: false },
  delivered: { label: "Delivered ✅", color: "bg-green-100 text-green-700", icon: "done_all", canManage: false },
  skipped: { label: "Skipped", color: "bg-red-100 text-red-600", icon: "cancel", canManage: false },
};

export function OrdersScreen({ onGoBack, onTrackLive, onGoToProfile, onShowNotificationToast, socket }) {
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratedOrders, setRatedOrders] = useState([]);

  // ─── Manage Sheet State ──────────────────────────────────────────────────
  const [manageOrder, setManageOrder] = useState(null); // order being managed
  const [manageMode, setManageMode] = useState(null);   // 'actions' | 'change_meal' | 'pause'
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pauseDays, setPauseDays] = useState(1);

  // ─── Load orders ──────────────────────────────────────────────────────────
  const loadOrders = async (type) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) { setOrders([]); setLoading(false); return; }
      const res = await dmbCustomerAPI.getMyOrders(type === "Upcoming" ? "upcoming" : "past");
      if (res.data?.success) setOrders(res.data.orders || []);
    } catch (err) {
      console.error("Failed to load orders:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(activeTab); }, [activeTab]);

  // ─── Socket: Real-time status updates & Daily Menu updates ───────────────
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
      const label = STATUS_CONFIG[data.status]?.label || data.status;
      onShowNotificationToast?.(`🔔 Order ${data.orderId} → ${label}`);
    };

    const handleDailyMenuUpdated = () => {
      loadOrders(activeTab);
    };

    socket.on("order_status_updated", handleStatusUpdate);
    socket.on("daily_menu_updated", handleDailyMenuUpdated);

    return () => {
      socket.off("order_status_updated", handleStatusUpdate);
      socket.off("daily_menu_updated", handleDailyMenuUpdated);
    };
  }, [socket, activeTab]);

  // ─── Open manage sheet ───────────────────────────────────────────────────
  const openManage = (order) => {
    setManageOrder(order);
    setManageMode("actions");
    setSelectedMealIds(order.meals?.map(m => m.mealPlanId || m._id) || []);
  };

  const closeManage = () => {
    setManageOrder(null);
    setManageMode(null);
    setAvailableMeals([]);
    setSelectedMealIds([]);
  };

  // ─── Skip order ──────────────────────────────────────────────────────────
  const handleSkip = async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.skipDailyOrder(manageOrder._id);
      setOrders(prev => prev.map(o => o._id === manageOrder._id ? { ...o, status: "skipped" } : o));
      onShowNotificationToast?.("✅ Order skipped. Credit will be added to your wallet.");
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to skip order");
    } finally {
      setLoadingAction(false);
    }
  };

  // ─── Pause subscription ──────────────────────────────────────────────────
  const handlePause = async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.pauseSubscription(
        manageOrder.subscriptionId,
        pauseDays,
        "Customer requested pause"
      );
      onShowNotificationToast?.(`⏸️ Subscription paused for ${pauseDays} day${pauseDays > 1 ? "s" : ""}`);
      await loadOrders(activeTab);
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to pause subscription");
    } finally {
      setLoadingAction(false);
    }
  };

  // ─── Load available meals for change-meal ────────────────────────────────
  const openChangeMeal = async () => {
    if (!manageOrder?.vendor?.name) { setManageMode("change_meal"); return; }
    try {
      // Get vendor ID from subscription — use order's vendorId stored in meals or vendor
      const vendorId = manageOrder.vendorId || manageOrder._id; // fallback
      const res = await dmbCustomerAPI.getVendorMenu(vendorId);
      if (res.data?.meals) setAvailableMeals(res.data.meals);
      else if (res.data?.plans) setAvailableMeals(res.data.plans);
    } catch (e) {}
    setManageMode("change_meal");
  };

  // ─── Submit meal change ──────────────────────────────────────────────────
  const handleChangeMeal = async () => {
    if (!manageOrder || selectedMealIds.length === 0) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.changeDailyOrderMeal(manageOrder._id, selectedMealIds);
      onShowNotificationToast?.("✅ Meal updated for this delivery!");
      await loadOrders(activeTab);
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to change meal");
    } finally {
      setLoadingAction(false);
    }
  };

  const toggleMealSelection = (id) => {
    setSelectedMealIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const formatDate = (date) =>
    new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  const isTomorrow = (date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Date(date).toDateString() === tomorrow.toDateString();
  };

  const isToday = (date) => new Date(date).toDateString() === new Date().toDateString();

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 flex justify-between items-center w-full px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
          arrow_back
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">My Orders</h1>
        <div className="w-8" />
      </header>

      <main className="px-5 pt-5">
        {/* Tabs */}
        <div className="flex border-b border-[#bec9c3] mb-5">
          {["Upcoming", "Past"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-grow py-3 text-center font-bold text-sm transition-colors ${
                activeTab === tab ? "text-primary border-b-2 border-primary-container" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-on-surface-variant">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-[14px] font-medium">Loading orders…</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-on-surface-variant">
            <span className="material-symbols-outlined text-[56px] text-[#bec9c3]">receipt_long</span>
            <p className="text-[15px] font-semibold text-center">
              {activeTab === "Upcoming" ? "No upcoming deliveries" : "No past orders yet"}
            </p>
            <p className="text-[13px] text-center">
              {activeTab === "Upcoming" ? "Subscribe to a meal plan to get started!" : "Your completed orders will appear here."}
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            {orders.map((order) => {
              const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.scheduled;
              const mealName = order.meals?.[0]?.name || "Meal";
              const extraMeals = (order.meals?.length || 1) - 1;
              const isPast = activeTab === "Past";
              const isDelivered = order.status === "delivered";
              const canManage = statusCfg.canManage && !isPast;
              const isTomorrowOrder = isTomorrow(order.deliveryDate);
              const isTodayOrder = isToday(order.deliveryDate);

              return (
                <div key={order._id || order.orderId} className="bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/30">
                  {/* Top: Date + Status */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-sans flex items-center gap-1.5">
                        {isTodayOrder && <span className="bg-primary text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold">TODAY</span>}
                        {isTomorrowOrder && <span className="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-extrabold">TOMORROW</span>}
                        {formatDate(order.deliveryDate)} · {SLOT_LABELS[order.deliverySlot] || order.deliverySlot}
                      </p>
                      <h4 className="text-[17px] font-extrabold text-on-surface leading-tight">
                        {mealName}
                        {extraMeals > 0 && <span className="text-[13px] text-on-surface-variant font-medium"> +{extraMeals} more</span>}
                      </h4>
                      <p className="text-[12px] text-on-surface-variant font-medium">{order.vendor?.name || ""}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`${statusCfg.color} font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow-sm font-sans`}>
                        {statusCfg.label}
                      </span>
                      {/* Manage button — only for scheduled orders */}
                      {canManage && (
                        <button
                          onClick={() => openManage(order)}
                          className="text-[11px] font-bold text-primary flex items-center gap-0.5 hover:text-primary-container active:scale-95 transition-all"
                        >
                          <span className="material-symbols-outlined text-[14px]">edit</span>
                          Manage
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Order ID */}
                  <div className="flex items-center gap-1.5 mb-3 bg-[#f6f3f2] rounded-lg px-3 py-1.5 w-fit">
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">tag</span>
                    <span className="text-[12px] font-mono font-semibold text-on-surface-variant">{order.orderId || "—"}</span>
                  </div>

                  {/* Status Progress Bar (Upcoming only, not skipped) */}
                  {!isPast && order.status !== "skipped" && (
                    <div className="mb-3">
                      {["scheduled", "preparing", "ready", "out_for_delivery", "delivered"].map((s, idx, arr) => {
                        const currentIdx = arr.indexOf(order.status);
                        const isActive = idx <= currentIdx;
                        const isNow = s === order.status;
                        return (
                          <span key={s} className="inline-flex items-center">
                            <span className={`w-2 h-2 rounded-full inline-block transition-all ${isActive ? "bg-primary" : "bg-[#ddd]"} ${isNow ? "ring-2 ring-primary/30 scale-125" : ""}`} />
                            {idx < arr.length - 1 && <span className={`inline-block h-0.5 w-8 ${isActive && idx < currentIdx ? "bg-primary" : "bg-[#ddd]"}`} />}
                          </span>
                        );
                      })}
                      <div className="flex justify-between text-[9px] text-on-surface-variant font-medium mt-1">
                        <span>Scheduled</span><span>Prep</span><span>Ready</span><span>En Route</span><span>Done</span>
                      </div>
                    </div>
                  )}

                  {/* Skipped notice */}
                  {order.status === "skipped" && (
                    <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-red-400 text-[18px]">cancel</span>
                      <p className="text-[12px] text-red-600 font-semibold">This delivery was skipped. Wallet credit applied.</p>
                    </div>
                  )}

                  {/* Action Row */}
                  <div className="flex items-center justify-between pt-3 border-t border-[#f0eded]">
                    {isPast || isDelivered ? (
                      <>
                        <button onClick={() => onShowNotificationToast?.(`📄 Receipt for ${order.orderId}…`)} className="text-primary font-semibold text-[13px] flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                          <span>Receipt</span>
                        </button>
                        <button
                          onClick={() => {
                            setRatedOrders(prev => prev.includes(order.orderId) ? prev : [...prev, order.orderId]);
                            onShowNotificationToast?.(ratedOrders.includes(order.orderId) ? "Already rated!" : "⭐ Thanks for rating!");
                          }}
                          className={`font-semibold text-[13px] flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors ${ratedOrders.includes(order.orderId) ? "text-primary" : "text-secondary"}`}
                        >
                          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                          <span>{ratedOrders.includes(order.orderId) ? "Rated" : "Rate"}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className={`material-symbols-outlined text-[18px] ${statusCfg.color.split(" ")[1]}`}>{statusCfg.icon}</span>
                          <span className="text-[13px] font-bold text-on-surface-variant">{statusCfg.label}</span>
                        </div>
                        {order.status === "out_for_delivery" && (
                          <button onClick={onTrackLive} className="border border-primary-container text-primary hover:bg-[#e8f3f0] font-bold text-xs px-4 py-2 rounded-lg active:scale-95 transition-transform flex items-center gap-1 shadow-sm">
                            <span>Track Live</span>
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>

      {/* ─── Manage Bottom Sheet ─────────────────────────────────────────────── */}
      {manageOrder && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closeManage}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl w-full max-w-[390px] mx-auto px-5 pt-5 pb-10 animate-slideUp"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1.5 bg-[#ddd] rounded-full mx-auto mb-4" />

            {manageMode === "actions" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-1">Manage Delivery</h2>
                <p className="text-[13px] text-on-surface-variant mb-1 font-medium">{manageOrder.meals?.[0]?.name || "Meal"}</p>
                <p className="text-[12px] text-on-surface-variant mb-5">
                  {formatDate(manageOrder.deliveryDate)} · {SLOT_LABELS[manageOrder.deliverySlot] || ""}
                  {isTomorrow(manageOrder.deliveryDate) && <span className="ml-2 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">TOMORROW</span>}
                </p>

                {/* Action Buttons */}
                <div className="space-y-3">
                  {/* Skip */}
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

                  {/* Change Meal */}
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

                  {/* Pause Subscription */}
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

                <button onClick={closeManage} className="w-full mt-4 py-3 text-center text-[14px] font-bold text-on-surface-variant">Cancel</button>
              </>
            )}

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Skip This Delivery?</h2>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  Your {formatDate(manageOrder.deliveryDate)} delivery will be skipped and the day's amount will be credited to your wallet.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setManageMode("actions")} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant hover:bg-slate-50">Go Back</button>
                  <button
                    onClick={handleSkip}
                    disabled={loadingAction}
                    className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
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
                      className={`flex-1 py-4 rounded-2xl font-bold text-[15px] border-2 transition-all active:scale-95 ${
                        pauseDays === d ? "border-primary bg-[#e8f3f0] text-primary" : "border-[#e4e2e1] bg-white text-on-surface-variant hover:bg-slate-50"
                      }`}
                    >
                      {d} Day{d > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setManageMode("actions")} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">Go Back</button>
                  <button
                    onClick={handlePause}
                    disabled={loadingAction}
                    className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
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
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                            isSelected ? "border-primary bg-[#e8f3f0]" : "border-[#e4e2e1] bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "border-primary bg-primary" : "border-[#ccc]"}`}>
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
                  <button onClick={() => setManageMode("actions")} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">Go Back</button>
                  <button
                    onClick={handleChangeMeal}
                    disabled={loadingAction || selectedMealIds.length === 0}
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loadingAction ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
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
