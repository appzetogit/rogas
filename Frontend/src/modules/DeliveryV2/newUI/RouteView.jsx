import { useState } from "react";
import { ArrowRight, ChevronRight, Check } from "lucide-react";
const RouteView = ({
  stops,
  onAcceptRoute,
  isAccepted,
  onNextStep,
  activeOrder
}) => {
  const [sliderPosition, setSliderPosition] = useState(0);
  const [justAccepted, setJustAccepted] = useState(isAccepted);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const maxDrag = 220;
  const handleTouchStart = (e) => {
    if (justAccepted || isAccepted) return;
    setDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    setStartX(clientX);
  };
  const handleTouchMove = (e) => {
    if (!dragging) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const diff = clientX - startX;
    const pos = Math.max(0, Math.min(diff, maxDrag));
    setSliderPosition(pos);
  };
  const handleTouchEnd = () => {
    if (!dragging) return;
    setDragging(false);
    if (sliderPosition >= maxDrag * 0.85) {
      setSliderPosition(maxDrag);
      setJustAccepted(true);
      onAcceptRoute();
    } else {
      setSliderPosition(0);
    }
  };
  return <div className="space-y-4 pb-12 animate-fadeIn">
      {
    /* Bento-like Dashboard Summary Stats */
  }
      <div className="grid grid-cols-2 gap-3">
        {
    /* TOTAL LOAD */
  }
        <div className="bg-white border border-[#e0e3e0] rounded-2xl p-4 flex flex-col justify-between h-32 shadow-sm">
          <span className="text-[#3e4945] font-bold text-xs uppercase tracking-wider">TOTAL LOAD</span>
          <div>
            <span className="text-3xl font-extrabold text-[#00604c]">22</span>
            <span className="text-sm font-medium text-[#3e4945] ml-1">Boxes</span>
          </div>
        </div>

        {
    /* STOPS and EST TIME Column Grid */
  }
        <div className="grid grid-rows-2 gap-3">
          <div className="bg-white border border-[#e0e3e0] rounded-xl px-4 py-2 flex items-center justify-between shadow-sm">
            <span className="text-xs font-bold text-[#3e4945] uppercase tracking-wider">STOPS</span>
            <span className="font-extrabold text-lg text-gray-900">11</span>
          </div>
          <div className="bg-white border border-[#e0e3e0] rounded-xl px-4 py-2 flex items-center justify-between shadow-sm">
            <span className="text-xs font-bold text-[#3e4945] uppercase tracking-wider">EST. TIME</span>
            <span className="font-extrabold text-lg text-[#00604c]">2h 14m</span>
          </div>
        </div>
      </div>

      {
    /* Current Stop Highlight Card */
  }
      <div className="bg-white border border-[#e0e3e0] rounded-2xl p-0 overflow-hidden custom-shadow">
        <div className="h-2 bg-[#00604c] w-full" />
        <div className="p-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="bg-[#00604c]/10 text-[#00604c] px-2 py-0.5 rounded-lg text-[10px] font-bold border border-[#00604c]/20">
                  CURRENT STOP
                </span>
                <span className="bg-[#00604c] text-white px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                  {isAccepted ? "ACTIVE" : "READY"}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Maria's Kitchen</h2>
              <p className="text-xs text-[#5d5f5b] mt-0.5">882 West 12th St, Suite 400</p>
            </div>
            
            <div className="w-11 h-11 bg-[#1f7a63] text-white rounded-full flex items-center justify-center font-bold text-base shadow-sm">
              P
            </div>
          </div>

          {
    /* Map Preview Placeholder Block */
  }
          <div className="w-full h-32 rounded-xl bg-gray-200 overflow-hidden mb-4 relative border border-gray-100">
            <img
    alt="Street map routing overview"
    className="w-full h-full object-cover grayscale opacity-85"
    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBFm1z0cbR-ro9wKCDpsH-rTQEMEvlGTuFF_BrTJyJ1vmPINaDOpNQIQihBzUifn80AYEyCHxwrVs8mS6KLosE-UDl2l-Gv5swaLKKvnvMRupEUCC8DlTTBJ5CFd1ysVjdPjOlNcja4KWSnWqkw_EBf-Xm98mJq_7vrenDvZoMAIBgHR7uD6vutPIZg3XA0hkTdCnXZNPekeI3s049OdjI7fkhcVIwJ-SC5gTtmo2oS2QGxRUsIL8BXhGUNK-4bOLGehKu9X2nITAAq"
    referrerPolicy="no-referrer"
  />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
              ETA 4 mins • 1.2 miles away
            </div>
          </div>

          {
    /* Accept Slide Gesture vs Next Target */
  }
          {!isAccepted && !justAccepted ? <div
    className="relative h-[52px] bg-[#e0e3e0] rounded-xl flex items-center justify-center select-none overflow-hidden touch-none border border-gray-300"
    onMouseMove={handleTouchMove}
    onTouchMove={handleTouchMove}
    onMouseUp={handleTouchEnd}
    onTouchEnd={handleTouchEnd}
    onMouseLeave={handleTouchEnd}
  >
              {
    /* Green Progress Backdrop */
  }
              <div
    className="absolute left-0 top-0 bottom-0 bg-[#00604c]/15 transition-all"
    style={{ width: `${sliderPosition / maxDrag * 100}%` }}
  />

              <span
    className="text-xs uppercase font-extrabold tracking-wider transition-opacity select-none"
    style={{ opacity: 1 - sliderPosition / maxDrag, color: "#3e4945" }}
  >
                Slide to Accept Route
              </span>

              {
    /* Slider Handle */
  }
              <div
    onMouseDown={handleTouchStart}
    onTouchStart={handleTouchStart}
    className="absolute left-1 w-11 h-11 bg-[#00604c] text-white rounded-lg flex items-center justify-center cursor-ew-resize hover:bg-[#1f7a63] transition-transform active:scale-95 shadow-md flex-shrink-0 z-10"
    style={{ transform: `translateX(${sliderPosition}px)` }}
  >
                <ChevronRight className="w-6 h-6 stroke-[3]" />
              </div>
            </div> : <button
    onClick={onNextStep}
    className="w-full h-[52px] bg-[#00604c] text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[#1f7a63] shadow-md shadow-[#00604c]/10"
  >
              {isAccepted && justAccepted ? <>
                  ACCEPTED <Check className="w-5 h-5 stroke-[3]" />
                </> : <>
                  START CURRENT STEP <ArrowRight className="w-5 h-5" />
                </>}
            </button>}
        </div>
      </div>

      {
    /* Upcoming Stops List */
  }
      <div>
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 mb-3">UPCOMING STOPS</h3>
        <div className="space-y-3">
          {stops.slice(1).map((stop, index) => <div
    key={stop.id}
    className="bg-white border border-[#e0e3e0] rounded-xl p-4 flex items-center justify-between shadow-xs hover:border-[#bec9c3] cursor-pointer transition-colors"
  >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${stop.type === "P" ? "bg-[#9ef3d7] text-[#005140]" : "bg-[#e0e0db] text-[#5d5f5b]"}`}>
                  {stop.type}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900 text-sm">{stop.name}</h4>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wide uppercase ${stop.status === "WAITING" ? "bg-[#ffdad5] text-[#ba1a1a]" : "bg-gray-100 text-gray-600"}`}>
                      {stop.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#3e4945] mt-0.5">{stop.address}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#bec9c3]" />
            </div>)}
        </div>
      </div>
    </div>;
};
export {
  RouteView
};
