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

  useEffect(() => {
    loadTodayMeals();
  }, []);

  // ─── Socket.IO: Real-time status updates ────────────────────────────────
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
    socket.on("order_status_updated", handleStatusUpdate);
    return () => socket.off("order_status_updated", handleStatusUpdate);
  }, [socket]);

  const userName = currentUser?.name?.split(" ")[0] || "there";
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

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
            {meal.meals?.length > 1 && (
              <p className="text-[12px] text-on-surface-variant font-medium mt-0.5">+{meal.meals.length - 1} more meals</p>
            )}
            {vendorName && (
              <p className="text-[13px] text-on-surface-variant font-medium mt-0.5">by {vendorName}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Order ID + Track button */}
        <div className="flex items-center justify-between pt-3 border-t border-[#f0eded]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[18px]">tag</span>
            <span className="text-[12px] text-on-surface-variant font-mono font-semibold">{meal.orderId || "—"}</span>
          </div>
          <button
            onClick={onGoToOrders}
            className="border border-primary-container text-primary hover:bg-[#e8f3f0] font-bold text-xs px-4 py-2 rounded-lg active:scale-95 transition-transform flex items-center gap-1 shadow-sm"
          >
            <span>View Orders</span>
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </button>
        </div>
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
    </div>
  );
}
