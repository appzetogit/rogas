import { useState, useEffect, useCallback, useRef } from "react";
import ScrollStickyBar from "../../../shared/components/ScrollStickyBar";
import { IMAGES } from "../types";
import { dmbCustomerAPI, dmbExtraCustomerAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";
import useDeliverySlots from "../../../shared/hooks/useDeliverySlots";
import { 
  ChevronRight, Flame, Timer, Sparkles, X, ArrowRight, UtensilsCrossed, Check, 
  ShoppingBag, Plus, Minus, Search, Star, MapPin, Calendar, Clock, ShieldCheck, 
  HeartHandshake, Truck, RefreshCw, ChefHat, Award, ArrowUpRight, Store, 
  AlertCircle, Phone, Info, Leaf, Navigation, Shuffle, ChevronDown
} from 'lucide-react';
import { useTranslation } from "react-i18next";
import useMoney from "../../../shared/payments/money";
import { getCurrentLanguage } from "@/shared/i18n";
import { usePantryCart } from "./PantryCartContext";
import { useAddresses, addressLine } from "./amendment/addresses";
import { SubscribeSheet } from "./amendment/SubscribeSheet";
import { useNavigate } from "react-router-dom";

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

/** Lower-case and strip accents so "pierogi" finds "Pierogi" and "lodz" finds "Łódź". */
const normalizeText = (value) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/gi, "l").toLowerCase().trim();

const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl) return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
  if (typeof imageUrl === "object") return imageUrl.url || imageUrl.secure_url || "";
  if (typeof imageUrl === "string") {
    if (/^(https?:)?\/\//i.test(imageUrl)) return imageUrl;
    return `${BACKEND_ORIGIN}${imageUrl.startsWith("/") ? imageUrl : "/" + imageUrl}`;
  }
  return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
};

const STATUS_COLORS = {
  scheduled: "bg-[#E8F3F0] text-primary",
  preparing: "bg-emerald-50 text-emerald-800",
  ready: "bg-blue-100 text-blue-700",
  out_for_delivery: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  skipped: "bg-red-100 text-red-700",
};

const STATUS_LABELS = {
  scheduled: "Scheduled",
  preparing: "In Preparation 👨‍🍳",
  ready: "Ready for Pickup ✓",
  out_for_delivery: "On the Way 🛵",
  delivered: "Delivered 🎉",
  skipped: "Skipped",
};

const FALLBACK_MEAL_PHOTO =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60";

// ─── Module-level cache (survives tab switches, cleared on logout) ──────────
let _mealCache = null;
const CACHE_TTL_MS = 60_000;

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
  onGoToWallet,
  onSelectPlan,
  onTrackLive,
  onShowNotificationToast,
  tomorrowMeal,
  setTomorrowMeal,
  points,
  currentUser,
  onLogout,
  socket,
}) {
  const { t } = useTranslation("customer");
  const { money } = useMoney();
  const { label: slotLabel } = useDeliverySlots();
  const navigate = useNavigate();
  const { cart, addItem, removeItem, getItemQuantity, cartTotal, totalItems } = usePantryCart();
  const { addresses } = useAddresses();

  // Zone detection
  const defaultAddress = addresses?.find((a) => a.isDefault) || addresses?.[0];
  const [zoneId, setZoneId] = useState(
    defaultAddress?.zoneId ? String(defaultAddress.zoneId) : localStorage.getItem("userZoneId") || ""
  );
  const [zoneName, setZoneName] = useState(defaultAddress?.city || "");
  // Addresses arrive after the first render, and the customer can pick another one: follow the default address.
  useEffect(() => {
    if (!defaultAddress?.zoneId) return;
    const z = String(defaultAddress.zoneId);
    setZoneId(z);
    try { localStorage.setItem("userZoneId", z); } catch { /* private mode */ }
  }, [defaultAddress?.zoneId]);
  const headerAddress = defaultAddress ? addressLine(defaultAddress) : zoneName;

  const [showBanner, setShowBanner] = useState(true);
  const [showPointsHist, setShowPointsHist] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Strategy 1: Initialise state from cache immediately ─
  const cached = getCachedMeals();
  const [todayMeal, setTodayMeal] = useState(cached?.today ?? null);
  const [tomorrowMealData, setTomorrowMealData] = useState(cached?.tomorrow ?? null);
  const [loading, setLoading] = useState(!cached);
  const filteredTodayMeal = todayMeal;
  const filteredTomorrowMealData = tomorrowMealData;

  // ─── Real Vendors & Pantry Items State ────────────────────────────────────
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [pantryItems, setPantryItems] = useState([]);
  const [pantryLoading, setPantryLoading] = useState(true);
  const [openPlansFor, setOpenPlansFor] = useState(null); // Opens SubscribeSheet directly

  // ─── Manage Sheet State ──────────────────────────────────────────────────
  const [manageOrder, setManageOrder] = useState(null);
  const [manageMode, setManageMode] = useState(null);
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pauseDays, setPauseDays] = useState(1);
  const [upcoming, setUpcoming] = useState(undefined);

  // ─── Resolve Zone Fallback ────────────────────────────────────────────────
  useEffect(() => {
    if (!zoneId) {
      dmbCustomerAPI.getPublicZones()
        .then((res) => {
          const list = res.data?.data?.zones || res.data?.zones || [];
          if (list.length > 0) {
            const firstZone = list[0];
            const zId = String(firstZone._id);
            setZoneId(zId);
            setZoneName(firstZone.name || firstZone.city || "");
            localStorage.setItem("userZoneId", zId);
          }
        })
        .catch(() => {});
    }
  }, [zoneId]);

  // ─── Fetch Real Vendors ───────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setVendorsLoading(true);

    const fetchVendors = async () => {
      try {
        if (zoneId) {
          const res = await dmbExtraCustomerAPI.browseVendors({ zoneId });
          if (alive && res.data?.vendors) {
            setVendors(res.data.vendors);
            setVendorsLoading(false);
            return;
          }
        }
      } catch (err) {
        // fallback to public plans if zone error
      }

      // Fallback: fetch via public active vendors / plans
      try {
        const res = await dmbCustomerAPI.getPublicZones();
        const zones = res.data?.data?.zones || res.data?.zones || [];
        if (zones.length > 0 && !zoneId) {
          const fallbackZoneId = String(zones[0]._id);
          const vRes = await dmbExtraCustomerAPI.browseVendors({ zoneId: fallbackZoneId });
          if (alive && vRes.data?.vendors) {
            setVendors(vRes.data.vendors);
            setVendorsLoading(false);
            return;
          }
        }
      } catch (e) {}

      if (alive) setVendorsLoading(false);
    };

    fetchVendors();
    return () => { alive = false; };
  }, [zoneId]);

  // ─── Fetch Real Pantry Items ──────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setPantryLoading(true);
    dmbCustomerAPI.getAllPantryItems(zoneId || undefined)
      .then((res) => {
        if (alive && res.data?.success) {
          setPantryItems((res.data.items || []).filter((i) => i.isAvailable !== false));
        }
      })
      .catch((err) => console.error("Pantry fetch err:", err))
      .finally(() => { if (alive) setPantryLoading(false); });

    return () => { alive = false; };
  }, [zoneId]);

  // ─── Fetch meals from API ────────────────────────────────────────────────
  const loadTodayMeals = useCallback(async ({ bustCache = false } = {}) => {
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) { setLoading(false); return; }

      if (!bustCache) {
        const hit = getCachedMeals();
        if (hit) {
          setTodayMeal(hit.today);
          setTomorrowMealData(hit.tomorrow);
          setLoading(false);
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
            status: tomorrow.status === "skipped" ? "Skipped" : "Scheduled",
          }));
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, [setTomorrowMeal]);

  useEffect(() => {
    loadTodayMeals();
  }, [loadTodayMeals]);

  // Listen to live socket order status updates
  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = (data) => {
      loadTodayMeals({ bustCache: true });
    };
    socket.on("order_status_update", handleStatusUpdate);
    socket.on("daily_order_update", handleStatusUpdate);
    return () => {
      socket.off("order_status_update", handleStatusUpdate);
      socket.off("daily_order_update", handleStatusUpdate);
    };
  }, [socket, loadTodayMeals]);

  // ─── Manage Sheet Handlers ────────────────────────────────────────────────
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
      onShowNotificationToast?.(t("✅ Delivery skipped"));
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || t("Failed to skip"));
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, loadTodayMeals, onShowNotificationToast, closeManage, t]);

  const handleUndoSkip = useCallback(async (order) => {
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.undoSkipDailyOrder(order._id);
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(t("✅ Skip cancelled!"));
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
      const subId = manageOrder.subscriptionId?._id || manageOrder.subscriptionId;
      await dmbCustomerAPI.pauseSubscription(subId, pauseDays);
      loadTodayMeals({ bustCache: true });
      onShowNotificationToast?.(t("✅ Subscription paused for {{count}} day", { count: pauseDays }));
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
      const vId = order.vendorId?._id || order.vendorId || order._id;
      const res = await dmbCustomerAPI.getVendorMenu(vId);
      setAvailableMeals(res.data?.menu ?? res.data?.meals ?? res.data?.plans ?? []);
    } catch {}
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

  // ─── Upcoming Check ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || todayMeal || tomorrowMealData) {
      setUpcoming(null);
      return;
    }
    let alive = true;
    dmbExtraCustomerAPI
      .calendar()
      .then((res) => {
        if (!alive) return;
        const subs = res.data?.subscriptions || [];
        const next = subs
          .flatMap((s) => (s.days || []).filter((d) => d.slots?.length).map((d) => ({ date: d.date, slot: d.slots[0] })))
          .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
        setUpcoming({ hasSubscription: subs.length > 0, paused: subs.length > 0 && subs.every((s) => s.status === "paused"), next });
      })
      .catch(() => {
        if (alive) setUpcoming({ hasSubscription: false, paused: false, next: null });
      });
    return () => { alive = false; };
  }, [loading, todayMeal, tomorrowMealData]);

  // User Greeting
  const userName = currentUser?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning") : hour < 17 ? t("Good afternoon") : t("Good evening");
  const pointsPercent = Math.min((points / 300) * 100, 100);

  const nextDayLabel = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(getCurrentLanguage(), { weekday: "long", day: "numeric", month: "short" });

  // Handle adding pantry item to cart
  const handleAddPantryItem = (item) => {
    const vId = item.vendorId?._id || item.vendorId;
    if (cart.vendorId && cart.vendorId !== vId && cart.items?.length > 0) {
      onShowNotificationToast?.(t("Cart cleared: switching to new vendor"));
    }
    addItem(item, vId);
    onShowNotificationToast?.(t("Added {{name}} to pantry bag!", { name: item.title }));
  };

  // Search: every word typed must match (accents and case ignored) a kitchen's name, chef, city, cuisines or dishes,
  // or a pantry item's name, description or category.
  const searchTokens = normalizeText(searchQuery).split(/\s+/).filter(Boolean);
  const isSearching = searchTokens.length > 0;
  const matchesSearch = (...parts) => {
    const haystack = normalizeText(parts.flat().filter(Boolean).join(" "));
    return searchTokens.every((token) => haystack.includes(token));
  };
  const cuisineNames = (v) => (v.cuisines || []).map((c) => (typeof c === "string" ? c : c?.name || ""));
  const filteredVendors = vendors.filter(
    (v) => !isSearching || matchesSearch(v.name, v.restaurantName, v.chefName, v.city, cuisineNames(v), v.mealNames)
  );
  const dishHits = (v) =>
    isSearching ? (v.mealNames || []).filter((n) => searchTokens.some((token) => normalizeText(n).includes(token))).slice(0, 3) : [];
  const filteredPantry = pantryItems.filter((i) => !isSearching || matchesSearch(i.title, i.description, i.categoryName));
  const nothingFound = isSearching && !vendorsLoading && !pantryLoading && filteredVendors.length === 0 && filteredPantry.length === 0;

  // ─── Render Active Meal Card ──────────────────────────────────────────────
  const renderMealCard = (meal, label, isToday = false) => {
    if (!meal) return null;
    const mealName = meal.meals?.[0]?.mealPlanName || meal.meals?.[0]?.name || "Your Meal";
    const vendorName = meal.vendor?.name || "";
    const slot = slotLabel(meal.deliverySlot) || meal.deliverySlot;
    const status = meal.status || "scheduled";
    const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.scheduled;
    const statusLabel = STATUS_LABELS[status] ?? status;
    const dateStr = new Date(meal.deliveryDate).toLocaleDateString(getCurrentLanguage(), {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    return (
      <section className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-100 shadow-md hover:shadow-lg transition-all duration-300 relative overflow-hidden">
        {/* Glow accent */}
        <div className={`absolute top-0 left-0 w-2 h-full ${isToday ? "bg-[#1F7A63]" : "bg-blue-500"}`} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700 text-lg">
              {isToday ? "🍽️" : "🚚"}
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">{label}</h2>
              <p className="text-xs text-slate-500 font-medium">{dateStr} · {slot}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        <div className="flex items-start justify-between bg-slate-50/80 rounded-2xl p-4 mb-4 border border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-800">{mealName}</h3>
            {vendorName && (
              <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                <ChefHat size={13} className="text-[#1F7A63]" /> {t("by {{vendorName}}", { vendorName })}
              </p>
            )}
          </div>
          {meal.deliveryPin && status === "out_for_delivery" && (
            <div className="text-right bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">PIN</span>
              <span className="text-base font-black text-[#1F7A63] tracking-widest">{meal.deliveryPin}</span>
            </div>
          )}
        </div>

        {/* Live Tracking CTA when out for delivery */}
        {status === "out_for_delivery" && (
          <button
            onClick={() => onTrackLive ? onTrackLive(meal) : onGoToOrders()}
            className="w-full mb-3 py-3 rounded-2xl bg-gradient-to-r from-[#1F7A63] to-emerald-600 text-white font-extrabold text-sm shadow-md hover:shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
          >
            <Truck size={18} className="animate-bounce" />
            <span>{t("Track Live Delivery on Map")}</span>
            <ChevronRight size={16} />
          </button>
        )}

        {/* Actions for upcoming orders */}
        {!isToday && status === "scheduled" && (
          <div className="flex gap-2.5 pt-2 border-t border-slate-100">
            <button
              onClick={() => { setManageOrder(meal); setManageMode("confirm_skip"); }}
              className="flex-1 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 text-center cursor-pointer active:scale-95 transition-all"
            >{t("Skip")}</button>
            <button
              onClick={() => { setManageOrder(meal); setManageMode("pause"); }}
              className="flex-1 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 text-center cursor-pointer active:scale-95 transition-all"
            >{t("Pause")}</button>
            <button
              onClick={() => openChangeMeal(meal)}
              className="flex-1 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 text-center cursor-pointer active:scale-95 transition-all"
            >{t("Change")}</button>
          </div>
        )}

        {!isToday && status === "skipped" && (
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={() => handleUndoSkip(meal)}
              disabled={loadingAction}
              className="w-full py-2.5 rounded-xl border border-[#1F7A63] text-[#1F7A63] hover:bg-emerald-50 text-xs font-bold text-center cursor-pointer active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {loadingAction && <div className="w-4 h-4 border-2 border-[#1F7A63] border-t-transparent rounded-full animate-spin" />}
              {t("Undo Skip & Deliver")}
            </button>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="bg-[#F8FAFC] text-slate-900 min-h-screen pb-36">
      <ScrollStickyBar 
        title={`${greeting}, ${userName}`} 
        right={
          <button 
            onClick={onGoToProfile} 
            className="w-9 h-9 rounded-full bg-white/20 text-white font-bold text-sm shadow-xs flex items-center justify-center"
            aria-label={t("Profile")}
          >
            {userName ? userName.charAt(0).toUpperCase() : "U"}
          </button>
        } 
      />

      {/* ─── Top Header & Hero Gradient ────────────────────────────────────── */}
      <header className="bg-gradient-to-br from-[#124b3c] via-[#1F7A63] to-[#2aa385] px-5 sm:px-8 pt-10 pb-12 rounded-b-[36px] shadow-lg relative z-10 text-white">
        <div className="max-w-6xl mx-auto">
          {/* Top Location Bar & Profile */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => navigate("/user/addresses")}
              className="flex items-center gap-2 bg-black/20 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 text-xs font-semibold active:scale-95 transition-transform min-w-0"
            >
              <MapPin size={14} className="text-[#9ef3d7] shrink-0" />
              <span className="text-white/90 truncate max-w-[200px] sm:max-w-xs">{headerAddress || t("Add address")}</span>
              <ChevronDown size={14} className="text-[#9ef3d7] shrink-0" />
            </button>

            <button
              onClick={onGoToProfile}
              className="relative w-11 h-11 rounded-full border-2 border-[#9ef3d7] overflow-hidden hover:scale-105 active:scale-95 transition-transform shadow flex items-center justify-center bg-white/20 text-white font-black text-base"
            >
              <span>{userName ? userName.charAt(0).toUpperCase() : "U"}</span>
              {currentUser?.profileImage && (
                <img
                  alt={t("User profile")}
                  className="absolute inset-0 w-full h-full object-cover"
                  src={currentUser.profileImage}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
            </button>
          </div>

          {/* Greeting Headline */}
          <div className="mb-5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              {greeting}, {userName} <span className="animate-pulse">👋</span>
            </h1>
            <p className="text-sm text-emerald-100 font-medium mt-1">
              {filteredTomorrowMealData
                ? t("Next delivery: {{slotLabel}} · {{date}}", { 
                    slotLabel: slotLabel(filteredTomorrowMealData.deliverySlot), 
                    date: new Date(filteredTomorrowMealData.deliveryDate).toLocaleDateString(getCurrentLanguage(), { weekday: "long" }) 
                  })
                : upcoming?.next
                  ? t("Next delivery: {{slotLabel}} · {{date}}", { 
                      slotLabel: slotLabel(upcoming.next.slot.slot) || upcoming.next.slot.slotName, 
                      date: nextDayLabel(upcoming.next.date) 
                    })
                  : t("Fresh homestyle meals & pantry essentials delivered daily")}
            </p>
          </div>

          {/* Smart Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur(); // closes the phone keyboard so the results are visible
                if (e.key === "Escape") setSearchQuery("");
              }}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label={t("Search meals, tiffin kitchens, pantry grocery...")}
              placeholder={t("Search meals, tiffin kitchens, pantry grocery...")}
              className="w-full h-12 pl-12 pr-10 bg-white text-slate-900 rounded-2xl text-sm font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-400/30 shadow-md transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label={t("Clear search")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Main Content Container ────────────────────────────────────────── */}
      <main className={`px-4 sm:px-8 max-w-6xl mx-auto ${isSearching ? "mt-5" : "-mt-6"} space-y-7 relative z-20`}>

        {/* Multi-Meal Alert Banner - Clean Mint Theme */}
        {showBanner && !isSearching && (
          <div className="bg-emerald-50/90 text-emerald-950 border border-emerald-200/80 p-4 rounded-2xl flex justify-between items-center shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-[#1F7A63] text-white shadow-xs">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-emerald-950">{t("Multi-Meal Subscriptions Live!")}</p>
                <p className="text-[11px] text-emerald-700 font-medium">{t("Bundle lunch & dinner in one plan with zero extra delivery fee.")}</p>
              </div>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="p-1 hover:bg-emerald-100 text-emerald-700 rounded-full transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {!isSearching && (
        <>
        {/* ─── Category Quick-Action Hub with Seeded 3D Images ────────────── */}
        <section className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-slate-100">
          <div className="grid grid-cols-5 gap-2 sm:gap-4 items-start">
            {[
              { id: "plans", label: "Meal Plans", image: "/categories/meal_plan.jpg", action: () => onGoToPlans() },
              { id: "pantry", label: "Pantry Store", image: "/categories/pantry_store.jpg", action: () => {
                const el = document.getElementById("pantry-section");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                else onGoToPlans();
              }},
              { id: "calendar", label: "Calendar", image: "/categories/calendar.jpg", action: () => onGoToCalendar() },
              { id: "orders", label: "My Orders", image: "/categories/orders.jpg", action: () => onGoToOrders() },
              { id: "wallet", label: "Wallet", image: "/categories/wallet.jpg", action: () => onGoToWallet ? onGoToWallet() : onGoToProfile() },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={cat.action}
                className="flex flex-col items-center justify-start h-full w-full p-1 sm:p-2 rounded-2xl hover:bg-slate-50/80 transition-all active:scale-95 group cursor-pointer"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 aspect-square rounded-2xl overflow-hidden bg-white shadow-xs border border-slate-100 mb-2 group-hover:scale-105 group-hover:shadow-md transition-all duration-300 flex items-center justify-center p-0.5">
                  <img src={cat.image} alt={cat.label} className="w-full h-full object-cover rounded-xl" />
                </div>
                <div className="h-8 sm:h-9 w-full flex items-start justify-center">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 text-center leading-tight line-clamp-2">
                    {cat.label}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ─── Smart Multi-Vendor Rotation Feature Card ────────────────────── */}
        <section 
          onClick={() => navigate("/user/rotation")}
          className="bg-gradient-to-r from-emerald-900 via-[#1F7A63] to-teal-800 rounded-3xl p-4 sm:p-5 text-white shadow-sm hover:shadow-xl transition-all cursor-pointer flex items-center justify-between gap-4 group"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Shuffle className="text-white" size={24} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base tracking-tight">Smart Rotation</span>
                <span className="text-[10px] font-extrabold bg-white/20 border border-white/20 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Multi-Vendor
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 font-medium truncate mt-0.5">
                Order from different home kitchens on different weekdays in 1 subscription
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 bg-white text-[#1F7A63] px-3.5 py-2 rounded-xl text-xs font-black shadow-xs group-hover:bg-emerald-50 transition-colors">
            <span>Try Now</span>
            <ArrowRight size={14} />
          </div>
        </section>

        {/* ─── Active Meal Subscriptions Status (Today / Tomorrow) ─────────── */}
        {loading ? (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4 animate-pulse">
            <div className="h-5 bg-slate-200 rounded w-1/3" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
            <div className="h-28 bg-slate-100 rounded-2xl" />
          </div>
        ) : (
          <>
            {todayMeal && renderMealCard(todayMeal, t("Today's Delivery"), true)}
            {tomorrowMealData && renderMealCard(tomorrowMealData, t("Tomorrow's Delivery"), false)}

            {/* Upcoming subscription but no meals today/tomorrow */}
            {!todayMeal && !tomorrowMealData && upcoming?.hasSubscription && (
              <section
                onClick={onGoToCalendar}
                className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm cursor-pointer hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl p-2 bg-emerald-50 rounded-2xl">📅</span>
                    <div>
                      <h2 className="text-base sm:text-lg font-black text-slate-900">{t("Your Meal Plan is Active")}</h2>
                      <p className="text-xs text-slate-500 font-medium">
                        {upcoming.paused
                          ? t("Plan currently paused. Resume anytime from Calendar.")
                          : upcoming.next
                            ? t("Next delivery: {{date}} · {{slot}}", { date: nextDayLabel(upcoming.next.date), slot: slotLabel(upcoming.next.slot.slot) || upcoming.next.slot.slotName })
                            : t("No pending deliveries for this week")}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </section>
            )}

            {/* Non-subscriber hero callout */}
            {!todayMeal && !tomorrowMealData && upcoming !== undefined && !upcoming?.hasSubscription && (
              <section className="bg-gradient-to-r from-emerald-800 to-[#1F7A63] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
                <div className="relative z-10 max-w-lg space-y-3">
                  <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-black uppercase tracking-wider text-emerald-200 inline-block">
                    🍱 Daily Tiffin Subscription
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black leading-tight text-white">
                    Healthy, Home-Style Meals Delivered Every Day
                  </h2>
                  <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed">
                    Choose from verified local home chefs and kitchens. Enjoy fresh rotis, sabzi, dal and rice right at your home or office.
                  </p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      onClick={onGoToPlans}
                      className="px-5 py-3 rounded-xl bg-white text-[#1F7A63] font-extrabold text-sm hover:bg-emerald-50 active:scale-95 transition-all shadow-md flex items-center gap-2 cursor-pointer"
                    >
                      <span>Explore Meal Plans</span>
                      <ArrowRight size={16} />
                    </button>
                    <button
                      onClick={() => {
                        const el = document.getElementById("pantry-section");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                        else onGoToPlans();
                      }}
                      className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm backdrop-blur-md active:scale-95 transition-all cursor-pointer"
                    >
                      Shop Pantry Essentials
                    </button>
                  </div>
                </div>

                <div className="absolute right-[-20px] bottom-[-20px] opacity-15 text-[160px] pointer-events-none select-none">
                  🍱
                </div>
              </section>
            )}
          </>
        )}

        </>
        )}

        {(!isSearching || vendorsLoading || filteredVendors.length > 0) && (
        <>
        {/* ─── Featured Kitchens & Tiffin Makers ──────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
                {isSearching ? t("Kitchens") : "Top Home Kitchens & Makers"}
              </h2>
              {!isSearching && <p className="text-xs text-slate-500 font-medium mt-0.5">Curated daily meal plans prepared fresh in your zone</p>}
            </div>
            <button
              onClick={onGoToPlans}
              className="shrink-0 text-xs sm:text-sm font-bold text-[#1F7A63] hover:text-[#175C4B] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap self-start sm:self-center pt-1 sm:pt-0"
            >
              <span>View All</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {vendorsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm animate-pulse space-y-3">
                  <div className="h-36 bg-slate-200 rounded-2xl" />
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-xs space-y-3">
              <span className="text-4xl">👨‍🍳</span>
              <h3 className="text-base font-bold text-slate-800">{t("No kitchens deliver to your area yet.")}</h3>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {(isSearching ? filteredVendors : filteredVendors.slice(0, 6)).map((vendor) => {
                const cover = normalizeImageUrl(
                  vendor.coverImages?.[0] || vendor.profileImage || vendor.logo
                );
                const rating = vendor.rating ? Number(vendor.rating).toFixed(1) : "4.8";
                const vendorTypeLabel = vendor.vendorType === "home_cook" ? "Home Chef" : vendor.vendorType === "restaurant" ? "Kitchen" : "Tiffin Center";

                return (
                  <div
                    key={vendor._id || vendor.id}
                    className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group"
                  >
                    {/* Cover image */}
                    <div className="relative h-40 overflow-hidden bg-slate-100">
                      <img
                        src={cover}
                        alt={vendor.restaurantName || vendor.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => { e.target.src = FALLBACK_MEAL_PHOTO; }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      
                      {/* Top Badges */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/90 text-slate-800 backdrop-blur-md shadow-xs">
                          {vendorTypeLabel}
                        </span>
                        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-white text-xs font-black">
                          <Star size={12} className="text-amber-400 fill-amber-400" />
                          <span>{rating}</span>
                        </div>
                      </div>

                      <div className="absolute bottom-3 left-3 right-3 text-white">
                        <h3 className="text-base font-black truncate">{vendor.restaurantName || vendor.name}</h3>
                        <p className="text-[11px] text-white/80 font-medium truncate flex items-center gap-1">
                          <MapPin size={11} /> {vendor.city || ""}
                        </p>
                      </div>
                    </div>

                    {/* Kitchen Info & CTA */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(vendor.cuisines || []).slice(0, 3).map((c, i) => (
                          <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {typeof c === "string" ? c : c.name || "Meal"}
                          </span>
                        ))}
                      </div>

                      {dishHits(vendor).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {dishHits(vendor).map((name) => (
                            <span key={name} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">🍽️ {name}</span>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <button
                          onClick={() => setOpenPlansFor(vendor)}
                          className="flex-1 py-2.5 rounded-xl bg-[#1F7A63] hover:bg-[#155a49] text-white text-xs font-extrabold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Subscribe</span>
                          <ArrowRight size={13} />
                        </button>
                        <button
                          onClick={onGoToPlans}
                          className="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          Menu
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        </>
        )}

        {(!isSearching || pantryLoading || filteredPantry.length > 0) && (
        <>
        {/* ─── Pantry Essentials Store (Direct In-Home Ordering) ───────────── */}
        <section id="pantry-section" className="space-y-4 pt-2">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
                {isSearching ? t("Pantry Items") : "Pantry Essentials & Daily Staples"}
              </h2>
              {!isSearching && (
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Breads, milk, sweets & groceries bundled with your meal delivery
                </p>
              )}
            </div>
            <button
              onClick={() => onGoToPlans()}
              className="shrink-0 text-xs sm:text-sm font-bold text-[#1F7A63] hover:text-[#175C4B] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap self-start sm:self-center pt-1 sm:pt-0"
            >
              <span>See All</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {pantryLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="bg-white rounded-3xl p-4 border border-slate-100 animate-pulse space-y-3">
                  <div className="h-28 bg-slate-200 rounded-2xl" />
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : filteredPantry.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-xs space-y-2">
              <span className="text-4xl">🛒</span>
              <h3 className="text-base font-bold text-slate-800">No Pantry Items Available</h3>
              <p className="text-xs text-slate-500">Pantry essentials will be stocked in your zone shortly.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {(isSearching ? filteredPantry : filteredPantry.slice(0, 8)).map((item) => {
                const img = normalizeImageUrl(item.image);
                const qty = getItemQuantity(item._id);

                return (
                  <div
                    key={item._id}
                    className="bg-white rounded-3xl p-3 sm:p-4 border border-slate-100 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      {/* Product Image */}
                      <div className="relative h-28 sm:h-32 rounded-2xl overflow-hidden bg-slate-50 mb-2.5">
                        <img
                          src={img}
                          alt={item.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => { e.target.src = FALLBACK_MEAL_PHOTO; }}
                        />
                      </div>

                      {/* Title & Price */}
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-800 line-clamp-1">{item.title}</h4>
                      <p className="text-[11px] text-slate-400 font-medium line-clamp-1">{item.categoryName || "Grocery staple"}</p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs sm:text-sm font-black text-slate-900">
                        {money(item.price)}
                      </span>

                      {qty === 0 ? (
                        <button
                          onClick={() => handleAddPantryItem(item)}
                          className="px-3 py-1.5 rounded-full bg-emerald-50 text-[#1F7A63] hover:bg-[#1F7A63] hover:text-white font-black text-xs transition-colors flex items-center gap-1 active:scale-95 cursor-pointer shadow-xs"
                        >
                          <Plus size={13} />
                          <span>Add</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 bg-[#1F7A63] text-white rounded-full px-1.5 py-0.5 shadow-xs">
                          <button
                            onClick={() => removeItem(item._id)}
                            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/20 text-white font-bold text-xs"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="text-xs font-black min-w-[14px] text-center">{qty}</span>
                          <button
                            onClick={() => handleAddPantryItem(item)}
                            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/20 text-white font-bold text-xs"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        </>
        )}

        {nothingFound && (
          <section className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-xs space-y-3">
            <span className="text-4xl">🔍</span>
            <h3 className="text-base font-bold text-slate-800">{t("No results for “{{query}}”", { query: searchQuery.trim() })}</h3>
            <p className="text-xs text-slate-500">{t("Try a different word or check the spelling.")}</p>
            <button
              onClick={() => setSearchQuery("")}
              className="px-4 py-2 rounded-xl bg-[#1F7A63] text-white text-xs font-extrabold active:scale-95 transition-all cursor-pointer"
            >
              {t("Clear search")}
            </button>
          </section>
        )}

        {!isSearching && (
        <>
        {/* ─── Why Rogas / DailyMealBox (Trust & Value Props) ───────────────── */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="text-center max-w-md mx-auto space-y-1">
            <span className="text-xs font-black uppercase tracking-widest text-[#1F7A63]">Daily Subscription Made Simple</span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">Why Customers Love DailyMealBox</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: "🥗",
                title: "100% Homestyle Fresh",
                desc: "Cooked freshly by certified local home chefs using pure, wholesome ingredients."
              },
              {
                icon: "⏱️",
                title: "Scheduled Slot Delivery",
                desc: "Choose Lunch (12–3 PM) or Dinner (5–8 PM). Guaranteed hot & timely arrivals."
              },
              {
                icon: "🔄",
                title: "Pause or Skip Anytime",
                desc: "Travelling or eating out? Pause or cancel days with zero penalties or charges."
              },
              {
                icon: "🔒",
                title: "One-Doorbell PIN",
                desc: "Multi-vendor orders bundled securely. Handover verified via 4-digit secret PIN."
              }
            ].map((prop, idx) => (
              <div key={idx} className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 space-y-2">
                <span className="text-3xl block mb-1">{prop.icon}</span>
                <h3 className="text-sm font-extrabold text-slate-900">{prop.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">{prop.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 3-Step Guide (How Subscriptions Work) - Clean Light Background ─── */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-xs space-y-6">
          <div className="text-center max-w-md mx-auto space-y-1">
            <span className="text-xs font-black uppercase tracking-widest text-[#1F7A63]">Simple & Transparent</span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">How Daily Delivery Works</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative">
            {[
              {
                step: "01",
                title: "Choose Your Plan",
                desc: "Pick your preferred kitchen, plan duration (Weekly or Monthly), and meal type (Veg, Diet, or Non-Veg)."
              },
              {
                step: "02",
                title: "Set Delivery Schedule",
                desc: "Select Lunch or Dinner slots, customize delivery weekdays (Mon–Fri or 7 Days), and add pantry grocery bags."
              },
              {
                step: "03",
                title: "Enjoy Daily Fresh Food",
                desc: "Track delivery boy live on map, share your 4-digit PIN at the door, and savor hot homemade food."
              }
            ].map((st, i) => (
              <div key={i} className="bg-slate-50/70 hover:bg-emerald-50/40 border border-slate-100 rounded-2xl p-5 relative space-y-2 transition-colors">
                <span className="text-2xl font-black text-[#1F7A63] block tracking-tight">{st.step}</span>
                <h3 className="text-base font-extrabold text-slate-900">{st.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{st.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Loyalty Rewards Widget ───────────────────────────────────────── */}
        <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl p-2 rounded-2xl bg-amber-50">⭐</span>
              <div>
                <span className="text-base sm:text-lg font-black text-slate-900">{t("{{points}} Reward Points", { points })}</span>
                <p className="text-xs text-slate-400 font-medium">Earn 10 points on every meal delivery</p>
              </div>
            </div>
            <button
              onClick={() => setShowPointsHist((v) => !v)}
              className="text-[#1F7A63] hover:underline font-extrabold text-xs cursor-pointer"
            >
              {showPointsHist ? t("Close") : t("History")}
            </button>
          </div>

          {showPointsHist ? (
            <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs font-semibold border border-slate-100">
              <div className="flex justify-between"><span>{t("Welcome Bonus")}</span><span className="text-emerald-700 font-black">{t("+200 pts")}</span></div>
              <div className="flex justify-between"><span>{t("First Subscription")}</span><span className="text-emerald-700 font-black">{t("+50 pts")}</span></div>
              <div className="flex justify-between"><span>{t("Profile setup complete")}</span><span className="text-emerald-700 font-black">{t("+30 pts")}</span></div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-[#1F7A63] h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${pointsPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                <span>{points} / 300 pts</span>
                <span className="text-[#1F7A63] font-bold">Redeem for discounts at checkout</span>
              </div>
            </div>
          )}
        </section>

        </>
        )}
      </main>

      {/* ─── Floating Pantry Cart Bottom Bar ───────────────────────────────── */}
      {totalItems > 0 && (
        <div className="fixed bottom-20 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] px-4 sm:px-8 z-40 animate-in slide-in-from-bottom duration-300">
          <button 
            onClick={() => navigate('/user/pantry-checkout')}
            className="w-full max-w-4xl mx-auto bg-[#1F7A63] hover:bg-[#155a49] text-white py-4 px-6 rounded-2xl flex items-center justify-between shadow-[0_12px_32px_rgba(31,122,99,0.4)] transition-all active:scale-98 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <ShoppingBag size={20} />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white/90">{totalItems} pantry item{totalItems > 1 ? "s" : ""} in bag</p>
                <p className="text-base font-black">{money(cartTotal)}</p>
              </div>
            </div>
            <span className="text-sm font-black flex items-center gap-1 bg-white text-[#1F7A63] px-4 py-2 rounded-xl shadow-xs">
              {t("Checkout")} <ChevronRight size={16} />
            </span>
          </button>
        </div>
      )}

      {/* ─── Manage Bottom Sheet (Skip / Pause / Change Meal) ──────────────── */}
      {manageOrder && manageMode && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={closeManage}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl shadow-2xl w-full max-w-lg mx-auto px-5 pt-5 pb-10 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-lg font-black text-slate-900 mb-2">{t("Skip This Delivery?")}</h2>
                <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
                  {manageOrder.paidBy
                    ? t("Your delivery for {{date}} will be skipped. Your company paid for this meal, so nothing is credited to your wallet.", { date: new Date(manageOrder.deliveryDate).toLocaleDateString(getCurrentLanguage(), { weekday: "short", day: "numeric", month: "short" }) })
                    : t("Your delivery for {{date}} will be skipped and the day's amount will be credited to your wallet.", { date: new Date(manageOrder.deliveryDate).toLocaleDateString(getCurrentLanguage(), { weekday: "short", day: "numeric", month: "short" }) })}
                </p>
                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-slate-200 py-3 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50">{t("Cancel")}</button>
                  <button
                    onClick={handleSkip}
                    disabled={loadingAction}
                    className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {t("Confirm Skip")}
                  </button>
                </div>
              </>
            )}

            {manageMode === "pause" && (
              <>
                <h2 className="text-lg font-black text-slate-900 mb-2">{t("Pause Subscription")}</h2>
                <p className="text-xs sm:text-sm text-slate-600 mb-5">{t("Select how many days to pause your subscription.")}</p>
                <div className="flex gap-3 mb-6">
                  {[1, 2, 3].map((d) => (
                    <button
                      key={d}
                      onClick={() => setPauseDays(d)}
                      className={`flex-1 py-4 rounded-2xl font-black text-sm border-2 transition-all active:scale-95 cursor-pointer ${
                        pauseDays === d ? "border-[#1F7A63] bg-emerald-50 text-[#1F7A63]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {t("{{count}} Day", { count: d })}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-slate-200 py-3 rounded-xl font-bold text-sm text-slate-700">{t("Cancel")}</button>
                  <button
                    onClick={handlePause}
                    disabled={loadingAction}
                    className="flex-1 bg-[#1F7A63] hover:bg-[#155a49] text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {loadingAction && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {t("Pause {{count}} Day", { count: pauseDays })}
                  </button>
                </div>
              </>
            )}

            {manageMode === "change_meal" && (
              <>
                <h2 className="text-lg font-black text-slate-900 mb-2">{t("Change Meal for this Delivery")}</h2>
                <p className="text-xs text-slate-500 mb-4">{t("Choose a dish from the vendor's active menu.")}</p>

                {availableMeals.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-6 text-center mb-5">
                    <UtensilsCrossed className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-medium">{t("No alternate meals available from this vendor right now.")}</p>
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
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                            isSelected ? "border-[#1F7A63] bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-[#1F7A63] bg-[#1F7A63]" : "border-slate-300"}`}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-extrabold text-slate-800">{meal.name}</p>
                            <p className="text-[11px] text-slate-500 font-medium">{money(meal.pricePerDay || meal.price)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-slate-200 py-3 rounded-xl font-bold text-sm text-slate-700">{t("Cancel")}</button>
                  <button
                    onClick={handleChangeMeal}
                    disabled={loadingAction || selectedMealIds.length === 0}
                    className="flex-1 bg-[#1F7A63] text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-sm"
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

      {/* ─── Direct Subscribe Sheet from Home ───────────────────────────────── */}
      {openPlansFor && (
        <SubscribeSheet
          vendor={{
            id: openPlansFor._id || openPlansFor.id,
            name: openPlansFor.restaurantName || openPlansFor.name
          }}
          onClose={() => setOpenPlansFor(null)}
          onProceedToCheckout={(checkoutData) => {
            setOpenPlansFor(null);
            if (onSelectPlan) onSelectPlan(checkoutData);
            else navigate("/user/checkout");
          }}
        />
      )}
    </div>
  );
}
