import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { dmbCustomerAPI, publicGetOnce } from "@food/api";
import { Star, Coins, X, Loader2, Flag, User, ArrowRight, Receipt, XCircle, ChevronRight, ArrowRightLeft, PauseCircle, UtensilsCrossed, Check, ArrowLeft } from 'lucide-react';
import { initRazorpayPayment } from "../../Food/utils/razorpay";

// ─── Constants (module-level, never re-created) ───────────────────────────────
const SLOT_LABELS = {
  breakfast: "Breakfast ☀️",
  lunch: "Lunch 🌤️",
  dinner: "Dinner 🌙",
};

const STATUS_CONFIG = {
  scheduled: { label: "Scheduled", color: "bg-[#E8F3F0] text-primary", icon: "schedule", canManage: true },
  preparing: { label: "Preparing 🔥", color: "bg-amber-100 text-amber-700", icon: "soup_kitchen", canManage: false },
  ready: { label: "Ready ✓", color: "bg-blue-100 text-blue-700", icon: "check_circle", canManage: false },
  out_for_delivery: { label: "On the Way 🛵", color: "bg-purple-100 text-purple-700", icon: "local_shipping", canManage: false },
  delivered: { label: "Delivered ✅", color: "bg-green-100 text-green-700", icon: "done_all", canManage: false },
  skipped: { label: "Skipped", color: "bg-red-100 text-red-600", icon: "cancel", canManage: false },
  failed: { label: "Failed ", color: "bg-red-100 text-red-700", icon: "error", canManage: false },
};

const TERMINAL_STATUSES = new Set(["skipped", "delivered", "failed"]);
const INACTIVE_STATUSES = new Set(["skipped", "delivered", "failed"]);

// ─── IST date helpers (pure, no closures) ────────────────────────────────────
const IST_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric", month: "2-digit", day: "2-digit",
});

function getUTCFormatDateStr(dateInput) {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getISTDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return IST_FORMATTER.format(d);
}

// ─── Slot timings cache — fetched once from backend, fallback to defaults ────────
let _slotTimings = {
  breakfast: { startHour: 6,  endHour: 11 },
  lunch:     { startHour: 11, endHour: 16 },
  dinner:    { startHour: 16, endHour: 23 },
};
let _slotTimingsFetched = false;

async function ensureSlotTimings() {
  if (_slotTimingsFetched) return;
  _slotTimingsFetched = true;
  try {
    const res = await publicGetOnce('/app-config/slot-timings');
    const timings = res?.data?.data?.slotTimings;
    if (timings) _slotTimings = { ..._slotTimings, ...timings };
  } catch (_) { /* use defaults */ }
}

// ─── Returns true if the order's slot is the currently active delivery window ─
// Uses dynamic timings from backend (admin-configurable), falls back to defaults
function isCurrentActiveSlot(order) {
  const orderDateStr = getUTCFormatDateStr(order.deliveryDate);
  if (orderDateStr !== getISTDateStr(0)) return false; // only today's orders

  const slot = (order.deliverySlot || 'lunch').toLowerCase();
  const nowIST = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  );
  const h = nowIST.getHours();

  const cfg = _slotTimings[slot];
  if (!cfg) return false;
  return h >= cfg.startHour && h < cfg.endHour;
}

// ─── Module-level cache (survives tab switches within a session) ──────────────
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

// ─── Helpers to patch cache in-place without full refetch ────────────────────
function patchCache(type, patchFn) {
  const cached = getCached(type);
  if (cached) setCached(type, patchFn(cached));
}

// ─── Static component — memoized so it never re-renders ──────────────────────
const SkeletonCard = memo(function SkeletonCard() {
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
});

// ─── Individual order card — memoized to skip re-render unless order/state changes
const OrderCard = memo(function OrderCard({
  order,
  isPast,
  isRated,
  onManage,
  onTrackLive,
  onRate,
  onTip,
  onRaiseComplaint,
}) {
  const statusCfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.scheduled;
  const mealName = order.meals?.[0]?.name || "Meal";
  const extraMeals = (order.meals?.length ?? 1) - 1;

  // Compute date string once per render of this card
  const dateStr = useMemo(() => {
    const orderDateStr = getUTCFormatDateStr(order.deliveryDate);
    if (orderDateStr === getISTDateStr(0)) return "TODAY";
    if (orderDateStr === getISTDateStr(1)) return "TOMORROW";
    const d = new Date(order.deliveryDate);
    return `${d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}`;
  }, [order.deliveryDate]);

  const slotStr = (order.deliverySlot || "LUNCH").toUpperCase();
  const isTerminal = TERMINAL_STATUSES.has(order.status);
  const isInactive = INACTIVE_STATUSES.has(order.status);
  const isActive = !isPast && !isInactive && isCurrentActiveSlot(order);

  const badgeColor =
    order.status === "skipped" || order.status === "failed"
      ? "bg-red-500"
      : order.status === "delivered"
        ? "bg-[#5c6e68]"
        : "bg-[#2a7a62]";

  const badgeLabel =
    order.status === "skipped" ? "SKIPPED" :
      order.status === "failed" ? "FAILED" :
        order.status === "delivered" ? "COMPLETED" :
          order.status === "scheduled" ? "SCHEDULED" : "ACTIVE";

  return (
    <div className={`rounded-[20px] p-4 mb-3 border transition-all duration-300 ${
      isActive
        ? "bg-gradient-to-br from-[#e8f7f3] to-[#f0faf7] border-[#006a5c] shadow-[0_0_0_2px_rgba(0,106,92,0.15),0_4px_16px_rgba(0,106,92,0.12)]"
        : "bg-white border-[#f0eded] shadow-sm"
    }`}>
      {/* Top: Date + Slot + Active Badge */}
      <div className="flex justify-between items-start mb-1">
        <div className="flex items-center gap-2">
          <p className={`text-[12px] font-bold tracking-wider uppercase font-sans ${
            isActive ? "text-[#006a5c]" : "text-[#5c6e68]"
          }`}>
            {dateStr} · {slotStr}
          </p>
          {isActive && (
            <span className="flex items-center gap-1 bg-[#006a5c] text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse inline-block" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPast && onRaiseComplaint && (
            <button
              onClick={() => onRaiseComplaint(order)}
              className="text-red-500 hover:text-red-700 active:scale-90 transition-transform flex items-center p-0.5 rounded-full hover:bg-red-50"
              title="Raise Complaint"
            >
              <Flag className="text-[18px]" />
            </button>
          )}
          <span className={`font-bold text-[9px] px-2.5 py-1 rounded-full uppercase tracking-wider font-sans text-white ${badgeColor}`}>
            {badgeLabel}
          </span>
        </div>
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
        <User className="text-[16px] text-[#5c6e68]" />
        <span className="text-[14px] text-[#5c6e68]">{order.userId?.name || "Maria K."}</span>
      </div>

      <div className="h-[1px] bg-[#f0eded] w-full mb-3" />

      {/* Bottom Action Row */}
      <div className="flex items-center justify-between">
        {isInactive ? (
          <div className="flex items-center gap-1.5 text-[#5c6e68]">
            <span className={`material-symbols-outlined text-[18px] ${order.status === "skipped" || order.status === "failed" ? "text-red-500" : ""
              }`}>
              {order.status === "skipped" ? "cancel" : order.status === "failed" ? "error" : "history"}
            </span>
            <span className={`text-[14px] font-medium ${order.status === "skipped" || order.status === "failed" ? "text-red-500" : ""
              }`}>
              {order.status === "skipped" ? "Skipped" : order.status === "failed" ? "Failed" : "Completed"}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[#006a5c]">
            <span className="material-symbols-outlined text-[18px]">{statusCfg.icon}</span>
            <span className="text-[14px] font-medium">
              {statusCfg.label.replace(/ [🔥✓🛵✅❌]/gu, "")}
            </span>
          </div>
        )}

        {!isPast && !isInactive && isCurrentActiveSlot(order) ? (
          <button
            onClick={() => onTrackLive(order)}
            className="text-[#006a5c] border border-[#006a5c] rounded-xl px-4 py-1.5 text-[13px] font-medium hover:bg-[#e8f3f0] active:scale-95 transition-all flex items-center gap-1"
          >
            Track Live <ArrowRight className="text-[16px]" />
          </button>
        ) : isPast && order.status === "delivered" ? (
          <div className="flex gap-2">
            <button
              onClick={() => onRate(order)}
              className={`border rounded-xl px-3 py-1.5 text-[13px] font-medium active:scale-95 transition-all flex items-center gap-1.5 ${order.isRated
                ? "text-[#006a5c] border-[#006a5c] bg-[#e8f3f0]"
                : "text-gray-500 border-gray-300 hover:bg-slate-50"
                }`}
            >
              <Star className={`w-3.5 h-3.5 ${order.isRated ? "fill-[#006a5c] text-[#006a5c]" : "text-gray-400"}`} />
              <span>{order.isRated ? `Rated (${order.deliveryRating})` : "Rate"}</span>
            </button>
            <button
              onClick={() => onTip(order)}
              className={`border rounded-xl px-3 py-1.5 text-[13px] font-medium active:scale-95 transition-all flex items-center gap-1.5 ${order.driverTip > 0
                ? "text-amber-700 border-amber-300 bg-amber-50"
                : "text-gray-500 border-gray-300 hover:bg-slate-50"
                }`}
            >
              <Coins className={`w-3.5 h-3.5 ${order.driverTip > 0 ? "text-amber-500 fill-amber-500" : "text-gray-400"}`} />
              <span>{order.driverTip > 0 ? `Tipped: ₹${order.driverTip}` : "Tip"}</span>
            </button>
          </div>
        ) : isPast && !isTerminal && statusCfg.canManage ? (
          <button
            onClick={() => onManage(order)}
            className="text-[#006a5c] border border-[#006a5c] rounded-xl px-4 py-1.5 text-[13px] font-medium hover:bg-[#e8f3f0] active:scale-95 transition-all"
          >
            Manage
          </button>
        ) : null}
      </div>
    </div>
  );
});

const PantryOrderCard = ({ order }) => {
  return (
    <div className="bg-white rounded-[16px] p-4 shadow-sm border border-[#f0f0f0] mb-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-extrabold text-[15px] text-[#2c3e35]">
            {order.vendorId?.restaurantName || "Pantry Vendor"}
          </h3>
          <p className="text-[10px] text-[#6e7a74] uppercase tracking-wider font-bold mt-0.5">
            Order ID: {order.orderId}
          </p>
        </div>
        <div className="bg-[#f0f8f5] px-2.5 py-1 rounded-full border border-[#d2e8de]">
          <span className="text-[10px] font-bold text-[#1F7A63] uppercase tracking-wider">
            {order.status}
          </span>
        </div>
      </div>
      
      <div className="flex justify-between items-start mt-4 pt-3 border-t border-dashed border-[#f0f0f0]">
        <div className="space-y-0.5">
          <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Items</span>
          <div className="text-[12px] font-medium text-[#2c3e35]">
            {order.items?.map((item, idx) => (
              <div key={idx}>{item.quantity}x {item.title}</div>
            ))}
            {(!order.items || order.items.length === 0) && "N/A"}
          </div>
        </div>
        <div className="text-right space-y-0.5">
          <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Dates</span>
          <span className="text-[12px] font-medium text-[#2c3e35] block">
            Delivery: {order.deliveryDates?.join(", ") || "N/A"}
            <br />
            Slots: {order.deliverySlots?.join(", ") || "N/A"}
          </span>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-dashed border-[#f0f0f0]">
        <div className="space-y-0.5 mt-2">
          <span className="text-[10px] text-[#6e7a74] uppercase tracking-wider block font-bold">Total Amount</span>
          <span className="text-[14px] font-extrabold text-[#006a5c] block mt-1">
            ₹{order.pricing?.total ? order.pricing.total.toFixed(2) : order.items?.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0).toFixed(2) || "0.00"}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function OrdersScreen({ onGoBack, onTrackLive, onRaiseComplaint, onGoToProfile, onShowNotificationToast, socket }) {
  const [activeSection, setActiveSection] = useState("Meals");
  const [activeTab, setActiveTab] = useState("Upcoming");
  const [orders, setOrders] = useState(() => getCached("upcoming") ?? []);
  const [loading, setLoading] = useState(() => !getCached("upcoming"));
  const [ratedOrders, setRatedOrders] = useState([]);

  // ─── Rating & Tip States ──────────────────────────────────────────────────
  const [ratingModal, setRatingModal] = useState({ show: false, order: null, rating: 0, comment: "", loading: false });
  const [tipModal, setTipModal] = useState({ show: false, order: null, amount: "", loading: false });

  // ─── Manage Sheet State ──────────────────────────────────────────────────
  const [manageOrder, setManageOrder] = useState(null);
  const [manageMode, setManageMode] = useState(null);
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [pauseDays, setPauseDays] = useState(1);

  // Keep latest activeTab accessible in stable callbacks without re-binding
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Fetch slot timings from backend on mount (so admin changes are reflected)
  useEffect(() => { ensureSlotTimings(); }, []);

  // ─── loadOrders — stale-proof via type argument + ref check ──────────────
  const loadOrders = useCallback(async (type, section, { bustCache = false } = {}) => {
    const currentSection = section || activeSectionRef.current;
    const isMeals = currentSection === "Meals";
    const key = isMeals 
      ? (type === "Upcoming" ? "upcoming" : "past") 
      : (type === "Upcoming" ? "pantry_upcoming" : "pantry_past");

    const isStale = () => activeTabRef.current !== type || activeSectionRef.current !== currentSection;

    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) {
        if (!isStale()) { setOrders([]); setLoading(false); }
        return;
      }

      if (!bustCache) {
        const hit = getCached(key);
        if (hit && !isStale()) {
          setOrders(hit);
          setLoading(false);
        }
      }

      if (isMeals) {
        const res = await dmbCustomerAPI.getMyOrders(type === "Upcoming" ? "upcoming" : "past");
        if (isStale()) return;

        if (res.data?.success) {
          const fresh = res.data.orders ?? [];
          setCached(key, fresh);
          setOrders(fresh);
        }
      } else {
        const apiType = type === "Upcoming" ? "upcoming" : "past";
        const res = await dmbCustomerAPI.getMyPantryOrders(apiType);
        if (isStale()) return;
        
        if (res.data?.success) {
          const fresh = res.data.orders ?? [];
          setCached(key, fresh);
          setOrders(fresh);
        }
      }
    } catch (err) {
      console.error("Failed to load orders:", err);
      if (!isStale()) setOrders([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, []); // stable — no deps needed thanks to activeTabRef

  // Re-fetch when tab changes
  useEffect(() => {
    const isMeals = activeSection === "Meals";
    const key = isMeals 
      ? (activeTab === "Upcoming" ? "upcoming" : "past") 
      : (activeTab === "Upcoming" ? "pantry_upcoming" : "pantry_past");
    const hit = getCached(key);
    if (hit) { setOrders(hit); setLoading(false); }
    else { setOrders([]); setLoading(true); }
    loadOrders(activeTab, activeSection);
  }, [activeTab, activeSection, loadOrders]);

  // ─── Socket: real-time status + daily menu updates ───────────────────────
  // Use refs for callbacks so socket.on/off doesn't need to re-bind on every render
  const handleStatusUpdateRef = useRef(null);
  const handleDailyMenuRef = useRef(null);

  handleStatusUpdateRef.current = (data) => {
    const patch = (list) =>
      list.map(o =>
        o.orderId === data.orderId || String(o._id) === String(data._id)
          ? { ...o, status: data.status }
          : o
      );
    setOrders(prev => patch(prev));
    patchCache("upcoming", patch);
    patchCache("past", patch);
    const label = STATUS_CONFIG[data.status]?.label || data.status;
    onShowNotificationToast?.(`🔔 Order ${data.orderId} → ${label}`);
  };

  handleDailyMenuRef.current = () => {
    loadOrders(activeTabRef.current, activeSectionRef.current, { bustCache: true });
  };

  useEffect(() => {
    if (!socket) return;
    const onStatus = (d) => handleStatusUpdateRef.current(d);
    const onMenu = () => handleDailyMenuRef.current();
    socket.on("order_status_updated", onStatus);
    socket.on("daily_menu_updated", onMenu);
    return () => {
      socket.off("order_status_updated", onStatus);
      socket.off("daily_menu_updated", onMenu);
    };
  }, [socket]); // binds once per socket instance — no stale closure

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
      const patch = (list) =>
        list.map(o => o._id === manageOrder._id ? { ...o, status: "skipped" } : o);
      setOrders(prev => patch(prev));
      const key = activeTabRef.current === "Upcoming" ? "upcoming" : "past";
      patchCache(key, patch);
      onShowNotificationToast?.("✅ Order skipped. Credit will be added to your wallet.");
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to skip order");
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, onShowNotificationToast, closeManage]);

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
      loadOrders(activeTabRef.current, activeSectionRef.current, { bustCache: true });
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to pause subscription");
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, pauseDays, loadOrders, onShowNotificationToast, closeManage]);

  const openChangeMeal = useCallback(async () => {
    setManageMode("change_meal");
    if (!manageOrder?.vendor?.name) return;
    try {
      const vendorId = manageOrder.vendorId?._id || manageOrder.vendorId || manageOrder._id;
      const res = await dmbCustomerAPI.getVendorMenu(vendorId);
      setAvailableMeals(res.data?.menu ?? res.data?.meals ?? res.data?.plans ?? []);
    } catch { /* show empty state */ }
  }, [manageOrder]);

  const handleChangeMeal = useCallback(async () => {
    if (!manageOrder || selectedMealIds.length === 0) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.changeDailyOrderMeal(manageOrder._id, selectedMealIds);
      onShowNotificationToast?.("✅ Meal updated for this delivery!");
      loadOrders(activeTabRef.current, { bustCache: true });
      closeManage();
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to change meal");
    } finally {
      setLoadingAction(false);
    }
  }, [manageOrder, selectedMealIds, loadOrders, onShowNotificationToast, closeManage]);

  const toggleMealSelection = useCallback((id) => {
    setSelectedMealIds([id]);
  }, []);

  // ─── Stable date formatters ───────────────────────────────────────────────
  const formatDate = useCallback((date) =>
    new Date(date).toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short",
    }), []);

  // ─── Stable rate & tip handlers ──────────────────────────────────────────
  const openRatingModal = useCallback((order) => {
    setRatingModal({
      show: true,
      order,
      rating: order.deliveryRating || 0,
      comment: order.ratingFeedback || "",
      loading: false
    });
  }, []);

  const openTipModal = useCallback((order) => {
    setTipModal({
      show: true,
      order,
      amount: "",
      loading: false
    });
  }, []);

  const submitRating = async () => {
    const { order, rating, comment } = ratingModal;
    if (!order) return;
    if (rating < 1 || rating > 5) {
      onShowNotificationToast?.("Please select a rating between 1 and 5 stars");
      return;
    }
    setRatingModal(prev => ({ ...prev, loading: true }));
    try {
      await dmbCustomerAPI.rateOrder(order._id, { rating, comment });
      onShowNotificationToast?.("Rating submitted successfully!");
      const patch = (list) =>
        list.map(o =>
          o._id === order._id
            ? { ...o, isRated: true, deliveryRating: rating, ratingFeedback: comment }
            : o
        );
      setOrders(prev => patch(prev));
      patchCache("past", patch);
      setRatingModal({ show: false, order: null, rating: 0, comment: "", loading: false });
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to submit rating");
      setRatingModal(prev => ({ ...prev, loading: false }));
    }
  };

  const submitTip = async () => {
    const { order, amount } = tipModal;
    if (!order) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      onShowNotificationToast?.("Please enter a valid tip amount");
      return;
    }
    setTipModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await dmbCustomerAPI.createTipOrder(order._id, numAmount);
      if (res.data?.success) {
        const rpOpts = res.data.razorpay;

        if (rpOpts.key === "rzp_test_dummy" || rpOpts.order_id.startsWith("rzp_tip_dev_")) {
          onShowNotificationToast?.("Demo mode: Simulating payment...");
          setTimeout(async () => {
            try {
              const verifyRes = await dmbCustomerAPI.verifyTipPayment(order._id, {
                razorpay_order_id: rpOpts.order_id,
                razorpay_payment_id: `rzp_pay_dev_${Math.random().toString(36).substr(2, 9)}`,
                razorpay_signature: `rzp_sig_dev_${Math.random().toString(36).substr(2, 9)}`
              });
              if (verifyRes.data?.success) {
                onShowNotificationToast?.("Tip payment simulated successfully!");
                const patch = (list) =>
                  list.map(o =>
                    o._id === order._id
                      ? { ...o, driverTip: (o.driverTip || 0) + numAmount }
                      : o
                  );
                setOrders(prev => patch(prev));
                patchCache("past", patch);
                setTipModal({ show: false, order: null, amount: "", loading: false });
              } else {
                onShowNotificationToast?.("Failed to verify simulated tip");
                setTipModal(prev => ({ ...prev, loading: false }));
              }
            } catch (err) {
              onShowNotificationToast?.(err.response?.data?.message || "Simulation failed");
              setTipModal(prev => ({ ...prev, loading: false }));
            }
          }, 1500);
          return;
        }

        const checkoutOptions = {
          key: rpOpts.key,
          amount: rpOpts.amount,
          currency: rpOpts.currency,
          order_id: rpOpts.order_id,
          name: rpOpts.name,
          description: rpOpts.description,
          handler: async function (response) {
            try {
              const verifyRes = await dmbCustomerAPI.verifyTipPayment(order._id, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              if (verifyRes.data?.success) {
                onShowNotificationToast?.("Tip payment verified and credited!");
                const patch = (list) =>
                  list.map(o =>
                    o._id === order._id
                      ? { ...o, driverTip: (o.driverTip || 0) + numAmount }
                      : o
                  );
                setOrders(prev => patch(prev));
                patchCache("past", patch);
                setTipModal({ show: false, order: null, amount: "", loading: false });
              } else {
                onShowNotificationToast?.("Failed to verify tip payment signature");
                setTipModal(prev => ({ ...prev, loading: false }));
              }
            } catch (err) {
              onShowNotificationToast?.(err.response?.data?.message || "Verification failed");
              setTipModal(prev => ({ ...prev, loading: false }));
            }
          },
          onError: function (err) {
            onShowNotificationToast?.("Payment failed: " + (err.description || "Try again"));
            setTipModal(prev => ({ ...prev, loading: false }));
          },
          onClose: function () {
            onShowNotificationToast?.("Payment modal closed");
            setTipModal(prev => ({ ...prev, loading: false }));
          }
        };

        await initRazorpayPayment(checkoutOptions);
      } else {
        onShowNotificationToast?.("Failed to create tip order");
        setTipModal(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
      onShowNotificationToast?.(err.response?.data?.message || "Failed to initialize tip payment");
      setTipModal(prev => ({ ...prev, loading: false }));
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────────
  const isPast = activeTab === "Past";
  const ratedOrderSet = useMemo(() => new Set(ratedOrders), [ratedOrders]);
  const filteredOrders = useMemo(() => {
    if (isPast) return orders;
    return orders.filter(o => o.meals?.[0]?.name !== "No meal set");
  }, [orders, isPast]);

  // Manage sheet derived values
  const manageDeliveryInfo = useMemo(() => {
    if (!manageOrder) return null;
    const dateStr = formatDate(manageOrder.deliveryDate);
    const slotLabel = SLOT_LABELS[manageOrder.deliverySlot] || "";
    const isTomorrow = getUTCFormatDateStr(manageOrder.deliveryDate) === getISTDateStr(1);
    return { dateStr, slotLabel, isTomorrow };
  }, [manageOrder, formatDate]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button
          onClick={onGoBack}
           className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"
        ><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-extrabold text-primary text-center">My Orders</h1>
        <div className="w-8" />
      </header>

      <main className="px-5 pt-20">
        <div className="flex items-center bg-[#f0f0f0] p-1 rounded-full mb-6 relative">
          <button 
            onClick={() => setActiveSection('Meals')}
            className={`flex-1 py-2.5 text-[14px] font-bold rounded-full transition-all duration-300 z-10 ${activeSection === 'Meals' ? 'bg-[#1F7A63] text-white shadow-md' : 'bg-transparent text-[#6e7a74]'}`}
          >
            Meals
          </button>
          <button 
            onClick={() => setActiveSection('Pantry')}
            className={`flex-1 py-2.5 text-[14px] font-bold rounded-full transition-all duration-300 z-10 ${activeSection === 'Pantry' ? 'bg-[#1F7A63] text-white shadow-md' : 'bg-transparent text-[#6e7a74]'}`}
          >
            Pantry
          </button>
        </div>
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
          <section className="space-y-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </section>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-on-surface-variant">
            <Receipt className="text-[56px] text-[#bec9c3]" />
            <p className="text-[15px] font-semibold text-center">
              {isPast ? (activeSection === "Meals" ? "No past meal orders yet" : "No past pantry orders yet") : (activeSection === "Meals" ? "No upcoming meal deliveries" : "No upcoming pantry deliveries")}
            </p>
            <p className="text-[13px] text-center">
              {isPast
                ? "Your completed orders will appear here."
                : "Subscribe to a meal plan to get started!"}
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            {filteredOrders.map(order => {
              if (activeSection === "Pantry") return <PantryOrderCard key={order.orderId || order._id} order={order} />;
              return <OrderCard
                key={order._id || order.orderId}
                order={order}
                isPast={isPast}
                isRated={order.isRated}
                onManage={openManage}
                onTrackLive={onTrackLive}
                onRate={openRatingModal}
                onTip={openTipModal}
                onRaiseComplaint={onRaiseComplaint}
              />;
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
                  {manageDeliveryInfo?.dateStr} · {manageDeliveryInfo?.slotLabel}
                  {manageDeliveryInfo?.isTomorrow && (
                    <span className="ml-2 bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      TOMORROW
                    </span>
                  )}
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => setManageMode("confirm_skip")}
                    className="w-full flex items-center gap-4 p-4 bg-red-50 border border-red-100 rounded-2xl hover:bg-red-100 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                      <XCircle className="text-red-500 text-[22px]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-bold text-on-surface">Skip This Delivery</p>
                      <p className="text-[12px] text-on-surface-variant font-medium">Wallet credit will be applied</p>
                    </div>
                    <ChevronRight className="text-on-surface-variant text-[18px]" />
                  </button>

                  <button
                    onClick={openChangeMeal}
                    className="w-full flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl hover:bg-blue-100 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <ArrowRightLeft className="text-blue-500 text-[22px]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-bold text-on-surface">Change Meal</p>
                      <p className="text-[12px] text-on-surface-variant font-medium">Switch to a different meal option</p>
                    </div>
                    <ChevronRight className="text-on-surface-variant text-[18px]" />
                  </button>

                  <button
                    onClick={() => setManageMode("pause")}
                    className="w-full flex items-center gap-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl hover:bg-amber-100 active:scale-[0.98] transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                      <PauseCircle className="text-amber-600 text-[22px]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-bold text-on-surface">Pause Subscription</p>
                      <p className="text-[12px] text-on-surface-variant font-medium">Pause for 1–2 days</p>
                    </div>
                    <ChevronRight className="text-on-surface-variant text-[18px]" />
                  </button>
                </div>

                <button
                  onClick={closeManage}
                  className="w-full mt-4 py-3 text-center text-[14px] font-bold text-on-surface-variant"
                >
                  Cancel
                </button>
              </>
            )}

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Skip This Delivery?</h2>
                <p className="text-[13px] text-on-surface-variant mb-6 leading-relaxed">
                  Your {manageDeliveryInfo?.dateStr} delivery will be skipped and the day's amount will be credited to your wallet.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setManageMode("actions")}
                    className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant hover:bg-slate-50"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleSkip}
                    disabled={loadingAction}
                    className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Confirm Skip
                  </button>
                </div>
              </>
            )}

            {manageMode === "pause" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Pause Subscription</h2>
                <p className="text-[13px] text-on-surface-variant mb-5">
                  Select how many days to pause your subscription.
                </p>
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
                  <button
                    onClick={() => setManageMode("actions")}
                    className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handlePause}
                    disabled={loadingAction}
                    className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    {loadingAction && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Pause {pauseDays} Day{pauseDays > 1 ? "s" : ""}
                  </button>
                </div>
              </>
            )}

            {manageMode === "change_meal" && (
              <>
                <h2 className="text-[17px] font-extrabold text-on-surface mb-2">Change Meal</h2>
                <p className="text-[13px] text-on-surface-variant mb-4">
                  Choose meals for this delivery from the vendor's menu.
                </p>

                {availableMeals.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center mb-5">
                    <UtensilsCrossed className="text-[36px] text-slate-300 mb-2" />
                    <p className="text-[13px] text-slate-500 font-medium">
                      No alternate meals available from this vendor right now.
                    </p>
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
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${isSelected
                            ? "border-primary bg-[#e8f3f0]"
                            : "border-[#e4e2e1] bg-white hover:bg-slate-50"
                            }`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? "border-primary bg-primary" : "border-[#ccc]"
                            }`}>
                            {isSelected && (
                              <Check className="text-white text-[12px]" />
                            )}
                          </div>
                          <div>
                            <p className="text-[14px] font-bold text-on-surface">{meal.name}</p>
                            <p className="text-[11px] text-on-surface-variant font-medium">
                              ₹{meal.pricePerDay || meal.price || "—"}/day
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setManageMode("actions")}
                    className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={handleChangeMeal}
                    disabled={loadingAction || selectedMealIds.length === 0}
                    className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loadingAction && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Confirm Change
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Rating Modal ─────────────────────────────────────────────────── */}
      {ratingModal.show && ratingModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setRatingModal({ show: false, order: null, rating: 0, comment: "", loading: false })}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[360px] p-6"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setRatingModal({ show: false, order: null, rating: 0, comment: "", loading: false })}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
                <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-1">Rate Delivery Partner</h3>
              <p className="text-xs text-gray-500 mb-6 font-medium">
                For order #{ratingModal.order.orderId}
              </p>

              {/* Star Selector */}
              <div className="flex gap-2.5 mb-6">
                {[1, 2, 3, 4, 5].map((star) => {
                  const isHighlighted = star <= ratingModal.rating;
                  return (
                    <button
                      key={star}
                      type="button"
                      disabled={ratingModal.order.isRated}
                      onClick={() => setRatingModal(prev => ({ ...prev, rating: star }))}
                      className="transition-transform active:scale-90 hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 ${isHighlighted
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-300"
                          }`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Comment Input */}
              <textarea
                value={ratingModal.comment}
                disabled={ratingModal.order.isRated || ratingModal.loading}
                onChange={(e) => setRatingModal(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Write optional feedback about the delivery..."
                className="w-full min-h-[80px] p-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#006a5c] focus:border-[#006a5c] mb-6 resize-none placeholder:text-gray-400"
              />

              {/* Submit Button */}
              {!ratingModal.order.isRated ? (
                <button
                  onClick={submitRating}
                  disabled={ratingModal.loading || ratingModal.rating === 0}
                  className="w-full bg-[#006a5c] text-white py-3 rounded-2xl font-bold text-sm hover:bg-[#00554a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {ratingModal.loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Rating
                </button>
              ) : (
                <div className="w-full bg-slate-50 border border-gray-200 py-3 rounded-2xl text-center text-sm font-semibold text-gray-500">
                  Rating Submitted
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Tip Modal ────────────────────────────────────────────────────── */}
      {tipModal.show && tipModal.order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setTipModal({ show: false, order: null, amount: "", loading: false })}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[360px] p-6"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setTipModal({ show: false, order: null, amount: "", loading: false })}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
                <Coins className="w-6 h-6 text-amber-500" />
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-1">Tip Your Delivery Partner</h3>
              <p className="text-xs text-gray-500 mb-6 leading-relaxed px-4 text-center">
                100% of your tip goes directly to the delivery partner for their exceptional service.
              </p>

              {/* Quick Select Buttons */}
              <div className="flex gap-2 w-full mb-4">
                {[10, 20, 50, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    disabled={tipModal.loading}
                    onClick={() => setTipModal(prev => ({ ...prev, amount: String(val) }))}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all active:scale-95 ${tipModal.amount === String(val)
                      ? "border-[#006a5c] bg-[#e8f3f0] text-[#006a5c]"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    ₹{val}
                  </button>
                ))}
              </div>

              {/* Custom Amount Input */}
              <div className="w-full relative mb-6">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">
                  ₹
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={tipModal.loading}
                  value={tipModal.amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setTipModal(prev => ({ ...prev, amount: val }));
                  }}
                  placeholder="Enter custom tip amount"
                  className="w-full pl-8 pr-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#006a5c] focus:border-[#006a5c] font-semibold text-gray-800 placeholder:font-normal placeholder:text-gray-400"
                />
              </div>

              {/* Pay Button */}
              <button
                onClick={submitTip}
                disabled={tipModal.loading || !tipModal.amount || Number(tipModal.amount) <= 0}
                className="w-full bg-[#006a5c] text-white py-3 rounded-2xl font-bold text-sm hover:bg-[#00554a] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {tipModal.loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tipModal.loading ? "Processing..." : `Send Tip of ₹${tipModal.amount || "0"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}