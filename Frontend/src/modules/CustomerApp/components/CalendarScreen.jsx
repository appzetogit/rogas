import { useState, useEffect, useRef } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI, restaurantAPI } from "@food/api";
import { AlertCircle, Soup, CheckCircle, Truck, CheckCheck, Lock, Info, Sandwich, XCircle, PartyPopper, Send, ArrowLeft, MoreVertical, UtensilsCrossed, Check } from 'lucide-react';
import useDeliverySlots from "../../../shared/hooks/useDeliverySlots";
import { Trans, useTranslation } from "react-i18next";

// Get today's date in Asia/Kolkata timezone represented as a Date object at local midnight
const getISTToday = () => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  const localToday = new Date();
  localToday.setFullYear(parseInt(year, 10));
  localToday.setMonth(parseInt(month, 10) - 1);
  localToday.setDate(parseInt(day, 10));
  localToday.setHours(0, 0, 0, 0);
  return localToday;
};

const getISTFormatDateStr = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
};


const formatCutoffTime = (time) => {
  if (!time) return '8:00 PM';
  const [h, m] = time.split(':');
  const h12 = parseInt(h, 10) % 12 || 12;
  const ampm = parseInt(h, 10) >= 12 ? 'PM' : 'AM';
  return `${h12}:${m} ${ampm}`;
};

export function CalendarScreen({ onGoBack, onGoToProfile, onShowToast, onGoToPlans, socket }) {
  const { t } = useTranslation("customer");
  const [selectedDateStr, setSelectedDateStr] = useState(() => getISTFormatDateStr(getISTToday()));
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("meals");
  const [pantryOrders, setPantryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [skipTarget, setSkipTarget] = useState(null); // legacy skip target (can be removed later if we fully migrate, but keep for now)
  const [hasFullWeekSub, setHasFullWeekSub] = useState(false);

  // Manage Order States
  const [activeDropdown, setActiveDropdown] = useState(null); // Tracks which order's 3-dot menu is open
  const [manageMode, setManageMode] = useState(null);
  const [manageOrder, setManageOrder] = useState(null);
  const [availableMeals, setAvailableMeals] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [pauseDays, setPauseDays] = useState(1);
  const [dateCache, setDateCache] = useState({});
  const [subsFetched, setSubsFetched] = useState(false);

  // Rating Modal state
  const [ratingModalOrder, setRatingModalOrder] = useState(null);
  const [ratingVal, setRatingVal] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");

  // Ref to always hold the latest selectedDateStr (avoids stale closures in socket handlers)
  const selectedDateStrRef = useRef(selectedDateStr);
  selectedDateStrRef.current = selectedDateStr;

  const [cutoffTime, setCutoffTime] = useState(null);
  const { slots: liveSlots, getSlot, window: slotWindow } = useDeliverySlots();
  const slotRank = (key) => { const i = liveSlots.findIndex((s) => s.key === key); return i === -1 ? 99 : i + 1; };

  useEffect(() => {
    restaurantAPI.getVendorTimingSettingsPublic()
      .then(res => {
        if (res.data?.success && res.data.data?.mealChangeCutoffTime) {
          setCutoffTime(res.data.data.mealChangeCutoffTime);
        } else {
          setCutoffTime('20:00');
        }
      })
      .catch(() => setCutoffTime('20:00'));
  }, []);

  // Load orders for a specific date (also fetches subscriptions on first call)
  const loadOrdersForDate = async (dateStr, forceRefresh = false) => {
    if (!forceRefresh && dateCache[dateStr]) {
      setOrders(dateCache[dateStr].orders);
      setPantryOrders(dateCache[dateStr].pantryOrders);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) {
        setOrders([]);
        setPantryOrders([]);
        return;
      }
      
      // Build parallel requests — include subscriptions only on first load
      const requests = [
        dmbCustomerAPI.getMyOrders({ date: dateStr }),
        dmbCustomerAPI.getMyPantryOrders({ date: dateStr }).catch(() => ({ data: { success: false } }))
      ];
      if (!subsFetched) {
        requests.push(dmbCustomerAPI.getMySubscriptions("active").catch(() => ({ data: { success: false } })));
      }

      const results = await Promise.all(requests);
      const [ordersRes, pantryRes] = results;

      // Process subscriptions (only on first load)
      if (!subsFetched && results[2]) {
        const subsRes = results[2];
        if (subsRes.data?.success) {
          const activeSubs = subsRes.data?.subscriptions || [];
          const hasFullWeek = activeSubs.some(sub => sub.deliveryDays === 'full_week');
          setHasFullWeekSub(hasFullWeek);
        }
        setSubsFetched(true);
      }

      const newOrders = ordersRes.data?.success ? (ordersRes.data.orders || []) : [];
      const newPantry = pantryRes?.data?.success ? (pantryRes.data.orders || []) : [];

      setOrders(newOrders);
      setPantryOrders(newPantry);
      setDateCache(prev => ({
        ...prev,
        [dateStr]: { orders: newOrders, pantryOrders: newPantry }
      }));
    } catch (err) {
      console.error("Failed to load orders for calendar:", err);
      setError(t("Failed to load meal data. Please try again later."));
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when selected date changes (with abort guard for React 18 StrictMode)
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      if (!cancelled) await loadOrdersForDate(selectedDateStr);
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedDateStr]);

  // Socket listener — uses ref to always access latest selectedDateStr
  useEffect(() => {
    if (!socket) return;
    const handleStatusUpdate = (data) => {
      setOrders(prev =>
        prev.map(o =>
          o.orderId === data.orderId || String(o._id) === String(data._id)
            ? { 
                ...o, 
                status: data.status,
                meals: data.meals && data.meals.length > 0 ? data.meals.map((m, i) => ({
                  ...(o.meals?.[i] || {}),
                  ...m,
                  mealPlanName: m.mealPlanName || m.name
                })) : o.meals
              }
            : o
        )
      );
      if (data.status === 'delivered') {
        setRatingModalOrder(data);
      }
    };

    const handleDailyMenuUpdated = () => {
      loadOrdersForDate(selectedDateStrRef.current, true);
    };

    socket.on("order_status_updated", handleStatusUpdate);
    socket.on("daily_menu_updated", handleDailyMenuUpdated);

    return () => {
      socket.off("order_status_updated", handleStatusUpdate);
      socket.off("daily_menu_updated", handleDailyMenuUpdated);
    };
  }, [socket]);

  // Determine if order is locked (today, past, or not scheduled)
  const isOrderLocked = (order) => {
    if (order.status !== 'scheduled') return true;

    // Today's or past date in IST is strictly locked (cannot skip or change today's order)
    const orderDateStr = getISTFormatDateStr(order.deliveryDate);
    const todayISTStr = getISTFormatDateStr(getISTToday());

    return orderDateStr <= todayISTStr;
  };

  // Skip order action
  const handleSkipOrder = async (orderId, mealName) => {
    // Extra frontend validation layer
    const targetOrder = orders.find(o => o._id === orderId);
    if (targetOrder && isOrderLocked(targetOrder)) {
      onShowToast(t("🔒 This order is locked and cannot be skipped."));
      return;
    }

    setLoadingAction(true);
    try {
      await dmbCustomerAPI.skipDailyOrder(orderId);
      const updateState = prev => prev.map(o => o._id === orderId ? { ...o, status: "skipped" } : o);
      setOrders(updateState);
      setDateCache(prev => {
        if (prev[selectedDateStr]) {
          return { ...prev, [selectedDateStr]: { ...prev[selectedDateStr], orders: updateState(prev[selectedDateStr].orders) } };
        }
        return prev;
      });
      onShowToast(t("{{mealName}} marked as skipped", { mealName: mealName || 'Meal' }));
    } catch (err) {
      const errMsg = err.response?.data?.message || t("Failed to skip order");
      onShowToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  // Trigger skip confirmation modal
  const triggerSkipOrder = (orderId, mealName) => {
    const targetOrder = orders.find(o => o._id === orderId);
    if (targetOrder && isOrderLocked(targetOrder)) {
      onShowToast(t("🔒 This order is locked and cannot be skipped."));
      return;
    }
    setSkipTarget({ orderId, mealName });
  };

  const confirmSkipOrder = async () => {
    if (!skipTarget) return;
    const { orderId, mealName } = skipTarget;
    setSkipTarget(null);
    await handleSkipOrder(orderId, mealName);
  };

  // Undo skip order action
  const handleUndoSkipOrder = async (orderId, mealName) => {
    // Extra frontend validation layer
    const targetOrder = orders.find(o => o._id === orderId);
    if (targetOrder) {
      const orderDateStr = getISTFormatDateStr(targetOrder.deliveryDate);
      const todayISTStr = getISTFormatDateStr(getISTToday());
      if (orderDateStr <= todayISTStr) {
        onShowToast(t("Cannot undo skip for today's or past orders."));
        return;
      }
    }

    setLoadingAction(true);
    try {
      await dmbCustomerAPI.undoSkipDailyOrder(orderId);
      const updateState = prev => prev.map(o => o._id === orderId ? { ...o, status: "scheduled" } : o);
      setOrders(updateState);
      setDateCache(prev => {
        if (prev[selectedDateStr]) {
          return { ...prev, [selectedDateStr]: { ...prev[selectedDateStr], orders: updateState(prev[selectedDateStr].orders) } };
        }
        return prev;
      });
      onShowToast(t("{{mealName}} skip undone successfully", { mealName: mealName || 'Meal' }));
    } catch (err) {
      const errMsg = err.response?.data?.message || t("Failed to undo skip");
      onShowToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  // ─── Manage Order Flows ───────────────────────────────────────────────────
  const closeManage = () => {
    setManageMode(null);
    setManageOrder(null);
    setSelectedMealIds([]);
    setAvailableMeals([]);
    setPauseDays(1);
    setSkipTarget(null);
  };

  const openSkip = (order, mealName) => {
    setManageOrder(order);
    setSkipTarget({ orderId: order._id, mealName }); 
    setManageMode("confirm_skip");
    setActiveDropdown(null);
  };

  const openPause = (order) => {
    setManageOrder(order);
    setPauseDays(1);
    setManageMode("pause");
    setActiveDropdown(null);
  };

  const handlePause = async () => {
    if (!manageOrder) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.pauseSubscription(
        manageOrder.subscriptionId._id || manageOrder.subscriptionId,
        pauseDays
      );
      onShowToast(t("Subscription paused for {{count}} day.", { count: pauseDays }));
      closeManage();
      loadOrdersForDate(selectedDateStrRef.current, true);
    } catch (err) {
      onShowToast(err.response?.data?.message || t("Failed to pause subscription"));
    } finally {
      setLoadingAction(false);
    }
  };

  const openChangeMeal = async (order) => {
    setManageOrder(order);
    setManageMode("change_meal");
    setActiveDropdown(null);
    setSelectedMealIds(order.meals?.map(m => m.mealPlanId?._id || m.mealPlanId) || []);
    
    try {
      const vendorId = order.vendorId?._id || order.vendorId;
      const res = await dmbCustomerAPI.getVendorMenu(vendorId);
      setAvailableMeals(res.data?.menu ?? res.data?.meals ?? res.data?.plans ?? []);
    } catch (err) {
      onShowToast(t("Failed to fetch available meals."));
    }
  };

  const toggleMealSelection = (mealId) => {
    setSelectedMealIds(prev =>
      prev.includes(mealId) ? prev.filter(id => id !== mealId) : [mealId] 
    );
  };

  const handleChangeMeal = async () => {
    if (!manageOrder || selectedMealIds.length === 0) return;
    setLoadingAction(true);
    try {
      await dmbCustomerAPI.changeDailyOrderMeal(manageOrder._id, selectedMealIds);
      onShowToast(t("Meal changed successfully!"));
      closeManage();
      loadOrdersForDate(selectedDateStrRef.current, true);
    } catch (err) {
      onShowToast(err.response?.data?.message || t("Failed to change meal"));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingModalOrder || ratingVal === 0) {
      onShowToast(t("Please select a star rating"));
      return;
    }
    setLoadingAction(true);
    try {
      let finalTip = tipAmount;
      if (tipAmount === "custom") {
        finalTip = Number(customTip);
      }
      await dmbCustomerAPI.rateOrder(ratingModalOrder._id, {
        rating: ratingVal,
        comment: feedbackText,
        tipAmount: finalTip
      });
      onShowToast(t("Thank you for your feedback!"));
      setRatingModalOrder(null);
      setRatingVal(0);
      setFeedbackText("");
      setTipAmount(0);
      setCustomTip("");

      // Update local state to reflect it's rated
      const updateState = prev => prev.map(o => String(o._id) === String(ratingModalOrder._id) ? { ...o, isRated: true } : o);
      setOrders(updateState);
      setDateCache(prev => {
        if (prev[selectedDateStr]) {
          return { ...prev, [selectedDateStr]: { ...prev[selectedDateStr], orders: updateState(prev[selectedDateStr].orders) } };
        }
        return prev;
      });
    } catch (err) {
      const errMsg = err.response?.data?.message || t("Failed to submit rating");
      onShowToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  const showLockedMessage = () => {
    onShowToast(t("🔒 This order is locked because it is today's or a past meal."));
  };

  const today = getISTToday();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  // Helper to generate the rolling 7 visible days (yesterday, today, and next 5 days)
  const getVisibleDays = () => {
    const days = [];

    // Yesterday
    const yest = new Date(today);
    yest.setDate(today.getDate() - 1);
    days.push(yest);

    // Today
    days.push(new Date(today));

    // Next 5 upcoming days
    for (let i = 1; i <= 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }

    return days;
  };

  const weekDays = getVisibleDays();

  // Format selected date heading
  const getSelectedDateHeading = () => {
    if (!selectedDateStr) return "";
    const [year, month, day] = selectedDateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const dayName = d.toLocaleDateString("en-US", { weekday: "long" });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString("en-US", { month: "long" });
    return `${dayName} ${dayNum} ${monthName}`;
  };

  // Map orders by date string key
  const orderMap = {};
  orders.forEach(o => {
    const key = getISTFormatDateStr(o.deliveryDate);
    if (!orderMap[key]) {
      orderMap[key] = [];
    }
    orderMap[key].push(o);
  });

  // Sort orders within each date key by slot order
  Object.keys(orderMap).forEach(key => {
    orderMap[key].sort((a, b) => {
      const rankA = slotRank(a.deliverySlot?.toLowerCase());
      const rankB = slotRank(b.deliverySlot?.toLowerCase());
      return rankA - rankB;
    });
  });

  // Build the list of visible days
  const getOrdersForDay = (date) => {
    const dateKeyStr = getISTFormatDateStr(date);
    const isYesterday = dateKeyStr === getISTFormatDateStr(yesterday);
    const isToday = dateKeyStr === getISTFormatDateStr(today);
    const dayOrders = (orderMap[dateKeyStr] || []).filter(order => {
      const firstMealName = order.meals?.[0]?.name;
      return firstMealName !== "No meal set";
    });

    return {
      date,
      dateStr: dateKeyStr,
      dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: date.getDate(),
      isYesterday,
      isToday,
      orders: dayOrders.map(order => {
        let isLocked = false;
        if (isYesterday || isToday) {
          isLocked = true;
        } else {
          isLocked = isOrderLocked(order);
        }
        return {
          order,
          isLocked,
          mealName: order.meals?.[0]?.mealPlanName || order.meals?.[0]?.name || "Meal Box",
          status: order.status
        };
      })
    };
  };

  const weekMealsGrouped = weekDays.map(d => getOrdersForDay(d));

  const daysOfWeekStrip = weekDays.map((date) => ({
    label: date.toLocaleDateString("en-US", { weekday: "short" })[0], // 'M', 'T', etc.
    num: date.getDate(),
    dateStr: getISTFormatDateStr(date)
  }));

  if (loading) {
    return (
      <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
        <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-extrabold text-primary text-center">{t("Calendar")}</h1>
          <div className="w-8" />
        </header>
        <div className="flex flex-col items-center justify-center pt-40 gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-on-surface-variant font-bold text-sm">{t("Loading your meal calendar...")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
        <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-extrabold text-primary text-center">{t("Calendar")}</h1>
          <div className="w-8" />
        </header>
        <div className="flex flex-col items-center justify-center pt-40 px-6 text-center gap-4">
          <AlertCircle className="text-6xl text-brand-red" />
          <p className="text-on-surface-variant font-bold text-base">{error}</p>
          <button
            onClick={() => loadOrdersForDate(selectedDateStr, true)}
            className="px-6 py-2.5 bg-primary text-white rounded-full font-bold shadow-md hover:bg-primary/95 active:scale-95 transition-all"
          >
            {t("Retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
      {/* Top App Bar */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-extrabold text-primary text-center">{t("Calendar")}</h1>
        <div className="w-8" />
      </header>

      <main className="pt-20 px-5 space-y-6">
        {/* Horizontal strip */}
        <section>
          <div className="flex justify-between items-center bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/30">
            {daysOfWeekStrip.map((d) => {
              const isSelected = selectedDateStr === d.dateStr;

              return (
                <button
                  key={d.dateStr}
                  onClick={() => setSelectedDateStr(d.dateStr)}
                  className="flex flex-col items-center gap-1.5 focus:outline-none focus:scale-105 transition-all duration-200"
                >
                  <span className="text-[12px] font-bold leading-none text-on-surface-variant">{d.label}</span>
                  <div className={`w-9 h-9 flex items-center justify-center rounded-full text-[14px] font-bold transition-all ${isSelected
                    ? "bg-primary-container text-white shadow-md scale-110"
                    : "text-on-surface hover:bg-[#f6f3f2]"}`}
                  >
                    {d.num}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Tabs */}
        <section className="flex bg-white rounded-full p-1 shadow-sm border border-[#e4e2e1]/30">
          <button 
            onClick={() => setActiveTab('meals')}
            className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all ${activeTab === 'meals' ? 'bg-primary text-white shadow-md' : 'text-on-surface hover:bg-[#f6f3f2]'}`}
          >
            {t("Meals")}
          </button>
          <button 
            onClick={() => setActiveTab('pantry')}
            className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all ${activeTab === 'pantry' ? 'bg-primary text-white shadow-md' : 'text-on-surface hover:bg-[#f6f3f2]'}`}
          >
            {t("Pantry")}
          </button>
        </section>

        {activeTab === 'meals' ? (
          <>
            {/* Selected date heading */}
        <section className="flex justify-between items-center">
          <h2 className="text-[20px] font-extrabold text-on-surface">
            {getSelectedDateHeading()}
          </h2>
        </section>

        {/* Meal planner rows */}
        <section className="flex flex-col gap-4">
          {(() => {
            const day = weekMealsGrouped.find(d => d.dateStr === selectedDateStr);
            if (!day) return null;

            const isSunday = day.date.getDay() === 0;
            const hasOrders = day.orders.length > 0;

            // Determine border color for the card
            let borderClass = "border-primary-container";
            if (day.isYesterday) {
              borderClass = "border-outline/25 opacity-70";
            } else if (hasOrders) {
              const statuses = day.orders.map(o => o.status);
              const isAnyLocked = day.orders.some(o => o.isLocked);
              
              if (statuses.includes("failed")) {
                borderClass = "border-red-500 opacity-85";
              } else if (statuses.includes("out_for_delivery")) {
                borderClass = "border-purple-600";
              } else if (statuses.includes("preparing")) {
                borderClass = "border-brand-amber";
              } else if (statuses.includes("ready")) {
                borderClass = "border-blue-600";
              } else if (statuses.includes("delivered")) {
                borderClass = "border-green-500";
              } else if (statuses.every(s => s === "skipped")) {
                borderClass = "border-brand-red opacity-85";
              } else if (isAnyLocked) {
                borderClass = "border-amber-500";
              }
            }

            return (
              <div
                key={day.dateStr}
                className={`bg-white rounded-2xl p-4 flex border-l-4 transition-all duration-300 scale-[1.01] shadow-md border-l-primary ${borderClass}`}
              >
                {/* Left Column: Date info */}
                <div className="text-center w-12 select-none flex-shrink-0 pt-1 border-r border-[#bec9c3]/20 pr-3 mr-1 flex flex-col justify-start">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant font-sans">
                    {day.dayName}
                  </span>
                  <span className="text-[17px] font-extrabold text-primary">
                    {day.dayNum}
                  </span>
                </div>

                {/* Right Column: Meal contents */}
                <div className="flex-grow flex flex-col gap-4">
                  {!hasOrders ? (
                    <div className="py-1">
                      <h3 className="text-base font-bold text-on-surface leading-snug">
                        {isSunday && !hasFullWeekSub ? t("Rest Day (Sunday)") : t("No delivery scheduled")}
                      </h3>
                      <p className="text-on-surface-variant/60 text-xs font-semibold font-sans mt-0.5">{t("No Delivery")}</p>
                    </div>
                  ) : (
                    day.orders.map((m, idx) => {
                      const slotKey = m.order.deliverySlot?.toLowerCase();
                      const slotDef = getSlot(slotKey);

                      return (
                        <div key={m.order._id || idx} className={`flex items-center justify-between ${idx > 0 ? "border-t border-[#bec9c3]/20 pt-4" : ""}`}>
                          <div className="flex-grow pr-3">
                            {/* Slot Badge */}
                            {slotDef && (
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <span
                                  style={{ backgroundColor: `${slotDef.color}1a`, color: slotDef.color, borderColor: `${slotDef.color}55` }}
                                  className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border"
                                >
                                  {slotDef.name} {slotDef.icon} · {slotWindow(slotKey)}
                                </span>
                              </div>
                            )}

                            <h3 className={`text-base font-bold text-on-surface leading-snug ${m.status === "skipped" ? "line-through opacity-50" : ""}`}>
                              {m.mealName}
                            </h3>

                            {/* Dynamic Status Badges */}
                            {m.status === "skipped" ? (
                              <p className="text-brand-red text-xs font-bold font-sans mt-0.5">{t("Skipped")}</p>
                            ) : m.status === "preparing" ? (
                              <div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5">
                                <Soup className="text-[14px]" />
                                <p>{t("Preparing 🔥")}</p>
                              </div>
                            ) : m.status === "ready" ? (
                              <div className="flex items-center gap-1 text-blue-600 text-xs font-bold font-sans mt-0.5">
                                <CheckCircle className="text-[14px]" />
                                <p>{t("Ready ✓")}</p>
                              </div>
                            ) : m.status === "out_for_delivery" ? (
                              <div className="flex items-center gap-1 text-purple-600 text-xs font-bold font-sans mt-0.5">
                                <Truck className="text-[14px]" />
                                <p>{t("On the Way 🛵")}</p>
                              </div>
                            ) : m.status === "delivered" ? (
                              <div className="flex items-center gap-1 text-green-600 text-xs font-bold font-sans mt-0.5">
                                <CheckCheck className="text-[14px]" />
                                <p>{t("Delivered ✅")}</p>
                              </div>
                            ) : m.status === "failed" ? (
                              <div className="flex items-center gap-1 text-red-600 text-xs font-bold font-sans mt-0.5">
                                <AlertCircle className="text-[14px]" />
                                <p>{t("Failed")} </p>
                              </div>
                            ) : m.isLocked ? (
                              <div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5" onClick={showLockedMessage}>
                                <Lock className="text-[14px]" />
                                <p>{t("Locked")}</p>
                              </div>
                            ) : (
                              <p className="text-primary text-xs font-bold font-sans mt-0.5">{t("Scheduled")}</p>
                            )}
                          </div>

                          <div className="flex-shrink-0 relative">
                            {m.status === "skipped" ? (
                              (day.isYesterday || day.isToday) ? (
                                <span className="text-[12px] font-bold text-brand-red/60 font-sans pr-2">{t("Skipped")}</span>
                              ) : (
                                <button
                                  onClick={() => handleUndoSkipOrder(m.order._id, m.mealName)}
                                  disabled={loadingAction}
                                  className="px-4 py-1.5 rounded-full bg-brand-amber text-black hover:bg-amber-400 font-extrabold text-[12px] active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                                >
                                  {t("Undo")}
                                </button>
                              )
                            ) : (m.status !== "scheduled" || m.isLocked) ? (
                              <button onClick={showLockedMessage} className="p-1.5 rounded-full hover:bg-amber-50 text-brand-amber transition-colors flex items-center justify-center cursor-pointer">
                                <Info className="text-[20px]" />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => setActiveDropdown(activeDropdown === m.order._id ? null : m.order._id)}
                                  className="p-1.5 rounded-full hover:bg-[#e8f3f0] text-primary transition-colors cursor-pointer"
                                >
                                  <MoreVertical className="text-[20px]" />
                                </button>
                                
                                {activeDropdown === m.order._id && (
                                  <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-xl shadow-xl border border-[#e4e2e1] overflow-hidden z-20">
                                    <button 
                                      onClick={() => openSkip(m.order, m.mealName)}
                                      className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-brand-red hover:bg-slate-50 transition-colors"
                                    >{t("Skip")}</button>
                                    <div className="h-[1px] bg-slate-100 w-full" />
                                    <button 
                                      onClick={() => openPause(m.order)}
                                      className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-amber-600 hover:bg-slate-50 transition-colors"
                                    >{t("Pause")}</button>
                                    <div className="h-[1px] bg-slate-100 w-full" />
                                    <button 
                                      onClick={() => openChangeMeal(m.order)}
                                      className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-primary hover:bg-slate-50 transition-colors"
                                    >{t("Change")}</button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}
        </section>

        {/* Empty state banner when no active subscriptions exist */}
        {orders.length === 0 && (
          <section className="bg-primary/5 p-6 rounded-2xl border border-primary/20 flex flex-col items-center text-center gap-3">
            <Sandwich className="text-4xl text-primary" />
            <h3 className="text-base font-bold text-on-surface">{t("No Active Subscription")}</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed max-w-[280px]">
              {t("Subscribe to a meal plan to start receiving fresh, healthy, home-cooked meals daily.")}
            </p>
            <button
              onClick={onGoToPlans}
              className="mt-2 px-5 py-2 bg-primary text-white font-extrabold text-[13px] rounded-full active:scale-95 transition-all shadow-sm"
            >
              {t("Explore Plans")}
            </button>
          </section>
        )}
          </>
        ) : (
          <section className="flex flex-col gap-4">
            {pantryOrders
              .filter((po) => po.deliveryDates?.includes(selectedDateStr))
              .map((po, idx) => (
                <div key={po._id || po.orderId || idx} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col border border-primary-container">
                  <div className="flex justify-between items-start mb-2 border-b border-[#bec9c3]/20 pb-2">
                    <h3 className="text-[16px] font-bold text-on-surface">{t("Pantry Order #")}{po.orderId?.slice(-6) || t("N/A")}</h3>
                    <span className="text-[12px] font-bold text-primary bg-primary-container/20 px-2 py-1 rounded-md capitalize">
                      {po.status || t("Scheduled")}
                    </span>
                  </div>
                  <div className="space-y-2 pt-2">
                    {po.items?.map((item, i) => (
                      <div key={i} className="flex justify-between text-[14px]">
                        <span className="text-on-surface-variant font-medium">{item.quantity}x {item.title}</span>
                        <span className="font-bold text-[#1b1c1c]">₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            {pantryOrders.filter((po) => po.deliveryDates?.includes(selectedDateStr)).length === 0 && (
              <div className="bg-white p-6 rounded-2xl border border-primary/20 flex flex-col items-center text-center gap-3">
                <h3 className="text-base font-bold text-on-surface">{t("No Pantry Deliveries")}</h3>
                <p className="text-xs text-on-surface-variant">{t("You have no pantry items scheduled for this day.")}</p>
              </div>
            )}
          </section>
        )}

        {/* Tip block */}
        <section className="bg-primary/5 p-4 rounded-xl border border-primary-container/20">
          <p className="text-[12px] text-primary-container font-semibold font-sans leading-relaxed">
            <Trans t={t} i18nKey={"💡 <0>Pro-Tip:</0> Locked meals are already cooked by our neighborhood chefs. You can change or skip any future delivery before <1>{{cutoff}}</1> on the day prior to delivery."} defaults={"💡 <0>Pro-Tip:</0> Locked meals are already cooked by our neighborhood chefs. You can change or skip any future delivery before <1>{{cutoff}}</1> on the day prior to delivery."} values={{ cutoff: formatCutoffTime(cutoffTime) }} components={[<strong />, <strong />]} />
          </p>
        </section>
      </main>

      {/* Manage Order Bottom Sheet */}
      {manageOrder && manageMode && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:w-[400px] rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl relative animate-slideUp">
            <button onClick={closeManage} className="absolute right-5 top-5 p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
              <XCircle className="text-slate-500 text-[20px]" />
            </button>

            {manageMode === "confirm_skip" && (
              <>
                <h2 className="text-[17px] font-extrabold text-brand-red mb-2">{t("Skip this Meal?")}</h2>
                <p className="text-[13px] text-on-surface-variant mb-6">
                  <Trans t={t} i18nKey={"Are you sure you want to skip <0>{{meal}}</0>? You will not receive delivery for this slot."} defaults={"Are you sure you want to skip <0>{{meal}}</0>? You will not receive delivery for this slot."} values={{ meal: skipTarget?.mealName || t("this meal") }} components={[<strong className="text-on-surface" />]} />
                </p>
                <div className="flex gap-3">
                  <button onClick={closeManage} className="flex-1 border border-[#e4e2e1] py-3 rounded-xl font-bold text-[14px] text-on-surface-variant">{t("Cancel")}</button>
                  <button
                    onClick={confirmSkipOrder}
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
                <p className="text-[13px] text-on-surface-variant mb-5">{t("Select how many days to pause your subscription starting from this date.")}</p>
                <div className="flex gap-3 mb-6">
                  {[1, 2, 3].map((d) => (
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
                <p className="text-[13px] text-on-surface-variant mb-4">{t("Choose a meal for this delivery from the vendor's menu.")}</p>

                {availableMeals.length === 0 ? (
                  <div className="bg-slate-50 rounded-xl p-6 text-center mb-5">
                    <UtensilsCrossed className="text-[36px] text-slate-300 mb-2 mx-auto" />
                    <p className="text-[13px] text-slate-500 font-medium">{t("No alternate meals available from this vendor right now.")}</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-5 max-h-60 overflow-y-auto pr-1">
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

      {/* Rating & Tip Modal */}
      {ratingModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRatingModalOrder(null)} />

          <div className="relative bg-white rounded-3xl p-6 shadow-2xl w-full max-w-[340px] text-center border border-[#bec9c3]/20 z-10 animate-slideUp">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3 border-4 border-white shadow-sm -mt-10">
              <PartyPopper className="text-green-500 text-[32px]" />
            </div>

            <h3 className="text-xl font-black text-[#00604c] mb-1">{t("Meal Delivered!")}</h3>
            <p className="text-xs text-on-surface-variant mb-5 font-semibold">{t("How was your delivery experience?")}</p>

            {/* Star Rating */}
            <div className="flex justify-center gap-2 mb-5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRatingVal(star)}
                  className={`material-symbols-outlined text-4xl transition-all ${star <= ratingVal ? "text-amber-400 [font-variation-settings:'FILL'1]" : "text-gray-200"
                    } hover:scale-110 active:scale-95`}
                >
                  star
                </button>
              ))}
            </div>

            {/* Feedback */}
            <textarea
              placeholder={t("Any feedback? (Optional)")}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-[#00604c] focus:ring-1 focus:ring-[#00604c] mb-4 h-20 resize-none"
            />

            {/* Tip Section */}
            <div className="mb-6">
              <p className="text-xs font-bold text-[#3e4945] mb-2 uppercase tracking-wider text-left">{t("Add a Tip for Driver")}</p>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[0, 5, 10, 15].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => { setTipAmount(amt); setCustomTip(""); }}
                    className={`py-2 rounded-lg font-bold text-sm transition-colors border ${tipAmount === amt
                        ? "bg-[#00604c] text-white border-[#00604c]"
                        : "bg-white text-gray-700 border-gray-200 hover:border-[#00604c]"
                      }`}
                  >
                    {amt === 0 ? t("No") : t("{{amt}}zł", { amt })}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTipAmount("custom")}
                  className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors border ${tipAmount === "custom"
                      ? "bg-[#00604c] text-white border-[#00604c]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#00604c]"
                    }`}
                >
                  {t("Custom")}
                </button>
                {tipAmount === "custom" && (
                  <input
                    type="number"
                    min="1"
                    placeholder={t("zł")}
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-[#00604c] font-bold text-center"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleSubmitRating}
                disabled={loadingAction || ratingVal === 0}
                className="w-full bg-[#00604c] text-white py-3.5 rounded-xl font-black text-sm hover:bg-[#1f7a63] active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
              >
                {loadingAction ? t("Submitting...") : t("Submit Rating")}
                <Send className="text-[18px]" />
              </button>
              <button
                onClick={() => setRatingModalOrder(null)}
                className="w-full py-2.5 rounded-xl font-bold text-xs text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                {t("Maybe Later")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
