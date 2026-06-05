import { useState } from "react";
import { IMAGES } from "../types";
export function OrdersScreen({ onGoBack, onTrackLive, onGoToProfile, onShowNotificationToast, tomorrowMeal }) {
    const [activeTab, setActiveTab] = useState("Upcoming");
    const handleDownloadReceipt = (mealName) => {
        onShowNotificationToast(`📄 Downloading VAT receipt PDF for ${mealName}...`);
    };
    const [ratedMeals, setRatedMeals] = useState([]);
    const handleRate = (mealName) => {
        if (ratedMeals.includes(mealName)) {
            onShowNotificationToast("You already submitted a rating for this meal!");
        }
        else {
            setRatedMeals([...ratedMeals, mealName]);
            onShowNotificationToast(`⭐ Rated 5 stars for ${mealName}. Thank you!`);
        }
    };
    return (<div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Header bar */}
      <header className="bg-white sticky top-0 z-40 flex justify-between items-center w-full px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <div className="flex items-center">
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
        </div>
        <h1 className="text-xl font-extrabold text-primary text-center">DailyMealBox</h1>
        <button onClick={onGoToProfile} className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]/50">
          <img alt="User profile" className="w-full h-full object-cover" src={IMAGES.profileAnnaSecondary}/>
        </button>
      </header>

      <main className="px-5 pt-6">
        <h2 className="text-[22px] font-extrabold text-on-surface mb-4">Orders</h2>

        {/* Segmented tabs */}
        <div className="flex border-b border-[#bec9c3] mb-6">
          <button onClick={() => setActiveTab("Upcoming")} className={`flex-grow py-3 text-center font-bold text-sm transition-colors ${activeTab === "Upcoming"
            ? "text-primary border-b-2 border-primary-container"
            : "text-on-surface-variant hover:text-on-surface"}`}>
            Upcoming
          </button>
          <button onClick={() => setActiveTab("Past")} className={`flex-grow py-3 text-center font-bold text-sm transition-colors ${activeTab === "Past"
            ? "text-primary border-b-2 border-primary-container"
            : "text-on-surface-variant hover:text-on-surface"}`}>
            Past
          </button>
        </div>

        {/* Tab views conditional rendering mapping screens */}
        {activeTab === "Upcoming" ? (<section className="space-y-4">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
              Upcoming Deliveries
            </h3>

            {/* Rosól Tomorrow's prep live card links tracking state */}
            <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-4 border border-[#e4e2e1]/30">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-sans">
                    TOMORROW · LUNCH 12:00
                  </p>
                  <h4 className="text-[18px] font-extrabold text-on-surface">
                    {tomorrowMeal.name}
                  </h4>
                  <div className="flex items-center gap-1.5 text-on-surface-variant text-[13px] font-medium">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person</span>
                    <span>Maria K.</span>
                  </div>
                </div>

                <span className="bg-primary-container text-white font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow-sm font-sans">
                  {tomorrowMeal.status}
                </span>
              </div>

              {/* Delivery status track live drawer elements */}
              <div className="flex items-center justify-between pt-3 border-t border-[#f0eded]">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-[20px]">local_shipping</span>
                  <span className="text-[13px] text-primary font-bold">In Preparation</span>
                </div>

                {tomorrowMeal.status === "Skipped" ? (<span className="text-[12px] text-brand-red font-semibold font-sans italic">
                    Delivery Skipped
                  </span>) : (<button onClick={onTrackLive} className="border border-primary-container text-primary hover:bg-[#e8f3f0] font-bold text-xs px-4 py-2 rounded-lg active:scale-95 transition-transform flex items-center gap-1 shadow-sm">
                    <span>Track Live</span>
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </button>)}
              </div>
            </div>

            {/* Upcoming meal 2 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/30">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-sans">
                    WED 14 MAY · LUNCH
                  </p>
                  <h4 className="text-base font-extrabold text-[#1b1c1c]">Pierogi ruskie</h4>
                  <div className="flex items-center gap-1.5 text-on-surface-variant text-[13px] font-medium">
                    <span className="material-symbols-outlined text-[16px]">person</span>
                    <span>Maria K.</span>
                  </div>
                </div>
                <span className="bg-primary-container text-white font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow-sm font-sans">
                  Scheduled
                </span>
              </div>
            </div>
          </section>) : (<section className="space-y-4">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
              Past Orders
            </h3>

            {/* Past Card 1 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/30">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider font-sans">
                    MON 12 MAY
                  </p>
                  <h4 className="text-base font-bold text-on-surface leading-tight">Żurek staropolski</h4>
                </div>
                <div className="flex items-center text-primary gap-1">
                  <span className="text-[12px] font-extrabold font-sans">Delivered</span>
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-5 pt-3 border-t border-[#f0eded]">
                <button onClick={() => handleDownloadReceipt("Żurek staropolski")} className="text-primary hover:text-primary-container font-semibold text-[13px] flex items-center gap-1 shadow-sm px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  <span>Receipt PDF</span>
                </button>
                <button onClick={() => handleRate("Żurek staropolski")} className={`font-semibold text-[13px] flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors ${ratedMeals.includes("Żurek staropolski") ? "text-primary font-bold" : "text-secondary hover:text-orange-600"}`}>
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                  <span>{ratedMeals.includes("Żurek staropolski") ? "Rated" : "Rate"}</span>
                </button>
              </div>
            </div>

            {/* Past Card 2 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/30">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider font-sans">
                    FRI 8 MAY
                  </p>
                  <h4 className="text-base font-bold text-on-surface leading-tight">Bigos domowy</h4>
                </div>
                <span className="bg-[#F59E0B] text-white font-bold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider shadow-sm font-sans">
                  Refunded
                </span>
              </div>

              <div className="mt-3 p-3 bg-secondary-container/10 border border-secondary-container/20 rounded-lg flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#855300] text-[18px]">info</span>
                <p className="text-[12px] text-[#684000] font-medium leading-tight">
                  Refund <span className="font-extrabold text-[#855300]">PLN 18</span> — Processing transaction
                </p>
              </div>
            </div>
          </section>)}
      </main>
    </div>);
}
