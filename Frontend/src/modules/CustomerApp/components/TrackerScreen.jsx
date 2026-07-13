import { useState, useEffect, useMemo } from "react";
import { IMAGES } from "../types";
import DeliveryTrackingMap from "@food/components/user/DeliveryTrackingMap";

export function TrackerScreen({ onGoBack, onShowNotificationToast, tomorrowMeal, trackedOrder, socket }) {
  const [arrivingMin, setArrivingMin] = useState(8);
  const [orderStatus, setOrderStatus] = useState(trackedOrder?.status || "preparing");

  const driverName = trackedOrder?.dispatch?.deliveryPartner?.name || "Jan W.";
  const driverPhoto = trackedOrder?.dispatch?.deliveryPartner?.profilePhoto;
  const driverVehicle = trackedOrder?.dispatch?.deliveryPartner?.vehicleType || "E-bike";
  const driverPhone = trackedOrder?.dispatch?.deliveryPartner?.phone || "";

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

  const restaurantCoords = useMemo(() => {
    const coords = trackedOrder?.vendor?.location?.coordinates || trackedOrder?.vendorId?.location?.coordinates || trackedOrder?.vendor?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      return { lat: Number(coords[1]), lng: Number(coords[0]) };
    }
    // Default fallback to Warsaw center coordinates
    return { lat: 52.2297, lng: 21.0122 };
  }, [trackedOrder]);

  const customerCoords = useMemo(() => {
    const coords = trackedOrder?.deliveryAddress?.location?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      return { lat: Number(coords[1]), lng: Number(coords[0]) };
    }
    return { lat: 52.235, lng: 21.018 };
  }, [trackedOrder]);

  const handleCall = () => {
    if (driverPhone) {
      onShowNotificationToast(`📞 Initiating secure telephone call to ${driverName} (${driverPhone})...`);
    } else {
      onShowNotificationToast(`📞 Initiating secure telephone call to ${driverName}...`);
    }
  };

  const handleChat = () => {
    onShowNotificationToast(`💬 Opening secure chat with ${driverName}...`);
  };

  return (
    <div className="relative w-full h-[844px] overflow-hidden bg-[#242f3e] shadow-2xl flex flex-col mx-auto rounded-[32px] border-4 border-on-surface">
      {/* Live tracking Google Map */}
      <div className="absolute inset-0 z-0">
        <DeliveryTrackingMap
          orderId={trackedOrder?._id}
          restaurantCoords={restaurantCoords}
          customerCoords={customerCoords}
          order={trackedOrder}
          onEtaUpdate={(eta) => {
            const minutes = parseInt(eta) || 8;
            setArrivingMin(minutes);
          }}
        />
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
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#e4e2e1] flex items-center justify-center font-bold text-gray-500">
                  {driverPhoto ? (
                    <img alt={`Driver ${driverName} portrait`} className="w-full h-full object-cover" src={driverPhoto} />
                  ) : (
                    driverName ? driverName.charAt(0).toUpperCase() : "D"
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-on-surface leading-tight">{driverName} · {driverVehicle}</span>
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
