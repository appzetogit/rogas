import { useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, CheckCircle2, Zap, Plus, Sparkles, ArrowLeft } from "lucide-react";
const MyShiftsView = ({
  initialShifts,
  stats,
  onGoBack,
  onUpdateStats
}) => {
  const [shifts, setShifts] = useState(initialShifts);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const calculateHoursLogged = (items) => {
    let hrs = 0;
    items.forEach((s) => {
      if (s.status === "done") {
        hrs += 6;
      } else if (s.status === "active") {
        hrs += 5.5;
      } else if (s.status === "scheduled") {
      }
    });
    return hrs + 21;
  };
  const handleCancelShift = (id) => {
    const updated = shifts.map((s) => {
      if (s.id === id) {
        return { ...s, status: "none", name: "No shift today", timeSlot: "", durationText: "" };
      }
      return s;
    });
    setShifts(updated);
    const newHrs = calculateHoursLogged(updated);
    onUpdateStats(newHrs);
  };
  const handleAddShift = (dayId) => {
    const updated = shifts.map((s) => {
      if (s.id === dayId || s.day === parseInt(dayId)) {
        return {
          ...s,
          status: "scheduled",
          name: "Afternoon Refresh",
          timeSlot: "12:00 - 18:00",
          durationText: "6h total"
        };
      }
      return s;
    });
    setShifts(updated);
    const newHrs = calculateHoursLogged(updated);
    onUpdateStats(newHrs);
    setShowAddMenu(false);
  };
  const handleFABAdd = () => {
    const emptyDay = shifts.find((s) => s.status === "none");
    if (emptyDay) {
      handleAddShift(emptyDay.id);
    }
  };
  const currentHrs = calculateHoursLogged(shifts);
  const completionRate = Math.min(100, Math.round(currentHrs / stats.hoursTarget * 100));
  return <div className="space-y-4 pb-20 animate-fadeIn text-gray-800">
      {
    /* Header Info */
  }
      <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-[#e0e3e0]">
        <button
    onClick={onGoBack}
    className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-1.5 text-[#00604c] font-bold text-xs"
  >
          <ArrowLeft className="w-4 h-4" />
          <span>Profile</span>
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-gray-900">Shift Planner</h2>
        </div>
        <div className="w-8 h-8" />
      </div>

      {
    /* Week Selector Banner */
  }
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900 px-1">My Shifts</h2>
        <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-[#e0e3e0] shadow-xs">
          <ChevronLeft className="w-5 h-5 text-[#5d5f5b] cursor-pointer hover:text-black" />
          <span className="font-bold text-sm text-[#3e4945]">Week of 12-18 May</span>
          <ChevronRight className="w-5 h-5 text-[#5d5f5b] cursor-pointer hover:text-black" />
        </div>
      </section>

      {
    /* Stats Card Row */
  }
      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-8 bg-white border border-[#e0e3e0] p-4 rounded-xl shadow-xs">
          <p className="text-[10px] uppercase font-bold text-[#5d5f5b] tracking-wider mb-1">Hours Logged</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[#00604c]">{currentHrs.toFixed(1)}</span>
            <span className="text-xs text-[#3e4945] font-semibold">/ {stats.hoursTarget}h target</span>
          </div>
        </div>
        
        <div className="col-span-4 bg-[#1f7a63] text-white p-4 rounded-xl flex flex-col justify-center items-center shadow-xs">
          <TrendingUp className="w-5 h-5 mb-1" />
          <p className="text-[10px] font-extrabold text-center tracking-wider">{completionRate}% Comp.</p>
        </div>
      </section>

      {
    /* Day Shifts Calendar list */
  }
      <div className="space-y-3">
        {shifts.map((shift) => <div key={shift.id}>
            {shift.status !== "none" ? <div
    className={`bg-white p-4 rounded-xl flex items-center justify-between transition-all border ${shift.status === "active" ? "border-[#ffb300] border-2 shadow-sm" : "border-[#e0e3e0]"}`}
  >
                <div className="flex gap-4 items-center">
                  <div className="flex flex-col items-center min-w-[44px]">
                    <span className="text-[10px] font-extrabold text-[#5d5f5b]">{shift.dayName}</span>
                    <span className="text-base font-black text-gray-900">{shift.day}</span>
                  </div>
                  
                  <div className="h-8 w-px bg-[#bec9c3]" />
                  
                  <div>
                    <p className="text-sm font-bold text-gray-900">{shift.name}</p>
                    <p className="text-xs text-[#5d5f5b]">{shift.timeSlot} • {shift.durationText}</p>
                  </div>
                </div>

                <div>
                  {shift.status === "done" && <div className="bg-[#e5e9e5] text-[#005140] px-3 py-1 rounded-full flex items-center gap-1 text-[11px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Done</span>
                    </div>}

                  {shift.status === "active" && <div className="bg-[#ffebe8] text-amber-600 px-3 py-1 rounded-full flex items-center gap-1 text-[11px] font-bold animate-pulse">
                      <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>Active</span>
                    </div>}

                  {shift.status === "scheduled" && <button
    onClick={() => handleCancelShift(shift.id)}
    className="border border-[#ba1a1a] text-[#ba1a1a] hover:bg-red-50 px-3.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all shadow-xs"
  >
                      Cancel
                    </button>}
                </div>
              </div> : (
    /* Shift is empty / None scheduled */
    <div className="bg-[#e3e3de]/30 border border-dashed border-[#bec9c3] rounded-xl p-4 flex items-center justify-between opacity-75 hover:opacity-100 transition-opacity">
                <div className="flex gap-4 items-center w-full">
                  <div className="flex flex-col items-center min-w-[44px]">
                    <span className="text-[10px] font-extrabold text-[#bec9c3]">{shift.dayName}</span>
                    <span className="text-base font-black text-gray-400">{shift.day}</span>
                  </div>
                  
                  <div className="h-8 w-px bg-[#bec9c3]/50" />
                  
                  <div className="flex-1 flex justify-between items-center pr-1">
                    <p className="text-xs italic font-medium text-gray-400">No shift scheduled</p>
                    <button
      onClick={() => handleAddShift(shift.id)}
      className="text-[#00604c] hover:scale-110 active:scale-95 transition-transform"
    >
                      <Plus className="w-6 h-6 stroke-[3]" />
                    </button>
                  </div>
                </div>
              </div>
  )}
          </div>)}
      </div>

      {
    /* Featured Resource Image Block: Shift Analytics */
  }
      <section className="bg-white border border-[#e0e3e0] rounded-2xl overflow-hidden relative h-48 block shadow-sm group cursor-pointer">
        <img
    alt="Schedule dashboard telemetry graphics"
    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90"
    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBDpIFzve6exfEGcFFL4QVArtxV2UzbNKfinICmwm1yigMg3JO9-0IMrdUSJRl5gptDLXz4tkwRuAstX_MAHwYA9-5U3H5P9-J3v2aOTwjY9Wrv8Vkx7lLaO8wZyKuqAarGYeajjC7MvLDd9JyF2TKJYUS-VA-8y0D5Z2Pg46theC7DqelqI1_rjAsNBn9YOw4ra2NOwsVZ_wAAaAHRrKSppCWcl6n5k5FW6mVSwrA7tCCj9wA7f62H5kpIdoA8iv3FH5i4w2N7zM7w"
  />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-4">
          <h3 className="text-white font-extrabold text-[#9ef3d7] text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-[#9ef3d7]" /> Shift Analytics</h3>
          <p className="text-gray-200 text-[11px] font-medium leading-normal mt-0.5">Review average earnings, active run completion speeds, and delivery streak payouts.</p>
        </div>
      </section>

      {
    /* Floating Action Button (FAB) strictly matching the mockup addition specs */
  }
      <button
    onClick={handleFABAdd}
    className="fixed right-6 bottom-20 bg-[#00604c] text-white h-14 w-14 rounded-full shadow-lg hover:bg-[#1f7a63] flex items-center justify-center active:scale-90 transition-transform z-40"
  >
        <Plus className="w-7 h-7 stroke-[3]" />
      </button>
    </div>;
};
export {
  MyShiftsView
};
