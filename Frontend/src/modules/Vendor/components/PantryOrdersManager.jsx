import React, { useState, useEffect } from 'react';
import { Receipt, MapPin, CheckCircle, RefreshCw } from 'lucide-react';
import { dmbVendorAPI } from '../../../services/api';
import { toast } from 'sonner';

export default function PantryOrdersManager() {
  const [activeTab, setActiveTab] = useState('pending');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date Logic
  const generateDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  };
  const dates = generateDates();
  const formatDateForApi = (d) => {
    const offset = d.getTimezoneOffset();
    const normalized = new Date(d.getTime() - (offset*60*1000));
    return normalized.toISOString().split('T')[0];
  };
  const [selectedDate, setSelectedDate] = useState(formatDateForApi(new Date()));

  const fetchOrders = async (dateStr) => {
    try {
      setLoading(true);
      const res = await dmbVendorAPI.getVendorPantryOrders({ date: dateStr || selectedDate });
      if (res.data?.success) {
        setOrders(res.data.orders);
      }
    } catch (err) {
      console.error('Failed to fetch pantry orders:', err);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(selectedDate);
  }, [selectedDate]);

  const handleUpdateOrderStatus = async (orderId, deliveryId, newStatus) => {
    try {
      const res = await dmbVendorAPI.updateDailyPantryStatus(orderId, deliveryId, newStatus);
      if (res.data?.success) {
        toast.success(`Order marked as ${newStatus}`);
        fetchOrders(); // refresh
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const pendingOrders = orders.filter(o => ['scheduled', 'preparing', 'ready'].includes(o.status));
  const completedOrders = orders.filter(o => ['out_for_delivery', 'delivered', 'failed'].includes(o.status));

  const displayOrders = activeTab === 'pending' ? pendingOrders : completedOrders;

  return (
    <div className="flex flex-col h-full bg-slate-50/50 pb-[100px]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xl px-5 pt-16 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-[28px] font-extrabold text-primary tracking-tight">Pantry Orders</h1>
          <p className="text-on-surface-variant text-[14px] mt-1 font-medium">Manage your incoming pantry orders.</p>
        </div>
        <button onClick={fetchOrders} className="p-2 bg-white rounded-full shadow-sm text-primary active:scale-95">
          <RefreshCw className={`text-[20px] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Date Slider */}
      <div className="bg-white mx-5 mt-2 rounded-[20px] p-2 flex justify-between shadow-sm border border-[#e4e2e1]/50 overflow-x-auto hide-scrollbar">
        {dates.map((d, i) => {
          const apiDate = formatDateForApi(d);
          const isSelected = apiDate === selectedDate;
          const dayStr = d.toLocaleDateString('en-US', { weekday: 'narrow' });
          const dateNum = d.getDate();
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(apiDate)}
              className={`flex flex-col items-center justify-center min-w-[44px] h-[52px] rounded-[14px] transition-all ${
                isSelected ? 'bg-primary text-white shadow-md' : 'text-[#6e7a74] hover:bg-slate-50'
              }`}
            >
              <span className={`text-[11px] font-bold ${isSelected ? 'text-white/90' : 'text-[#a1a8a5]'}`}>{dayStr}</span>
              <span className={`text-[15px] font-extrabold mt-0.5`}>{dateNum}</span>
            </button>
          );
        })}
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
                  <h3 className="font-extrabold text-[16px] text-[#1b1c1c]">Order #{order.orderId || order.id.slice(-4)}</h3>
                  <p className="text-[13px] font-bold text-primary mt-0.5 capitalize">{order.day} - {order.deliverySlot}</p>
                </div>
                <span className={`px-3.5 py-1.5 rounded-full text-[12px] font-extrabold capitalize ${
                  order.status === 'ready' ? 'bg-green-100 text-green-700' : 
                  order.status === 'delivered' ? 'bg-blue-100 text-blue-700' : 
                  'bg-[#eef0ec] text-primary'
                }`}>
                  {order.status.replace('_', ' ')}
                </span>
              </div>
              <div className="py-4 border-t border-b border-[#f0f0f0] my-4 bg-slate-50/50 rounded-xl px-4">
                <p className="text-[14px] font-bold text-[#1b1c1c]">{order.itemsName}</p>
                <div className="flex items-center gap-1.5 mt-2 text-on-surface-variant">
                  <MapPin className="text-[16px]" />
                  <p className="text-[13px] font-medium">{order.zone}</p>
                </div>
                {order.customer && (
                  <div className="mt-3 pt-3 border-t border-[#e4e2e1]/50 text-on-surface-variant">
                    <p className="text-[13px] font-medium">
                      <span className="font-bold text-[#1b1c1c]">Customer: </span> 
                      {order.customer.name || `${order.customer.firstName} ${order.customer.lastName}`} 
                      {order.customer.phone && ` (${order.customer.phone})`}
                    </p>
                  </div>
                )}
              </div>
              {activeTab === 'pending' && order.status !== 'ready' && (
                <button
                  onClick={() => handleUpdateOrderStatus(order.id, order.deliveryId, 'ready')}
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
