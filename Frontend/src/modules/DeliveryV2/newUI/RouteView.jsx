import { useState, useEffect } from "react";
import { ArrowRight, ChevronRight, Check, Navigation, AlertTriangle } from "lucide-react";

const RouteView = ({
    stops,
    onAcceptRoute,
    isAccepted,
    onNextStep,
    activeOrder,
    routeMetadata,
    totalEarnings
}) => {
    const [sliderPosition, setSliderPosition] = useState(0);
    const [justAccepted, setJustAccepted] = useState(isAccepted);
    const [dragging, setDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [timeRemaining, setTimeRemaining] = useState("");
    const maxDrag = 220;

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

    if (!stops || stops.length === 0) {
        return (
            <div className="bg-white border border-dashed border-[#bec9c3] rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-4 min-h-[350px] animate-fadeIn my-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                    <Navigation className="w-6 h-6 rotate-45 text-[#3e4945]" />
                </div>
                <div>
                    <h3 className="text-base font-extrabold text-gray-900">No Orders Available</h3>
                    <p className="text-xs text-[#5d5f5b] max-w-xs mt-2 leading-relaxed">
                        There are no active pickup or delivery orders assigned to you at the moment. You'll see route details here once assigned.
                    </p>
                </div>
            </div>
        );
    }

    const currentStop = stops[0];

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

    return (
        <div className="space-y-4 pb-12 animate-fadeIn text-left">
            {/* Route Info Bento Grid */}
            <div className="grid grid-cols-2 gap-3">
                {/* Vendor and Slot details */}
                <div className="bg-white border border-[#e0e3e0] rounded-2xl p-4 flex flex-col justify-between h-40 shadow-sm text-left">
                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-[#3e4945] font-extrabold text-[10px] uppercase tracking-wider font-sans">VENDOR</span>
                            <span className="bg-[#1F7A63]/10 text-[#1F7A63] px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide">
                                {routeMetadata?.slotType || "Slot"}
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
                        <span className="text-[9px] font-bold text-[#3e4945] uppercase tracking-wider font-sans">MEAL BOXES</span>
                        <span className="font-extrabold text-xs text-[#1F7A63]">{routeMetadata?.totalMealBoxCount || 0}</span>
                    </div>

                    {/* STOPS */}
                    <div className="bg-white border border-[#e0e3e0] rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left">
                        <span className="text-[9px] font-bold text-[#3e4945] uppercase tracking-wider font-sans">STOPS</span>
                        <span className="font-extrabold text-xs text-gray-900">{routeMetadata?.stopsCount || 0}</span>
                    </div>

                    {/* TIME REMAINING */}
                    <div className="bg-white border border-[#e0e3e0] rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left">
                        <span className="text-[9px] font-bold text-[#3e4945] uppercase tracking-wider font-sans">TIME LEFT</span>
                        <span className={`font-mono text-[11px] font-black ${timeRemaining ? 'text-rose-600 font-extrabold' : 'text-[#1F7A63]'}`}>
                            {timeRemaining || "3h 00m"}
                        </span>
                    </div>

                    {/* TOTAL EARNINGS */}
                    {totalEarnings !== undefined && (
                        <div className="bg-[#1F7A63]/10 border border-[#1F7A63]/25 rounded-xl px-2.5 py-1 flex items-center justify-between shadow-sm text-left animate-fadeIn">
                            <span className="text-[9px] font-bold text-[#1F7A63] uppercase tracking-wider font-sans">EARNINGS</span>
                            <span className="font-extrabold text-xs text-[#1F7A63] font-sans">₹{totalEarnings.toFixed(2)}</span>
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
                                    CURRENT STOP
                                </span>
                                <span className="bg-[#1F7A63] text-white px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide">
                                    {isAccepted ? "ACTIVE" : "READY"}
                                </span>
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 leading-tight">{currentStop?.name || 'No Name'}</h2>
                            <p className="text-xs text-[#5d5f5b] mt-0.5">{currentStop?.address || 'No Address'}</p>
                        </div>

                        <div className="w-11 h-11 bg-[#1F7A63] text-white rounded-full flex items-center justify-center font-bold text-base shadow-sm">
                            {currentStop?.type || 'P'}
                        </div>
                    </div>

                    {/* Map Preview Placeholder Block */}
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

                    {/* Accept Slide Gesture vs Next Target */}
                    {!isAccepted && !justAccepted ? (
                        <div
                            className="relative h-[52px] bg-[#e0e3e0] rounded-xl flex items-center justify-center select-none overflow-hidden touch-none border border-gray-300"
                            onMouseMove={handleTouchMove}
                            onTouchMove={handleTouchMove}
                            onMouseUp={handleTouchEnd}
                            onTouchEnd={handleTouchEnd}
                            onMouseLeave={handleTouchEnd}
                        >
                            {/* Green Progress Backdrop */}
                            <div
                                className="absolute left-0 top-0 bottom-0 bg-[#1F7A63]/15 transition-all"
                                style={{ width: `${(sliderPosition / maxDrag) * 100}%` }}
                            />

                            <span
                                className="text-xs uppercase font-extrabold tracking-wider transition-opacity select-none"
                                style={{ opacity: 1 - sliderPosition / maxDrag, color: "#3e4945" }}
                            >
                                Slide to Accept Route
                            </span>

                            {/* Slider Handle */}
                            <div
                                onMouseDown={handleTouchStart}
                                onTouchStart={handleTouchStart}
                                className="absolute left-1 w-11 h-11 bg-[#1F7A63] text-white rounded-lg flex items-center justify-center cursor-ew-resize hover:bg-[#1F7A63]/90 transition-transform active:scale-95 shadow-md flex-shrink-0 z-10"
                                style={{ transform: `translateX(${sliderPosition}px)` }}
                            >
                                <ChevronRight className="w-6 h-6 stroke-[3]" />
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={onNextStep}
                            className="w-full h-[52px] bg-[#1F7A63] text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all hover:bg-[#1F7A63]/90 shadow-md shadow-[#1F7A63]/10"
                        >
                            {isAccepted && justAccepted ? (
                                <>
                                    ACCEPTED <Check className="w-5 h-5 stroke-[3]" />
                                </>
                            ) : (
                                <>
                                    START CURRENT STEP <ArrowRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Upcoming Stops List */}
            <div>
                <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1 mb-3">UPCOMING STOPS</h3>
                <div className="space-y-3">
                    {stops.slice(1).map((stop) => (
                        <div
                            key={stop.id}
                            className="bg-white border border-[#e0e3e0] rounded-xl p-4 flex items-center justify-between shadow-xs hover:border-[#bec9c3] cursor-pointer transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${stop.type === "P" ? "bg-[#1F7A63]/10 text-[#1F7A63]" : "bg-[#3B82F6]/10 text-[#3B82F6]"
                                        }`}
                                >
                                    {stop.type}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold text-gray-900 text-sm">{stop.name}</h4>
                                        <span
                                            className={`text-[9px] font-bold px-2 py-0.5 rounded tracking-wide uppercase ${stop.status === "WAITING"
                                                ? "bg-[#ffdad5] text-[#ba1a1a]"
                                                : stop.status === "COMPLETED"
                                                    ? "bg-green-100 text-green-700"
                                                    : "bg-gray-100 text-gray-600"
                                                }`}
                                        >
                                            {stop.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#3e4945] mt-0.5">{stop.address}</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-[#bec9c3]" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export { RouteView };
