import { useState } from "react";
import { Info, Gift, CalendarDays, ShieldCheck } from "lucide-react";
const EarningsView = ({ stats }) => {
  const [activeTab, setActiveTab] = useState("today");
  const getTotalsByTab = () => {
    switch (activeTab) {
      case "today":
        return {
          total: stats.todayEarned + stats.todayTips + stats.guaranteeTopUp,
          deliveries: stats.todayEarned,
          tips: stats.todayTips,
          topUp: stats.guaranteeTopUp,
          orders: 8,
          progressText: "Progress 4/10",
          progressPercent: 40,
          progressDesc: "Deliver 6 more orders today to earn 25 PLN extra."
        };
      case "week":
        return {
          total: 820.5,
          deliveries: 680,
          tips: 95.5,
          topUp: 45,
          orders: 42,
          progressText: "Progress 8/10",
          progressPercent: 80,
          progressDesc: "Deliver 8 more shifts this week to achieve Elite partner status."
        };
      case "month":
        return {
          total: 3450,
          deliveries: 2900,
          tips: 420,
          topUp: 130,
          orders: 182,
          progressText: "Progress 10/10",
          progressPercent: 100,
          progressDesc: "Monthly quest completed! Enjoy your 250 PLN bonus payout."
        };
    }
  };
  const data = getTotalsByTab();
  return <div className="space-y-4 pb-12 animate-fadeIn text-gray-800">
      {
    /* Tab Switchers */
  }
      <div className="flex bg-[#ebefeb] rounded-2xl p-1 gap-1 border border-[#e0e3e0]">
        {["today", "week", "month"].map((tab) => <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={`flex-1 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-200 ${activeTab === tab ? "bg-white text-[#00604c] shadow-sm" : "text-[#3e4945] hover:bg-[#e0e3e0]"}`}
  >
            {tab === "today" ? "Today" : tab === "week" ? "This week" : "Month"}
          </button>)}
      </div>

      {
    /* Primary Balance Summary Card */
  }
      <section className="bg-white border border-[#e0e3e0]/80 rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[11px] font-bold text-[#3e4945] uppercase tracking-widest">
            {activeTab === "today" ? "Today's Total" : activeTab === "week" ? "Weekly Total" : "Monthly Total"}
          </span>
          <Info className="w-4 h-4 text-[#bec9c3] cursor-pointer" />
        </div>
        
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold text-[#00604c] tracking-tight">{data.total.toFixed(2)}</span>
          <span className="text-sm font-bold text-[#00604c] opacity-80 uppercase">PLN</span>
        </div>

        <hr className="my-4 border-[#e0e3e0]" />

        <div className="space-y-3.5">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#3e4945]">Delivery earnings</span>
            <span className="font-bold text-gray-900">{data.deliveries.toFixed(2)} PLN</span>
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#3e4945]">Tips</span>
            <div className="flex items-center gap-1.5">
              {activeTab === "today" && <span className="bg-[#9ef3d7] text-[#005140] text-[8px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wider animate-pulse">
                  NEW
                </span>}
              <span className="font-bold text-gray-900">{data.tips.toFixed(2)} PLN</span>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-[#3e4945]">Guarantee top-up</span>
            <span className="font-bold text-gray-900">{data.topUp.toFixed(2)} PLN</span>
          </div>
        </div>
      </section>

      {
    /* Bonus Challenge Card */
  }
      <section className="bg-white border border-[#bec9c3] rounded-2xl p-5 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[#a3574c]" />
        
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#854036]" />
            <h3 className="font-extrabold text-gray-900 text-sm">Daily Bonus</h3>
          </div>
          <span className="text-[10px] uppercase font-extrabold text-[#854036] bg-[#ffebe8] px-2 py-0.5 rounded">
            {data.progressText}
          </span>
        </div>

        <div className="w-full bg-[#e5e9e5] h-2.5 rounded-full overflow-hidden mb-2.5">
          <div
    className="bg-[#a3574c] h-full rounded-full transition-all duration-500"
    style={{ width: `${data.progressPercent}%` }}
  />
        </div>
        
        <p className="text-xs text-[#3e4945] font-medium leading-relaxed">
          {data.progressDesc}
        </p>
      </section>

      {
    /* 7-Day Chart Section drawing beautiful custom visual layout blocks echoing the screenshot */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest mb-4">7-DAY HISTORIC EARNINGS</h3>
        
        <div className="flex items-end justify-between h-36 gap-2 pt-2">
          {
    /* Monday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "35%" }} title="Monday: 45 PLN" />
            <span className="text-[9px] font-bold text-[#3e4945]">Mon</span>
          </div>
          
          {
    /* Tuesday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "65%" }} title="Tuesday: 92 PLN" />
            <span className="text-[9px] font-bold text-[#3e4945]">Tue</span>
          </div>
          
          {
    /* Wednesday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "50%" }} title="Wednesday: 70 PLN" />
            <span className="text-[9px] font-bold text-[#3e4945]">Wed</span>
          </div>
          
          {
    /* Thursday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "80%" }} title="Thursday: 115 PLN" />
            <span className="text-[9px] font-bold text-[#3e4945]">Thu</span>
          </div>
          
          {
    /* Friday (ACTIVE Selected Hottest!) */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#00604c] rounded-t-lg shadow-sm" style={{ height: "100%" }} title="Friday: 144 PLN (Hottest Day)" />
            <span className="text-[9px] font-extrabold text-[#00604c] underline">Fri</span>
          </div>
          
          {
    /* Saturday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "25%" }} title="Saturday: 30 PLN" />
            <span className="text-[9px] font-bold text-[#3e4945]">Sat</span>
          </div>
          
          {
    /* Sunday */
  }
          <div className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="w-full bg-[#e0e3e0] rounded-t-lg transition-all hover:bg-[#bec9c3]" style={{ height: "18%" }} title="Sunday: 22 PLN" />
            <span className="text-[9px] font-bold text-[#3e4945]">Sun</span>
          </div>
        </div>
      </section>

      {
    /* Payout Information Section */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-[#9ef3d7] rounded-full flex items-center justify-center text-[#005140]">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-[#181d1b]">AUTOMATED PAYOUT</h4>
            <p className="text-xs text-[#3e4945] font-medium">Next payout: Friday 16 May</p>
          </div>
        </div>
        <button className="bg-[#00604c] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#1f7a63] cursor-pointer shadow-sm active:scale-95 transition-transform">
          DETAILS
        </button>
      </section>

      {
    /* Min Guarantee Status Badge */
  }
      <div className="bg-[#00604c]/5 border border-[#00604c]/20 rounded-2xl p-4 flex gap-3 shadow-xs">
        <ShieldCheck className="w-5 h-5 text-[#00604c] flex-shrink-0" />
        <div className="space-y-0.5">
          <p className="font-bold text-sm text-[#00604c]">Min guarantee active</p>
          <p className="text-xs text-[#3e4945] leading-relaxed">
            You are earning a minimum of <span className="font-bold">32 PLN/hr guaranteed</span> for this active shift. Keep accepting assignments!
          </p>
        </div>
      </div>

      {
    /* Visual Anchor Poster: Courier on the road */
  }
      <div className="relative w-full h-40 rounded-2xl overflow-hidden shadow-sm grayscale hover:grayscale-0 transition-all duration-700">
        <img
    alt="Driver on bike delivering food"
    className="w-full h-full object-cover"
    src="https://images.unsplash.com/photo-1593950315186-76a92975b60c?auto=format&fit=crop&q=80&w=600"
  />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-white text-base font-extrabold tracking-wide">Keep it fresh</p>
          <p className="text-gray-200 text-xs mt-0.5">Your average delivery rating: 4.95 ★</p>
        </div>
      </div>
    </div>;
};
export {
  EarningsView
};
