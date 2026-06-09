import { useState, useEffect } from "react";
import { Phone, MessageSquare, MapPin, CheckCircle, Camera, Check, Clock } from "lucide-react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { dmbDeliveryAPI } from "../../../services/api";

const mapContainerStyle = {
  width: "100%",
  height: "100%"
};

const DeliveryConfirmation = ({
  order,
  orders,
  stops,
  onSelectOrder,
  onGoBack,
  onConfirmDelivered,
  onOpenChat,
  onReportIssue
}) => {
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setPinDigits(["", "", "", ""]);
    setPhotoCaptured(false);
    setErrorText("");
    setSuccess(false);
  }, [order?.id]);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey
  });

  const deliveryStops = (orders || [order])
    .filter(o => o && o.status !== "delivered")
    .map((o, idx) => {
      const lat = o.customerLat || (52.21 + idx * 0.005);
      const lng = o.customerLng || (20.98 + idx * 0.004);
      return {
        id: o.id,
        name: o.customerName || "Customer",
        address: o.customerAddress || "",
        lat,
        lng
      };
    });

  const centerLat = order?.customerLat || (deliveryStops.find(s => s.id === order?.id)?.lat) || 52.21;
  const centerLng = order?.customerLng || (deliveryStops.find(s => s.id === order?.id)?.lng) || 20.98;
  const center = { lat: centerLat, lng: centerLng };
  const handlePinChange = (index, val) => {
    const cleaned = val.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = cleaned;
    setPinDigits(newDigits);
    setErrorText("");
    if (cleaned && index < 3) {
      const nextInput = document.getElementById(`del-pin-${index + 1}`);
      nextInput?.focus();
    }
  };
  const handleConfirm = async () => {
    const pinStr = pinDigits.join("");
    const isLiveOrder = /^[0-9a-fA-F]{24}$/.test(order?.id);

    if (isLiveOrder) {
      if (!photoCaptured && pinStr.length < 4) {
        setErrorText("Please enter the 4-digit customer PIN or capture a delivery photo first.");
        return;
      }

      if (photoCaptured) {
        try {
          setErrorText("");
          setSuccess(false);
          const photoUrl = "https://images.unsplash.com/photo-1594488651083-023b8a44d81c?auto=format&fit=crop&q=80&w=800";
          const res = await dmbDeliveryAPI.uploadDeliveryPhoto(order.id, photoUrl);
          if (res.data?.success) {
            setSuccess(true);
            setTimeout(() => {
              onConfirmDelivered(order.paymentMethod === "CASH" ? order.cashAmount : 0);
            }, 1200);
          } else {
            setErrorText(res.data?.message || "Failed to verify photo proof");
          }
        } catch (err) {
          console.error("Failed to verify photo via backend:", err);
          setErrorText(err.response?.data?.message || "Server error confirming photo delivery.");
        }
      } else {
        try {
          setErrorText("");
          setSuccess(false);
          const res = await dmbDeliveryAPI.verifyDeliveryPin(order.id, pinStr);
          if (res.data?.success) {
            setSuccess(true);
            setTimeout(() => {
              onConfirmDelivered(order.paymentMethod === "CASH" ? order.cashAmount : 0);
            }, 1200);
          } else {
            setErrorText(res.data?.message || "Invalid customer PIN");
          }
        } catch (err) {
          console.error("Failed to verify delivery PIN via backend:", err);
          setErrorText(err.response?.data?.message || "Incorrect PIN or server error.");
        }
      }
    } else {
      const expectedPin = order?.deliveryPin || order?.pin || "1234";
      if (!photoCaptured && pinStr !== expectedPin) {
        setErrorText(`Please enter correct customer PIN (${expectedPin}) or capture a delivery photo first.`);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onConfirmDelivered(order.paymentMethod === "CASH" ? order.cashAmount : 0);
      }, 1200);
    }
  };
  return <div className="space-y-4 pb-16 animate-fadeIn text-gray-800">
      {
    /* Header Info Bar */
  }
      <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-[#e0e3e0]">
        <button
    onClick={onGoBack}
    className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
  >
          <span className="text-[#00604c] font-black text-sm">&larr; Back</span>
        </button>
        <div className="text-center">
          <p className="text-[10px] text-[#3e4945] font-extrabold uppercase">Delivery Dropoff</p>
          <h2 className="text-sm font-bold text-gray-900">Delivery - C7 Ochota</h2>
        </div>
        <div className="w-8 h-8 rounded-full overflow-hidden border border-[#e0e3e0]">
          <img
    alt="Jan Wisniewski Profile"
    className="w-full h-full object-cover"
    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCsfrq_0ZjpgdHuNrT-iHoHJIUmjDGQw9kLQ8CWwL5t08A99XVq3Qml0_dqJCnug2otKGKy_FzVDNiFLRDupl6Bx81pLpQhMWXbJWg1eaLT2tMExu5FoJVqAamFTuaQewI2pJmtY3e-Db8KJKMoKZQ6w3QrYfgmjXrHjgCtB6lUxuSqI2qbuMXswZAD1Bbfkn0cY9odKH7b7zcMghtsqjyeZOmIrsWU4OJOry9HN_GRn95yAyq_7C3YpNM5UpV94AZdmoDHcFVcL2Kf text-xs"
    referrerPolicy="no-referrer"
  />
        </div>
      </div>

      {
    /* Map View Frame with Warsaw Background and ETA */
  }
      <div className="relative h-44 w-full rounded-2xl overflow-hidden border border-[#bec9c3] shadow-inner bg-slate-200">
        {isLoaded && !loadError && apiKey ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={13}
            options={{
              zoomControl: false,
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: false,
              disableDefaultUI: true,
              clickableIcons: false
            }}
          >
            {deliveryStops.map((stop, index) => {
              const isSelected = stop.id === order?.id;
              return (
                <Marker
                  key={`stop-${stop.id || index}`}
                  position={{ lat: stop.lat, lng: stop.lng }}
                  onClick={() => {
                    if (onSelectOrder) {
                      onSelectOrder(stop.id);
                    }
                  }}
                  icon={{
                    url: isSelected 
                      ? `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="8" y="32" font-size="32">🟢</text></svg>')}`
                      : `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="8" y="32" font-size="32">📍</text></svg>')}`,
                    scaledSize: window.google?.maps?.Size ? new window.google.maps.Size(40, 40) : undefined
                  }}
                  title={stop.name}
                />
              );
            })}
          </GoogleMap>
        ) : (
          <>
            <img
              alt="Map tracking Warsaw, Ochota district"
              className="absolute inset-0 w-full h-full object-cover opacity-75"
              src="https://lh3.googleusercontent.com/placeholder-map-warsaw"
              onError={(e) => {
                e.currentTarget.src = "https://lh3.googleusercontent.com/aida-public/AB6AXuDtYSr4ztK_ia4wuzQms16XegAIPcDr5q0PSCJUMcXwoMsNSW0m8eHCyAEyvoz6B3zTE1im1B7ZsA7e3sRtvElbkKBCqhxZ-notSZ2Ud_P0fdCuS40cHP-oqOsaIkP-WAohcnJ9nkyCnkI_Uu_DJb9SI7yel6NC2Gpe4hRhRlr6e2dDjm-dLvv10k5FmcKr4_R9gXPW1jiwe_2FqOs27LnLCnWitwGmrdpPc5VbinMWwOGrs5t_sGtJwHQ8BpVSbYaGK5jgzBPnWNPY";
              }}
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#F5F5F0] to-transparent opacity-40" />
          </>
        )}
        
        <div className="absolute top-3 left-3 bg-[#00604c] text-white px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md z-10">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wider">ETA: 4 min</span>
        </div>
      </div>

      {
    /* Customer Contact Card */
  }
      <div className="bg-white border border-[#e0e3e0] rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-extrabold text-[#181d1b] text-lg">{order.customerName}</h3>
            <p className="text-xs text-[#3e4945] flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#00604c]" />
              {order.deliveryAddress}
            </p>
            {centerLat && centerLng && (
              <p className="text-[10px] text-gray-500 font-semibold mt-0.5 ml-4.5 flex items-center gap-1">
                <span>📍</span>
                <span>Coordinates: {parseFloat(centerLat).toFixed(6)}, {parseFloat(centerLng).toFixed(6)}</span>
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            <a
    href="tel:+48987654321"
    className="w-10 h-10 rounded-full border border-[#00604c] text-[#00604c] flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
  >
              <Phone className="w-4 h-4" />
            </a>
            <button
    onClick={onOpenChat}
    className="w-10 h-10 rounded-full border border-[#00604c] text-[#00604c] flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
  >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>

        {
    /* Note block */
  }
        <div className="bg-[#e5e9e5]/40 p-3.5 rounded-lg border-l-4 border-[#00604c] shadow-xs">
          <p className="text-[10px] font-extrabold text-[#00604c] tracking-wider uppercase mb-1">CUSTOMER NOTE</p>
          <blockquote className="text-xs font-semibold italic text-[#181d1b] leading-relaxed">
            "{order.customerNote}"
          </blockquote>
        </div>
      </div>

      {
    /* Cash Collection Banner */
  }
      {order.paymentMethod === "CASH" && <div className="bg-[#ffdad6] text-[#93000a] p-4 rounded-xl flex items-center justify-between border-t-4 border-[#ba1a1a] shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-xl">💰</span>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider opacity-85 text-[#93000a]">Payment Method</p>
              <p className="text-base font-extrabold">Collect {order.cashAmount} PLN Cash</p>
            </div>
          </div>
          <div className="bg-[#ba1a1a] text-white px-3 py-1 rounded-full text-xs font-bold shadow-xs">
            CASH
          </div>
        </div>}

      {
    /* Delivery Proof Container */
  }
      <div className="bg-white border border-[#e0e3e0] rounded-xl p-4 space-y-4 shadow-sm">
        <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest px-1">DELIVERY PROOF</h3>

        {
    /* PIN verification input */
  }
        <div className="space-y-2 bg-[#f1f4f1]/50 p-3.5 rounded-xl border border-[#e0e3e0]">
          <p className="text-xs font-bold text-[#3e4945]">Enter customer PIN</p>
          <div className="flex justify-between gap-1.5">
            {pinDigits.map((digit, idx) => <input
    key={idx}
    id={`del-pin-${idx}`}
    type="text"
    maxLength={1}
    value={digit}
    onChange={(e) => handlePinChange(idx, e.target.value)}
    className="w-12 h-14 text-center text-xl font-extrabold bg-white border border-[#bec9c3] focus:border-[#00604c] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#00604c]"
    placeholder="•"
  />)}
          </div>
          <p className="text-[10px] text-[#5d5f5b] font-medium italic">
            Tip: Share PIN <span className="font-bold underline text-[#00604c] text-xs">{order?.deliveryPin || order?.pin || "1234"}</span> with customer.
          </p>
        </div>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-[#3e4945] bg-white px-3 w-fit mx-auto font-extrabold">
            Or take delivery photo
          </div>
        </div>

        {
    /* Camera visual triggers */
  }
        <div className="space-y-2">
          {!photoCaptured ? <button
    onClick={() => setPhotoCaptured(true)}
    className="w-full h-14 border-2 border-dashed border-[#bec9c3] hover:border-[#00604c] text-[#5d5f5b] rounded-xl flex items-center justify-center gap-2.5 transition-colors active:bg-[#f1f4f1] font-bold text-xs"
  >
              <Camera className="w-5 h-5 text-[#5d5f5b]" />
              Open Camera Proof
            </button> : <div className="relative w-full h-44 rounded-xl overflow-hidden border-2 border-[#00604c] shadow-sm group">
              <img
    alt="Confirmation Door Photo"
    className="w-full h-full object-cover"
    src="https://images.unsplash.com/photo-1594488651083-023b8a44d81c?auto=format&fit=crop&q=80&w=800"
  />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="bg-[#00604c] text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1">
                  <Check className="w-4 h-4 stroke-[3]" /> Photo Captured Successfully
                </span>
              </div>
              <button
    onClick={() => setPhotoCaptured(false)}
    className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] px-2.5 py-1 rounded"
  >
                Reset
              </button>
            </div>}
        </div>
      </div>

      {
    /* Warnings & Alerts */
  }
      {errorText && <div className="bg-[#ffdad6] text-[#93000a] text-xs font-bold p-3 rounded-lg border border-red-100 flex items-center gap-2">
          <span className="text-base flex-shrink-0">⚠️</span>
          <span>{errorText}</span>
        </div>}

      {success && <div className="bg-[#e5e9e5] text-[#005140] text-xs font-bold p-3 rounded-lg border border-[#bec9c3] flex items-center gap-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span>Delivery match success! Registering payout update...</span>
        </div>}

      {
    /* Confirm Delivered CTA and Problem Trigger */
  }
      <div className="space-y-4">
        <button
    onClick={handleConfirm}
    className="w-full h-[52px] bg-[#00604c] hover:bg-[#1f7a63] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform shadow-md shadow-[#00604c]/25 text-base"
  >
          {success ? "CONFIRMING..." : "Confirm Delivered"}
          <Check className="w-5 h-5 stroke-[2.5]" />
        </button>

        <div className="text-center">
          <button
    onClick={onReportIssue}
    className="text-xs font-semibold text-[#ba1a1a] hover:underline"
  >
            Cannot complete delivery? Report failed dropoff
          </button>
        </div>
      </div>
    </div>;
};
export {
  DeliveryConfirmation
};
