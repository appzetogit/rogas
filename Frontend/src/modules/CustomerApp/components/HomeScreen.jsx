import { useState, useEffect, useCallback, useRef } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI } from "@food/api";
import useDeliverySlots from "../../../shared/hooks/useDeliverySlots";
import { ChevronRight, Flame, Timer, Sparkles, X, ArrowRight, UtensilsCrossed, Check } from 'lucide-react';
import { useTranslation } from "react-i18next";


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
  preparing: "In Preparation ",
  ready: "Ready for Pickup ✓",
  out_for_delivery: "On the Way ",
  delivered: "Delivered ",
  skipped: "Skipped",
};

const FALLBACK_MEAL_PHOTO =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60";

// ─── Module-level cache (survives tab switches, cleared on logout) ──────────
// Structure: { data: { today, tomorrow }, fetchedAt: timestamp }
let _mealCache = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export function clearMealCache() {
  _mealCache = null;
}

function getCachedMeals() {
  if (!_mealCache) return null;
  if (Date.now() - _mealCache.fetchedAt > CACHE_TTL_MS) {
    _mealCache = null;
    return null;
  }
  return _mealCache.data;
}

function setCachedMeals(data) {
  _mealCache = { data, fetchedAt: Date.now() };
}

export function HomeScreen({
  onGoToPlans,
  onGoToCalendar,
  onGoToOrders,
  onGoToProfile,
  onShowNotificationToast,
  tomorrowMeal,
  setTomorrowMeal,
  points,
  currentUser,
  onLogout,
  socket,
}) {
  const { t } = useTranslation("customer");
  const { label: slotLabel } = useDeliverySlots();
  const [showBanner, setShowBanner] = useState(true);
  const [showPointsHist, setShowPointsHist] = useState(false);

  // ── Strategy 1: Initialise state from cache immediately (no spinner flash) ─
  const cached = getCachedMeals();
  const [todayMeal, setTodayMeal] = useState(cached?.today ?? null);
  const [tomorrowMealData, setTomorrowMealData] = useState(cached?.tomorrow ?? null);
  // If we already have cached data, don't show the loading spinner at all
  const [loading, setLoading] = useState(!cached);

  // ─── Manage Sheet State ──────────────────────────────────────────────────
  const [manageOrder, setManageOrder] = useState(null);
  const [manageMode, setManageMode] = useState(null);
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pauseDays, setPauseDays] = useState(1);

  // ─── Fetch meals from API ────────────────────────────────────────────────
  const loadTodayMeals = useCallback(async ({ bustCache = false } = {}) => {
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) { setLoading(false); return; }

      // ── Strategy 2: Return immediately from cache, refetch silently ────────
      if (!bustCache) {
        const hit = getCachedMeals();
        if (hit) {
          setTodayMeal(hit.today);
          setTomorrowMealData(hit.tomorrow);
          setLoading(false);
          // Still do a background revalidation so data stays fresh
          // (won't cause a visible spinner since loading is already false)
        }
      }

      const res = await dmbCustomerAPI.getTodayMeal();
      if (res.data?.success) {
        const today = res.data.today ?? null;
        const tomorrow = res.data.tomorrow ?? null;

        setCachedMeals({ today, tomorrow });
        setTodayMeal(today);
        setTomorrowMealData(tomorrow);

        const tomorrowName = tomorrow?.meals?.[0]?.name;
        if (tomorrowName) {
          setTomorrowMeal((prev) => ({
            ...prev,
            name: tomorrowName,
            status: tomorrow.status,
          }));
        }
      }
    } catch {
      // Not logged in or no active subscription — silently ignore
    } finally {
      setLoading(false);
    }
  }, [setTomorrowMeal]);

  useEffect(() => {
    loadTodayMeals();
  }, [loadTodayMeals]);

  // ─── Socket.IO real-time updates ─────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleStatusUpdate = (data) => {
      const updatedDate = new Date(data.deliveryDate).toDateString();
      const patchCard = (card) => {
        if (!card) return card;
        return new Date(card.deliveryDate).toDateString() === updatedDate
          ? { 
              ...card, 
              status: data.status,
              meals: data.meals && data.meals.length > 0 ? data.meals.map((m, i) => ({
                ...(card.meals?.[i] || {}),
                ...m,
                mealPlanName: m.mealPlanName || m.name
              })) : card.meals
            }
          : card;
      };
      setTodayMeal((prev) => {
        const next = patchCard(prev);
        if (next !== prev && _mealCache) {
          _mealCache.data.today = next; // keep cache in sync
        }
        return next;
      });
      setTomorrowMealData((prev) => {
        const next = patchCard(prev);
        if (next !== prev && _mealCache) {
          _mealCache.data.tomorrow = next;
        }
        return next;
      });
    };

    const handleDailyMenuUpdated = (data) => {
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(t("📢 Tomorrow's meal updated to: \"{{dishName}}\"!", { dishName: data.dishName }));
    };

    socket.on("order_status_updated", handleStatusUpdate);
    socket.on("daily_menu_updated", handleDailyMenuUpdated);

    return () => {
      socket.off("order_status_updated", handleStatusUpdate);
      socket.off("daily_menu_updated", handleDailyMenuUpdated);
    };
  }, [socket, loadTodayMeals, onShowNotificationToast]);

  // ─── Action Handlers ─────────────────────────────────────────────────────
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
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(t("✅ Order skipped. Credit will be added to your wallet."));
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || t("Failed to skip order"));
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, loadTodayMeals, onShowNotificationToast, closeManage, t]);

  const handleUndoSkip = useCallback(async (meal) => {
    if (!meal) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.undoSkipDailyOrder(meal._id);
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(t("✅ Order skip undone. Meal restored."));
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || t("Failed to undo skip"));
    } finally {
      setLoadingAction(false);
    }
  }, [loadTodayMeals, onShowNotificationToast, t]);

  const handlePause = useCallback(async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.pauseSubscription(
        manageOrder.subscriptionId,
        pauseDays,
        "Customer requested pause from Home"
      );
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(
        t("⏸️ Subscription paused for {{count}} day", { count: pauseDays })
      );
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || t("Failed to pause subscription"));
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, pauseDays, loadTodayMeals, onShowNotificationToast, closeManage, t]);

  const openChangeMeal = useCallback(async (order) => {
    setManageOrder(order);
    setSelectedMealIds(order.meals?.map((m) => m.mealPlanId || m._id) ?? []);
    setManageMode("change_meal");
    try {
      const vendorId = order.vendorId?._id || order.vendorId || order._id;
      const res = await dmbCustomerAPI.getVendorMenu(vendorId);
      setAvailableMeals(res.data?.menu ?? res.data?.meals ?? res.data?.plans ?? []);
    } catch {
      // Menu fetch failed — show empty state
    }
  }, []);

  const handleChangeMeal = useCallback(async () => {
    if (!manageOrder || selectedMealIds.length === 0) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.changeDailyOrderMeal(manageOrder._id, selectedMealIds);
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(t("✅ Meal updated for this delivery!"));
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || t("Failed to change meal"));
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, selectedMealIds, loadTodayMeals, onShowNotificationToast, closeManage, t]);

  const toggleMealSelection = useCallback((id) => {
    setSelectedMealIds([id]);
  }, []);

  // ─── Derived values ───────────────────────────────────────────────────────
  const userName = currentUser?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t("Good morning") : hour < 17 ? t("Good afternoon") : t("Good evening");
  const pointsPercent = Math.min((points / 300) * 100, 100);

  const filteredTodayMeal = todayMeal?.meals?.[0]?.name === "No meal set" ? null : todayMeal;
  const filteredTomorrowMealData = tomorrowMealData?.meals?.[0]?.name === "No meal set" ? null : tomorrowMealData;

  // ─── Render helpers ───────────────────────────────────────────────────────
  const renderTomorrowMealPreviewCard = (meal) => {
    if (!meal) return null;
    const mealName = meal.meals?.[0]?.mealPlanName || meal.meals?.[0]?.name || "Your Meal";
    const mealPhoto = meal.meals?.[0]?.photo || FALLBACK_MEAL_PHOTO;
    const calories = meal.meals?.[0]?.nutrition?.calories ?? 450;

    return (
      <section className="bg-white rounded-2xl p-5 shadow-md border border-[#e4e2e1] transition-all duration-300 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-[17px] font-extrabold text-on-surface">
            {t("Tomorrow's Menu Preview 🍽️")}
          </h2>
          <button
            onClick={onGoToOrders}
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
          >
            <ChevronRight className="text-on-surface-variant text-[20px]" />
          </button>
        </div>

        <div
          onClick={onGoToOrders}
          className="relative rounded-xl overflow-hidden h-44 shadow-inner group cursor-pointer"
        >
          <img
            src={mealPhoto}
            alt={mealName}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <h3 className="text-xl font-extrabold text-white tracking-wide drop-shadow-md">{mealName}</h3>
          </div>
        </div>

        <div className="flex items-center gap-5 text-[13px] text-on-surface-variant font-bold px-1">
          <div className="flex items-center gap-1.5">
            <Flame className="text-amber-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
            <span>{t("{{calories}} kcal", { calories })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Timer className="text-sky-500 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
            <span>{t("5 min prep")}</span>
          </div>
        </div>
      </section>
    );
  };

  const renderMealCard = (meal, label, isToday = false) => {
    if (!meal) return null;
    const mealName = meal.meals?.[0]?.mealPlanName || meal.meals?.[0]?.name || "Your Meal";
    const vendorName = meal.vendor?.name || "";
    const slot = SLOT_LABELS[meal.deliverySlot] || meal.deliverySlot;
    const status = meal.status || "scheduled";
    const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.scheduled;
    const statusLabel = STATUS_LABELS[status] ?? status;
    const dateStr = new Date(meal.deliveryDate).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    return (
      <section
        className={`bg-white rounded-2xl p-5 border-l-4 ${isToday ? "border-primary-container" : "border-[#bec9c3]"
          } shadow-md transition-all duration-300`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{isToday ? "🍽️" : "🚚"}</span>
          <h2 className="text-[17px] font-extrabold text-on-surface">{label}</h2>
          <span className="ml-auto text-[11px] text-on-surface-variant font-medium">
            {dateStr} · {slot}
          </span>
        </div>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-on-surface leading-snug">{mealName}</h3>
            {vendorName && (
              <p className="text-[13px] text-on-surface-variant font-medium mt-0.5">{t("by {{vendorName}}", { vendorName })}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {!isToday && status === "scheduled" && (
          <div className="flex gap-3 mt-3 pt-3 border-t border-[#f0eded]">
            <button
              onClick={() => { setManageOrder(meal); setManageMode("confirm_skip"); }}
              className="flex-1 py-2 rounded-full border border-[#bec9c3] hover:bg-slate-50 text-[13px] font-semibold text-on-surface text-center cursor-pointer active:scale-95 transition-all"
            >{t("Skip")}</button>
            <button
              onClick={() => { setManageOrder(meal); setManageMode("pause"); }}
              className="flex-1 py-2 rounded-full border border-[#bec9c3] hover:bg-slate-50 text-[13px] font-semibold text-on-surface text-center cursor-pointer active:scale-95 transition-all"
            >{t("Pause")}</button>
            <button
              onClick={() => openChangeMeal(meal)}
              className="flex-1 py-2 rounded-full border border-[#bec9c3] hover:bg-slate-50 text-[13px] font-semibold text-on-surface text-center cursor-pointer active:scale-95 transition-all"
            >{t("Change")}</button>
          </div>
        )}

        {!isToday && status === "skipped" && (
          <div className="flex gap-3 mt-3 pt-3 border-t border-[#f0eded]">
            <button
              onClick={() => handleUndoSkip(meal)}
              disabled={loadingAction}
              className="flex-grow py-2 rounded-full border border-primary text-primary hover:bg-[#e8f3f0] text-[13px] font-semibold text-center cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {loadingAction && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
              {t("Undo Skip")}
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
            <h1 className="text-[22px] font-extrabold tracking-tight">
              {greeting}, {userName} 👋
            </h1>
            <p className="text-[14px] opacity-90 font-medium">
              {filteredTomorrowMealData
                ? t("Next delivery: {{slotLabel}} · {{date}}", { slotLabel: slotLabel(filteredTomorrowMealData.deliverySlot), date: new Date(filteredTomorrowMealData.deliveryDate).toLocaleDateString("en-IN", { weekday: "long" }) })
                : t("No upcoming deliveries")}
            </p>
          </div>
          <button
            onClick={onGoToProfile}
            className="relative w-12 h-12 rounded-full border-2 border-[#9ef3d7] overflow-hidden hover:scale-105 active:scale-95 transition-transform shadow flex items-center justify-center bg-white/20 text-white font-bold text-[18px]"
          >
            <span className="z-0">{userName ? userName.charAt(0).toUpperCase() : "U"}</span>
            {currentUser?.profileImage && currentUser.profileImage.trim() !== "" && (
              <img
                alt={t("User profile")}
                className="absolute inset-0 w-full h-full object-cover z-10"
                src={currentUser.profileImage}
                loading="eager"
                onError={(e) => e.target.style.display = 'none'}
              />
            )}
          </button>
        </div>
      </header>

      <main className="px-5 -mt-5 space-y-5 relative z-20">
        {/* Banner */}
        {showBanner && (
          <div className="bg-[#F59E0B] text-white p-4 rounded-xl flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-3">
              <Sparkles className="text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }} />
              <p className="text-[13px] font-bold">{t("Multi-meal subscriptions now available!")}</p>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="p-1 hover:bg-black/10 rounded-full transition-colors flex items-center justify-center cursor-pointer"
            >
              <X className="text-[18px]" />
            </button>
          </div>
        )}

        {/* ── Strategy 3: Show skeleton instead of full spinner ───────────── */}
        {loading ? (
          <div className="bg-white rounded-2xl p-5 shadow-md space-y-3 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/2" />
            <div className="h-3 bg-slate-100 rounded w-3/4" />
            <div className="h-28 bg-slate-100 rounded-xl" />
          </div>
        ) : (
          <>
            {filteredTomorrowMealData && renderMealCard(filteredTomorrowMealData, "Tomorrow's Delivery")}

            {!filteredTodayMeal && !filteredTomorrowMealData && (
              <section
                onClick={onGoToPlans}
                className="bg-white rounded-2xl p-5 border-l-4 border-primary-container shadow-md cursor-pointer hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🍱</span>
                  <h2 className="text-[17px] font-extrabold text-on-surface">{t("Start Your Meal Plan")}</h2>
                </div>
                <p className="text-[14px] text-on-surface-variant font-medium mb-4">
                  {t("Subscribe to a daily meal plan from local vendors. Fresh, healthy, delivered daily.")}
                </p>
                <div className="flex items-center gap-2 text-primary font-bold text-[14px]">
                  <span>{t("Browse Plans")}</span>
                  <ArrowRight className="text-[18px]" />
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
              <span className="text-[18px] font-extrabold text-on-surface">{t("{{points}} points", { points })}</span>
            </div>
            <button
              onClick={() => setShowPointsHist((v) => !v)}
              className="text-primary-container hover:text-primary font-bold text-[13px]"
            >
              {showPointsHist ? t("Close") : t("History")}
            </button>
          </div>

          {showPointsHist ? (
            <div className="bg-[#f6f3f2] p-3 rounded-lg space-y-2 text-[12px] font-medium border border-[#e4e2e1]">
              <div className="flex justify-between"><span>{t("Welcome Bonus")}</span><span className="text-primary font-bold">{t("+200 pts")}</span></div>
              <div className="flex justify-between"><span>{t("First Subscription")}</span><span className="text-primary font-bold">{t("+50 pts")}</span></div>
              <div className="flex justify-between"><span>{t("Profile setup complete")}</span><span className="text-primary font-bold">{t("+30 pts")}</span></div>
            </div>
          ) : (
            <>
              <div className="w-full bg-[#eae7e7] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary-container h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${pointsPercent}%` }}
                />
              </div>
              <p className="text-[12px] text-on-surface-variant font-medium">
                {t("10 pts per delivery · Redeem for discounts")}
              </p>
            </>
          )}
        </section>

        {/* Tomorrow's Meal Preview */}
        {!loading && filteredTomorrowMealData && renderTomorrowMealPreviewCard(filteredTomorrowMealData)}

        <div className="h-8" />
      </main>

      {/* ─── Manage Bottom Sheet ──────────────────────────────────────────── */}
      {manageOrder && manageMode && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closeManage}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl w-full max-w-[390px] mx-auto px-5 pt-5 pb-10 animate-slideUp text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-[#ddd] rounded-full mx-auto mb-4" />

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">{t("Skip This Delivery?")}</h2>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  {t("Your delivery for {{date}} will be skipped and the day's amount will be credited to your wallet.", { date: new Date(manageOrder.deliveryDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) })}
                </p>
                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant hover:bg-slate-50">{t("Cancel")}</button>
                  <button
                    onClick={handleSkip}
                    disabled={loadingAction}
                    className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {t("Confirm Skip")}
                  </button>
                </div>
              </>
            )}

            {manageMode === "pause" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">{t("Pause Subscription")}</h2>
                <p className="text-[13px] text-on-surface-variant mb-5">{t("Select how many days to pause your subscription.")}</p>
                <div className="flex gap-3 mb-6">
                  {[1, 2].map((d) => (
                    <button
                      key={d}
                      onClick={() => setPauseDays(d)}
                      className={`flex-1 py-4 rounded-2xl font-bold text-[15px] border-2 transition-all active:scale-95 ${pauseDays === d ? "border-primary bg-[#e8f3f0] text-primary" : "border-[#e4e2e1] bg-white text-on-surface-variant hover:bg-slate-50"
                        }`}
                    >
                      {t("{{count}} Day", { count: d })}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">{t("Cancel")}</button>
                  <button
                    onClick={handlePause}
                    disabled={loadingAction}
                    className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {t("Pause {{count}} Day", { count: pauseDays })}
                  </button>
                </div>
              </>
            )}

            {manageMode === "change_meal" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">{t("Change Meal")}</h2>
                <p className="text-[13px] text-on-surface-variant mb-4">{t("Choose meals for this delivery from the vendor's menu.")}</p>

                {availableMeals.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center mb-5">
                    <UtensilsCrossed className="text-[36px] text-slate-300 mb-2" />
                    <p className="text-[13px] text-slate-500 font-medium">{t("No alternate meals available from this vendor right now.")}</p>
                    <p className="text-[12px] text-slate-400 mt-1">{t("Current selection will be kept.")}</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
                    {availableMeals.map((meal) => {
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
                            {isSelected && <Check className="text-white text-[12px]" />}
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-on-surface">{meal.name}</p>
                            <p className="text-[11px] text-on-surface-variant font-medium">{t("₹{{pricePerDay}}/day", { pricePerDay: meal.pricePerDay || meal.price || "—" })}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">{t("Cancel")}</button>
                  <button
                    onClick={handleChangeMeal}
                    disabled={loadingAction || selectedMealIds.length === 0}
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {t("Confirm Change")}
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