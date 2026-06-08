import { useState, useEffect, useRef } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI } from "@food/api";

const SLOT_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const STATUS_COLORS = {
  scheduled: "bg-[#E8F3F0] text-primary",
  preparing: "bg-amber-100 text-amber-700",
  ready: "bg-blue-100 text-blue-700",
  out_for_delivery: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  skipped: "bg-red-100 text-red-700",
};
const STATUS_LABELS = {
  scheduled: "Scheduled",
  preparing: "In Preparation 🔥",
  ready: "Ready for Pickup ✓",
  out_for_delivery: "On the Way 🛵",
  delivered: "Delivered ✅",
  skipped: "Skipped",
};

export function HomeScreen({
  onGoToPlans, onGoToCalendar, onGoToOrders, onGoToProfile,
  onShowNotificationToast, tomorrowMeal, setTomorrowMeal, points, currentUser, onLogout,
  socket
}) {
  const [showBanner, setShowBanner] = useState(true);
  const [showPointsHist, setShowPointsHist] = useState(false);
  const [todayMeal, setTodayMeal] = useState(null);
  const [tomorrowMealData, setTomorrowMealData] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollingRef = useRef(null);

  // ─── HomeScreen Manage Sheet State ───────────────────────────────────────
  const [manageOrder, setManageOrder] = useState(null);
  const [manageMode, setManageMode] = useState(null); // 'change_meal' | 'pause' | 'confirm_skip'
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pauseDays, setPauseDays] = useState(1);

  // ─── Load today + tomorrow meals from API ───────────────────────────────
  const loadTodayMeals = async () => {
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) { setLoading(false); return; }
      const res = await dmbCustomerAPI.getTodayMeal();
      if (res.data?.success) {
        setTodayMeal(res.data.today || null);
        setTomorrowMealData(res.data.tomorrow || null);
        // Sync legacy state so OrdersScreen also gets meal name
        if (res.data.tomorrow?.meals?.[0]?.name) {
          setTomorrowMeal(prev => ({ ...prev, name: res.data.tomorrow.meals[0].name, status: res.data.tomorrow.status }));
        }
      }
    } catch (err) {
      // Not logged in or no active subscription — silently ignore
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.skipDailyOrder(manageOrder._id);
      loadTodayMeals();
      onShowNotificationToast?.("✅ Order skipped. Credit will be added to your wallet.");
      setManageOrder(null);
      setManageMode(null);
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to skip order");
    } finally {
      setLoadingAction(false);
    }
  };

  const handlePause = async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.pauseSubscription(
        manageOrder.subscriptionId,
        pauseDays,
        "Customer requested pause from Home"
      );
      loadTodayMeals();
      onShowNotificationToast?.(`⏸️ Subscription paused for ${pauseDays} day${pauseDays > 1 ? "s" : ""}`);
      setManageOrder(null);
      setManageMode(null);
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to pause subscription");
    } finally {
      setLoadingAction(false);
    }
  };

  const openChangeMeal = async (order) => {
    setManageOrder(order);
    setSelectedMealIds(order.meals?.map(m => m.mealPlanId || m._id) || []);
    setManageMode("change_meal");
    try {
      const vendorId = order.vendorId || order._id;
      const res = await dmbCustomerAPI.getVendorMenu(vendorId);
      if (res.data?.meals) setAvailableMeals(res.data.meals);
      else if (res.data?.plans) setAvailableMeals(res.data.plans);
    } catch (e) { }
  };

  const handleChangeMeal = async () => {
    if (!manageOrder || selectedMealIds.length === 0) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.changeDailyOrderMeal(manageOrder._id, selectedMealIds);
      loadTodayMeals();
      onShowNotificationToast?.("✅ Meal updated for this delivery!");
      setManageOrder(null);
      setManageMode(null);
      setAvailableMeals([]);
      setSelectedMealIds([]);
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

  const closeManage = () => {
    setManageOrder(null);
    setManageMode(null);
    setAvailableMeals([]);
    setSelectedMealIds([]);
  };

  useEffect(() => {
    loadTodayMeals();
  }, []);

  // ─── Socket.IO: Real-time status updates & Daily Menu updates ───────────
  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = (data) => {
      const updateCard = (card) => {
        if (!card) return card;
        const orderDate = new Date(card.deliveryDate).toDateString();
        const updatedDate = new Date(data.deliveryDate).toDateString();
        if (orderDate === updatedDate) {
          return { ...card, status: data.status };
        }
        return card;
      };
      setTodayMeal(prev => updateCard(prev));
      setTomorrowMealData(prev => updateCard(prev));
    };

    const handleDailyMenuUpdated = (data) => {
      loadTodayMeals();
      if (onShowNotificationToast) {
        onShowNotificationToast(`📢 Tomorrow's meal updated to: "${data.dishName}"!`);
      }
    };

    socket.on("order_status_updated", handleStatusUpdate);
    socket.on("daily_menu_updated", handleDailyMenuUpdated);

    return () => {
      socket.off("order_status_updated", handleStatusUpdate);
      socket.off("daily_menu_updated", handleDailyMenuUpdated);
    };
  }, [socket, onShowNotificationToast]);

  const userName = currentUser?.name?.split(" ")[0] || "there";
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const renderTomorrowMealPreviewCard = (meal) => {
    if (!meal) return null;
    const mealName = meal.meals?.[0]?.name || "Your Meal";
    const mealPhoto = meal.meals?.[0]?.photo || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60";
    const nutrition = meal.meals?.[0]?.nutrition;
    const calories = nutrition?.calories || 450;

    return (
      <section className="bg-white rounded-2xl p-5 shadow-md border border-[#e4e2e1] transition-all duration-300 space-y-4">
        {/* Card Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-extrabold text-on-surface">Tomorrow's Menu Preview 🍽️</h2>
          </div>
          <button 
            onClick={onGoToOrders}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
          </button>
        </div>

        {/* Meal Photo and Name Overlay */}
        <div 
          onClick={onGoToOrders}
          className="relative rounded-xl overflow-hidden h-44 shadow-inner group cursor-pointer"
        >
          <img 
            src={mealPhoto} 
            alt={mealName} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          {/* Dish Name */}
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-xl font-extrabold text-white tracking-wide drop-shadow-md">{mealName}</h3>
          </div>
        </div>

        {/* Nutrition and Prep Info */}
        <div className="flex items-center gap-5 text-[13px] text-on-surface-variant font-bold px-1">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-amber-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            <span>{calories} kcal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sky-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>timer</span>
            <span>5 min prep</span>
          </div>
        </div>
      </section>
    );
  };

  const renderMealCard = (meal, label, isToday = false) => {
    if (!meal) return null;
    const mealName = meal.meals?.[0]?.name || "Your Meal";
    const vendorName = meal.vendor?.name || "";
    const slot = SLOT_LABELS[meal.deliverySlot] || meal.deliverySlot;
    const status = meal.status || "scheduled";
    const statusColor = STATUS_COLORS[status] || STATUS_COLORS.scheduled;
    const statusLabel = STATUS_LABELS[status] || status;
    const deliveryDate = new Date(meal.deliveryDate);
    const dateStr = deliveryDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

    return (
      <section className={`bg-white rounded-2xl p-5 border-l-4 ${isToday ? "border-primary-container" : "border-[#bec9c3]"} shadow-md transition-all duration-300`}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{isToday ? "🍽️" : "🚚"}</span>
          <h2 className="text-[17px] font-extrabold text-on-surface">{label}</h2>
          <span className="ml-auto text-[11px] text-on-surface-variant font-medium">{dateStr} · {slot}</span>
        </div>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-on-surface leading-snug">{mealName}</h3>
            {vendorName && (
              <p className="text-[13px] text-on-surface-variant font-medium mt-0.5">by {vendorName}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Skip, Pause, Change Actions Row */}
        {!isToday && status === 'scheduled' && (
          <div className="flex gap-3 mt-3 pt-3 border-t border-[#f0eded]">
            <button
              onClick={() => {
                setManageOrder(meal);
                setManageMode("confirm_skip");
              }}
              className="flex-1 py-2 rounded-full border border-[#bec9c3] hover:bg-slate-50 text-[13px] font-semibold text-on-surface text-center cursor-pointer active:scale-95 transition-all"
            >
              Skip
            </button>
            <button
              onClick={() => {
                setManageOrder(meal);
                setManageMode("pause");
              }}
              className="flex-1 py-2 rounded-full border border-[#bec9c3] hover:bg-slate-50 text-[13px] font-semibold text-on-surface text-center cursor-pointer active:scale-95 transition-all"
            >
              Pause
            </button>
            <button
              onClick={() => openChangeMeal(meal)}
              className="flex-1 py-2 rounded-full border border-[#bec9c3] hover:bg-slate-50 text-[13px] font-semibold text-on-surface text-center cursor-pointer active:scale-95 transition-all"
            >
              Change
            </button>
          </div>
        )}
      </section>
    );
  };


  return (
    <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
      {/* Top Header */}
      <header className="bg-primary px-5 pt-12 pb-8 rounded-b-[32px] shadow-md relative z-10 text-white">
        <div className="flex justify-between items-center mb-2">
          <div className="flex flex-col">
            <h1 className="text-[22px] font-extrabold tracking-tight">{greeting}, {userName} 👋</h1>
            <p className="text-[14px] opacity-90 font-medium">
              {tomorrowMealData
                ? `Next delivery: ${SLOT_LABELS[tomorrowMealData.deliverySlot] || "Lunch"} · ${new Date(tomorrowMealData.deliveryDate).toLocaleDateString("en-IN", { weekday: "long" })}`
                : "No upcoming deliveries"}
            </p>
          </div>
          <button onClick={onGoToProfile} className="w-12 h-12 rounded-full border-2 border-[#9ef3d7] overflow-hidden hover:scale-105 active:scale-95 transition-transform shadow">
            <img alt="User profile" className="w-full h-full object-cover" src={IMAGES.profileAnnaMain} />
          </button>
        </div>
      </header>

      <main className="px-5 -mt-5 space-y-5 relative z-20">
        {/* Banner */}
        {showBanner && (
          <div className="bg-[#F59E0B] text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <p className="text-[13px] font-bold">Multi-meal subscriptions now available!</p>
            </div>
            <button onClick={() => setShowBanner(false)} className="p-1 hover:bg-black/10 rounded-full transition-colors flex items-center justify-center cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl p-5 shadow-md flex items-center justify-center h-28">
            <div className="flex flex-col items-center gap-2 text-on-surface-variant">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-[13px] font-medium">Loading your meals…</p>
            </div>
          </div>
        ) : (
          <>
            {/* Today's Meal */}
            {todayMeal && renderMealCard(todayMeal, "Today's Delivery", true)}

            {/* Tomorrow's Meal */}
            {tomorrowMealData && renderMealCard(tomorrowMealData, "Tomorrow's Delivery")}

            {/* No active subscription */}
            {!todayMeal && !tomorrowMealData && (
              <section
                onClick={onGoToPlans}
                className="bg-white rounded-2xl p-5 border-l-4 border-primary-container shadow-md cursor-pointer hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🍱</span>
                  <h2 className="text-[17px] font-extrabold text-on-surface">Start Your Meal Plan</h2>
                </div>
                <p className="text-[14px] text-on-surface-variant font-medium mb-4">
                  Subscribe to a daily meal plan from local vendors. Fresh, healthy, delivered daily.
                </p>
                <div className="flex items-center gap-2 text-primary font-bold text-[14px]">
                  <span>Browse Plans</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </div>
              </section>
            )}
          </>
        )}

        {/* Loyalty Points Widget */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xl">⭐</span>
              <span className="text-[18px] font-extrabold text-on-surface">{points} points</span>
            </div>
            <button onClick={() => setShowPointsHist(!showPointsHist)} className="text-primary-container hover:text-primary font-bold text-[13px]">
              {showPointsHist ? "Close" : "History"}
            </button>
          </div>

          {showPointsHist ? (
            <div className="bg-[#f6f3f2] p-3 rounded-lg space-y-2 text-[12px] font-medium border border-[#e4e2e1]">
              <div className="flex justify-between"><span>Welcome Bonus</span><span className="text-primary font-bold">+200 pts</span></div>
              <div className="flex justify-between"><span>First Subscription</span><span className="text-primary font-bold">+50 pts</span></div>
              <div className="flex justify-between"><span>Profile setup complete</span><span className="text-primary font-bold">+30 pts</span></div>
            </div>
          ) : (
            <>
              <div className="w-full bg-[#eae7e7] h-2.5 rounded-full overflow-hidden">
                <div className="bg-primary-container h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min((points / 300) * 100, 100)}%` }} />
              </div>
              <p className="text-[12px] text-on-surface-variant font-medium">10 pts per delivery · Redeem for discounts</p>
            </>
          )}
        </section>

        {/* Tomorrow's Meal Preview (below 120 points card) */}
        {!loading && tomorrowMealData && renderTomorrowMealPreviewCard(tomorrowMealData)}

        {/* Quick Actions */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { icon: "assignment", label: "My Plans", action: onGoToPlans },
            { icon: "calendar_today", label: "Calendar", action: onGoToCalendar },
            { icon: "shopping_bag", label: "Orders", action: onGoToOrders },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={action}
              className="bg-white rounded-xl p-4 shadow-sm flex flex-col items-center gap-2 hover:shadow-md active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-primary text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
              <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{label}</span>
            </button>
          ))}
        </section>

        <div className="h-8" />
      </main>

      {/* ─── Manage Bottom Sheet ─────────────────────────────────────────────── */}
      {manageOrder && manageMode && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closeManage}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl w-full max-w-[390px] mx-auto px-5 pt-5 pb-10 animate-slideUp text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1.5 bg-[#ddd] rounded-full mx-auto mb-4" />

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Skip This Delivery?</h2>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  Your delivery for {new Date(manageOrder.deliveryDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} will be skipped and the day's amount will be credited to your wallet.
                </p>
                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant hover:bg-slate-50">Cancel</button>
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
                      className={`flex-1 py-4 rounded-2xl font-bold text-[15px] border-2 transition-all active:scale-95 ${pauseDays === d ? "border-primary bg-[#e8f3f0] text-primary" : "border-[#e4e2e1] bg-white text-on-surface-variant hover:bg-slate-50"
                        }`}
                    >
                      {d} Day{d > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">Cancel</button>
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
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${isSelected ? "border-primary bg-[#e8f3f0]" : "border-[#e4e2e1] bg-white hover:bg-slate-50"
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
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">Cancel</button>
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
