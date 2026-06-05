/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';








export default function OrdersManager({
  orders,
  onUpdateOrderStatus,
  onBatchUpdateStatus
}) {
  const [viewMode, setViewMode] = useState('queue');
  const [activeFilter, setActiveFilter] = useState('All');

  // Filter orders based on active tab
  const filteredOrders = orders.filter((order) => {
    if (activeFilter === 'Subs') return order.type === 'Subscription';
    if (activeFilter === 'One-time') return order.type === 'One-time';
    return true; // All
  });

  // Calculate statistics
  const acceptedOrdersCount = orders.filter((o) => o.status === 'Accepted').length;
  const preparingOrdersCount = orders.filter((o) => o.status === 'Preparing').length;
  const readyOrdersCount = orders.filter((o) => o.status === 'Ready').length;
  const remainingCount = orders.filter((o) => o.status !== 'Ready').length;

  return (
    <div className="flex-grow pt-14 pb-[99px] font-sans px-4 select-none max-w-[390px] mx-auto w-full text-left">
      {/* Upper View Selector Toggles */}
      <div className="flex gap-2 my-3">
        <button
          onClick={() => setViewMode('queue')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all ${
          viewMode === 'queue' ?
          'bg-primary text-white border-primary shadow-xs' :
          'bg-white text-primary border-primary hover:bg-primary/5'}`
          }>
          
          Today's Orders (Prep Queue)
        </button>
        <button
          onClick={() => setViewMode('board')}
          className={`flex-1 py-2 text-center text-[12px] font-bold rounded-lg border transition-all ${
          viewMode === 'board' ?
          'bg-primary text-white border-primary shadow-xs' :
          'bg-white text-primary border-primary hover:bg-primary/5'}`
          }>
          
          Preparation Board
        </button>
      </div>

      {viewMode === 'queue' ?
      <div className="space-y-4 animate-fadeIn">
          {/* Segment Filter Tabs */}
          <div className="flex items-center justify-between bg-white rounded-xl p-1 shadow-xs border border-outline-variant/30 overflow-x-auto no-scrollbar">
            <button
            onClick={() => setActiveFilter('All')}
            className={`flex-1 py-2 text-center font-bold text-[13px] rounded-lg transition-all ${
            activeFilter === 'All' ? 'bg-primary-container/10 border-b-2 border-primary text-primary' : 'text-outline hover:text-primary'}`
            }>
            
              All ({orders.length})
            </button>
            <button
            onClick={() => setActiveFilter('Subs')}
            className={`flex-1 py-2 text-center font-bold text-[13px] rounded-lg transition-all ${
            activeFilter === 'Subs' ? 'bg-primary-container/10 border-b-2 border-primary text-primary' : 'text-outline hover:text-primary'}`
            }>
            
              Subs ({orders.filter((o) => o.type === 'Subscription').length})
            </button>
            <button
            onClick={() => setActiveFilter('One-time')}
            className={`flex-1 py-2 text-center font-bold text-[13px] rounded-lg transition-all ${
            activeFilter === 'One-time' ? 'bg-primary-container/10 border-b-2 border-primary text-primary' : 'text-outline hover:text-primary'}`
            }>
            
              One-time ({orders.filter((o) => o.type === 'One-time').length})
            </button>
          </div>

          {/* Section subtitle */}
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline">ACTIVE PREP QUEUE</span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{remainingCount} remaining</span>
          </div>

          {/* Queue List Cards */}
          <div className="space-y-4">
            {filteredOrders.length === 0 ?
          <div className="text-center py-10 bg-white rounded-xl p-5 border border-dashed border-outline-variant">
                <span className="material-symbols-outlined text-[32px] text-outline">inbox</span>
                <p className="text-[13px] text-outline-variant font-bold mt-2">No active matching orders found</p>
              </div> :

          filteredOrders.map((order) => {
            const isReady = order.status === 'Ready';
            const isPreparing = order.status === 'Preparing';
            const isAccepted = order.status === 'Accepted';

            let borderCls = 'border-l-[6px] border-[#F59E0B]'; // Amber for preparing
            if (isReady) borderCls = 'border-l-[6px] border-[#1F7A63]'; // Green for ready
            else if (isAccepted) borderCls = 'border-l-[6px] border-[#bec9c3]'; // Gray for accepted

            return (
              <div
                key={order.id}
                className={`bg-surface-container-lowest rounded-xl overflow-hidden shadow-xs border border-outline-variant/20 ${borderCls} transition-all duration-300 transform hover:scale-[1.01]`}>
                
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[10px] text-outline font-bold uppercase tracking-wider">ZONE: {order.zone}</p>
                          <h3 className="text-[15px] font-bold text-on-surface mt-0.5">{order.itemsName}</h3>
                        </div>
                        <span className="bg-surface-container-highest px-2.5 py-1 rounded text-[11px] font-bold text-on-surface-variant font-mono">
                          {order.code}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3 pt-1">
                        <span className="bg-tertiary text-on-tertiary px-3 py-1 rounded-full text-[11px] font-bold">
                          {order.type}
                        </span>
                        
                        {isReady ?
                    <span className="bg-primary text-on-primary px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1">
                            Ready <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                          </span> :
                    isPreparing ?
                    <span className="bg-secondary-container text-white px-3 py-1 rounded-full text-[11px] font-bold">
                            Preparing
                          </span> :

                    <span className="bg-outline text-white px-3 py-1 rounded-full text-[11px] font-bold">
                            Accepted
                          </span>
                    }
                      </div>

                      {order.status !== 'Ready' &&
                  <div className="flex justify-end border-t border-outline-variant/30 pt-3">
                          <button
                      onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                      className="text-primary font-bold text-[13px] flex items-center gap-0.5 active:opacity-75 transition-opacity">
                      
                            Mark Ready
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                          </button>
                        </div>
                  }
                    </div>
                  </div>);

          })
          }
          </div>
        </div> :

      <div className="space-y-5 animate-fadeIn">
          {/* Subheading summary line stats row */}
          <div>
            <p className="text-[13px] font-bold text-outline">Today — {orders.length} orders total</p>
          </div>

          {/* Status Summary Boxes Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#e6f4f1] p-3 rounded-xl flex flex-col items-center border border-primary-fixed/20">
              <span className="text-[10px] font-bold text-primary-container uppercase tracking-wide">ACCEPTED</span>
              <span className="text-xl font-bold text-primary mt-1">{acceptedOrdersCount}</span>
            </div>
            <div className="bg-[#fff4e5] p-3 rounded-xl flex flex-col items-center border border-secondary-fixed/20">
              <span className="text-[10px] font-bold text-on-secondary-container uppercase tracking-wide">PREPARING</span>
              <span className="text-xl font-bold text-secondary-container mt-1">{preparingOrdersCount}</span>
            </div>
            <div className="bg-[#f0f9f1] p-3 rounded-xl flex flex-col items-center border border-primary-fixed-dim/20">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wide">READY ✓</span>
              <span className="text-xl font-bold text-primary mt-1">{readyOrdersCount}</span>
            </div>
          </div>

          {/* BATCH UPDATE Section */}
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">BATCH UPDATE</h2>
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs border border-outline-variant/20">
              <p className="text-[13px] text-on-surface mb-3 font-medium">Update all orders at once:</p>
              <div className="flex gap-3">
                <button
                onClick={() => onBatchUpdateStatus('Accepted', 'Preparing')}
                className="flex-1 bg-secondary-container text-white py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-1 active:scale-95 transition-transform cursor-pointer">
                
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  Start Preparing
                </button>
                <button
                onClick={() => onBatchUpdateStatus('Preparing', 'Ready')}
                className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-bold text-[13px] flex items-center justify-center gap-1 active:scale-95 transition-transform cursor-pointer">
                
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  All Ready
                </button>
              </div>
            </div>
          </section>

          {/* INDIVIDUAL ORDERS list */}
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">INDIVIDUAL ORDERS</h2>
            <div className="space-y-2.5">
              {orders.map((order) => {
              const isReady = order.status === 'Ready';
              const isPreparing = order.status === 'Preparing';
              const isAccepted = order.status === 'Accepted';

              let borderLeftColor = 'border-primary';
              if (isPreparing) borderLeftColor = 'border-secondary-container';else
              if (isAccepted) borderLeftColor = 'border-outline-variant';

              return (
                <div
                  key={order.id}
                  className={`bg-surface-container-lowest p-3 rounded-xl shadow-xs border border-outline-variant/10 flex items-center justify-between border-l-4 ${borderLeftColor} transition-transform hover:scale-[1.01]`}>
                  
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[14px] font-bold text-on-surface font-mono">{order.code}</span>
                        <span className="text-outline text-[12px]">•</span>
                        <span className="text-[13px] text-on-surface font-medium truncate block">{order.itemsName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-outline font-medium">{order.zone}</span>
                        {isReady ?
                      <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Ready ✓
                          </span> :
                      isPreparing ?
                      <span className="bg-secondary-container/10 text-secondary text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Preparing
                          </span> :

                      <span className="bg-surface-container-high text-on-surface-variant text-[10px] px-2 py-0.5 rounded-full font-bold">
                            Accepted
                          </span>
                      }
                      </div>
                    </div>

                    {/* Mic & Check toggle actions */}
                    <div className="flex gap-2">
                      <button
                      onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}
                      title="Set Preparing"
                      className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${
                      isPreparing ?
                      'bg-secondary-container text-white border-secondary-container shadow-xs active:scale-90' :
                      'border-outline-variant text-outline hover:bg-surface-container active:scale-90'}`
                      }>
                      
                        <span className="material-symbols-outlined text-[18px]">microwave</span>
                      </button>
                      <button
                      onClick={() => onUpdateOrderStatus(order.id, 'Ready')}
                      title="Set Ready"
                      className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all cursor-pointer ${
                      isReady ?
                      'bg-primary text-on-primary border-primary shadow-xs active:scale-90' :
                      'border-outline-variant text-outline hover:bg-surface-container active:scale-90'}`
                      }>
                      
                        <span className="material-symbols-outlined text-[18px]">check</span>
                      </button>
                    </div>
                  </div>);

            })}
            </div>
          </section>
        </div>
      }
    </div>);

}