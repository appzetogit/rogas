import React, { useState } from 'react';
import { Receipt, MapPin, CheckCircle } from 'lucide-react';

export default function PantryOrdersManager({ orders = [], onUpdateOrderStatus }) {
  const [activeTab, setActiveTab] = useState('pending');

  const pendingOrders = orders.filter(o => ['Scheduled', 'Preparing', 'Accepted'].includes(o.status));
  const completedOrders = orders.filter(o => ['Ready', 'On the Way', 'Delivered'].includes(o.status));

  const displayOrders = activeTab === 'pending' ? pendingOrders : completedOrders;

  return (
    <div className="flex flex-col h-full bg-slate-50/50 pb-[100px]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xl px-5 pt-16 pb-4">
        <h1 className="text-[28px] font-extrabold text-primary tracking-tight">Pantry Orders</h1>
        <p className="text-on-surface-variant text-[14px] mt-1 font-medium">Manage your incoming pantry orders.</p>
      </div>

      {/* Tabs */}
      <div className="px-5 mt-2 flex gap-3">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-3 rounded-2xl text-[14px] font-bold transition-all shadow-sm ${
            activeTab === 'pending' ? 'bg-primary text-white' : 'bg-white text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          Pending ({pendingOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-3 rounded-2xl text-[14px] font-bold transition-all shadow-sm ${
            activeTab === 'completed' ? 'bg-primary text-white' : 'bg-white text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          Completed ({completedOrders.length})
        </button>
      </div>

      {/* Orders List */}
      <div className="px-5 mt-5 space-y-4">
        {displayOrders.length === 0 ? (
          <div className="text-center mt-12 bg-white rounded-3xl p-8 border border-[#e4e2e1]/50 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-[#eef0ec] mx-auto flex items-center justify-center mb-4">
              <Receipt className="text-[32px] text-primary" />
            </div>
            <p className="text-[17px] text-[#1b1c1c] font-extrabold">No {activeTab} orders</p>
            <p className="text-[14px] text-[#6e7a74] mt-1 font-medium">You're all caught up!</p>
          </div>
        ) : (
          displayOrders.map(order => (
            <div key={order.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-transparent hover:border-primary/20 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-extrabold text-[16px] text-[#1b1c1c]">Order #{order.code || order.id.slice(-4)}</h3>
                  <p className="text-[13px] font-bold text-primary mt-0.5">{order.day}</p>
                </div>
                <span className={`px-3.5 py-1.5 rounded-full text-[12px] font-extrabold ${
                  order.status === 'Ready' ? 'bg-green-100 text-green-700' : 
                  order.status === 'Delivered' ? 'bg-blue-100 text-blue-700' : 
                  'bg-[#eef0ec] text-primary'
                }`}>
                  {order.status}
                </span>
              </div>
              <div className="py-4 border-t border-b border-[#f0f0f0] my-4 bg-slate-50/50 rounded-xl px-4">
                <p className="text-[14px] font-bold text-[#1b1c1c]">{order.itemsName}</p>
                <div className="flex items-center gap-1.5 mt-2 text-on-surface-variant">
                  <MapPin className="text-[16px]" />
                  <p className="text-[13px] font-medium">{order.zone}</p>
                </div>
              </div>
              {activeTab === 'pending' && (
                <button
                  onClick={() => onUpdateOrderStatus && onUpdateOrderStatus(order.id, 'ready', order.deliverySlot)}
                  className="w-full py-3.5 rounded-xl bg-primary hover:bg-[#155a49] text-white font-extrabold text-[14px] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <CheckCircle className="text-[18px]" />
                  Mark as Ready
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
