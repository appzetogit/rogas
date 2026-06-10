import { useState, useEffect } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI } from "@food/api";

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

const getUTCFormatDateStr = (dateInput) => {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getLocalFormatDateStr = (d) => {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function CalendarScreen({ onGoBack, onGoToProfile, onShowToast, onGoToPlans, socket }) {
  const [selectedDateStr, setSelectedDateStr] = useState(() => getLocalFormatDateStr(getISTToday()));
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [skipTarget, setSkipTarget] = useState(null); // { orderId, mealName }

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
      const [upcomingRes, pastRes] = await Promise.all([
        dmbCustomerAPI.getMyOrders("upcoming"),
        dmbCustomerAPI.getMyOrders("past")
      ]);

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
    const orderDateStr = getUTCFormatDateStr(order.deliveryDate);
    const todayISTStr = getLocalFormatDateStr(getISTToday());

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
      const orderDateStr = getUTCFormatDateStr(targetOrder.deliveryDate);
      const todayISTStr = getLocalFormatDateStr(getISTToday());
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
    const key = getUTCFormatDateStr(o.deliveryDate);
    if (!orderMap[key]) {
      orderMap[key] = [];
    }
    orderMap[key].push(o);
  });

  // Build the list of visible days
  const getMealForDay = (date) => {
    const dateKeyStr = getLocalFormatDateStr(date);

    const isYesterday = dateKeyStr === getLocalFormatDateStr(yesterday);
    const isToday = dateKeyStr === getLocalFormatDateStr(today);

    const dayOrders = orderMap[dateKeyStr] || [];
    if (dayOrders.length > 0) {
      const order = dayOrders[0];

      // Determine if locked (yesterday & today are strictly non-editable)
      let isLocked = false;
      if (isYesterday || isToday) {
        isLocked = true;
      } else {
        isLocked = isOrderLocked(order);
      }

      // Deduplicate meal names
      const mealNames = order.meals?.map(m => m.name).filter(Boolean) || [];
      const uniqueMealNames = [...new Set(mealNames)];
      const name = uniqueMealNames.join(", ") || "Meal Box";

      return {
        hasOrder: true,
        order,
        dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: date.getDate(),
        dateStr: dateKeyStr,
        name,
        isLocked,
        originalStatus: order.status
      };
    } else {
      const isSunday = date.getDay() === 0;
      return {
        hasOrder: false,
        dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
        dayNum: date.getDate(),
        dateStr: dateKeyStr,
        name: isSunday ? "Rest Day (Sunday)" : "No delivery scheduled",
        isLocked: true,
        originalStatus: ""
      };
    }
  };

  const weekMeals = weekDays.map(d => getMealForDay(d));

  const daysOfWeekStrip = weekDays.map((date) => ({
    label: date.toLocaleDateString("en-US", { weekday: "short" })[0], // 'M', 'T', etc.
    num: date.getDate(),
    dateStr: getLocalFormatDateStr(date)
  }));

  if (loading) {
    return (
      <div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
        <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
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
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
          <h1 className="text-xl font-extrabold text-primary text-center">Calendar</h1>
          <div className="w-8" />
        </header>
        <div className="flex flex-col items-center justify-center pt-40 px-6 text-center gap-4">
          <span className="material-symbols-outlined text-6xl text-brand-red">error</span>
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
        <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
          arrow_back
        </button>
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
          {weekMeals.map((m) => {
            const isSelected = selectedDateStr === m.dateStr;
            const isYesterday = m.dateStr === getLocalFormatDateStr(yesterday);
            const isToday = m.dateStr === getLocalFormatDateStr(today);

            // Determine styling classes based on status
            let borderClass = "border-primary-container";
            if (isYesterday) {
              borderClass = "border-outline/25 opacity-70";
            } else if (m.originalStatus === "skipped") {
              borderClass = "border-brand-red opacity-85";
            } else if (m.originalStatus === "delivered") {
              borderClass = "border-green-500";
            } else if (m.isLocked && m.hasOrder) {
              borderClass = "border-amber-500";
            }

            return (
              <div
                key={m.dateStr}
                className={`bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border-l-4 transition-all duration-300 ${isSelected ? "scale-[1.01] shadow-md" : ""} ${borderClass}`}
              >
                <div className="flex items-center gap-4">
                  <div className="text-center w-8 select-none">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant font-sans">
                      {m.dayName}
                    </span>
                    <span className={`text-[15px] font-bold ${isSelected ? "text-primary font-extrabold" : "text-[#1b1c1c]"}`}>
                      {m.dayNum}
                    </span>
                  </div>

                  <div>
                    <h3 className={`text-base font-bold text-on-surface leading-snug ${m.originalStatus === "skipped" ? "line-through opacity-50" : ""}`}>
                      {m.name}
                    </h3>

                    {/* Dynamic Status Badges */}
                    {!m.hasOrder ? (
                      <p className="text-on-surface-variant/60 text-xs font-semibold font-sans mt-0.5">No Delivery</p>
                    ) : m.originalStatus === "skipped" ? (
                      <p className="text-brand-red text-xs font-bold font-sans mt-0.5">Skipped</p>
                    ) : m.originalStatus === "preparing" ? (
                      <div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">soup_kitchen</span>
                        <p>Preparing 🔥</p>
                      </div>
                    ) : m.originalStatus === "ready" ? (
                      <div className="flex items-center gap-1 text-blue-600 text-xs font-bold font-sans mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        <p>Ready ✓</p>
                      </div>
                    ) : m.originalStatus === "out_for_delivery" ? (
                      <div className="flex items-center gap-1 text-purple-600 text-xs font-bold font-sans mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                        <p>On the Way 🛵</p>
                      </div>
                    ) : m.originalStatus === "delivered" ? (
                      <div className="flex items-center gap-1 text-green-600 text-xs font-bold font-sans mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">done_all</span>
                        <p>Delivered ✅</p>
                      </div>
                    ) : m.isLocked ? (
                      <div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5" onClick={showLockedMessage}>
                        <span className="material-symbols-outlined text-[14px]">lock</span>
                        <p>Locked</p>
                      </div>
                    ) : (
                      <p className="text-primary text-xs font-bold font-sans mt-0.5">Scheduled</p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {!m.hasOrder ? (
                  null
                ) : m.originalStatus === "skipped" ? (
                  (isYesterday || isToday) ? (
                    <span className="text-[12px] font-bold text-brand-red/60 font-sans pr-2">Skipped</span>
                  ) : (
                    <button
                      onClick={() => handleUndoSkipOrder(m.order._id, m.name)}
                      disabled={loadingAction}
                      className="px-4 py-1.5 rounded-full bg-brand-amber text-black hover:bg-amber-400 font-extrabold text-[12px] active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                    >
                      Undo
                    </button>
                  )
                ) : (m.originalStatus !== "scheduled" || m.isLocked) ? (
                  <button onClick={showLockedMessage} className="p-1.5 rounded-full hover:bg-amber-50 text-brand-amber transition-colors flex items-center justify-center cursor-pointer">
                    <span className="material-symbols-outlined text-[20px]">info</span>
                  </button>
                ) : (
                  <button
                    onClick={() => triggerSkipOrder(m.order._id, m.name)}
                    disabled={loadingAction}
                    className="px-4 py-1.5 rounded-full border border-primary-container text-primary hover:bg-[#e8f3f0] font-extrabold text-[12px] active:scale-95 transition-all disabled:opacity-50"
                  >
                    Skip
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {/* Empty state banner when no active subscriptions exist */}
        {orders.length === 0 && (
          <section className="bg-primary/5 p-6 rounded-2xl border border-primary/20 flex flex-col items-center text-center gap-3">
            <span className="material-symbols-outlined text-4xl text-primary">lunch_dining</span>
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
              <span className="material-symbols-outlined text-brand-red text-[28px]">cancel</span>
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
    </div>
  );
}
