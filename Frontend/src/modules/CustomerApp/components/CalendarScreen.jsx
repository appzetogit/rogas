import { useState, useEffect } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI } from "@food/api";
import { AlertCircle, Soup, CheckCircle, Truck, CheckCheck, Lock, Info, Sandwich, XCircle, PartyPopper, Send, ArrowLeft } from 'lucide-react';

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

const SLOT_INFO = {
  breakfast: { label: "Breakfast ☀️", time: "7–9 AM", color: "bg-amber-50 text-amber-800 border-amber-200" },
  lunch: { label: "Lunch 🌤️", time: "12–2 PM", color: "bg-[#e8f3f0] text-primary border-primary/20" },
  dinner: { label: "Dinner 🌙", time: "7–9 PM", color: "bg-indigo-50 text-indigo-800 border-indigo-200" },
};

const SLOT_ORDER = {
  breakfast: 1,
  lunch: 2,
  dinner: 3
};

export function CalendarScreen({ onGoBack, onGoToProfile, onShowToast, onGoToPlans, socket }) {
  const [selectedDateStr, setSelectedDateStr] = useState(() => getISTFormatDateStr(getISTToday()));
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState("meals");
  const [pantryOrders, setPantryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [skipTarget, setSkipTarget] = useState(null); // { orderId, mealName }
  const [hasFullWeekSub, setHasFullWeekSub] = useState(false);

  // Rating Modal state
  const [ratingModalOrder, setRatingModalOrder] = useState(null);
  const [ratingVal, setRatingVal] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");

  // Load orders
  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("user_accessToken");
      if (!token) {
        setOrders([]);
        return;
      }
      const [upcomingRes, pastRes, activeSubsRes, pantryRes] = await Promise.all([
        dmbCustomerAPI.getMyOrders("upcoming"),
        dmbCustomerAPI.getMyOrders("past"),
        dmbCustomerAPI.getMySubscriptions("active"),
        dmbCustomerAPI.getMyPantryOrders().catch(() => ({ data: { success: false } }))
      ]);

      if (pantryRes?.data?.success) {
        setPantryOrders(pantryRes.data.orders || []);
      }

      let combined = [];
      if (upcomingRes.data?.success) {
        combined = [...combined, ...(upcomingRes.data.orders || [])];
      }
      if (pastRes.data?.success) {
        combined = [...combined, ...(pastRes.data.orders || [])];
      }

      // Deduplicate
      const seen = new Set();
      const deduped = combined.filter(o => {
        const id = o._id || o.orderId;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      setOrders(deduped);

      if (activeSubsRes.data?.success) {
        const activeSubs = activeSubsRes.data?.subscriptions || [];
        const hasFullWeek = activeSubs.some(sub => sub.deliveryDays === 'full_week');
        setHasFullWeekSub(hasFullWeek);
      }
    } catch (err) {
      console.error("Failed to load orders for calendar:", err);
      setError("Failed to load meal data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Socket listener
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
      if (data.status === 'delivered') {
        setRatingModalOrder(data);
      }
    };

    const handleDailyMenuUpdated = () => {
      loadOrders();
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
      onShowToast("🔒 This order is locked and cannot be skipped.");
      return;
    }

    setLoadingAction(true);
    try {
      await dmbCustomerAPI.skipDailyOrder(orderId);
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: "skipped" } : o));
      onShowToast(`${mealName || 'Meal'} marked as skipped`);
    } catch (err) {
      const errMsg = err.response?.data?.message || "Failed to skip order";
      onShowToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  // Trigger skip confirmation modal
  const triggerSkipOrder = (orderId, mealName) => {
    const targetOrder = orders.find(o => o._id === orderId);
    if (targetOrder && isOrderLocked(targetOrder)) {
      onShowToast("🔒 This order is locked and cannot be skipped.");
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
        onShowToast("Cannot undo skip for today's or past orders.");
        return;
      }
    }

    setLoadingAction(true);
    try {
      await dmbCustomerAPI.undoSkipDailyOrder(orderId);
      setOrders(prev => prev.map(o => o._id === orderId ? { ...o, status: "scheduled" } : o));
      onShowToast(`${mealName || 'Meal'} skip undone successfully`);
    } catch (err) {
      const errMsg = err.response?.data?.message || "Failed to undo skip";
      onShowToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingModalOrder || ratingVal === 0) {
      onShowToast("Please select a star rating");
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
      onShowToast("Thank you for your feedback!");
      setRatingModalOrder(null);
      setRatingVal(0);
      setFeedbackText("");
      setTipAmount(0);
      setCustomTip("");

      // Update local state to reflect it's rated
      setOrders(prev => prev.map(o => String(o._id) === String(ratingModalOrder._id) ? { ...o, isRated: true } : o));
    } catch (err) {
      const errMsg = err.response?.data?.message || "Failed to submit rating";
      onShowToast(errMsg);
    } finally {
      setLoadingAction(false);
    }
  };

  const showLockedMessage = () => {
    onShowToast("🔒 This order is locked because it is today's or a past meal.");
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
      const rankA = SLOT_ORDER[a.deliverySlot?.toLowerCase()] || 2;
      const rankB = SLOT_ORDER[b.deliverySlot?.toLowerCase()] || 2;
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
          mealName: order.meals?.[0]?.name || "Meal Box",
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
        <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-extrabold text-primary text-center">Calendar</h1>
          <div className="w-8" />
        </header>
        <div className="flex flex-col items-center justify-center pt-40 gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-on-surface-variant font-bold text-sm">Loading your meal calendar...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
        <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-extrabold text-primary text-center">Calendar</h1>
          <div className="w-8" />
        </header>
        <div className="flex flex-col items-center justify-center pt-40 px-6 text-center gap-4">
          <AlertCircle className="text-6xl text-brand-red" />
          <p className="text-on-surface-variant font-bold text-base">{error}</p>
          <button
            onClick={loadOrders}
            className="px-6 py-2.5 bg-primary text-white rounded-full font-bold shadow-md hover:bg-primary/95 active:scale-95 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
      {/* Top App Bar */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack}  className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-extrabold text-primary text-center">Calendar</h1>
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
            Meals
          </button>
          <button 
            onClick={() => setActiveTab('pantry')}
            className={`flex-1 py-2 text-[14px] font-bold rounded-full transition-all ${activeTab === 'pantry' ? 'bg-primary text-white shadow-md' : 'text-on-surface hover:bg-[#f6f3f2]'}`}
          >
            Pantry
          </button>
        </section>

        {activeTab === 'meals' ? (
          <>
            {/* Selected date heading */}
        <section className="flex justify-between items-center">
          <h2 className="text-[20px] font-extrabold text-on-surface">
            {getSelectedDateHeading()}
          </h2>
          <span className="text-xs font-bold text-on-surface-variant font-sans tracking-wide">
            WEEKLY OVERVIEW
          </span>
        </section>

        {/* Meal planner rows */}
        <section className="flex flex-col gap-4">
          {weekMealsGrouped.map((day) => {
            const isSelected = selectedDateStr === day.dateStr;
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
                className={`bg-white rounded-2xl p-4 shadow-sm flex border-l-4 transition-all duration-300 ${isSelected ? "scale-[1.01] shadow-md border-l-primary" : ""} ${borderClass}`}
              >
                {/* Left Column: Date info */}
                <div className="text-center w-12 select-none flex-shrink-0 pt-1 border-r border-[#bec9c3]/20 pr-3 mr-1 flex flex-col justify-start">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant font-sans">
                    {day.dayName}
                  </span>
                  <span className={`text-[17px] font-extrabold ${isSelected ? "text-primary" : "text-[#1b1c1c]"}`}>
                    {day.dayNum}
                  </span>
                </div>

                {/* Right Column: Meal contents */}
                <div className="flex-grow flex flex-col gap-4">
                  {!hasOrders ? (
                    <div className="py-1">
                      <h3 className="text-base font-bold text-on-surface leading-snug">
                        {isSunday && !hasFullWeekSub ? "Rest Day (Sunday)" : "No delivery scheduled"}
                      </h3>
                      <p className="text-on-surface-variant/60 text-xs font-semibold font-sans mt-0.5">No Delivery</p>
                    </div>
                  ) : (
                    day.orders.map((m, idx) => {
                      const slotKey = m.order.deliverySlot?.toLowerCase() || "lunch";
                      const slot = SLOT_INFO[slotKey] || SLOT_INFO.lunch;

                      return (
                        <div key={m.order._id || idx} className={`flex items-center justify-between ${idx > 0 ? "border-t border-[#bec9c3]/20 pt-4" : ""}`}>
                          <div className="flex-grow pr-3">
                            {/* Slot Badge */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${slot.color}`}>
                                {slot.label} · {slot.time}
                              </span>
                            </div>

                            <h3 className={`text-base font-bold text-on-surface leading-snug ${m.status === "skipped" ? "line-through opacity-50" : ""}`}>
                              {m.mealName}
                            </h3>

                            {/* Dynamic Status Badges */}
                            {m.status === "skipped" ? (
                              <p className="text-brand-red text-xs font-bold font-sans mt-0.5">Skipped</p>
                            ) : m.status === "preparing" ? (
                              <div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5">
                                <Soup className="text-[14px]" />
                                <p>Preparing 🔥</p>
                              </div>
                            ) : m.status === "ready" ? (
                              <div className="flex items-center gap-1 text-blue-600 text-xs font-bold font-sans mt-0.5">
                                <CheckCircle className="text-[14px]" />
                                <p>Ready ✓</p>
                              </div>
                            ) : m.status === "out_for_delivery" ? (
                              <div className="flex items-center gap-1 text-purple-600 text-xs font-bold font-sans mt-0.5">
                                <Truck className="text-[14px]" />
                                <p>On the Way 🛵</p>
                              </div>
                            ) : m.status === "delivered" ? (
                              <div className="flex items-center gap-1 text-green-600 text-xs font-bold font-sans mt-0.5">
                                <CheckCheck className="text-[14px]" />
                                <p>Delivered ✅</p>
                              </div>
                            ) : m.status === "failed" ? (
                              <div className="flex items-center gap-1 text-red-600 text-xs font-bold font-sans mt-0.5">
                                <AlertCircle className="text-[14px]" />
                                <p>Failed </p>
                              </div>
                            ) : m.isLocked ? (
                              <div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5" onClick={showLockedMessage}>
                                <Lock className="text-[14px]" />
                                <p>Locked</p>
                              </div>
                            ) : (
                              <p className="text-primary text-xs font-bold font-sans mt-0.5">Scheduled</p>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex-shrink-0">
                            {m.status === "skipped" ? (
                              (day.isYesterday || day.isToday) ? (
                                <span className="text-[12px] font-bold text-brand-red/60 font-sans pr-2">Skipped</span>
                              ) : (
                                <button
                                  onClick={() => handleUndoSkipOrder(m.order._id, m.mealName)}
                                  disabled={loadingAction}
                                  className="px-4 py-1.5 rounded-full bg-brand-amber text-black hover:bg-amber-400 font-extrabold text-[12px] active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                                >
                                  Undo
                                </button>
                              )
                            ) : (m.status !== "scheduled" || m.isLocked) ? (
                              <button onClick={showLockedMessage} className="p-1.5 rounded-full hover:bg-amber-50 text-brand-amber transition-colors flex items-center justify-center cursor-pointer">
                                <Info className="text-[20px]" />
                              </button>
                            ) : (
                              <button
                                onClick={() => triggerSkipOrder(m.order._id, m.mealName)}
                                disabled={loadingAction}
                                className="px-4 py-1.5 rounded-full border border-primary-container text-primary hover:bg-[#e8f3f0] font-extrabold text-[12px] active:scale-95 transition-all disabled:opacity-50"
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Empty state banner when no active subscriptions exist */}
        {orders.length === 0 && (
          <section className="bg-primary/5 p-6 rounded-2xl border border-primary/20 flex flex-col items-center text-center gap-3">
            <Sandwich className="text-4xl text-primary" />
            <h3 className="text-base font-bold text-on-surface">No Active Subscription</h3>
            <p className="text-xs text-on-surface-variant leading-relaxed max-w-[280px]">
              Subscribe to a meal plan to start receiving fresh, healthy, home-cooked meals daily.
            </p>
            <button
              onClick={onGoToPlans}
              className="mt-2 px-5 py-2 bg-primary text-white font-extrabold text-[13px] rounded-full active:scale-95 transition-all shadow-sm"
            >
              Explore Plans
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
                    <h3 className="text-[16px] font-bold text-on-surface">Pantry Order #{po.orderId?.slice(-6) || 'N/A'}</h3>
                    <span className="text-[12px] font-bold text-primary bg-primary-container/20 px-2 py-1 rounded-md capitalize">
                      {po.status || 'Scheduled'}
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
                <h3 className="text-base font-bold text-on-surface">No Pantry Deliveries</h3>
                <p className="text-xs text-on-surface-variant">You have no pantry items scheduled for this day.</p>
              </div>
            )}
          </section>
        )}

        {/* Tip block */}
        <section className="bg-primary/5 p-4 rounded-xl border border-primary-container/20">
          <p className="text-[12px] text-primary-container font-semibold font-sans leading-relaxed">
            💡 <strong>Pro-Tip:</strong> Locked meals are already cooked by our neighborhood chefs. You can skip any future delivery up to 48 hours in advance!
          </p>
        </section>
      </main>

      {/* Skip Confirmation Modal */}
      {skipTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setSkipTarget(null)} />

          {/* Modal Content */}
          <div className="relative bg-white rounded-3xl p-6 shadow-2xl w-full max-w-[340px] text-center border border-[#bec9c3]/20 z-10">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="text-brand-red text-[28px]" />
            </div>

            <h3 className="text-lg font-extrabold text-on-surface mb-2">Skip Meal?</h3>
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Are you sure you want to skip <strong>{skipTarget.mealName || "this meal"}</strong>? Confirming this will skip your meal.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setSkipTarget(null)}
                className="flex-grow border border-[#e4e2e1] py-2.5 rounded-full font-extrabold text-[13px] text-on-surface-variant hover:bg-slate-50 active:scale-95 transition-all"
              >
                Go Back
              </button>
              <button
                onClick={confirmSkipOrder}
                className="flex-grow bg-brand-red text-white py-2.5 rounded-full font-extrabold text-[13px] hover:bg-red-600 active:scale-95 transition-all"
              >
                Confirm
              </button>
            </div>
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

            <h3 className="text-xl font-black text-[#00604c] mb-1">Meal Delivered!</h3>
            <p className="text-xs text-on-surface-variant mb-5 font-semibold">How was your delivery experience?</p>

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
              placeholder="Any feedback? (Optional)"
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-[#00604c] focus:ring-1 focus:ring-[#00604c] mb-4 h-20 resize-none"
            />

            {/* Tip Section */}
            <div className="mb-6">
              <p className="text-xs font-bold text-[#3e4945] mb-2 uppercase tracking-wider text-left">Add a Tip for Driver</p>
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
                    {amt === 0 ? "No" : `${amt}zł`}
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
                  Custom
                </button>
                {tipAmount === "custom" && (
                  <input
                    type="number"
                    min="1"
                    placeholder="zł"
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
                {loadingAction ? "Submitting..." : "Submit Rating"}
                <Send className="text-[18px]" />
              </button>
              <button
                onClick={() => setRatingModalOrder(null)}
                className="w-full py-2.5 rounded-xl font-bold text-xs text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
