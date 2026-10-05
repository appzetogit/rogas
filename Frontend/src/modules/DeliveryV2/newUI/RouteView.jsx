import useMoney from "@/shared/payments/money";
import { useState, useEffect } from "react";
import { ArrowRight, ChevronRight, Check, Navigation, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionSlider } from "../components/ui/ActionSlider";

const RouteView = ({
    stops,
    onAcceptRoute,
    isAccepted,
    onNextStep,
    activeOrder,
    routeMetadata,
    totalEarnings,
    loading = false
}) => {
    const { t } = useTranslation("driver");
    const { money } = useMoney();
    const [justAccepted, setJustAccepted] = useState(isAccepted);
    const [timeRemaining, setTimeRemaining] = useState("");

    // Countdown timer logic for the 3-hour window
    useEffect(() => {
        const deadline = routeMetadata?.deliveryDeadline;
        if (!deadline) {
            setTimeRemaining("");
            return;
        }

        const updateTimer = () => {
            const remainingMs = new Date(deadline).getTime() - Date.now();
            if (remainingMs <= 0) {
                setTimeRemaining("00:00:00 (Expired)");
                return;
            }
            const secs = Math.floor(remainingMs / 1000);
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            setTimeRemaining(formatted);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [routeMetadata?.deliveryDeadline]);

    // Keep justAccepted state in sync with isAccepted prop
    useEffect(() => {
        setJustAccepted(isAccepted);
    }, [isAccepted]);

    if (loading && (!stops || stops.length === 0)) {
        return (
            <div className="flex items-center justify-center min-h-[300px] text-[#1F7A63]">
                <div className="w-8 h-8 border-4 border-[#1F7A63] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!stops || stops.length === 0) {
        return (
            <div className="bg-white border border-dashed border-[#bec9c3] rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-4 min-h-[350px] animate-fadeIn my-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                    <Navigation className="w-6 h-6 rotate-45 text-[#3e4945]" />
                </div>
                <div>
                    <h3 className="text-base font-extrabold text-gray-900">{t("No Orders Available")}</h3>
                    <p className="text-xs text-[#5d5f5b] max-w-xs mt-2 leading-relaxed">
                        {t("There are no active pickup or delivery orders assigned to you at the moment. You'll see route details here once assigned.")}
                    </p>
                </div>
            </div>
        );
    }

    const currentStop = stops[0];

    const isPickupStop = (st) => st?.type === 'pickup' || st?.type === 'P';
    const targetLat = currentStop?.lat ?? (isPickupStop(currentStop) ? (currentStop?.vendorLat ?? routeMetadata?.vendorLocation?.latitude) : currentStop?.customerLat);
    const targetLng = currentStop?.lng ?? (isPickupStop(currentStop) ? (currentStop?.vendorLng ?? routeMetadata?.vendorLocation?.longitude) : currentStop?.customerLng);
    const dialable = (p) => (String(p || "").replace(/\D/g, "").length >= 6 ? String(p).replace(/[^\d+]/g, "") : null);
    const statusOf = (st) => {
        if (st.status === 'completed' || st.status === 'COMPLETED') return { label: t("Done"), cls: "bg-green-100 text-green-700" };
        if (st.awaitingPickup) return { label: t("After pickup"), cls: "bg-[#ffdad5] text-[#ba1a1a]" };
        return { label: t("To do"), cls: "bg-gray-100 text-gray-600" };
    };

    const handleOpenGoogleMaps = (e) => {
        e.stopPropagation();
        if (targetLat && targetLng) {
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`, '_blank');
        } else {
            const query = encodeURIComponent(`${currentStop?.name || ''} ${currentStop?.address || ''}`);
            window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
        }
    };

    return (
        <div className="space-y-4 pb-12 animate-fadeIn text-left">
            {/* Gap AL: cold meals on this route → insulated bag (shown once per route) */}
            {routeMetadata?.hasColdMeals && (
                <div className="flex items-center gap-3 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-sky-900">
                    <span className="text-xl">❄️</span>
                    <p className="text-[13px] font-bold">{t("Cold meals in today's route — use insulated bag")}</p>
                </div>
            )}
            {/* Route Info Bento Grid */}
            <div className="grid grid-cols-2 gap-3">
                {/* Vendor and Slot details */}
                <div className="bg-white border border-[#e0e3e0] rounded-2xl p-4 flex flex-col justify-between h-40 shadow-sm text-left">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#3e4945] font-extrabold text-[10px] uppercase tracking-wider font-sans">{t("VENDOR")}</span>
                            <span className="bg-[#1F7A63]/10 text-[#1F7A63] px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">
                                {routeMetadata?.slotType || t("Slot")}
                            </span>
                        </div>
                        <h3 className="text-sm font-extrabold text-gray-900 mt-2 line-clamp-1">{routeMetadata?.vendorName || "—"}</h3>
                        <p className="text-[10px] text-[#5d5f5b] mt-0.5 line-clamp-2">{routeMetadata?.vendorAddress || "—"}</p>
                    </div>
                    {routeMetadata?.vendorPhone && (
                        <a href={`tel:${routeMetadata.vendorPhone}`} className="text-[10px] font-bold text-[#1F7A63] hover:underline flex items-center gap-1 mt-1">
                            📞 {routeMetadata.vendorPhone}
                        </a>
                    )}
                </div>

                {/* Load, Stops & Time Grid */}
                <div className="flex flex-col gap-1 justify-between h-40">
                    {/* TOTAL LOAD */}
                    <div className="bg-white border border-[#e0e3e0] rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left">
                        <span className="text-[9px] font-bold text-[#3e4945] uppercase tracking-wider font-sans">{t("MEAL BOXES")}</span>
                        <span className="font-extrabold text-xs text-[#1F7A63]">{routeMetadata?.totalMealBoxCount || 0}</span>
                    </div>

                    {/* STOPS */}
                    <div className="bg-white border border-[#e0e3e0] rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left">
                        <span className="text-[9px] font-bold text-[#3e4945] uppercase tracking-wider font-sans">{t("STOPS")}</span>
                        <span className="font-extrabold text-xs text-gray-900">{routeMetadata?.stopsCount || 0}</span>
                    </div>

                    {/* TIME REMAINING */}
                    <div className="bg-white border border-[#e0e3e0] rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left">
                        <span className="text-[9px] font-bold text-[#3e4945] uppercase tracking-wider font-sans">{t("TIME LEFT")}</span>
                        <span className={`font-mono text-[11px] font-black ${timeRemaining ? 'text-rose-600 font-extrabold' : 'text-[#1F7A63]'}`}>
                            {timeRemaining || "—"}
                        </span>
                    </div>

                    {/* TOTAL EARNINGS */}
                    {totalEarnings !== undefined && (
                        <div className="bg-[#1F7A63]/10 border border-[#1F7A63]/25 rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left animate-fadeIn">
                            <span className="text-[9px] font-bold text-[#1F7A63] uppercase tracking-wider font-sans">{t("EARNINGS")}</span>
                            <span className="font-extrabold text-xs text-[#1F7A63] font-sans">{money(totalEarnings)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Current Stop Highlight Card */}
            <div className="bg-white border border-[#e0e3e0] rounded-2xl p-0 overflow-hidden custom-shadow text-left">
                <div className="h-2 bg-[#1F7A63] w-full" />
                <div className="p-4">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="bg-[#1F7A63]/10 text-[#1F7A63] px-2 py-0.5 rounded-lg text-[10px] font-bold border border-[#1F7A63]/20">
                                    {t("CURRENT STOP")}
                                </span>
                                <span className="bg-[#1F7A63] text-white px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                                    {isAccepted ? t("ACTIVE") : t("READY")}
                                </span>
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 leading-tight">{currentStop?.name || t("No Name")}</h2>
                            {currentStop?.isFamilyBox && <p className="text-[11px] font-bold text-violet-700 mt-0.5">{t("Family Box × {{n}} sets", { n: currentStop.setCount || 1 })}</p>}
                            <p className="text-xs text-[#5d5f5b] mt-0.5">{currentStop?.address || t("No Address")}</p>
                        </div>

                        <div className="w-11 h-11 bg-[#1F7A63] text-white rounded-full flex items-center justify-center font-bold text-base shadow-sm">
                            {isPickupStop(currentStop) ? 'P' : 'D'}
                        </div>
                    </div>

                    {/* Map Preview Block with Directions Button */}
                    <div 
                        onClick={onNextStep}
                        className="w-full h-36 rounded-xl bg-[#1f3d36] overflow-hidden mb-4 relative border border-gray-100 cursor-pointer group shadow-inner"
                    >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                        <div className="absolute bottom-2.5 left-3 flex items-center gap-2">
                            <span className="bg-black/60 text-white text-[10px] font-medium px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/10">
                                📍 {currentStop?.name || t("Current Stop")}
                            </span>
                        </div>

                        <button
                            type="button"
                            onClick={handleOpenGoogleMaps}
                            className="absolute bottom-2.5 right-3 bg-[#1F7A63] hover:bg-[#175d4b] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-md flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                            <Navigation className="w-3.5 h-3.5" />
                            {t("Navigate")}
                        </button>
                    </div>

                    {/* Accept Slide Gesture vs Next Target */}
                    {!isAccepted && !justAccepted ? (
                        <ActionSlider
                            label={t("Slide to Accept Route")}
                            successLabel={t("Route accepted")}
                            color="bg-[#1F7A63]"
                            onConfirm={() => {
                                setJustAccepted(true);
                                onAcceptRoute();
                            }}
                        />
                    ) : (
                        <button
                            onClick={onNextStep}
                            className="w-full h-[52px] bg-[#1F7A63] text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[#1F7A63]/90 shadow-md shadow-[#1F7A63]/10"
                        >
                            {t("START PICKUP STEP")} <ArrowRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Upcoming Stops List */}
            <div>
                <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 mb-3">{t("UPCOMING STOPS")}</h3>
                <div className="space-y-3">
                    {stops.slice(1).map((stop) => {
                        const pickup = isPickupStop(stop);
                        const st = statusOf(stop);
                        const phone = dialable(stop.phone);
                        return (
                            <div
                                key={stop.id}
                                className="bg-white border border-[#e0e3e0] rounded-xl p-4 shadow-xs text-left"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-sm ${pickup ? "bg-[#1F7A63]/10 text-[#1F7A63]" : "bg-[#3B82F6]/10 text-[#3B82F6]"}`}>
                                            {pickup ? 'P' : 'D'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#3e4945]">{pickup ? t("Pickup at vendor") : t("Delivery to customer")}</p>
                                            <h4 className="font-semibold text-gray-900 text-sm">{stop.name || ""}</h4>
                                            <p className="text-xs text-[#3e4945] mt-0.5">{stop.address || ""}</p>
                                        </div>
                                    </div>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wide uppercase shrink-0 ${st.cls}`}>{st.label}</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {stop.slot && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{stop.slot}</span>}
                                    {Number(stop.boxCount) > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1F7A63]/10 text-[#1F7A63]">{t("{{n}} meal box(es)", { n: stop.boxCount })}</span>}
                                    {stop.isFamilyBox && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">{t("Family Box × {{n}} sets", { n: stop.setCount || 1 })}</span>}
                                    {stop.hasColdMeal && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">{t("❄️ Cold")}</span>}
                                </div>
                                {phone && (
                                    <a href={`tel:${phone}`} className="inline-block mt-2 text-[11px] font-bold text-[#1F7A63] hover:underline">📞 {stop.phone}</a>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export { RouteView };
