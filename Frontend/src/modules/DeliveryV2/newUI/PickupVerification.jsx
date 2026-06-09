import { useState, useRef } from "react";
import { MapPin, Phone, CheckSquare, Square, Box, AlertTriangle, ArrowLeft, Navigation, CheckCircle } from "lucide-react";
import { dmbDeliveryAPI } from "../../../services/api";

const PickupVerification = ({
  order,
  onGoBack,
  onConfirmPickup,
  onReportIssue
}) => {
  const defaultItems = order?.items || [{ id: 1, name: 'Meal Boxes', quantity: order?.boxCount || 1, checked: false }];
  const [items, setItems] = useState(defaultItems);
  const [pinDigits, setPinDigits] = useState(["", "", "", ""]);
  const [showError, setShowError] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputsRef = useRef([]);
  const toggleCheck = (id) => {
    setItems(
      items.map(
        (item) => item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
    setShowError(false);
  };
  const allChecked = items.every((item) => item.checked);
  const handlePinChange = (index, val) => {
    const cleaned = val.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = cleaned;
    setPinDigits(newDigits);
    setShowError(false);
    if (cleaned && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }
  };
  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      const newDigits = [...pinDigits];
      newDigits[index - 1] = "";
      setPinDigits(newDigits);
      inputsRef.current[index - 1]?.focus();
    }
  };
  const [isVerifying, setIsVerifying] = useState(false);
  const handleConfirm = async () => {
    const finalPin = pinDigits.join("");
    if (finalPin.length === 4) {
      if (!allChecked) {
        setShowError("Please check all package manifest items first!");
        return;
      }
      try {
        setIsVerifying(true);
        const res = await dmbDeliveryAPI.verifyCollectionPin(finalPin);
        if (res.data?.success) {
          setSuccess(true);
          setTimeout(() => {
            onConfirmPickup();
          }, 1000);
        }
      } catch (err) {
        setShowError(err.response?.data?.message || "Invalid Collection PIN");
      } finally {
        setIsVerifying(false);
      }
    } else {
      setShowError("Please enter the 4-digit PIN");
    }
  };
  return <div className="space-y-4 pb-16 animate-fadeIn text-gray-800">
      {
    /* Header Info Banner containing back navigation button */
  }
      <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-[#e0e3e0]">
        <button
    onClick={onGoBack}
    className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
  >
          <ArrowLeft className="w-5 h-5 text-[#00604c]" />
        </button>
        <div className="text-center">
          <p className="text-[10px] text-[#3e4945] font-extrabold uppercase">Vendor Pickup</p>
          <h2 className="text-sm font-bold text-gray-900">{order.vendorName}</h2>
        </div>
        <div className="w-5 h-5" /> {
    /* spacer */
  }
      </div>

      {
    /* Map View Frame */
  }
      <div className="relative h-48 w-full bg-[#e3e3de] rounded-2xl overflow-hidden border border-[#bec9c3]">
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#6e7a74_1px,transparent_1px)] [background-size:20px_20px]" />
        
        {
    /* Mock Map Lines */
  }
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 200">
          <path
    d="M50 150 L150 120 L250 80 L350 50"
    fill="none"
    stroke="#9ef3d7"
    strokeDasharray="8 4"
    strokeWidth="4"
  />
          <circle cx="50" cy="150" fill="#00604c" r="6" />
          <circle cx="350" cy="50" fill="#854036" r="8" />
        </svg>

        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center bg-white/95 backdrop-blur-sm p-3 rounded-xl border border-[#bec9c3] shadow-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#00604c] rounded-full inline-block" />
            <span className="text-xs font-bold text-gray-900">1.2 miles away</span>
          </div>
          <div className="flex items-center gap-2 text-[#00604c] font-bold text-xs">
            <span>ETA 4 mins</span>
          </div>
        </div>
      </div>

      {
    /* Vendor Detail Card */
  }
      <div className="bg-white rounded-2xl border border-[#bec9c3] p-4 shadow-sm space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-extrabold text-gray-900 text-lg">{order.vendorName}</h3>
            <p className="text-xs text-[#5d5f5b] flex items-center gap-1 mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#00604c]" />
              {order.pickupAddress}
            </p>
          </div>
          <span className="bg-[#9ef3d7] text-[#005140] px-3 py-1 rounded-full text-[10px] font-bold tracking-wider">
            READY FOR PICKUP
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button className="flex items-center justify-center gap-2 bg-[#00604c] text-white h-11 rounded-lg text-xs font-bold active:scale-95 transition-transform">
            <Navigation className="w-4 h-4 fill-white" />
            NAVIGATE
          </button>
          <a
    href="tel:+48123456789"
    className="flex items-center justify-center gap-2 border border-[#00604c] text-[#00604c] h-11 rounded-lg text-xs font-bold active:scale-95 transition-transform"
  >
            <Phone className="w-4 h-4" />
            CALL VENDOR
          </a>
        </div>
      </div>

      {
    /* Manifest Section */
  }
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-[#3e4945] uppercase tracking-widest">
            LOAD MANIFEST ({items.length} ITEMS)
          </h3>
          <Box className="w-4 h-4 text-[#3e4945]" />
        </div>

        <div className="space-y-2">
          {items.map((item) => <div
    key={item.id}
    onClick={() => toggleCheck(item.id)}
    className={`bg-white border rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors ${item.checked ? "border-[#00604c] bg-[#9ef3d7]/5" : "border-[#bec9c3]"}`}
  >
              <div className="flex-shrink-0">
                {item.checked ? <CheckSquare className="w-5 h-5 text-[#00604c]" /> : <Square className="w-5 h-5 text-gray-400" />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-900 leading-snug">{item.name}</p>
                <p className="text-[10px] text-[#5d5f5b] mt-0.5">Quantity: {item.quantity}x packs</p>
              </div>
            </div>)}
        </div>
      </div>

      {
    /* PIN Verification Frame */
  }
      <div className="bg-white border-t-4 border-[#00604c] rounded-2xl p-5 shadow-sm border-x border-b border-[#bec9c3] space-y-4">
        <h3 className="font-extrabold text-gray-900 text-sm tracking-wide">ENTER COLLECTION PIN</h3>
        
        <div className="flex justify-between gap-2">
          {pinDigits.map((digit, idx) => <input
    key={idx}
    ref={(el) => {
      inputsRef.current[idx] = el;
    }}
    type="text"
    maxLength={1}
    value={digit}
    onChange={(e) => handlePinChange(idx, e.target.value)}
    onKeyDown={(e) => handleKeyDown(idx, e)}
    className="w-14 h-14 text-center text-2xl font-black bg-[#ebefeb] border border-[#bec9c3] focus:border-[#00604c] rounded-xl focus:outline-none"
    placeholder="•"
  />)}
        </div>

        {
    /* Informative Help / Tip */
  }
        <p className="text-center text-[10px] font-bold text-amber-600 bg-amber-50 rounded-md py-1 border border-amber-100">
          Hint: The merchant collection PIN is <span className="font-black underline scale-110 px-1 inline-block">4901</span>
        </p>

        {
    /* Live Errors Alert Banner matching the Wrong PIN screenshot strictly */
  }
        {showError && <div className="flex items-center gap-2 bg-[#ffdad6] text-[#93000a] p-3 rounded-xl border border-[#ffdad6] shadow-xs">
            <AlertTriangle className="w-5 h-5 text-[#ba1a1a] flex-shrink-0" />
            <p className="text-xs font-bold leading-tight">
              {typeof showError === 'string' ? showError : (!allChecked ? "Please check all package manifest items first!" : "Wrong PIN. Please verify with the vendor.")}
            </p>
          </div>}

        {success && <div className="flex items-center gap-2 bg-[#9ef3d7] text-[#005140] p-3 rounded-xl border border-[#bec9c3]">
            <CheckCircle className="w-5 h-5 text-[#00604c] flex-shrink-0" />
            <p className="text-xs font-bold leading-tight">PIN verified successfully! Confirming pickup...</p>
          </div>}

        <button
    disabled={isVerifying}
    onClick={handleConfirm}
    className={`w-full h-12 rounded-xl text-sm font-bold uppercase transition-all flex items-center justify-center ${allChecked && pinDigits.join("").length === 4 ? "bg-[#00604c] hover:bg-[#1f7a63] text-white cursor-pointer shadow-md" : "bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300"}`}
  >
          {isVerifying ? "VERIFYING..." : (success ? "PICKED UP!" : "CONFIRM PICKUP")}
        </button>

        {
    /* Cannot deliver trigger */
  }
        <div className="text-center pt-1 border-t border-gray-100">
          <button
    onClick={onReportIssue}
    className="text-xs font-semibold text-[#ba1a1a] hover:underline"
  >
            Problems at merchant? Cannot pickup orders
          </button>
        </div>
      </div>
    </div>;
};
export {
  PickupVerification
};
