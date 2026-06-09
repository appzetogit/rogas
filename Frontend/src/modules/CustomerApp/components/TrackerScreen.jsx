import { useState, useEffect } from "react";
import { IMAGES } from "../types";

export function TrackerScreen({ onGoBack, onShowNotificationToast, tomorrowMeal, trackedOrder, socket }) {
  const [driverX, setDriverX] = useState(250);
  const [driverY, setDriverY] = useState(300);
  const [arrivingMin, setArrivingMin] = useState(8);
  const [orderStatus, setOrderStatus] = useState(trackedOrder?.status || "preparing");

  // Subscribe to real-time status updates via Socket
  useEffect(() => {
    if (!socket || !trackedOrder?._id) return;
    
    // Join room for this specific order to get updates
    socket.emit("join_room", `order_tracking_${trackedOrder._id}`);

    const handleStatusUpdate = (data) => {
      if (String(data.orderId) === String(trackedOrder._id) || String(data._id) === String(trackedOrder._id)) {
        if (data.status) {
          setOrderStatus(data.status);
          if (data.status === "delivered") {
            onShowNotificationToast?.("🎉 Order has been delivered!");
          }
        }
      }
    };

    socket.on("order_status_changed", handleStatusUpdate);
    socket.on("order_status_updated", handleStatusUpdate);

    return () => {
      socket.off("order_status_changed", handleStatusUpdate);
      socket.off("order_status_updated", handleStatusUpdate);
    };
  }, [socket, trackedOrder?._id, onShowNotificationToast]);

  // Animate the driver icon along the track line
  useEffect(() => {
    if (orderStatus === "delivered") {
      setDriverX(120);
      setDriverY(700);
      setArrivingMin(0);
      return;
    }
    
    let step = 0;
    const interval = setInterval(() => {
      step += 0.05;
      // Interpolate along the path: start at top-right, move towards bottom-left destination (x: 120, y: 700)
      const startX = 280;
      const startY = 180;
      const endX = 120;
      const endY = 700;
      const currentX = startX + (endX - startX) * Math.sin(step % (Math.PI / 2));
      const currentY = startY + (endY - startY) * Math.sin(step % (Math.PI / 2));
      setDriverX(Math.round(currentX));
      setDriverY(Math.round(currentY));
      // countdown arrival min
      setArrivingMin((prev) => {
        if (prev <= 1)
          return 8; // reset loop for demo
        return Math.round(8 - (step % 2) * 5) || 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [orderStatus]);

  const handleCall = () => {
    onShowNotificationToast("📞 Initiating secure telephone call to Jan W. (E-bike driver)...");
  };

  const handleChat = () => {
    onShowNotificationToast("💬 Opening secure chat with Jan W.: 'Hello, I'll be downstairs in 5 mins!'");
  };

  return (
    <div className="relative w-full h-[844px] overflow-hidden bg-[#242f3e] shadow-2xl flex flex-col mx-auto rounded-[32px] border-4 border-on-surface">
      {/* Warsaw Night style map overlay layout */}
      <div className="absolute inset-0 z-0">
        <img alt="Warsaw map digital night traces" className="w-full h-full object-cover opacity-60 grayscale contrast-125 saturate-50" src={IMAGES.warsawMapGISDark} />

        {/* SVG Navigation pathway tracer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 390 844" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Path Line emerald glowing */}
          <path d="M120 700C120 700 150 600 200 550C250 500 280 400 280 300L320 180" stroke="#1F7A63" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" className="opacity-75" />
          <path d="M120 700C120 700 150 600 200 550C250 500 280 400 280 300L320 180" stroke="#82d6bb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {/* Home target indicator */}
          <circle cx="120" cy="700" r="10" fill="#ffffff" stroke="#1F7A63" strokeWidth="4" />
          <circle cx="120" cy="700" r="4" fill="#1f7a63" />
        </svg>

        {/* Dynamic biking driver dot marker with pulsating ripple loops */}
        <div className="absolute flex items-center justify-center transition-all duration-1000 ease-out" style={{ left: `${driverX}px`, top: `${driverY}px`, transform: "translate(-50%, -50%)" }}>
          <div className="relative flex items-center justify-center">
            {/* Pulsing radar triggers */}
            <div className="absolute w-12 h-12 bg-primary-container rounded-full animate-ping opacity-60"></div>
            <div className="absolute w-8 h-8 bg-[#82d6bb]/50 rounded-full animate-pulse"></div>

            {/* Bike dot */}
            <div className="w-10 h-10 bg-primary-container rounded-full border-4 border-white flex items-center justify-center shadow-lg relative z-10">
              <span className="material-symbols-outlined text-white text-[20px] font-fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                directions_bike
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Floating App Bar */}
      <header className="relative z-40 px-5 pt-3">
        <div className="flex items-center justify-between h-14 w-full">
          <button onClick={onGoBack} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform text-[#1b1c1c]">
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>

          <div className="flex-1 px-4">
            <div className="bg-white rounded-2xl p-3 flex items-center justify-between shadow-lg border border-[#bec9c3]/20">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#e4e2e1]">
                  <img alt="Driver Jan portrait" className="w-full h-full object-cover" src={IMAGES.driverMaleApproachable} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-on-surface leading-tight">Jan W. · E-bike</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <span className="material-symbols-outlined text-[13px] text-secondary font-fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>
                      star
                    </span>
                    <span className="text-[11px] font-extrabold text-on-surface-variant">4.9</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="bg-primary-container px-2 py-0.5 rounded-full mb-0.5">
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                    {orderStatus === "delivered" ? "DONE" : "12:47"}
                  </span>
                </div>
                <span className="text-[10px] font-extrabold text-on-surface-variant">
                  {orderStatus === "delivered" ? "Delivered" : `~${arrivingMin} min away`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Bottom sliding delivery tracker sheet */}
      <div className="mt-auto relative z-40">
        <div className="bg-white rounded-t-[28px] shadow-[0_-4px_24px_rgba(0,0,0,0.15)] p-5 pb-8">
          {/* Drag bar handle placeholder */}
          <div className="w-10 h-1.5 bg-[#e4e2e1] rounded-full mx-auto mb-6 opacity-60"></div>

          {orderStatus === "delivered" ? (
            <>
              <div className="flex items-center justify-between mb-5">
                <div className="flex flex-col">
                  <h2 className="text-lg font-extrabold text-[#00604c] tracking-tight">🎉 Order Delivered!</h2>
                  <span className="text-xs text-on-surface-variant font-semibold mt-0.5">
                    Your meal has been successfully delivered. Enjoy!
                  </span>
                </div>
                <div className="w-11 h-11 bg-green-100 rounded-full flex items-center justify-center text-[#00604c] shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">check_circle</span>
                </div>
              </div>

              {/* Success display */}
              <div className="bg-green-50 rounded-2xl p-5 flex flex-col items-center justify-center mb-6 border border-green-200 shadow-inner">
                <span className="text-2xl mb-1">✅</span>
                <span className="text-base font-extrabold text-[#00604c] font-sans">
                  Delivered Successfully
                </span>
                <span className="text-[11px] text-gray-500 font-bold font-sans mt-1 leading-none">
                  Thank you for ordering with Rogas!
                </span>
              </div>

              <div className="flex gap-3">
                <button onClick={onGoBack} className="w-full h-12 bg-[#00604c] hover:bg-[#155a49] rounded-xl flex items-center justify-center gap-2 text-white font-bold text-xs active:scale-[0.98] transition-transform shadow">
                  <span>Back to Orders</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div className="flex flex-col">
                  <h2 className="text-lg font-extrabold text-on-surface tracking-tight">🚴 Driver on the way!</h2>
                  <span className="text-xs text-on-surface-variant font-semibold mt-0.5">
                    {tomorrowMeal?.name || "Meal"} by Maria K.
                  </span>
                </div>
                <div className="w-11 h-11 bg-primary/10 rounded-full flex items-center justify-center text-primary shadow-sm hover:scale-105 active:scale-95 transition-all">
                  <span className="material-symbols-outlined text-[24px]">notifications_active</span>
                </div>
              </div>

              {/* Core delivery pin display parameters */}
              <div className="bg-[#f6f3f2] rounded-2xl p-5 flex flex-col items-center justify-center mb-6 border border-[#bec9c3]/30 shadow-inner">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider font-sans mb-1">
                  Your delivery PIN
                </span>
                <div className="flex gap-2">
                  <span className="text-[32px] font-extrabold tracking-[0.3em] pl-2 text-primary font-mono select-all">
                    {trackedOrder?.deliveryPin || trackedOrder?.pin || "7234"}
                  </span>
                </div>
                <span className="text-[11px] text-[#6e7a74] font-bold font-sans mt-2 leading-none">
                  Share this PIN with your driver upon arrival
                </span>
              </div>

              <div className="flex gap-3">
                <button onClick={handleCall} className="flex-1 h-12 bg-primary-container hover:bg-[#155a49] rounded-xl flex items-center justify-center gap-2 text-white font-bold text-xs active:scale-[0.98] transition-transform shadow">
                  <span className="material-symbols-outlined text-sm font-fill-1" style={{ fontVariationSettings: "'FILL' 1" }}>call</span>
                  <span>Call Driver</span>
                </button>
                <button onClick={handleChat} className="w-12 h-12 bg-[#eae7e7] hover:bg-[#dcd9d9] text-[#1b1c1c] rounded-xl flex items-center justify-center active:scale-[0.95] transition-all shadow-sm" aria-label="chat driver">
                  <span className="material-symbols-outlined text-lg">chat</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
