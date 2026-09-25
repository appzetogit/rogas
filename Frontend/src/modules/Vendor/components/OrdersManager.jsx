import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dmbVendorAPI } from '../../../services/api/index';
import { CheckCheck, Truck, Inbox, Tag, Soup, CheckCircle, Receipt, Microwave, Check, BarChart, Clock, Zap } from 'lucide-react';
import useDeliverySlots, { pickCurrentSlot } from '../../../shared/hooks/useDeliverySlots';


const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'bg-slate-100 text-slate-600', border: 'border-slate-300' },
  preparing: { label: 'Preparing 🔥', color: 'bg-amber-100 text-amber-700', border: 'border-amber-400' },
  ready: { label: 'Ready ✓', color: 'bg-green-100 text-green-700', border: 'border-green-500' },
  out_for_delivery: { label: 'On the Way 🛵', color: 'bg-purple-100 text-purple-700', border: 'border-purple-400' },
  delivered: { label: 'Delivered ✅', color: 'bg-blue-100 text-blue-700', border: 'border-blue-400' },
  skipped: { label: 'Skipped', color: 'bg-red-100 text-red-600', border: 'border-red-300' },
};

/** Convert "HH:MM" string to minutes since midnight */
const hhmmToMin = (str) => {
  if (!str) return null;
  const [h, m] = str.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** Format minutes as "H:MM AM/PM" */
const fmtMin = (mins) => {
  if (mins === null || mins === undefined) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

export default function OrdersManager({ orders: legacyOrders, onUpdateOrderStatus, onBatchUpdateStatus }) {
  const navigate = useNavigate();
  const { slots: slotList, label: slotName } = useDeliverySlots();
  const [viewMode, setViewMode] = useState('daily');
  const [activeDate, setActiveDate] = useState('today');
  const [timingConfig, setTimingConfig] = useState(null); // admin timing from backend
  const timingFetched = useRef(false);

  const getInitialSlot = (config = timingConfig) => pickCurrentSlot(config, slotList);

  const [activeSlot, setActiveSlot] = useState(() => getInitialSlot(null));
  const [dailyOrders, setDailyOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [isRequestingDelivery, setIsRequestingDelivery] = useState(false);

  const [now, setNow] = useState(new Date());

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  // Refresh current time every minute so window status updates live
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch admin timing config once on mount
  useEffect(() => {
    if (timingFetched.current) return;
    timingFetched.current = true;
    dmbVendorAPI.getTimingSettings()
      .then(res => {
        if (res?.data?.data) {
          const cfg = res.data.data;
          setTimingConfig(cfg);
          setActiveSlot(getInitialSlot(cfg));
        }
      })
      .catch(() => { /* fail silently — no restriction */ });
  }, []);

  // Reset slot filter on date change
  useEffect(() => {
    setActiveSlot(getInitialSlot(timingConfig));
  }, [activeDate, timingConfig, slotList]);


  // ─── Load daily orders from backend ──────────────────────────────────────
  const loadDailyOrders = async (dateLabel = 'today', { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const dateParam = dateLabel === 'tomorrow'
        ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const res = await dmbVendorAPI.getDailyOrders({ date: dateParam });
      if (res.data?.success) {
        setDailyOrders(res.data.orders || []);
      }
    } catch (err) {
      console.error('Failed to load daily orders:', err);
      if (!silent) setDailyOrders([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDailyOrders(activeDate);
  }, [activeDate]);

  useEffect(() => {
    const handleStatusUpdate = (e) => {
      const detail = e?.detail || {};
      // Determine which date label ('today' or 'tomorrow') the changed order belongs to
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      let orderDateLabel = null;
      if (detail.deliveryDate) {
        const orderDate = new Date(detail.deliveryDate).toISOString().split('T')[0];
        if (orderDate === todayStr) orderDateLabel = 'today';
        else if (orderDate === tomorrowStr) orderDateLabel = 'tomorrow';
      }

      // Always silently reload the current view
      loadDailyOrders(activeDate, { silent: true });

      // If the changed order is for a different date than what's displayed, show a toast
      if (orderDateLabel && orderDateLabel !== activeDate) {
        showToast(`📋 An order for ${orderDateLabel} was updated`);
      }
    };
    window.addEventListener('restaurantOrderStatusUpdate', handleStatusUpdate);
    return () => {
      window.removeEventListener('restaurantOrderStatusUpdate', handleStatusUpdate);
    };
  }, [activeDate]);

  // ─── Live timing window check (uses admin config) ───────────────────────────
  const getWindowForSlot = (slot) => {
    const cfg = timingConfig?.[slot];
    if (!cfg || cfg.isEnabled === false) return null;
    const start = hhmmToMin(cfg.startTime);
    const end   = hhmmToMin(cfg.endTime);
    return (start !== null && end !== null) ? { start, end } : null;
  };

  const isWithinPrepWindow = (slot, date = now) => {
    if (timingConfig?.bypassPrepTimingRestrictions) return true;
    const win = getWindowForSlot(slot);
    if (!win) return true; // no config → always allowed
    const cur = date.getHours() * 60 + date.getMinutes();
    return cur >= win.start && cur <= win.end;
  };

  const getWindowLabel = (slot) => {
    const win = getWindowForSlot(slot);
    if (!win) return null;
    return `${fmtMin(win.start)} – ${fmtMin(win.end)}`;
  };


  // ─── Update single order status ──────────────────────────────────────────
  const handleStatusChange = async (orderId, newStatus, deliverySlot) => {
    if ((newStatus === 'preparing' || newStatus === 'ready') && activeDate === 'today') {
      if (!isWithinPrepWindow(deliverySlot)) {
        const label = slotName(deliverySlot);
        const win = getWindowLabel(deliverySlot);
        showToast(`⏰ ${label} preparation is only allowed${win ? ` between ${win}` : ''}. Please try again later.`);
        return;
      }
    }

    try {
      await dmbVendorAPI.updateDailyOrderStatus(orderId, newStatus);
      setDailyOrders(prev =>
        prev.map(o => o._id === orderId ? { ...o, status: newStatus } : o)
      );
      showToast(`✅ Order ${newStatus === 'preparing' ? 'In Preparation' : 'Marked Ready'}!`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status');
    }
  };

  // ─── Mark ALL orders ready ────────────────────────────────────────────────
  const handleMarkAllReady = async () => {
    if (activeDate === 'today' && !isWithinPrepWindow(activeSlot)) {
      const label = slotName(activeSlot);
      const win = getWindowLabel(activeSlot);
      showToast(`⏰ ${label} preparation is only allowed${win ? ` between ${win}` : ''}. Please try again later.`);
      return;
    }
    try {
      const dateParam = activeDate === 'tomorrow'
        ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      await dmbVendorAPI.markAllDailyOrdersReady(dateParam, activeSlot);
      setDailyOrders(prev =>
        prev.map(o => (
          ['scheduled', 'preparing'].includes(o.status) &&
          o.deliverySlot === activeSlot
        ) ? { ...o, status: 'ready' } : o)
      );
      const slotLabel = slotName(activeSlot);
      showToast(`✅ ${slotLabel} orders marked as Ready!`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to mark all ready');
    }
  };

  const handleRequestDeliveryPartner = async () => {
    try {
      setIsRequestingDelivery(true);
      const dateParam = activeDate === 'tomorrow'
        ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const res = await dmbVendorAPI.resendBatch(dateParam, activeSlot);
      if (res.data?.success) {
        showToast(`✅ Delivery partner requested for ${slotName(activeSlot)}!`);
        loadDailyOrders(activeDate);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to request delivery partner');
    } finally {
      setIsRequestingDelivery(false);
    }
  };


  // Slot counts based on dailyOrders for the active date
  const countFor = (key) => dailyOrders.filter(o => o.deliverySlot === key).length;

  const filteredOrders = dailyOrders.filter(o => o.deliverySlot === activeSlot);

  // Summary stats (dynamic based on filtered orders)
  const preparingCount = filteredOrders.filter(o => o.status === 'preparing').length;
  const readyCount = filteredOrders.filter(o => o.status === 'ready').length;
  const pendingCount = filteredOrders.filter(o => ['scheduled', 'preparing'].includes(o.status)).length;

  return (
    <div className="flex-grow pt-4 pb-[99px] md:pb-6 font-sans px-4 select-none max-w-7xl mx-auto w-full text-left">

      {/* View Mode Tabs */}
      <div className="flex gap-2 my-3">
        <button
          onClick={() => setViewMode('daily')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all ${
            viewMode === 'daily' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5"><Receipt className="w-4 h-4" /> Subscription Orders</span>
        </button>
        <button
          onClick={() => setViewMode('legacy')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all ${
            viewMode === 'legacy' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5"><Tag className="w-4 h-4" /> One-Time Orders</span>
        </button>
      </div>

      {viewMode === 'daily' ? (
        <div className="space-y-4 animate-fadeIn">

          {/* Date Selector */}
          <div className="flex gap-2">
            {['today', 'tomorrow'].map(d => (
              <button
                key={d}
                onClick={() => setActiveDate(d)}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${
                  activeDate === d ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface border-[#e4e2e1] hover:bg-slate-50'
                }`}
              >
                {d === 'today' ? "Today's Orders" : "Tomorrow's Orders"}
              </button>
            ))}
          </div>

          {/* Slot Filter Chips */}
          <div className="flex gap-1.5 select-none overflow-x-auto">
            {slotList.map(sl => ({ id: sl.key, label: sl.name, count: countFor(sl.key), emoji: sl.icon })).map(slot => {
              return (
              <button
                key={slot.id}
                onClick={() => setActiveSlot(slot.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                  activeSlot === slot.id
                    ? 'bg-primary text-white border-primary shadow-sm font-extrabold'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-sm leading-none shrink-0">{slot.emoji}</span>
                <span>{slot.label}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                  activeSlot === slot.id ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {slot.count}
                </span>
              </button>
              );
            })}
          </div>

          {/* Timing Window Banner */}
          {(() => {
            if (timingConfig?.bypassPrepTimingRestrictions) {
              return (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[12px] font-semibold border bg-purple-50 border-purple-200 text-purple-700 transition-all">
                  <Zap className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Testing Mode: Preparation allowed anytime (restrictions bypassed)</span>
                </div>
              );
            }
            const win = getWindowLabel(activeSlot);
            const allowed = isWithinPrepWindow(activeSlot);
            const slotLabel = slotName(activeSlot);
            if (!win) return null; // no admin config — no banner
            return (
              <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[12px] font-semibold border transition-all ${
                allowed
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-300 text-amber-700'
              }`}>
                {allowed ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <Clock className="w-4 h-4 text-amber-600 shrink-0" />}
                <span>
                  {slotLabel} window: <strong>{win}</strong>
                  {!allowed && ' — Outside prep window'}
                </span>
              </div>
            );
          })()}

          {/* Meal Box Counts Card */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-left">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Meal Box Counts</h4>
            <div className="grid grid-cols-3 gap-2 text-center text-[12px] font-bold text-slate-700">
              {slotList.map(sl => (
                <div key={sl.key} className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                  <p className="text-[9px] text-slate-400 uppercase font-bold truncate">{sl.name}</p>
                  <p className="text-[14px] text-primary font-black mt-0.5">{countFor(sl.key)} Boxes</p>
                </div>
              ))}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-50 p-3 rounded-xl flex flex-col items-center border border-amber-200">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Preparing</span>
              <span className="text-xl font-bold text-amber-700 mt-1">{preparingCount}</span>
            </div>
            <div className="bg-green-50 p-3 rounded-xl flex flex-col items-center border border-green-200">
              <span className="text-[10px] font-bold text-green-600 uppercase tracking-wide">Ready ✓</span>
              <span className="text-xl font-bold text-green-700 mt-1">{readyCount}</span>
            </div>
          </div>

          {/* Batch: Mark All Ready */}
          {pendingCount > 0 && (
            <button
              onClick={handleMarkAllReady}
              className="w-full bg-primary text-white py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-sm"
            >
              <CheckCheck className="text-[18px]" />
              Mark All {pendingCount} {slotName(activeSlot)} Orders as Ready
            </button>
          )}

          {/* Collection Status */}
          {pendingCount === 0 && readyCount > 0 && (
            <div className="w-full bg-[#1F7A63]/10 border border-[#1F7A63]/20 text-[#1F7A63] py-3.5 px-4 rounded-2xl font-bold text-[13px] flex items-center justify-center gap-2.5 shadow-sm animate-fadeIn">
              <Truck className="text-[18px] animate-pulse" />
              <span>Collection PIN Generated — Waiting for Delivery Partner</span>
            </div>
          )}

          {/* Orders List */}
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-on-surface-variant">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px] font-medium">Loading orders…</span>
            </div>
          ) : dailyOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 p-6">
              <Inbox className="text-[40px] text-slate-300" />
              <p className="text-[14px] text-slate-500 font-bold mt-2">No subscription orders {activeDate}</p>
              <p className="text-[12px] text-slate-400 mt-1">Orders appear when customers have active subscriptions</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 p-6 animate-fadeIn">
              <Inbox className="text-[40px] text-slate-300" />
              <p className="text-[14px] text-slate-500 font-bold mt-2">No {slotName(activeSlot)} orders {activeDate}</p>
              <p className="text-[12px] text-slate-400 mt-1">Select another slot or check back later</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 space-y-0">
              {filteredOrders.map(order => {
                const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.scheduled;
                const mealName = order.meals?.[0]?.mealPlanName || order.meals?.[0]?.name || 'Meal';
                const extraMeals = (order.meals?.length || 1) - 1;
                const canPrepare = order.status === 'scheduled';
                const canReady = order.status === 'preparing';

                return (
                  <div
                    key={order._id}
                    className={`bg-white rounded-xl overflow-hidden shadow-sm border border-l-4 ${sc.border} transition-all`}
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            {slotName(order.deliverySlot)}
                          </p>
                          <h3 className="text-[15px] font-bold text-on-surface mt-0.5">
                            {mealName}
                            {extraMeals > 0 && <span className="text-[12px] text-slate-400 font-medium"> +{extraMeals} more</span>}
                          </h3>
                          {order.meals?.[0]?.mealPlanName && order.meals?.[0]?.name && order.meals[0].name !== order.meals[0].mealPlanName && (
                            <p className="text-[11px] text-[#1F7A63] font-medium mt-0.5">🍽️ {order.meals[0].name}</p>
                          )}
                          <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                            👤 {order.customer?.name || ''}
                          </p>
                        </div>
                        <span className={`${sc.color} font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider`}>
                          {sc.label}
                        </span>
                      </div>

                      {/* Order ID */}
                      <div className="flex items-center gap-1.5 mb-3 bg-slate-50 rounded-lg px-2 py-1 w-fit">
                        <Tag className="text-[12px] text-slate-400" />
                        <span className="text-[11px] font-mono font-semibold text-slate-500">{order.orderId || '—'}</span>
                      </div>

                      {/* Action Buttons */}
                      {order.status !== 'delivered' && order.status !== 'skipped' && (
                        <div className="flex gap-2 pt-3 border-t border-slate-100">
                          {canPrepare && (
                            <button
                              onClick={() => handleStatusChange(order._id, 'preparing', order.deliverySlot)}
                              className="flex-1 bg-amber-500 text-white py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                            >
                              <Soup className="text-[16px]" />
                              Start Preparing
                            </button>
                          )}
                          {canReady && (
                            <button
                              onClick={() => handleStatusChange(order._id, 'ready')}
                              className="flex-1 bg-primary text-white py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                            >
                              <CheckCircle className="text-[16px]" />
                              Mark Ready
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <div className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1">
                              <CheckCheck className="text-[16px]" />
                              Ready for Pickup
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Legacy One-Time Orders */
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">ONE-TIME ORDERS</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{legacyOrders.length} total</span>
          </div>

          {legacyOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 p-6">
              <Receipt className="text-[40px] text-slate-300" />
              <p className="text-[14px] text-slate-500 font-bold mt-2">No one-time orders</p>
            </div>
          ) : (
            legacyOrders.map(order => {
              const isReady = order.status === 'Ready';
              const isPreparing = order.status === 'Preparing';
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl overflow-hidden shadow-sm border border-l-4 ${
                    isReady ? 'border-green-500' : isPreparing ? 'border-amber-400' : 'border-slate-300'
                  } transition-all`}
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ZONE: {order.zone}</p>
                        <h3 className="text-[15px] font-bold text-on-surface mt-0.5">{order.itemsName}</h3>
                      </div>
                      <span className="bg-slate-100 px-2.5 py-1 rounded text-[11px] font-bold text-slate-600 font-mono">{order.code}</span>
                    </div>
                    {order.status !== 'Ready' && (
                      <div className="flex gap-2 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}
                          className={`flex-1 py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform ${
                            isPreparing ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <Microwave className="text-[16px]" />
                          {isPreparing ? 'Preparing…' : 'Start Preparing'}
                        </button>
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                          className="flex-1 bg-primary text-white py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <Check className="text-[16px]" />
                          Mark Ready
                        </button>
                      </div>
                    )}
                    {isReady && (
                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        <CheckCircle className="text-green-600 text-[18px]" />
                        <span className="text-[13px] font-bold text-green-700">Ready for Pickup</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Quick Actions (at the bottom of OrdersManager) */}
      <section className="space-y-2 text-left pt-6 mt-8 border-t border-slate-100">
        <h3 className="text-[11px] font-bold text-outline uppercase tracking-wider px-1">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3 pb-4">
          <button
            onClick={() => onBatchUpdateStatus('any', 'Ready')}
            className="bg-primary text-on-primary h-[48px] rounded-lg font-bold text-[13px] flex items-center justify-center gap-2 active:scale-98 shadow-md hover:brightness-110 transition-all cursor-pointer">
            <CheckCircle className="text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
            <span>Mark All Ready</span>
          </button>

          <button
            onClick={() => navigate('/vendor/earnings')}
            className="bg-white border border-primary text-primary h-[48px] rounded-lg font-bold text-[13px] flex items-center justify-center gap-2 active:scale-98 shadow-xs hover:bg-primary/5 transition-all cursor-pointer">
            <BarChart className="text-[18px]" />
            <span>View Forecast</span>
          </button>
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full font-bold text-[13px] shadow-xl z-[200] animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  );
}