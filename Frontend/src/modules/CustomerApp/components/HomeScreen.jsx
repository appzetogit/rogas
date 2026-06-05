import { useState } from "react";
import { IMAGES } from "../types";
export function HomeScreen({ onGoToPlans, onGoToCalendar, onGoToOrders, onGoToProfile, onShowNotificationToast, tomorrowMeal, setTomorrowMeal, points }) {
    const [showBanner, setShowBanner] = useState(true);
    const [showPointsHist, setShowPointsHist] = useState(false);
    const handleSkip = () => {
        if (tomorrowMeal.status === "Skipped") {
            setTomorrowMeal({ ...tomorrowMeal, status: "Scheduled" });
            onShowNotificationToast("Delivery scheduled again!");
        }
        else {
            setTomorrowMeal({ ...tomorrowMeal, status: "Skipped" });
            onShowNotificationToast("Tomorrow's delivery skipped successfully.");
        }
    };
    const handlePause = () => {
        if (tomorrowMeal.status === "Processing") {
            // Toggle back
            setTomorrowMeal({ ...tomorrowMeal, status: "Scheduled" });
            onShowNotificationToast("Subscription delivery unpaused.");
        }
        else {
            setTomorrowMeal({ ...tomorrowMeal, status: "Processing" });
            onShowNotificationToast("Tomorrow's delivery paused.");
        }
    };
    const handleSwapAlternative = (newMeal) => {
        setTomorrowMeal({ ...tomorrowMeal, name: newMeal });
        onShowNotificationToast(`Meal swapped to ${newMeal}!`);
    };
    const alternatives = ["Pierogi ruskie", "Żurek staropolski", "Zupa Pomidorowa", "Keto Bowl"];
    return (<div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
      {/* Top Header */}
      <header className="bg-primary px-5 pt-12 pb-8 rounded-b-[32px] shadow-md relative z-10 text-white">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <h1 className="text-[22px] font-extrabold tracking-tight">Good morning, Anna 👋</h1>
            <p className="text-[14px] opacity-90 font-medium">Next delivery tomorrow, 12:00–13:00</p>
          </div>
          <button onClick={onGoToProfile} className="w-12 h-12 rounded-full border-2 border-[#9ef3d7] overflow-hidden hover:scale-105 active:scale-95 transition-transform shadow">
            <img alt="User profile Anna" className="w-full h-full object-cover" src={IMAGES.profileAnnaMain}/>
          </button>
        </div>
      </header>

      <main className="px-5 -mt-5 space-y-6 relative z-20">
        {/* Banner */}
        {showBanner && (<div className="bg-[#F59E0B] text-white p-4 rounded-xl flex justify-between items-center shadow-lg animate-pulse-subtle">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <p className="text-[13px] font-bold">New feature: AI Picks now available in Plans tab!</p>
            </div>
            <button onClick={() => setShowBanner(false)} className="p-1 hover:bg-black/10 rounded-full transition-colors flex items-center justify-center cursor-pointer">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>)}

        {/* Tomorrow's delivery primary card */}
        <section className="bg-white rounded-2xl p-5 border-l-4 border-primary-container shadow-md transition-all duration-300">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🚚</span>
            <h2 className="text-[18px] font-extrabold text-on-surface">Tomorrow's Delivery</h2>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-on-surface leading-snug">{tomorrowMeal.name}</h3>
              <p className="text-[13px] text-on-surface-variant font-medium">by Maria K. · Mokotów</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider ${tomorrowMeal.status === "Scheduled"
            ? "bg-[#E8F3F0] text-primary"
            : tomorrowMeal.status === "Skipped"
                ? "bg-red-100 text-brand-red"
                : "bg-amber-100 text-brand-amber"}`}>
              {tomorrowMeal.status === "Scheduled"
            ? "Scheduled"
            : tomorrowMeal.status === "Skipped"
                ? "Skipped"
                : "Paused"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={handleSkip} className={`border border-[#6e7a74] font-bold text-[13px] py-2 rounded-full transition-colors focus:ring-2 focus:ring-primary/20 ${tomorrowMeal.status === "Skipped"
            ? "bg-red-50 text-brand-red border-red-200"
            : "text-on-surface hover:bg-[#f6f3f2]"}`}>
              {tomorrowMeal.status === "Skipped" ? "Undo Skip" : "Skip"}
            </button>
            <button onClick={handlePause} className={`border border-[#6e7a74] font-bold text-[13px] py-2 rounded-full transition-colors focus:ring-2 focus:ring-primary/20 ${tomorrowMeal.status === "Processing"
            ? "bg-amber-50 text-brand-amber border-amber-200"
            : "text-on-surface hover:bg-[#f6f3f2]"}`}>
              {tomorrowMeal.status === "Processing" ? "Resume" : "Pause"}
            </button>
            <div className="relative group/change">
              <button className="w-full border border-[#6e7a74] text-on-surface font-bold text-[13px] py-2 rounded-full hover:bg-[#f6f3f2] transition-colors">
                Change
              </button>
              {/* Change meal options popover dropdown */}
              <div className="absolute bottom-11 right-0 hidden group-hover/change:block bg-white border border-[#bec9c3]/50 rounded-xl shadow-2xl p-2 w-48 z-30">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider p-1 border-b border-[#f0eded]">
                  Choose Alternative
                </p>
                <div className="space-y-1 mt-1">
                  {alternatives.map((alt) => (<button key={alt} onClick={() => handleSwapAlternative(alt)} className="w-full text-left font-semibold text-[12px] p-2 hover:bg-primary/5 rounded-md text-on-surface transition-colors">
                      {alt}
                    </button>))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Loyalty Points Widget */}
        <section className="bg-white rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xl">⭐</span>
              <span className="text-[18px] font-extrabold text-on-surface">{points} points</span>
            </div>
            <button onClick={() => setShowPointsHist(!showPointsHist)} className="text-primary-container hover:text-primary font-bold text-[13px]">
              {showPointsHist ? "Close" : "History"}
            </button>
          </div>

          {showPointsHist ? (<div className="bg-[#f6f3f2] p-3 rounded-lg space-y-2 text-[12px] font-medium border border-[#e4e2e1]">
              <div className="flex justify-between">
                <span>Welcome Bonus</span>
                <span className="text-primary font-bold">+200 pts</span>
              </div>
              <div className="flex justify-between">
                <span>Healthy Weekly Box (May 12)</span>
                <span className="text-primary font-bold">+10 pts</span>
              </div>
              <div className="flex justify-between">
                <span>Profile setup complete</span>
                <span className="text-primary font-bold">+30 pts</span>
              </div>
            </div>) : (<>
              <div className="w-full bg-[#eae7e7] h-2.5 rounded-full overflow-hidden">
                <div className="bg-primary-container h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${(points / 300) * 105}%` }}></div>
              </div>
              <p className="text-[12px] text-on-surface-variant font-medium">
                10 pts per delivery · Redeem for discounts
              </p>
            </>)}
        </section>

        {/* Tomorrow's menu preview */}
        <section onClick={onGoToPlans} className="bg-white rounded-2xl p-5 shadow-sm overflow-hidden group cursor-pointer transition-all hover:shadow-md">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[18px] font-extrabold text-on-surface">Tomorrow's Menu Preview 🍽</h2>
            <span className="material-symbols-outlined text-[#3e4945] group-hover:translate-x-1 transition-transform">
              chevron_right
            </span>
          </div>

          <div className="relative rounded-xl overflow-hidden h-40 mb-3 shadow">
            <img alt="Rosol Soup gourmet look" className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500" src={IMAGES.soupRosol}/>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
            <div className="absolute bottom-3 left-4">
              <p className="text-white text-base font-bold">Rosół Staropolski</p>
              <p className="text-white/80 text-[11px] font-medium">Fine polish noodles, sliced chicken, organic carrot slices</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 bg-[#f6f3f2] px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[16px] text-primary">local_fire_department</span>
              <span className="text-[12px] font-semibold text-[#3e4945]">450 kcal</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#f6f3f2] px-3 py-1 rounded-full">
              <span className="material-symbols-outlined text-[16px] text-primary">timer</span>
              <span className="text-[12px] font-semibold text-[#3e4945]">5 min prep</span>
            </div>
          </div>
        </section>

        {/* spacer */}
        <div className="h-8"></div>
      </main>
    </div>);
}
