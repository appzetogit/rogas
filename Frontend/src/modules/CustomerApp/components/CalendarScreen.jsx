import { useState } from "react";
import { IMAGES } from "../types";
export function CalendarScreen({ onGoBack, onGoToProfile, onShowToast }) {
    const [selectedDay, setSelectedDay] = useState(12); // Mon 12 default
    // Setup the list of scheduled meals for this week (Monday 12th to Sunday 18th)
    const [meals, setMeals] = useState([
        { day: "Mon", dayNum: 12, name: "Rosol", status: "Scheduled" },
        { day: "Tue", dayNum: 13, name: "Pierogi", status: "Scheduled" },
        { day: "Wed", dayNum: 14, name: "Bigos", status: "Locked", isLocked: true },
        { day: "Thu", dayNum: 15, name: "Zurek", status: "Skipped" },
        { day: "Fri", dayNum: 16, name: "Grochowka", status: "Scheduled" },
        { day: "Sat", dayNum: 17, name: "Lazy Lasagna", status: "Scheduled" },
        { day: "Sun", dayNum: 18, name: "Chef's Salad Duo", status: "Scheduled" }
    ]);
    const daysOfWeek = [
        { label: "M", num: 12 },
        { label: "T", num: 13 },
        { label: "W", num: 14 },
        { label: "T", num: 15 },
        { label: "F", num: 16 },
        { label: "S", num: 17 },
        { label: "S", num: 18 }
    ];
    const toggleSkip = (dayNum) => {
        setMeals(meals.map((m) => {
            if (m.dayNum === dayNum) {
                const isScheduled = m.status === "Scheduled";
                onShowToast(isScheduled ? `${m.name} meal marked as skipped` : `${m.name} meal restored`);
                return {
                    ...m,
                    status: isScheduled ? "Skipped" : "Scheduled"
                };
            }
            return m;
        }));
    };
    const showLockedMessage = () => {
        onShowToast("🔒 This order is locked because it is less than 48 hours away.");
    };
    return (<div className="bg-[#F5F5F0] text-on-surface min-h-[880px] pb-32">
      {/* Top App Bar */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
        </div>
        <h1 className="text-xl font-extrabold text-primary">Calendar</h1>
        <button onClick={onGoToProfile} className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]/50 hover:scale-105 transition-transform">
          <img alt="Man thumbnail profile secondary mockup matches" className="w-full h-full object-cover" src={IMAGES.profileManIndex}/>
        </button>
      </header>

      <main className="pt-20 px-5 space-y-6">
        {/* Horizontal strip */}
        <section>
          <div className="flex justify-between items-center bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/30">
            {daysOfWeek.map((d) => (<button key={d.num} onClick={() => setSelectedDay(d.num)} className="flex flex-col items-center gap-1.5 focus:outline-none focus:scale-105 transition-all duration-200">
                <span className="text-[12px] font-bold text-on-surface-variant leading-none">{d.label}</span>
                <div className={`w-9 h-9 flex items-center justify-center rounded-full text-[14px] font-bold transition-all ${selectedDay === d.num
                ? "bg-primary-container text-white shadow-md scale-110"
                : "text-on-surface hover:bg-[#f6f3f2]"}`}>
                  {d.num}
                </div>
              </button>))}
          </div>
        </section>

        {/* Selected date heading */}
        <section className="flex justify-between items-center">
          <h2 className="text-[20px] font-extrabold text-on-surface">
            {selectedDay === 12
            ? "Monday 12 May"
            : selectedDay === 13
                ? "Tuesday 13 May"
                : selectedDay === 14
                    ? "Wednesday 14 May"
                    : selectedDay === 15
                        ? "Thursday 15 May"
                        : selectedDay === 16
                            ? "Friday 16 May"
                            : selectedDay === 17
                                ? "Saturday 17 May"
                                : "Sunday 18 May"}
          </h2>
          <span className="text-xs font-bold text-on-surface-variant font-sans tracking-wide">
            WEEKLY OVERVIEW
          </span>
        </section>

        {/* Meal planner rows matching images */}
        <section className="flex flex-col gap-4">
          {meals.map((m) => {
            const isSelected = selectedDay === m.dayNum;
            return (<div key={m.dayNum} className={`bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border-l-4 transition-all duration-300 ${isSelected ? "scale-[1.01] shadow-md" : ""} ${m.status === "Locked"
                    ? "border-amber-500"
                    : m.status === "Skipped"
                        ? "border-brand-red opacity-85"
                        : "border-primary-container"}`}>
                <div className="flex items-center gap-4">
                  <div className="text-center w-8 select-none">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant font-sans">
                      {m.day}
                    </span>
                    <span className={`text-[15px] font-bold ${isSelected ? "text-primary font-extrabold" : "text-[#1b1c1c]"}`}>
                      {m.dayNum}
                    </span>
                  </div>

                  <div>
                    <h3 className={`text-base font-bold text-on-surface leading-snug ${m.status === "Skipped" ? "line-through opacity-50" : ""}`}>
                      {m.name}
                    </h3>
                    
                    {m.status === "Locked" ? (<div className="flex items-center gap-1 text-brand-amber text-xs font-bold font-sans mt-0.5" onClick={showLockedMessage}>
                        <span className="material-symbols-outlined text-[14px]">lock</span>
                        <p>Locked</p>
                      </div>) : m.status === "Skipped" ? (<p className="text-brand-red text-xs font-bold font-sans mt-0.5">Skipped</p>) : (<p className="text-primary text-xs font-bold font-sans mt-0.5">Scheduled</p>)}
                  </div>
                </div>

                {m.status === "Locked" ? (<button onClick={showLockedMessage} className="p-1.5 rounded-full hover:bg-amber-50 text-brand-amber transition-colors flex items-center justify-center cursor-pointer">
                    <span className="material-symbols-outlined text-[20px]">info</span>
                  </button>) : m.status === "Skipped" ? (<button onClick={() => toggleSkip(m.dayNum)} className="px-5 py-1.5 rounded-full bg-brand-amber text-black hover:bg-amber-400 font-extrabold text-[12px] active:scale-95 transition-all shadow-sm">
                    Undo
                  </button>) : (<button onClick={() => toggleSkip(m.dayNum)} className="px-4 py-1.5 rounded-full border border-primary-container text-primary hover:bg-[#e8f3f0] font-extrabold text-[12px] active:scale-95 transition-all">
                    Skip
                  </button>)}
              </div>);
        })}
        </section>

        {/* Tip block */}
        <section className="bg-primary/5 p-4 rounded-xl border border-primary-container/20">
          <p className="text-[12px] text-primary-container font-semibold font-sans leading-relaxed">
            💡 <strong>Pro-Tip:</strong> Locked meals are already cooked by our neighborhood chefs. You can skip any future delivery up to 48 hours in advance!
          </p>
        </section>
      </main>
    </div>);
}
