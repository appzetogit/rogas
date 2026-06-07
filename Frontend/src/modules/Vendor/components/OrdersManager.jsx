/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { dmbVendorAPI } from '../../../services/api/index';

const SLOT_LABEL = { breakfast: 'Breakfast ☀️', lunch: 'Lunch 🌤️', dinner: 'Dinner 🌙' };

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'bg-slate-100 text-slate-600', border: 'border-slate-300' },
  preparing: { label: 'Preparing 🔥', color: 'bg-amber-100 text-amber-700', border: 'border-amber-400' },
  ready: { label: 'Ready ✓', color: 'bg-green-100 text-green-700', border: 'border-green-500' },
  out_for_delivery: { label: 'On the Way 🛵', color: 'bg-purple-100 text-purple-700', border: 'border-purple-400' },
  delivered: { label: 'Delivered ✅', color: 'bg-blue-100 text-blue-700', border: 'border-blue-400' },
  skipped: { label: 'Skipped', color: 'bg-red-100 text-red-600', border: 'border-red-300' },
};

export default function OrdersManager({ orders: legacyOrders, onUpdateOrderStatus, onBatchUpdateStatus }) {
  const [viewMode, setViewMode] = useState('daily');
  const [activeDate, setActiveDate] = useState('today');
  const [dailyOrders, setDailyOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ─── Load daily orders from backend ──────────────────────────────────────
  const loadDailyOrders = async (dateLabel = 'today') => {
    setLoading(true);
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
      setDailyOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDailyOrders(activeDate);
  }, [activeDate]);

  // ─── Update single order status ──────────────────────────────────────────
  const handleStatusChange = async (orderId, newStatus) => {
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
    try {
      const dateParam = activeDate === 'tomorrow'
        ? new Date(Date.now() + 86400000).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      await dmbVendorAPI.markAllDailyOrdersReady(dateParam, null);
      setDailyOrders(prev =>
        prev.map(o => ['scheduled', 'preparing'].includes(o.status) ? { ...o, status: 'ready' } : o)
      );
      showToast('✅ All orders marked as Ready!');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to mark all ready');
    }
  };

  // Summary stats
  const scheduledCount = dailyOrders.filter(o => o.status === 'scheduled').length;
  const preparingCount = dailyOrders.filter(o => o.status === 'preparing').length;
  const readyCount = dailyOrders.filter(o => o.status === 'ready').length;
  const pendingCount = dailyOrders.filter(o => ['scheduled', 'preparing'].includes(o.status)).length;

  return (
    <div className="flex-grow pt-14 pb-[99px] font-sans px-4 select-none max-w-[390px] mx-auto w-full text-left">

      {/* View Mode Tabs */}
      <div className="flex gap-2 my-3">
        <button
          onClick={() => setViewMode('daily')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all ${
            viewMode === 'daily' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}
        >
          📋 Subscription Orders
        </button>
        <button
          onClick={() => setViewMode('legacy')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all ${
            viewMode === 'legacy' ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary hover:bg-primary/5'
          }`}
        >
          🛒 One-Time Orders
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

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3 rounded-xl flex flex-col items-center border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Scheduled</span>
              <span className="text-xl font-bold text-slate-700 mt-1">{scheduledCount}</span>
            </div>
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
              <span className="material-symbols-outlined text-[18px]">done_all</span>
              Mark All {pendingCount} Orders as Ready
            </button>
          )}

          {/* Orders List */}
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-on-surface-variant">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px] font-medium">Loading orders…</span>
            </div>
          ) : dailyOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200 p-6">
              <span className="material-symbols-outlined text-[40px] text-slate-300">inbox</span>
              <p className="text-[14px] text-slate-500 font-bold mt-2">No subscription orders {activeDate}</p>
              <p className="text-[12px] text-slate-400 mt-1">Orders appear when customers have active subscriptions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dailyOrders.map(order => {
                const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.scheduled;
                const mealName = order.meals?.[0]?.name || 'Meal';
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
                            {SLOT_LABEL[order.deliverySlot] || order.deliverySlot}
                          </p>
                          <h3 className="text-[15px] font-bold text-on-surface mt-0.5">
                            {mealName}
                            {extraMeals > 0 && <span className="text-[12px] text-slate-400 font-medium"> +{extraMeals} more</span>}
                          </h3>
                          <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                            👤 {order.customer?.name || 'Customer'}
                          </p>
                        </div>
                        <span className={`${sc.color} font-bold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider`}>
                          {sc.label}
                        </span>
                      </div>

                      {/* Order ID */}
                      <div className="flex items-center gap-1.5 mb-3 bg-slate-50 rounded-lg px-2 py-1 w-fit">
                        <span className="material-symbols-outlined text-[12px] text-slate-400">tag</span>
                        <span className="text-[11px] font-mono font-semibold text-slate-500">{order.orderId || '—'}</span>
                      </div>

                      {/* Action Buttons */}
                      {order.status !== 'delivered' && order.status !== 'skipped' && (
                        <div className="flex gap-2 pt-3 border-t border-slate-100">
                          {canPrepare && (
                            <button
                              onClick={() => handleStatusChange(order._id, 'preparing')}
                              className="flex-1 bg-amber-500 text-white py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                            >
                              <span className="material-symbols-outlined text-[16px]">soup_kitchen</span>
                              Start Preparing
                            </button>
                          )}
                          {canReady && (
                            <button
                              onClick={() => handleStatusChange(order._id, 'ready')}
                              className="flex-1 bg-primary text-white py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                            >
                              <span className="material-symbols-outlined text-[16px]">check_circle</span>
                              Mark Ready
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <div className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1">
                              <span className="material-symbols-outlined text-[16px]">done_all</span>
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
              <span className="material-symbols-outlined text-[40px] text-slate-300">receipt_long</span>
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
                          <span className="material-symbols-outlined text-[16px]">microwave</span>
                          {isPreparing ? 'Preparing…' : 'Start Preparing'}
                        </button>
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                          className="flex-1 bg-primary text-white py-2 rounded-lg font-bold text-[12px] flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          Mark Ready
                        </button>
                      </div>
                    )}
                    {isReady && (
                      <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                        <span className="material-symbols-outlined text-green-600 text-[18px]">check_circle</span>
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full font-bold text-[13px] shadow-xl z-[200] animate-fadeIn">
          {toast}
        </div>
      )}
    </div>
  );
}