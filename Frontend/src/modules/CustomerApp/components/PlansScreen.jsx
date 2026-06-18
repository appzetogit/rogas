import { useState, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { IMAGES } from "../types";

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};
import { restaurantAPI, dmbCustomerAPI } from "@food/api";
import { API_BASE_URL } from "@food/api/config";

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const normalizeImageUrl = (imageUrl) => {
  if (!imageUrl) return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
  if (typeof imageUrl === "object") return imageUrl.url || imageUrl.secure_url || "";
  if (typeof imageUrl === "string") {
    if (/^(https?:)?\/\//i.test(imageUrl)) return imageUrl;
    return `${BACKEND_ORIGIN}${imageUrl.startsWith("/") ? imageUrl : "/" + imageUrl}`;
  }
  return "";
};

const getPrimaryImage = (vendor) => {
  const coverImages = Array.isArray(vendor?.coverImages) ? vendor.coverImages : [];
  const firstCoverImage = coverImages.map(normalizeImageUrl).find(Boolean);
  if (firstCoverImage) return firstCoverImage;
  return normalizeImageUrl(vendor?.profileImage) || normalizeImageUrl(vendor?.logo) || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
};

const DELIVERY_SLOTS = [
  { id: "breakfast", label: "Breakfast", time: "7:00 – 9:00 AM", icon: "☀️" },
  { id: "lunch", label: "Lunch", time: "12:00 – 2:00 PM", icon: "🌤️" },
  { id: "dinner", label: "Dinner", time: "7:00 – 9:00 PM", icon: "🌙" },
];


// ─── Menu Modal ────────────────────────────────────────────────────────────────
function MenuModal({ vendorId, vendorName, onClose }) {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const res = await dmbCustomerAPI.getVendorMenu(vendorId);
        setMenu(res.data?.menu || []);
      } catch (e) {
        console.error("Menu fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();
  }, [vendorId]);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-[#e4e2e1] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f0eded]">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#1b1c1c]">🍽️ Menu</h2>
            <p className="text-[12px] text-[#6e7a74]">{vendorName}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#f5f5f0] flex items-center justify-center active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-[13px] text-[#6e7a74]">Loading menu...</p>
            </div>
          ) : menu.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <span className="text-4xl">🍴</span>
              <p className="font-bold text-[#6e7a74]">No active menu items yet</p>
              <p className="text-[12px] text-[#6e7a74]">This vendor hasn't added menu items</p>
            </div>
          ) : menu.map((item) => (
            <div key={item._id} className="bg-[#f9f9f7] rounded-2xl p-4 flex gap-4 border border-[#e4e2e1]/50">
              {item.photos?.[0] ? (
                <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[#e4e2e1]">
                  <img src={normalizeImageUrl(item.photos[0])} alt={item.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">🥗</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-[14px] text-[#1b1c1c] truncate">{item.name}</h3>
                {item.description && (
                  <p className="text-[12px] text-[#6e7a74] mt-0.5 line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[15px] font-extrabold text-primary">₹{item.pricePerDay}/day</span>
                  {item.nutrition?.calories && (
                    <span className="text-[11px] text-[#6e7a74] bg-white border border-[#e4e2e1] px-2 py-0.5 rounded-full">
                      {item.nutrition.calories} kcal
                    </span>
                  )}
                </div>
                {item.allergens?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.allergens.slice(0, 3).map((a) => (
                      <span key={a} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-semibold">{a}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Plans Selection Modal ─────────────────────────────────────────────────────
// ─── Helper: get tomorrow's date as YYYY-MM-DD in local time ───────────────
const getTomorrowDateStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function PlansModal({ vendorId, vendorName, vendorImage, onClose, onProceedToCheckout, hasActiveSub }) {
  const [mealPlans, setMealPlans] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedSlots, setSelectedSlots] = useState(["lunch"]);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [showActiveSubWarning, setShowActiveSubWarning] = useState(false);
  const [feePerOrder, setFeePerOrder] = useState(0);
  // Start date — default to tomorrow, only future dates allowed
  const [selectedStartDate, setSelectedStartDate] = useState(getTomorrowDateStr);

  // Map & Zone state
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState("");
  const [lat, setLat] = useState(28.6139); // default
  const [lng, setLng] = useState(77.2090);
  const [showMap, setShowMap] = useState(false);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const fetchAddressFromCoordinates = (latitude, longitude) => {
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        if (status === 'OK' && results[0]) {
          setAddress(results[0].formatted_address);
        }
      });
    }
  };

  const handleLiveLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setLat(latitude);
        setLng(longitude);
        fetchAddressFromCoordinates(latitude, longitude);
        setShowMap(true);
      }, (error) => {
        alert('Failed to get live location. Please allow location permissions.');
      });
    } else {
      alert('Geolocation is not supported by your browser');
    }
  };

  const onMapClick = (e) => {
    const latitude = e.latLng.lat();
    const longitude = e.latLng.lng();
    setLat(latitude);
    setLng(longitude);
    fetchAddressFromCoordinates(latitude, longitude);
  };

  useEffect(() => {
    const fetchPlansAndDurations = async () => {
      try {
        setLoading(true);
        const [plansRes, zonesRes, subPlansRes] = await Promise.all([
          dmbCustomerAPI.getVendorPlans(vendorId),
          dmbCustomerAPI.getPublicZones(),
          dmbCustomerAPI.getSubscriptionPlans()
        ]);

        const plans = plansRes.data?.mealPlans || [];
        setMealPlans(plans);

        const activeZones = zonesRes.data?.data?.zones || zonesRes.data?.zones || [];
        setZones(activeZones);

        const subPlans = subPlansRes.data?.plans || [];
        setSubscriptionPlans(subPlans);
        setFeePerOrder(subPlansRes.data?.feePerOrder || 0);

        if (subPlans.length > 0) {
          setSelectedPlan(subPlans[0]);
        }
      } catch (e) {
        console.error("Plans fetch error:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPlansAndDurations();
  }, [vendorId]);

  const defaultMeal = mealPlans[0];
  const selectedMealsList = defaultMeal ? [{
    mealPlanId: defaultMeal._id,
    quantity: 1,
    name: defaultMeal.name,
    pricePerDay: defaultMeal.pricePerDay
  }] : [];

  const toggleSlotSelection = (slotId) => {
    setSelectedSlots((prev) => {
      if (prev.includes(slotId)) {
        if (prev.length === 1) {
          return prev;
        }
        return prev.filter((id) => id !== slotId);
      } else {
        return [...prev, slotId];
      }
    });
  };

  const getDaysCount = (plan) => {
    if (!plan) return 0;
    const isMonFri = plan.deliveryDays === "mon_fri";
    if (plan.duration === "day") return 1;
    if (plan.duration === "week") return isMonFri ? 5 : 7;
    if (plan.duration === "month") return isMonFri ? 20 : 30;
    return 0;
  };

  const daysCount = getDaysCount(selectedPlan);
  const sumActiveMenuPrices = mealPlans.reduce((acc, p) => acc + (p.pricePerDay || 0), 0);
  const activeMenuCount = mealPlans.length;
  const avgMenuPrice = activeMenuCount > 0 ? (sumActiveMenuPrices / activeMenuCount) : 0;

  const basePricePerDay = selectedPlan ? (selectedPlan.price / daysCount) : 0;
  const foodTotal = basePricePerDay * selectedSlots.length * daysCount;

  const foodVat = selectedPlan ? (selectedPlan.foodVat || 0) : 0;
  const deliveryVat = selectedPlan ? (selectedPlan.deliveryVat || 0) : 0;
  const platformFee = selectedPlan ? (selectedPlan.platformFee || 0) : 0;

  const foodVatBaseAmount = selectedPlan?.applyFoodVatOnMenu
    ? (avgMenuPrice * selectedSlots.length * daysCount)
    : foodTotal;

  const foodVatAmount = Math.round((foodVatBaseAmount * (foodVat / 100)) * 100) / 100;
  const deliveryCharge = daysCount * selectedSlots.length * feePerOrder;
  const deliveryVatAmount = Math.round((deliveryCharge * (deliveryVat / 100)) * 100) / 100;
  const platformFeeAmount = platformFee; // charged only once per subscription

  const totalPrice = Math.round((foodTotal + foodVatAmount + deliveryCharge + deliveryVatAmount + platformFeeAmount) * 100) / 100;

  const durationCodeMap = {
    day: "one_day",
    week: "weekly",
    month: "monthly"
  };

  const durationLabelMap = {
    day: "One Day",
    week: "Weekly",
    month: "Monthly"
  };

  const handleProceed = () => {
    if (!selectedPlan) {
      alert("Please select a subscription plan");
      return;
    }
    if (selectedMealsList.length === 0) {
      alert("No active meal plans found for this vendor");
      return;
    }
    if (!selectedZone) {
      alert("Please select a delivery zone");
      return;
    }
    if (address.trim() === "") {
      alert("Please enter a delivery address");
      return;
    }
    if (hasActiveSub) {
      setShowActiveSubWarning(true);
      return;
    }
    onProceedToCheckout({
      vendorId,
      vendorName,
      zoneId: selectedZone,
      meals: selectedMealsList,
      duration: durationCodeMap[selectedPlan.duration] || "weekly",
      durationLabel: durationLabelMap[selectedPlan.duration] || "Weekly",
      deliverySlot: selectedSlots[0] || "lunch",
      deliverySlots: selectedSlots,
      deliveryDays: selectedPlan.deliveryDays || "full_week",
      startDate: selectedStartDate,
      deliveryAddress: {
        street: address,
        city: "Local",
        state: "Local",
        label: "Home",
        location: {
          type: "Point",
          coordinates: [lng, lat]
        }
      },
      pricing: {
        basePricePerDay,
        deliveryFeePerDay: feePerOrder,
        subtotal: foodTotal,
        foodVat,
        deliveryVat,
        platformFee,
        foodVatAmount,
        foodVatBaseAmount,
        deliveryVatAmount,
        deliveryCharge,
        platformFeeAmount,
        totalPrice,
        applyFoodVatOnMenu: selectedPlan.applyFoodVatOnMenu
      },
      vendorImage
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-[#e4e2e1] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f0eded]">
          <div>
            <h2 className="text-[17px] font-extrabold text-[#1b1c1c]">📋 Subscription Plans</h2>
            <p className="text-[12px] text-[#6e7a74]">{vendorName}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-[#f5f5f0] flex items-center justify-center active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-[13px] text-[#6e7a74]">Loading plans...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Select Subscription Plan */}
              <section>
                <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest mb-3">Select Subscription Plan</h3>
                {subscriptionPlans.length === 0 ? (
                  <div className="bg-[#f9f9f7] rounded-xl p-4 text-center">
                    <span className="text-2xl">📋</span>
                    <p className="text-[13px] text-[#6e7a74] mt-1">No active plans configured by admin</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {subscriptionPlans.map((plan) => {
                      const isSelected = selectedPlan?._id === plan._id;
                      const planDays = getDaysCount(plan);
                      const displayDuration = plan.duration === "day" ? "Daily" : plan.duration === "week" ? "Weekly" : "Monthly";
                      const displaySchedule = plan.deliveryDays === "mon_fri" ? "Monday–Friday" : "Full Week";
                      
                      return (
                        <button
                          key={plan._id}
                          type="button"
                          onClick={() => setSelectedPlan(plan)}
                          className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex justify-between items-start gap-3 ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-[#e4e2e1] bg-[#f9f9f7] hover:border-primary/20"}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-[15px] text-[#1b1c1c]">{plan.name}</p>
                            <p className="text-[12px] font-medium text-[#6e7a74] mt-1">
                              {displayDuration} plan • {displaySchedule} ({planDays} Delivery Days)
                            </p>
                            {plan.description && (
                              <p className="text-[12px] text-[#6e7a74] mt-1.5 line-clamp-2">{plan.description}</p>
                            )}
                            {plan.features?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {plan.features.map((f, i) => (
                                  <span key={i} className="text-[10px] bg-white border border-[#e4e2e1] text-[#6e7a74] px-2 py-0.5 rounded-full font-semibold">
                                    ✓ {f}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[17px] font-extrabold text-primary">₹{plan.price}</p>
                            {isSelected && (
                              <div className="mt-2.5 flex items-center justify-end gap-1 text-primary">
                                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                <span className="text-[12px] font-bold">Selected</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Step 4: Delivery Slots (Breakfast/Lunch/Dinner) */}
              <section>
                <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest mb-3">Delivery Time Slots</h3>
                <div className="space-y-2">
                  {DELIVERY_SLOTS.map((slot) => {
                    const isSlotSelected = selectedSlots.includes(slot.id);
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => toggleSlotSelection(slot.id)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${isSlotSelected ? "border-primary bg-primary/5" : "border-[#e4e2e1] bg-[#f9f9f7]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSlotSelected}
                            readOnly
                            className="w-5 h-5 rounded border-[#bec9c3] text-[#1F7A63] focus:ring-[#1F7A63] cursor-pointer mr-1"
                          />
                          <span className="text-xl">{slot.icon}</span>
                          <div className="text-left">
                            <p className="font-extrabold text-[13px] text-[#1b1c1c]">{slot.label}</p>
                            <p className="text-[11px] text-[#6e7a74]">{slot.time}</p>
                          </div>
                        </div>
                        {isSlotSelected && (
                          <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_box</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Start Date Picker */}
              <section>
                <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest mb-3">Subscription Start Date</h3>
                <div className="relative">
                  <div className="flex items-center gap-3 bg-white border-2 border-[#e4e2e1] rounded-xl px-4 py-3 focus-within:border-primary transition-colors">
                    <span className="material-symbols-outlined text-primary text-[20px]">calendar_month</span>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider mb-0.5">First Delivery Date</p>
                      <input
                        type="date"
                        value={selectedStartDate}
                        min={getTomorrowDateStr()}
                        onChange={(e) => setSelectedStartDate(e.target.value)}
                        className="w-full bg-transparent text-[14px] font-extrabold text-[#1b1c1c] outline-none cursor-pointer"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-[#6e7a74] mt-1.5 ml-1">
                    📅 Today &amp; past dates cannot be selected. Default is tomorrow.
                  </p>
                </div>
              </section>

              {/* Step 5: Delivery Address & Zone */}
              <section>
                <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest mb-3">Service Zone</h3>
                <div className="bg-white rounded-xl border-2 border-[#e4e2e1] overflow-hidden mb-4">
                  <select
                    value={selectedZone}
                    onChange={(e) => setSelectedZone(e.target.value)}
                    className="w-full bg-transparent px-4 py-3 text-[13px] text-[#1b1c1c] font-medium outline-none"
                  >
                    <option value="">Select your Zone</option>
                    {zones.map(z => (
                      <option key={z._id} value={z._id}>{z.name}</option>
                    ))}
                  </select>
                </div>

                <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest mb-3">Delivery Address</h3>
                <div className="bg-white rounded-xl p-3 border-2 border-[#e4e2e1] space-y-3">
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Enter full address or select on map"
                    rows={2}
                    className="w-full bg-[#f9f9f7] rounded-lg px-3 py-2 text-[13px] font-medium text-[#1b1c1c] resize-none focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowMap(!showMap)}
                      className="flex-1 py-2 rounded-lg text-[12px] font-bold border border-primary text-primary flex items-center justify-center gap-1.5 transition-colors active:bg-primary/5"
                    >
                      <span className="material-symbols-outlined text-[16px]">location_on</span>
                      {showMap ? 'Hide Map' : 'Set on Map'}
                    </button>
                    <button
                      onClick={handleLiveLocation}
                      className="flex-1 py-2 rounded-lg text-[12px] font-bold bg-[#1F7A63]/10 text-[#1F7A63] flex items-center justify-center gap-1.5 transition-colors active:bg-[#1F7A63]/20"
                    >
                      <span className="material-symbols-outlined text-[16px]">my_location</span>
                      Live Location
                    </button>
                  </div>

                  {showMap && (
                    <div className="h-[200px] w-full rounded-lg overflow-hidden border border-[#e4e2e1] relative z-0">
                      {isLoaded ? (
                        <GoogleMap
                          mapContainerStyle={mapContainerStyle}
                          center={{ lat, lng }}
                          zoom={14}
                          onClick={onMapClick}
                          options={{ disableDefaultUI: true, zoomControl: true }}
                        >
                          <Marker position={{ lat, lng }} />
                        </GoogleMap>
                      ) : (
                        <div className="flex items-center justify-center h-full text-[#6e7a74] text-[12px] bg-[#f9f9f7]">Loading Map...</div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Price Summary */}
              {selectedPlan && (
                <section className="bg-[#1F7A63]/5 rounded-2xl p-4 border border-primary/20">
                  <h3 className="text-[11px] font-bold text-[#6e7a74] uppercase tracking-widest mb-3">Price Summary</h3>
                  <div className="space-y-2 text-[13px]">
                    <div className="space-y-1">
                      {defaultMeal ? (
                        <div className="flex justify-between text-[#6e7a74]">
                          <span>Default Meal: {defaultMeal.name}</span>
                          <span>(Initial)</span>
                        </div>
                      ) : (
                        <div className="text-[#ea4335] text-[12px] font-bold">
                          ⚠️ No active meal plans found for this vendor.
                        </div>
                      )}
                    </div>
                    <div className="border-t border-[#e4e2e1] pt-2 flex justify-between text-[#6e7a74]">
                      <span>Plan Base Rate</span>
                      <span className="font-bold">₹{selectedPlan.price}</span>
                    </div>
                    <div className="flex justify-between text-[#6e7a74]">
                      <span>Duration</span>
                      <span className="font-bold">
                        {selectedPlan.duration === "day" ? "Daily" : selectedPlan.duration === "week" ? "Weekly" : "Monthly"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#6e7a74]">
                      <span>Selected Slots Count</span>
                      <span className="font-bold">× {selectedSlots.length} slot{selectedSlots.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex justify-between text-[#6e7a74]">
                      <span>Delivery Slots</span>
                      <span className="font-bold text-right">
                        {selectedSlots.map(id => DELIVERY_SLOTS.find(s => s.id === id)).map(s => s ? `${s.icon} ${s.label}` : "").join(" + ")}
                      </span>
                    </div>
                    <div className="border-t border-[#e4e2e1] pt-2 flex justify-between text-[#6e7a74]">
                      <span>Food Total</span>
                      <span className="font-bold">₹{foodTotal.toFixed(2)}</span>
                    </div>
                    {foodVat > 0 && (
                      <div className="flex justify-between text-[#6e7a74]">
                        <span>Food VAT ({foodVat}%{selectedPlan.applyFoodVatOnMenu ? ` on ₹${foodVatBaseAmount.toFixed(2)} Menu Total` : ""})</span>
                        <span className="font-bold">₹{foodVatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[#6e7a74]">
                      <span>Delivery Charge</span>
                      <span className="font-bold">₹{deliveryCharge.toFixed(2)}</span>
                    </div>
                    {deliveryVat > 0 && (
                      <div className="flex justify-between text-[#6e7a74]">
                        <span>Delivery VAT ({deliveryVat}%)</span>
                        <span className="font-bold">₹{deliveryVatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {platformFee > 0 && (
                      <div className="flex justify-between text-[#6e7a74]">
                        <span>Platform Fee (One-time)</span>
                        <span className="font-bold">₹{platformFeeAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t border-primary/20 pt-2 mt-2 flex justify-between">
                      <span className="font-extrabold text-[#1b1c1c]">Total Price</span>
                      <span className="font-extrabold text-[17px] text-primary">₹{totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </section>
              )}

              {/* CTA */}
              <button
                onClick={handleProceed}
                disabled={selectedMealsList.length === 0 || !selectedZone || !address.trim()}
                className="w-full bg-[#1F7A63] disabled:opacity-50 text-white font-extrabold py-4 rounded-2xl text-[15px] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">shopping_cart</span>
                Proceed to Checkout
              </button>
              <div className="h-4" />
            </div>
          )}
        </div>
      </div>

      {showActiveSubWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[210] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-left">
            <h3 className="text-lg font-extrabold text-[#F59E0B] flex items-center gap-2">
              <span className="material-symbols-outlined">warning</span>
              Active Subscription Exists
            </h3>

            <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
              You already have an active or paused subscription plan. You cannot purchase another plan until your current subscription expires or is cancelled.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowActiveSubWarning(false)}
                className="w-full bg-primary hover:bg-[#155a49] text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main PlansScreen ──────────────────────────────────────────────────────────
export function PlansScreen({ onGoBack, onSelectPlan, onGoToProfile }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [openPlansFor, setOpenPlansFor] = useState(null);
  const [hasActiveSub, setHasActiveSub] = useState(false);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        setLoading(true);
        const response = await restaurantAPI.getRestaurants(
          { limit: 100, status: "approved" },
          { noCache: true, headers: { "X-Zone-Id": "" } }
        );
        const list = response?.data?.data?.restaurants || response?.data?.data || response?.data?.restaurants || [];
        setVendors(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error("Error fetching vendors:", err);
      } finally {
        setLoading(false);
      }
    };
    const checkActiveSub = async () => {
      try {
        const res = await dmbCustomerAPI.getMySubscriptions();
        if (res.data?.success) {
          const activeOrPaused = res.data.subscriptions?.some(
            sub => sub.status === "active" || sub.status === "paused"
          );
          setHasActiveSub(activeOrPaused);
        }
      } catch (e) {
        console.error("Error checking active subscriptions:", e);
      }
    };
    fetchVendors();
    checkActiveSub();
  }, []);

  const activePlans = vendors.map((vendor) => {
    let tags = [];
    if (Array.isArray(vendor.cuisines) && vendor.cuisines.length > 0) {
      tags = vendor.cuisines.slice(0, 3).map((c) => (typeof c === "string" ? c : c.name));
    } else if (vendor.vendorType) {
      const typeMap = { home_cook: "Home Cook", cloud_kitchen: "Cloud Kitchen", restaurant: "Restaurant", catering: "Catering" };
      tags = [typeMap[vendor.vendorType] || vendor.vendorType, "Fresh Meals"];
    } else {
      tags = ["Fresh Meals", "Daily Delivery"];
    }

    const num = (vendor._id || vendor.id || "").toString().split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const matchPct = 85 + (num % 15);

    return {
      id: vendor._id || vendor.id,
      name: vendor.restaurantName || vendor.name || "Meal Vendor",
      chefName: vendor.ownerName || "Chef",
      location: vendor.city || vendor.zone || "Local",
      rating: (vendor.ratings?.average || vendor.rating || 4.5).toFixed(1),
      tags,
      image: getPrimaryImage(vendor),
      isBestMatch: matchPct >= 97,
      matchPct,
      vendorData: vendor,
    };
  });

  const filteredPlans = activePlans.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.chefName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProceedToCheckout = (checkoutData) => {
    setOpenPlansFor(null);
    onSelectPlan(checkoutData);
  };

  return (
    <>
      <div className="bg-[#F5F5F0] text-on-surface min-h-screen pb-32">
        {/* Top Header */}
        <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
          <h1 className="text-xl font-extrabold text-primary text-center">Meal Plans</h1>
          <div className="w-8" />
        </header>

        <main className="pt-20 px-4">
          {/* Search */}
          <div className="relative mb-4">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#bec9c3] text-[20px]">search</span>
            <input
              type="text"
              placeholder="Search vendors, cuisines, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-11 pr-4 bg-white border border-[#bec9c3] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6e7a74]">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            )}
          </div>

          {/* Hero Banner */}
          <div className="bg-gradient-to-br from-[#1F7A63] to-[#155a49] rounded-2xl p-5 mb-5 relative overflow-hidden shadow-lg">
            <div className="absolute -right-6 -top-6 w-28 h-28 bg-white/10 rounded-full blur-xl" />
            <div className="absolute right-4 bottom-2 opacity-20 text-[80px] leading-none">🥗</div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🤖</span>
                <p className="text-white/80 text-[12px] font-bold uppercase tracking-wider">AI Curated for You</p>
              </div>
              <p className="text-white text-[19px] font-extrabold leading-tight">Choose Your Daily Meal Partner</p>
              <p className="text-white/70 text-[12px] mt-1">Fresh • Healthy • Delivered to your door</p>
            </div>
          </div>

          {/* Section heading */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-bold text-[#6e7a74] uppercase tracking-widest">
              {loading ? "Loading..." : `${filteredPlans.length} vendor${filteredPlans.length !== 1 ? "s" : ""} available`}
            </h2>
          </div>

          {/* Vendor Cards */}
          <section className="space-y-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                    <div className="h-44 bg-[#e4e2e1]" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-[#e4e2e1] rounded w-3/4" />
                      <div className="h-3 bg-[#e4e2e1] rounded w-1/2" />
                      <div className="h-8 bg-[#e4e2e1] rounded-xl mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <span className="text-5xl">🍽️</span>
                <p className="font-extrabold text-[#1b1c1c] text-[16px]">No vendors found</p>
                <p className="text-[13px] text-[#6e7a74]">{searchQuery ? "Try a different search" : "No approved vendors yet"}</p>
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-primary font-bold text-sm underline">Clear search</button>
                )}
              </div>
            ) : (
              filteredPlans.map((plan) => (
                <article
                  key={plan.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-md border border-transparent hover:border-primary/20 hover:shadow-lg transition-all duration-300"
                >
                  {/* Cover Image */}
                  <div className="relative h-44 w-full bg-[#e4e2e1] overflow-hidden">
                    <img
                      alt={plan.name}
                      className="w-full h-full object-cover"
                      src={plan.image}
                      onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80"; }}
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {plan.isBestMatch && (
                        <span className="bg-primary text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wide shadow">
                          ⭐ Best Match
                        </span>
                      )}
                      <span className="bg-white/95 backdrop-blur-sm text-primary text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow">
                        {plan.matchPct}% match
                      </span>
                    </div>

                    {/* Rating badge */}
                    <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm flex items-center gap-1 px-2.5 py-1 rounded-full shadow">
                      <span className="material-symbols-outlined text-amber-400 text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <span className="text-[12px] font-extrabold text-[#1b1c1c]">{plan.rating}</span>
                    </div>

                    {/* Vendor name on image */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-white font-extrabold text-[16px] drop-shadow-md">{plan.name}</h3>
                      <p className="text-white/80 text-[12px] font-medium drop-shadow">
                        {plan.chefName} • {plan.location}
                      </p>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4">
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {plan.tags.map((tag) => (
                        <span key={tag} className="bg-primary/8 text-primary text-[11px] font-bold px-2.5 py-1 rounded-full border border-primary/15">
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex gap-2">
                      {/* View Menu Button */}
                      <button
                        onClick={() => setOpenMenuFor(plan)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#f5f5f0] text-[#1b1c1c] border border-[#e4e2e1] py-3 rounded-xl text-[13px] font-bold active:scale-[0.97] transition-all hover:bg-[#eef0ec]"
                      >
                        <span className="material-symbols-outlined text-[18px] text-primary">restaurant_menu</span>
                        View Menu
                      </button>

                      {/* View Plans Button */}
                      <button
                        onClick={() => setOpenPlansFor(plan)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#1F7A63] text-white py-3 rounded-xl text-[13px] font-bold active:scale-[0.97] transition-all hover:bg-[#155a49] shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">subscriptions</span>
                        View Plans
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>

          <div className="h-20" />
        </main>
      </div>

      {/* Menu Modal */}
      {openMenuFor && (
        <MenuModal
          vendorId={openMenuFor.id}
          vendorName={openMenuFor.name}
          onClose={() => setOpenMenuFor(null)}
        />
      )}

      {/* Plans Modal */}
      {openPlansFor && (
        <PlansModal
          vendorId={openPlansFor.id}
          vendorName={openPlansFor.name}
          vendorImage={openPlansFor.image}
          onClose={() => setOpenPlansFor(null)}
          onProceedToCheckout={handleProceedToCheckout}
          hasActiveSub={hasActiveSub}
        />
      )}
    </>
  );
}
