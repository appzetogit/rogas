import { Bell, ShoppingBag, DollarSign, Star, Navigation, Wallet, HeartHandshake, Gift } from "lucide-react";
import { useState, useEffect } from "react";
import { deliveryAPI } from "@food/api";

const DashboardHome = ({
  stats,
  toggleOnline,
  activeOrder,
  onNavigateToPickup
}) => {
  const [addons, setAddons] = useState([]);

  useEffect(() => {
    const fetchAddons = async () => {
      try {
        const res = await deliveryAPI.getActiveEarningAddons();
        if (res?.data?.success) {
          setAddons(res.data.data?.offers || []);
        }
      } catch (err) {
        console.error("Error fetching addons:", err);
      }
    };
    fetchAddons();
  }, []);

  return <div className="space-y-4 animate-fadeIn">
    {
      /* Top Welcome Header */
    }
    <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-[#e0e3e0] shadow-sm">
      <div className="flex items-center gap-3">
        <div className="relative">
          <img
            alt={stats?.name || "Delivery Partner"}
            className="w-12 h-12 rounded-full border border-[#bec9c3] object-cover"
            src={stats?.profileImage || "https://lh3.googleusercontent.com/aida-public/AB6AXuDD2_lMXh8dhOlTWeYSkHItytPk5uzDBhawYjfPwJs-PtVgUhSwqy36J6R-4DoKas8gpTeiha4dx5AHukgQKjXvMgqXpnMdn1EC7sPE4E9WhiieZ5DvKcSezk8FwQxV4aVeUEjoymn9M17VrWwTIIPYsDzhXS704LBs998TQfmDJAxCIrqiuDZY-EnsVhc5nySTdKZPztVoEhGkiihaO1DJaMlHwFO4uD5li-43YQ49fK6OUt3xSRLLc4_CP6OGpXnptuQRok-hK_Ih"}
            referrerPolicy="no-referrer"
          />
          {stats.online && <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#00604c] border-2 border-white rounded-full" />}
        </div>
        <div>
          <p className="text-xs text-[#3e4945] font-semibold uppercase tracking-wider">FreshDash Partner</p>
          <h1 className="text-lg font-bold text-[#00604c]">Good morning, {(stats?.name || "Partner").split(" ")[0]}</h1>
        </div>
      </div>

      <div className="relative cursor-pointer p-2 rounded-full hover:bg-[#f1f4f1] transition-colors">
        <Bell className="w-6 h-6 text-[#3e4945]" />
        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#ba1a1a] rounded-full border border-white" />
      </div>
    </div>

    {
      /* Online Toggle Card */
    }
    <div
      onClick={toggleOnline}
      className={`p-6 rounded-2xl shadow-md cursor-pointer transition-all active:scale-[0.98] duration-200 border ${stats.online ? "bg-[#00604c] border-[#016b55] text-white" : "bg-[#5d5f5b] border-[#6e7a74] text-white"}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {stats.online ? "ONLINE" : "OFFLINE"}
          </h2>
          <p className="text-sm opacity-90 font-medium">
            {stats.online ? "Receiving delivery requests" : "Turn on to start receiving orders"}
          </p>
        </div>
        <div className="w-14 h-8 bg-white/20 rounded-full relative flex items-center px-1 transition-colors">
          <div
            className={`w-6 h-6 bg-white rounded-full shadow-md transition-transform duration-300 ${stats.online ? "translate-x-6" : "translate-x-0"}`}
          />
        </div>
      </div>
    </div>

    {
      /* Summary Stats Bento Grid */
    }
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-white p-4 rounded-xl border border-[#e0e3e0] flex flex-col items-center justify-center text-center">
        <ShoppingBag className="w-5 h-5 text-[#00604c] mb-1" />
        <span className="text-lg font-bold text-[#181d1b]">{stats?.today?.deliveries || 0}</span>
        <span className="text-[10px] uppercase font-bold text-[#3e4945] tracking-wider">Deliveries</span>
      </div>

      <div className="bg-white p-4 rounded-xl border border-[#e0e3e0] flex flex-col items-center justify-center text-center">
        <DollarSign className="w-5 h-5 text-[#00604c] mb-1" />
        <span className="text-lg font-bold text-[#181d1b]">{(stats?.today?.earned || 0).toFixed(0)} PLN</span>
        <span className="text-[10px] uppercase font-bold text-[#3e4945] tracking-wider">Earned</span>
      </div>

      <div className="bg-white p-4 rounded-xl border border-[#e0e3e0] flex flex-col items-center justify-center text-center">
        <Star className="w-5 h-5 text-[#ba1a1a] fill-[#ba1a1a] mb-1" />
        <span className="text-lg font-bold text-[#181d1b]">{stats.rating.toFixed(1)}</span>
        <span className="text-[10px] uppercase font-bold text-[#3e4945] tracking-wider">Rating</span>
      </div>
    </div>

    {
      /* Active Order Section */
    }
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">Active Order</h3>
      {activeOrder && activeOrder.status !== "delivered" && activeOrder.status !== "failed" ? <div className="bg-white p-4 rounded-xl border-t-4 border-[#ffb300] border-x border-b border-[#e0e3e0] shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#e0e0db] rounded-lg flex items-center justify-center text-[#5d5f5b]">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-base">{activeOrder.vendorName}</h4>
              <p className="text-xs text-[#3e4945]">{activeOrder.status === "ready_for_pickup" ? "Pickup: " : "Deliver to: "}{activeOrder.status === "ready_for_pickup" ? activeOrder.pickupAddress : activeOrder.deliveryAddress}</p>
            </div>
          </div>
          <span className="bg-[#ffdad5] text-[#74332a] text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
            Urgently
          </span>
        </div>

        <button
          onClick={onNavigateToPickup}
          disabled={!stats.online}
          className={`w-full h-11 bg-[#00604c] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${!stats.online ? "opacity-50 cursor-not-allowed bg-gray-400" : "hover:bg-[#1f7a63]"}`}
        >
          <Navigation className="w-4 h-4 fill-white" />
          Navigate to Pickup
        </button>
      </div> : <div className="bg-white p-6 rounded-xl border border-dashed border-[#bec9c3] text-center text-[#5d5f5b]">
        <p className="text-sm font-medium">No active deliveries right now.</p>
        {stats.online ? <p className="text-xs text-[#3e4945] mt-1">Waiting for dispatcher route requests...</p> : <p className="text-xs text-[#3e4945] mt-1">Go online to receive assignment offers.</p>}
      </div>}
    </div>

    {
      /* Earning Addon Offers */
    }
    {addons.length > 0 ? (
      addons.map((addon) => {
        const progressPercent = Math.min(100, Math.round((addon.currentOrders / addon.targetOrders) * 100)) || 0;
        return (
          <div key={addon.id} className="bg-white p-4 rounded-xl border border-[#e0e3e0] shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-gray-900 text-sm">{addon.title}</h3>
              <span className="text-xs font-bold text-[#00604c] bg-[#9ef3d7] px-2 py-0.5 rounded">
                {progressPercent}% Complete
              </span>
            </div>
            <div className="w-full h-3 bg-[#e5e9e5] rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-2.5 text-xs text-[#3e4945]">
              {progressPercent >= 100 
                ? `Completed! Enjoy your ${addon.targetAmount} PLN bonus payout.` 
                : `Deliver ${addon.targetOrders - addon.currentOrders} more orders to earn ${addon.targetAmount} PLN extra`}
            </p>
          </div>
        );
      })
    ) : (
      <div className="bg-white p-6 rounded-xl border border-dashed border-[#bec9c3] text-center text-[#5d5f5b] shadow-sm">
        <div className="flex justify-center mb-3">
          <Gift className="w-8 h-8 text-[#bec9c3]" />
        </div>
        <h3 className="font-extrabold text-gray-900 text-sm mb-1">No Earning Addon Offers Available</h3>
        <p className="text-xs font-medium">Check back later for new bonus challenges and earning opportunities.</p>
      </div>
    )}

    {
      /* Secondary Info Cards */
    }
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white p-4 rounded-xl border border-amber-300/60 shadow-sm flex flex-col gap-2">
        <Wallet className="w-5 h-5 text-amber-600" />
        <div>
          <span className="text-[11px] font-semibold text-[#3e4945] block uppercase tracking-wider">Cash (COD)</span>
          <span className="text-lg font-bold text-gray-900">{stats.cashInHand ? stats.cashInHand.toFixed(2) : "0.00"} PLN</span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-[#e0e3e0] shadow-sm flex flex-col gap-2">
        <HeartHandshake className="w-5 h-5 text-[#00604c]" />
        <div>
          <span className="text-[11px] font-semibold text-[#3e4945] block uppercase tracking-wider font-sans">Tips Today</span>
          <span className="text-lg font-bold text-gray-900">{stats.today?.tips ? stats.today.tips.toFixed(2) : "0.00"} PLN</span>
        </div>
      </div>
    </div>
  </div>;
};
export {
  DashboardHome
};
