import { useState, useEffect, useRef } from "react";
import { Phone, MessageSquare, MapPin, CheckCircle, Camera, Check, Clock } from "lucide-react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { dmbDeliveryAPI, deliveryAPI, uploadAPI } from "../../../services/api";
import { ActionSlider } from "../components/ui/ActionSlider";

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

  // Live Camera states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const videoRef = useRef(null);

  // Payment Options page states
  const [paymentScreenOpen, setPaymentScreenOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrError, setQrError] = useState("");
  console.log("order-------------->:", order)


  useEffect(() => {
    setPinDigits(["", "", "", ""]);
    setPhotoCaptured(false);
    setErrorText("");
    setSuccess(false);

    // Reset camera state
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraActive(false);
    setCameraStream(null);
    setPhotoBlob(null);
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    setUploadingPhoto(false);

    // Reset payment screen state
    setPaymentScreenOpen(false);
    setSelectedPaymentMethod("");
    setQrCodeUrl("");
    setLoadingQr(false);
    setQrError("");
  }, [order?.id]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [cameraStream, photoPreviewUrl]);

  const startCamera = async () => {
    try {
      setErrorText("");
      setPhotoPreviewUrl(null);
      setPhotoBlob(null);
      setPhotoCaptured(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      setCameraStream(stream);
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => console.error("Error playing video:", err));
        }
      }, 100);
    } catch (err) {
      console.error("Camera access failed:", err);
      setErrorText("Camera access denied or unavailable. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        setPhotoBlob(blob);
        const url = URL.createObjectURL(blob);
        setPhotoPreviewUrl(url);
        setPhotoCaptured(true);
      }
    }, "image/jpeg", 0.85);

    stopCamera();
  };

  const retakePhoto = () => {
    setPhotoCaptured(false);
    setPhotoBlob(null);
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    startCamera();
  };

  const handleSelectQrPayment = async () => {
    setSelectedPaymentMethod("QR");
    setLoadingQr(true);
    setQrError("");
    setQrCodeUrl("");
    try {
      const res = await deliveryAPI.createCollectQr(order.id);
      if (res.data?.success && res.data?.imageUrl) {
        setQrCodeUrl(res.data.imageUrl);
      } else {
        const amount = order.cashAmount || order.pricing?.total || 15;
        const upiUrl = `upi://pay?pa=vendor@razorpay&pn=${encodeURIComponent(order.vendorName || "Vendor")}&am=${amount}&cu=INR`;
        const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
        setQrCodeUrl(fallbackUrl);
      }
    } catch (err) {
      console.warn("Failed to generate Razorpay QR code:", err);
      const amount = order.cashAmount || order.pricing?.total || 15;
      const upiUrl = `upi://pay?pa=vendor@razorpay&pn=${encodeURIComponent(order.vendorName || "Vendor")}&am=${amount}&cu=INR`;
      const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;
      setQrCodeUrl(fallbackUrl);
    } finally {
      setLoadingQr(false);
    }
  };

  const handleSelectCashPayment = () => {
    setSelectedPaymentMethod("CASH");
  };

  const handleConfirmQrPayment = async () => {
    try {
      setSuccess(true);
      await dmbDeliveryAPI.confirmPayment(order.id, 'QR');
      setTimeout(() => {
        onConfirmDelivered(order.paymentMethod === "CASH" ? order.cashAmount : 0);
      }, 1000);
    } catch (err) {
      console.error(err);
      setErrorText("Error confirming payment on server.");
      setSuccess(false);
    }
  };

  const handleConfirmCashPayment = async () => {
    try {
      await dmbDeliveryAPI.confirmPayment(order.id, 'CASH');
      onConfirmDelivered(order.paymentMethod === "CASH" ? order.cashAmount : 0);
    } catch (err) {
      console.error(err);
      setErrorText(err.response?.data?.message || "Error confirming payment on server.");
      throw err;
    }
  };

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
    // Lock the current order as the active selection so live socket updates don't prematurely switch screens
    if (onSelectOrder && order?.id) {
      onSelectOrder(order.id);
    }

    const pinStr = pinDigits.join("");
    const isLiveOrder = /^[0-9a-fA-F]{24}$/.test(order?.id);

    if (isLiveOrder) {
      if (!photoCaptured && pinStr.length < 4) {
        setErrorText("Please enter the 4-digit customer PIN or capture a delivery photo first.");
        return;
      }

      if (photoCaptured) {
        if (!photoBlob) {
          setErrorText("Captured photo data is missing. Please capture again.");
          return;
        }

        try {
          setErrorText("");
          setSuccess(false);
          setUploadingPhoto(true);

          // Upload real photo to media storage
          const file = new File([photoBlob], `proof-${order.id}.jpg`, { type: "image/jpeg" });
          const uploadRes = await uploadAPI.uploadMedia(file, { folder: "appzeto/delivery/proofs" });

          if (!uploadRes.data?.success || !uploadRes.data?.data) {
            throw new Error("Failed to upload image to media storage.");
          }

          const photoUrl = uploadRes.data.data.url || uploadRes.data.data.secure_url;

          // Submit photo url to delivery endpoint
          const res = await dmbDeliveryAPI.uploadDeliveryPhoto(order.id, photoUrl);
          if (res.data?.success) {
            setPaymentScreenOpen(true);
          } else {
            setErrorText(res.data?.message || "Failed to verify photo proof");
          }
        } catch (err) {
          console.error("Failed to verify photo:", err);
          setErrorText(err.response?.data?.message || err.message || "Server error confirming photo delivery.");
        } finally {
          setUploadingPhoto(false);
        }
      } else {
        try {
          setErrorText("");
          setSuccess(false);
          const res = await dmbDeliveryAPI.verifyDeliveryPin(order.id, pinStr);
          if (res.data?.success) {
            setPaymentScreenOpen(true);
          } else {
            setErrorText(res.data?.message || "Invalid customer PIN");
          }
        } catch (err) {
          console.error("Failed to verify delivery PIN:", err);
          setErrorText(err.response?.data?.message || "Incorrect PIN or server error.");
        }
      }
    } else {
      const expectedPin = order?.deliveryPin || order?.pin || "1234";
      if (!photoCaptured && pinStr !== expectedPin) {
        setErrorText(`Please enter correct customer PIN (${expectedPin}) or capture a delivery photo first.`);
        return;
      }
      setPaymentScreenOpen(true);
    }
  };

  const getButtonText = () => {
    if (uploadingPhoto) return "UPLOADING PHOTO...";
    if (success) return "VERIFIED!";
    return "Confirm Delivery";
  };

  if (paymentScreenOpen) {
    return (
      <div className="space-y-4 pb-16 animate-fadeIn text-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-[#e0e3e0]">
          <button
            onClick={() => setPaymentScreenOpen(false)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <span className="text-[#00604c] font-black text-sm">&larr; Back</span>
          </button>
          <div className="text-center">
            <p className="text-[10px] text-[#3e4945] font-extrabold uppercase">Payment Collection</p>
            <h2 className="text-sm font-bold text-gray-900">Order #{order?.id?.slice(-6) || "Payment"}</h2>
          </div>
          <div className="w-8 h-8" />
        </div>

        {/* Amount Card */}
        <div className="bg-white border border-[#e0e3e0] rounded-xl p-6 shadow-sm text-center space-y-2">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Amount to Collect</p>
          <p className="text-3xl font-black text-[#00604c]">
            {order?.riderEarning || 0} PLN
          </p>
          <p className="text-xs text-gray-400">Please choose a payment method below to verify collection.</p>
        </div>

        {/* Payment Methods Selection */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleSelectQrPayment}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === "QR"
              ? "border-[#00604c] bg-[#9ef3d7]/10"
              : "border-[#e0e3e0] bg-white hover:border-[#00604c]/40"
              }`}
          >
            <span className="text-2xl mb-1">📱</span>
            <span className="font-bold text-sm text-gray-900">QR Payment</span>
            <span className="text-[10px] text-gray-500 mt-1">Scan Razorpay QR</span>
          </button>

          <button
            onClick={handleSelectCashPayment}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${selectedPaymentMethod === "CASH"
              ? "border-[#00604c] bg-[#9ef3d7]/10"
              : "border-[#e0e3e0] bg-white hover:border-[#00604c]/40"
              }`}
          >
            <span className="text-2xl mb-1">💰</span>
            <span className="font-bold text-sm text-gray-900">Collect Cash</span>
            <span className="text-[10px] text-gray-500 mt-1">Physical Cash</span>
          </button>
        </div>

        {/* QR Payment View */}
        {selectedPaymentMethod === "QR" && (
          <div className="bg-white border border-[#e0e3e0] rounded-xl p-5 shadow-sm flex flex-col items-center space-y-4 animate-slideUp">
            <h3 className="font-extrabold text-sm text-gray-900 uppercase tracking-wide">Razorpay QR Code</h3>

            {loadingQr ? (
              <div className="w-48 h-48 bg-gray-50 border border-dashed rounded-xl flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#00604c] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : qrError ? (
              <div className="w-48 h-48 bg-red-50 border border-red-200 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                <span className="text-red-500 font-bold text-xs">{qrError}</span>
              </div>
            ) : qrCodeUrl ? (
              <div className="p-2 border border-gray-100 rounded-xl bg-white shadow-inner">
                <img src={qrCodeUrl} alt="Razorpay QR" className="w-48 h-48 object-contain" />
              </div>
            ) : null}

            <p className="text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-100 text-center">
              Let the customer scan the QR to complete online transfer.
            </p>

            <button
              onClick={handleConfirmQrPayment}
              className="w-full h-12 bg-[#00604c] hover:bg-[#1f7a63] text-white font-bold rounded-xl flex items-center justify-center transition-all shadow-md cursor-pointer"
            >
              Confirm Paid & Complete
            </button>
          </div>
        )}

        {/* Cash Payment Slider View */}
        {selectedPaymentMethod === "CASH" && (
          <div className="bg-white border border-[#e0e3e0] rounded-xl p-5 shadow-sm space-y-4 animate-slideUp">
            <h3 className="font-extrabold text-sm text-gray-900 uppercase tracking-wide">Confirm Cash Collection</h3>
            <p className="text-xs text-gray-500">
              Please count and verify that you have collected exactly <span className="font-extrabold text-gray-900">{order.riderEarning || 0} PLN</span> in cash.
            </p>

            <div className="pt-2">
              <ActionSlider
                label="Slide to Confirm Collection"
                successLabel="Cash Collected ✓"
                onConfirm={handleConfirmCashPayment}
                color="bg-[#00604c]"
              />
            </div>
          </div>
        )}
      </div>
    );
  }

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
        <h2 className="text-sm font-bold text-gray-900">Delivery - Order #{order?.id?.slice(-6) || "Payment"}</h2>
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
          <h3 className="font-extrabold text-[#181d1b] text-lg">{order?.customerName || "Customer"}</h3>
          <p className="text-xs text-[#3e4945] flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5 text-[#00604c]" />
            {order?.deliveryAddress || "Customer Address"}
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
          "{order?.customerNote || "No instructions provided."}"
        </blockquote>
      </div>
    </div>

    {
      /* Cash Collection Banner */
    }
    {order?.paymentMethod === "CASH" && <div className="bg-[#ffdad6] text-[#93000a] p-4 rounded-xl flex items-center justify-between border-t-4 border-[#ba1a1a] shadow-sm animate-pulse">
      <div className="flex items-center gap-3">
        <span className="text-xl">💰</span>
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider opacity-85 text-[#93000a]">Payment Method</p>
          <p className="text-base font-extrabold">Collect {order?.riderEarning || 0} PLN Cash</p>
        </div>
      </div>
      <div className="bg-[#ba1a1a] text-white px-3 py-1 rounded-full text-xs font-bold shadow-xs">
        CASH
      </div>
    </div>}

    {
      /* Delivery Earnings Banner */
    }
    <div className="bg-[#e8f5e9] text-[#1b5e20] p-4 rounded-xl flex items-center justify-between border-t-4 border-[#4caf50] shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xl">💸</span>
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider opacity-85 text-[#1b5e20]">Delivery Earning</p>
          <p className="text-base font-extrabold">₹{order?.riderEarning || 0}</p>
        </div>
      </div>
      <div className="bg-[#4caf50] text-white px-3 py-1 rounded-full text-xs font-bold shadow-xs">
        EARN
      </div>
    </div>

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
        {cameraActive ? (
          <div className="relative w-full h-64 rounded-xl overflow-hidden border-2 border-[#00604c] bg-black shadow-inner flex flex-col justify-end">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="relative z-10 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex justify-center gap-4">
              <button
                onClick={stopCamera}
                className="bg-gray-800/80 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={capturePhoto}
                className="bg-[#00604c] hover:bg-[#1f7a63] text-white px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Capture Photo
              </button>
            </div>
          </div>
        ) : photoCaptured && photoPreviewUrl ? (
          <div className="relative w-full h-44 rounded-xl overflow-hidden border-2 border-[#00604c] shadow-sm group">
            <img
              alt="Confirmation Live Photo"
              className="w-full h-full object-cover"
              src={photoPreviewUrl}
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="bg-[#00604c] text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1">
                <Check className="w-4 h-4 stroke-[3]" /> Live Photo Captured
              </span>
            </div>
            <button
              onClick={retakePhoto}
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] px-2.5 py-1 rounded cursor-pointer animate-fadeIn"
            >
              Retake
            </button>
          </div>
        ) : (
          <button
            onClick={startCamera}
            className="w-full h-14 border-2 border-dashed border-[#bec9c3] hover:border-[#00604c] text-[#5d5f5b] rounded-xl flex items-center justify-center gap-2.5 transition-colors active:bg-[#f1f4f1] font-bold text-xs cursor-pointer"
          >
            <Camera className="w-5 h-5 text-[#5d5f5b]" />
            Open Camera Proof
          </button>
        )}
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
        disabled={uploadingPhoto || success}
        className="w-full h-[52px] bg-[#00604c] hover:bg-[#1f7a63] disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform shadow-md shadow-[#00604c]/25 text-base cursor-pointer"
      >
        {getButtonText()}
        <Check className="w-5 h-5 stroke-[2.5]" />
      </button>

      <div className="text-center">
        <button
          onClick={onReportIssue}
          className="text-xs font-semibold text-[#ba1a1a] hover:underline cursor-pointer"
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
