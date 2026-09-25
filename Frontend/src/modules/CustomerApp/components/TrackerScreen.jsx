import { useState, useEffect, useMemo } from "react";
import DeliveryTrackingMap from "@food/components/user/DeliveryTrackingMap";
import { ArrowLeft, Star, CheckCircle, BellRing, Phone, MessageSquare } from 'lucide-react';
import { useTranslation } from "react-i18next";

export function TrackerScreen({ onGoBack, onShowNotificationToast, tomorrowMeal, trackedOrder, socket }) {
  const { t } = useTranslation("customer");
  const [arrivingMin, setArrivingMin] = useState(8);
  const [orderStatus, setOrderStatus] = useState(trackedOrder?.status || "preparing");

  const driverName = trackedOrder?.dispatch?.deliveryPartner?.name || "Jan W.";
  const driverPhoto = trackedOrder?.dispatch?.deliveryPartner?.profilePhoto;
  const driverVehicle = trackedOrder?.dispatch?.deliveryPartner?.vehicleType || "E-bike";
  const driverPhone = trackedOrder?.dispatch?.deliveryPartner?.phone || "";

  // Subscribe to real-time status updates via Socket
  useEffect(() => {
    if (!socket || !trackedOrder?._id) return;
    
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
      onShowNotificationToast(t("📞 Initiating secure telephone call to {{driverName}} ({{driverPhone}})...", { driverName, driverPhone }));
    } else {
      onShowNotificationToast(t("📞 Initiating secure telephone call to {{driverName}}...", { driverName }));
    }
  };

  const handleChat = () => {
    onShowNotificationToast(t("💬 Opening secure chat with {{driverName}}...", { driverName }));
  };

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-screen pb-32 font-sans relative">
      {/* Fixed Top Header */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button 
          onClick={onGoBack} 
          className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">{t("Live Order Tracking")}</h1>
        <div className="w-8" />
      </header>

      <main className="pt-20 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto space-y-6">
        {/* Driver & Status Top Bar */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#e4e2e1] flex items-center justify-center font-bold text-slate-500 border border-slate-200">
              {driverPhoto ? (
                <img alt={t("Driver {{driverName}}", { driverName })} className="w-full h-full object-cover" src={driverPhoto} />
              ) : (
                driverName ? driverName.charAt(0).toUpperCase() : "D"
              )}
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight">{driverName} · {driverVehicle}</h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="text-xs font-bold text-slate-600">{t("4.9 Rating")}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block bg-[#1F7A63]/10 text-[#1F7A63] px-3 py-1 rounded-full text-xs font-extrabold mb-0.5">
              {orderStatus === "delivered" ? t("DONE") : "12:47"}
            </span>
            <p className="text-xs font-bold text-slate-500">
              {orderStatus === "delivered" ? t("Delivered") : t("~{{arrivingMin}} min away", { arrivingMin })}
            </p>
          </div>
        </div>

        {/* Live Map Area */}
        <div className="relative w-full h-[420px] sm:h-[480px] rounded-3xl overflow-hidden shadow-md border border-slate-200/80 bg-slate-200 z-0">
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

        {/* Delivery Details Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
          {orderStatus === "delivered" ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-[#1F7A63]">{t("🎉 Order Delivered!")}</h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {t("Your meal has been successfully delivered. Enjoy your meal!")}
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-[#1F7A63] shadow-xs">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-5 text-center">
                <span className="text-3xl block mb-1">✅</span>
                <p className="text-base font-extrabold text-[#1F7A63]">{t("Delivered Successfully")}</p>
                <p className="text-xs text-slate-500 font-medium mt-1">{t("Thank you for ordering with DailyMealBox!")}</p>
              </div>

              <button 
                onClick={onGoBack} 
                className="w-full h-12 bg-[#1F7A63] hover:bg-[#155a49] text-white rounded-xl font-extrabold text-sm transition-all shadow-md cursor-pointer active:scale-[0.98]"
              >
                {t("Back to Orders")}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">{t("🚴 Driver on the way!")}</h2>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    {t("{{meal}} by {{vendor}}", { meal: tomorrowMeal?.name || t("Meal"), vendor: trackedOrder?.vendor?.restaurantName || t("Maria K.") })}
                  </p>
                </div>
                <div className="w-12 h-12 bg-[#1F7A63]/10 rounded-2xl flex items-center justify-center text-[#1F7A63]">
                  <BellRing className="w-6 h-6 animate-bounce" />
                </div>
              </div>

              {/* Delivery PIN Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 text-center space-y-2">
                <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest block">
                  {t("Your Delivery PIN")}
                </span>
                <span className="text-3xl sm:text-4xl font-extrabold tracking-[0.3em] pl-3 text-[#1F7A63] font-mono block">
                  {trackedOrder?.deliveryPin || trackedOrder?.pin || "8323"}
                </span>
                <span className="text-xs text-slate-500 font-medium block">
                  {t("Share this PIN with your driver upon arrival")}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button 
                  onClick={handleCall} 
                  className="flex-1 h-12 bg-[#1F7A63] hover:bg-[#155a49] text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-[0.98]"
                >
                  <Phone className="w-4 h-4 fill-current" />
                  <span>{t("Call Driver")}</span>
                </button>
                <button 
                  onClick={handleChat} 
                  className="w-12 h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 border border-slate-200/60" 
                  title={t("Chat Driver")}
                >
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
