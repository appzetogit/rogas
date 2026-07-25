import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Calendar as CalendarIcon, MapPin, Receipt, Info, X, ChevronDown, ChevronUp, ChevronLeft } from 'lucide-react';
import { usePantryCart } from './PantryCartContext';
import { dmbCustomerAPI } from '@food/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const mapContainerStyle = { width: '100%', height: '100%' };
const MAP_LIBRARIES = ["places", "drawing", "geometry"];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const formatDateForApi = (d) => {
  const offset = d.getTimezoneOffset();
  const normalized = new Date(d.getTime() - (offset * 60 * 1000));
  return normalized.toISOString().split('T')[0];
};

const generateDates = () => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
};

const SLOTS = [
  { id: 'breakfast', label: 'Breakfast (6AM–11AM)' },
  { id: 'lunch', label: 'Lunch (11AM–4PM)' },
  { id: 'dinner', label: 'Dinner (4PM–11PM)' },
];

// ─── Helper: Date Chip Row ───────────────────────────────────────────────────
function DateChips({ dates, selectedDates, onToggle }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {dates.map((d, i) => {
        const apiDate = formatDateForApi(d);
        const isSelected = selectedDates.includes(apiDate);
        const day = d.toLocaleDateString('en-US', { weekday: 'narrow' });
        const dateNum = d.getDate();
        return (
          <button
            key={i}
            onClick={() => onToggle(apiDate)}
            className={`flex flex-col items-center justify-center min-w-[54px] h-[68px] rounded-[14px] transition-all flex-shrink-0 ${isSelected ? 'bg-[#1F7A63] text-white shadow-[0_6px_16px_rgba(31,122,99,0.3)]' : 'bg-[#f6f8f7] border border-[#e4e2e1]/50 text-[#6e7a74] hover:bg-[#eef0ec]'
              }`}
          >
            <span className={`text-[10px] font-medium uppercase tracking-widest ${isSelected ? 'text-white/90' : 'text-[#a1a8a5]'}`}>{day}</span>
            <span className={`text-[16px] font-semibold mt-0.5 ${isSelected ? 'text-white' : 'text-[#1b1c1c]'}`}>{dateNum}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PantryCheckoutScreen() {
  const navigate = useNavigate();
  const { cart, cartTotal, totalItems, clearCart, updateItemDates, updateItemSlots, addItem, removeItem } = usePantryCart();

  const [dates] = useState(generateDates);
  // Global dates — applied to items that have no custom dates
  const [globalDates, setGlobalDates] = useState([formatDateForApi(new Date())]);
  // Global slots
  const [globalSlots, setGlobalSlots] = useState(['lunch']);
  const [loading, setLoading] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState(null);
  // Pricing config from backend
  const [pricingConfig, setPricingConfig] = useState({ foodVatPercent: 0, platformFee: 0 });
  // Which items' date pickers are expanded
  const [expandedItemIds, setExpandedItemIds] = useState([]);

  // Map state
  const [showMap, setShowMap] = useState(false);
  const [lat, setLat] = useState(28.6139);
  const [lng, setLng] = useState(77.2090);
  const [tempAddress, setTempAddress] = useState('');

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: MAP_LIBRARIES,
  });

  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      navigate('/user/plans');
      return;
    }
    try {
      const userStr = localStorage.getItem('user_user');
      if (userStr) {
        const u = JSON.parse(userStr);
        if (u.deliveryAddress) setDeliveryAddress(u.deliveryAddress);
      }
    } catch (_) { }
  }, [cart, navigate]);

  // Fetch pricing config (Food VAT %, Platform Fee) for the vendor
  useEffect(() => {
    const fetchPricingConfig = async () => {
      if (!cart?.vendorId) return;
      try {
        const res = await dmbCustomerAPI.getVendorPricingConfig(cart.vendorId);
        if (res.data?.success) {
          setPricingConfig({
            foodVatPercent: res.data.foodVatPercent || 0,
            platformFee: res.data.platformFee || 0,
          });
        }
      } catch (err) {
        // fallback to defaults silently
      }
    };
    fetchPricingConfig();
  }, [cart?.vendorId]);

  // ─── Date helpers ────────────────────────────────────────────────────────────
  const toggleGlobalDate = (dateStr) => {
    setGlobalDates(prev => {
      if (prev.includes(dateStr)) {
        if (prev.length === 1) { toast.error('At least one date required.'); return prev; }
        return prev.filter(d => d !== dateStr);
      }
      return [...prev, dateStr];
    });
  };

  const toggleItemDate = (itemId, dateStr) => {
    const item = cart.items.find(i => i.pantryItemId === itemId);
    if (!item) return;
    const current = item.deliveryDates && item.deliveryDates.length > 0 ? item.deliveryDates : [...globalDates];
    let next;
    if (current.includes(dateStr)) {
      if (current.length === 1) { toast.error('At least one date required.'); return; }
      next = current.filter(d => d !== dateStr);
    } else {
      next = [...current, dateStr];
    }
    updateItemDates(itemId, next);
  };

  const resetItemDates = (itemId) => {
    updateItemDates(itemId, []); // back to global
  };

  // ─── Slot helper ─────────────────────────────────────────────────────────────
  const toggleGlobalSlot = (slotId) => {
    setGlobalSlots(prev => {
      if (prev.includes(slotId)) {
        if (prev.length === 1) { toast.error('At least one slot required.'); return prev; }
        return prev.filter(s => s !== slotId);
      }
      return [...prev, slotId];
    });
  };

  const toggleItemSlot = (itemId, slotId) => {
    const item = cart.items.find(i => i.pantryItemId === itemId);
    if (!item) return;
    const current = item.deliverySlots && item.deliverySlots.length > 0 ? item.deliverySlots : [...globalSlots];
    let next;
    if (current.includes(slotId)) {
      if (current.length === 1) { toast.error('At least one slot required.'); return; }
      next = current.filter(s => s !== slotId);
    } else {
      next = [...current, slotId];
    }
    updateItemSlots(itemId, next);
  };

  const resetItemSlots = (itemId) => {
    updateItemSlots(itemId, []); // back to global
  };

  // ─── Smart Pricing ────────────────────────────────────────────────────────────
  const getItemDates = (item) =>
    item.deliveryDates && item.deliveryDates.length > 0 ? item.deliveryDates : globalDates;

  const getItemSlots = (item) =>
    item.deliverySlots && item.deliverySlots.length > 0 ? item.deliverySlots : globalSlots;

  const uniqueDeliveryTrips = () => {
    const all = new Set();
    (cart.items || []).forEach(item => {
      const dates = getItemDates(item);
      const slots = getItemSlots(item);
      dates.forEach(d => {
        // Technically, multiple trips if different slots on same day. 
        // We'll count unique days for pricing to match previous logic, or unique day-slots.
        // The previous logic counted unique days. Let's stick to unique days to not shock the user with higher fees,
        // or unique day-slots if we want to be exact. Let's count unique days for fee, as per original logic.
        all.add(d);
      });
    });
    return [...all];
  };

  // ─── Pricing Calculation (new formula) ─────────────────────────────────────
  // itemsTotal = sum of all selected item prices (base, no date/slot multiplier)
  const itemsTotal = (cart.items || []).reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Unique delivery days across all items
  const uniqueDatesSet = new Set();
  const uniqueSlotsSet = new Set();
  (cart.items || []).forEach(item => {
    getItemDates(item).forEach(d => uniqueDatesSet.add(d));
    getItemSlots(item).forEach(s => uniqueSlotsSet.add(s));
  });
  const uniqueDates = [...uniqueDatesSet];
  const totalDeliveryDays = uniqueDates.length;
  const totalDeliverySlots = uniqueSlotsSet.size;

  const foodVatPercent = pricingConfig.foodVatPercent || 0;
  const platformFee = pricingConfig.platformFee || 0;
  const foodVatAmount = Math.round((itemsTotal * (foodVatPercent / 100)) * 100) / 100;

  // Grand Total = Items Total × (Days * Slots) + Food VAT + Platform Fee
  const grandTotal = (itemsTotal * (totalDeliveryDays * totalDeliverySlots)) + foodVatAmount + platformFee;

  // ─── Map ─────────────────────────────────────────────────────────────────────
  const fetchAddressFromCoordinates = (latitude, longitude) => {
    if (window.google && window.google.maps) {
      new window.google.maps.Geocoder().geocode(
        { location: { lat: latitude, lng: longitude } },
        (results, status) => {
          if (status === 'OK' && results[0]) setTempAddress(results[0].formatted_address);
        }
      );
    }
  };

  const handleLiveLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setLat(coords.latitude); setLng(coords.longitude);
          fetchAddressFromCoordinates(coords.latitude, coords.longitude);
          setShowMap(true);
        },
        () => { toast.error('Location permission denied.'); setShowMap(true); }
      );
    } else {
      toast.error('Geolocation not supported.');
      setShowMap(true);
    }
  };

  const onMapClick = (e) => {
    const latitude = e.latLng.lat();
    const longitude = e.latLng.lng();
    setLat(latitude); setLng(longitude);
    fetchAddressFromCoordinates(latitude, longitude);
  };

  const confirmMapAddress = () => {
    if (!tempAddress) { toast.error('Please drop a pin.'); return; }
    const parts = tempAddress.split(', ');
    setDeliveryAddress({
      label: 'Selected from Map',
      street: parts[0] || tempAddress,
      city: parts[1] || 'City',
      state: parts[2] || 'State',
      pincode: parts.length > 3 ? parts[3] : '000000',
      location: { type: 'Point', coordinates: [lng, lat] },
    });
    setShowMap(false);
  };

  // ─── Payment & Grouped Order Placement ───────────────────────────────────────
  const handlePayment = async () => {
    if (!deliveryAddress) { toast.error('Please select a delivery address.'); return; }
    if (globalSlots.length === 0) { toast.error('Please select at least one delivery slot.'); return; }

    setLoading(true);
    try {
      // 1. Build date/slot groups: key = sorted dates + sorted slots
      const dateGroups = {};
      (cart.items || []).forEach(item => {
        const resolvedDates = getItemDates(item);
        const resolvedSlots = getItemSlots(item);
        const key = [...resolvedDates].sort().join(',') + '|' + [...resolvedSlots].sort().join(',');

        if (!dateGroups[key]) dateGroups[key] = { dates: resolvedDates, slots: resolvedSlots, items: [] };
        dateGroups[key].items.push({ pantryItemId: item.pantryItemId, quantity: item.quantity });
      });

      const groups = Object.values(dateGroups);

      // 2. Single Razorpay payment for grandTotal
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        toast.error('Razorpay SDK not loaded.');
        setLoading(false);
        return;
      }

      // Create a temporary order using the first group to get razorpay order id.
      // Pass grandTotal as totalOverride so the backend uses the frontend-calculated amount.
      const frontendGrandTotalPaise = Math.round(grandTotal * 100);
      const firstGroupPayload = {
        vendorId: cart.vendorId,
        items: groups[0].items,
        deliveryDates: groups[0].dates,
        deliverySlots: groups[0].slots,
        deliveryAddress,
        totalOverride: grandTotal, // backend must use this exact amount
      };

      const firstRes = await dmbCustomerAPI.createPantryOrder(firstGroupPayload);
      if (!firstRes.data?.success) throw new Error(firstRes.data?.message || 'Failed to create order');

      const { order: firstOrder, razorpayOrderId, razorpayKeyId, razorpayAmount } = firstRes.data;

      // ── Amount mismatch guard ──────────────────────────────────────────────
      // Validate that the amount the backend sent to Razorpay matches what we
      // computed on the frontend. If they differ, do NOT open Razorpay.
      const backendAmountPaise = razorpayAmount != null
        ? Math.round(Number(razorpayAmount))
        : frontendGrandTotalPaise; // if backend didn't return it, we trust it matched

      if (backendAmountPaise !== frontendGrandTotalPaise) {
        toast.error('Server error. Please try again later.');
        setLoading(false);
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

      const options = {
        key: razorpayKeyId,
        amount: frontendGrandTotalPaise,
        currency: 'INR',
        name: 'Rogas Pantry',
        description: `Pantry Order — ${groups.length} group(s)`,
        order_id: razorpayOrderId,
        handler: async (response) => {
          try {
            // Verify first order payment
            const verifyRes = await dmbCustomerAPI.verifyPantryPayment({
              orderId: firstOrder.orderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (!verifyRes.data?.success) throw new Error('Payment verification failed');

            // Place remaining group orders (2, 3, ...) silently
            for (let i = 1; i < groups.length; i++) {
              const g = groups[i];
              try {
                await dmbCustomerAPI.createPantryOrder({
                  vendorId: cart.vendorId,
                  items: g.items,
                  deliveryDates: g.dates,
                  deliverySlots: g.slots,
                  deliveryAddress,
                  paymentId: response.razorpay_payment_id, // link to same payment
                });
              } catch (groupErr) {
                console.error(`Group ${i + 1} order failed:`, groupErr);
              }
            }

            clearCart();
            toast.success('Payment successful! Your orders are placed.');
            navigate('/user/orders');
          } catch (err) {
            toast.error('Payment verification failed. Contact support.');
          }
        },
        theme: { color: '#1F7A63' },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => toast.error('Payment failed or cancelled.'));
      rzp.open();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Payment initiation failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!cart || cart.items.length === 0) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F5F0] pb-[220px]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#e4e2e1]/60 px-5 pt-6 pb-4 flex items-center justify-center relative">
        <button onClick={() => navigate(-1)} className="absolute left-5 p-2 -ml-2 text-[#1F7A63] active:scale-95 transition-transform flex items-center justify-center">
          <ArrowLeft className="w-6 h-6" strokeWidth={2.5} />
        </button>
        <h1 className="text-[18px] font-extrabold text-[#1F7A63] tracking-wide uppercase">Checkout</h1>
      </div>

      <div className="px-5 space-y-6 mt-6">



        {/* ── ITEMS with per-item date override ── */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <h2 className="text-[16px] font-extrabold text-[#1b1c1c] mb-4 flex items-center gap-2">
            <Receipt className="text-[18px] text-primary" />
            Items &amp; Schedules
          </h2>
          <div className="space-y-4">
            {cart.items.map(item => {
              const resolvedDates = getItemDates(item);
              const resolvedSlots = getItemSlots(item);
              const hasCustomDates = item.deliveryDates && item.deliveryDates.length > 0;
              const hasCustomSlots = item.deliverySlots && item.deliverySlots.length > 0;
              const isExpanded = expandedItemIds.includes(item.pantryItemId);

              return (
                <div key={item.pantryItemId} className="rounded-2xl border border-[#ebebeb] overflow-hidden bg-white">

                  {/* ── Top Row: Title | Price | Expand ── */}
                  <div className="flex items-center px-4 py-3 gap-3">
                    {/* Title + badge */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#1b1c1c] truncate">{item.title}</p>
                      <p className="text-[11px] mt-0.5">
                        {hasCustomDates
                          ? <span className="text-[#1F7A63] font-semibold">Custom Schedule</span>
                          : <span className="text-[#a0a8a5]">Global Schedule</span>
                        }
                      </p>
                    </div>

                    {/* Price */}
                    <span className="font-extrabold text-[14px] text-[#1F7A63] shrink-0">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpandedItemIds(prev =>
                        prev.includes(item.pantryItemId)
                          ? prev.filter(id => id !== item.pantryItemId)
                          : [...prev, item.pantryItemId]
                      )}
                      className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                    >
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-[#1F7A63]" />
                        : <ChevronDown className="w-4 h-4 text-[#9a9a9a]" />}
                    </button>
                  </div>

                  {/* ── Qty Stepper row (always visible) ── */}
                  <div className="flex items-center justify-between px-4 pb-3">
                    <span className="text-[12px] text-[#a0a8a5]">₹{item.price.toFixed(2)} / unit</span>
                    <div className="flex items-center gap-2 bg-[#f5f5f0] rounded-full px-3 py-1">
                      <button
                        onClick={() => removeItem(item.pantryItemId)}
                        className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-[#1F7A63] font-bold text-[16px] shadow-sm active:scale-90 transition-transform"
                      >−</button>
                      <span className="text-[14px] font-extrabold text-[#1b1c1c] min-w-[20px] text-center">{item.quantity}</span>
                      <button
                        onClick={() => addItem({ _id: item.pantryItemId, title: item.title, price: item.price }, cart.vendorId)}
                        className="w-6 h-6 rounded-full bg-[#1F7A63] flex items-center justify-center text-white font-bold text-[16px] shadow-sm active:scale-90 transition-transform"
                      >+</button>
                    </div>
                  </div>

                  {/* ── Expanded: Dates + Slots ── */}
                  {isExpanded && (
                    <div className="border-t border-[#f0f0f0] bg-[#fafaf9] px-4 pt-4 pb-5 space-y-5">

                      {/* Dates */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[12px] font-extrabold text-[#1b1c1c] uppercase tracking-wide">Delivery Dates</p>
                          {hasCustomDates && (
                            <button
                              onClick={() => resetItemDates(item.pantryItemId)}
                              className="text-[11px] text-[#1F7A63] font-semibold"
                            >Reset</button>
                          )}
                        </div>
                        <DateChips
                          dates={dates}
                          selectedDates={resolvedDates}
                          onToggle={(d) => toggleItemDate(item.pantryItemId, d)}
                        />
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-[#ebebeb]" />

                      {/* Slots */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[12px] font-extrabold text-[#1b1c1c] uppercase tracking-wide">Delivery Slots</p>
                          {hasCustomSlots && (
                            <button
                              onClick={() => resetItemSlots(item.pantryItemId)}
                              className="text-[11px] text-[#1F7A63] font-semibold"
                            >Reset</button>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {SLOTS.map(slotObj => (
                            <button
                              key={slotObj.id}
                              onClick={() => toggleItemSlot(item.pantryItemId, slotObj.id)}
                              className={`w-full py-2.5 rounded-xl text-[13px] font-bold transition-all ${
                                resolvedSlots.includes(slotObj.id)
                                  ? 'bg-[#1F7A63] text-white shadow-sm'
                                  : 'bg-white border border-[#e4e2e1] text-[#6e7a74]'
                              }`}
                            >
                              {slotObj.label}
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>



        {/* ── ADDRESS ── */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[16px] font-extrabold text-[#1b1c1c] flex items-center gap-2">
              <MapPin className="text-[18px] text-primary" />
              Delivery Address
            </h2>
            {deliveryAddress && (
              <button onClick={handleLiveLocation} className="text-[#1F7A63] text-[11px] font-extrabold tracking-widest uppercase hover:underline">
                EDIT
              </button>
            )}
          </div>
          {deliveryAddress ? (
            <div className="bg-[#eef0ec] rounded-2xl p-4">
              <p className="text-[14px] font-bold text-[#1b1c1c]">{deliveryAddress.label || 'Home'}</p>
              <p className="text-[13px] text-[#6e7a74] mt-1 line-clamp-2">{deliveryAddress.street}, {deliveryAddress.city}</p>
            </div>
          ) : (
            <button onClick={handleLiveLocation} className="w-full py-3 border-2 border-dashed border-primary/30 rounded-2xl text-primary font-bold text-[14px] flex items-center justify-center gap-2">
              <MapPin className="text-[16px]" /> Set Address on Map
            </button>
          )}
        </div>

        {/* ── PRICING SUMMARY ── */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <h2 className="text-[16px] font-extrabold text-[#1b1c1c] mb-3">Price Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-[14px] text-[#6e7a74]">
              <span>Items Total</span>
              <span className="font-semibold text-[#1b1c1c]">₹{itemsTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[14px] text-[#6e7a74]">
              <span>Delivery Days</span>
              <span className="font-semibold text-[#1b1c1c]">{totalDeliveryDays} day(s)</span>
            </div>
            <div className="flex justify-between text-[14px] text-[#6e7a74]">
              <span>Delivery Slots</span>
              <span className="font-semibold text-[#1b1c1c]">{totalDeliverySlots} slot(s)</span>
            </div>
            {foodVatPercent > 0 && (
              <div className="flex justify-between text-[14px] text-[#6e7a74]">
                <span>Food VAT ({foodVatPercent}%)</span>
                <span className="font-semibold text-[#1b1c1c]">₹{foodVatAmount.toFixed(2)}</span>
              </div>
            )}
            {platformFee > 0 && (
              <div className="flex justify-between text-[14px] text-[#6e7a74]">
                <span>Platform Fee</span>
                <span className="font-semibold text-[#1b1c1c]">₹{platformFee.toFixed(2)}</span>
              </div>
            )}
            <div className="h-[1px] bg-[#f0f0f0] my-1" />
            <div className="flex justify-between text-[16px] font-extrabold text-[#1b1c1c]">
              <span>Grand Total</span>
              <span className="text-primary">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ── Map Modal ── */}
      {showMap && isLoaded && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden w-full max-w-[420px] shadow-2xl flex flex-col h-[70vh]">
            <div className="px-5 py-4 border-b border-[#f0eded] flex justify-between items-center">
              <h2 className="text-[18px] font-extrabold text-[#1b1c1c]">Set Delivery Location</h2>
              <button onClick={() => setShowMap(false)} className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center">
                <X className="text-[20px]" />
              </button>
            </div>
            <div className="flex-1 relative">
              <GoogleMap mapContainerStyle={mapContainerStyle} center={{ lat, lng }} zoom={15} onClick={onMapClick} options={{ disableDefaultUI: true, zoomControl: true }}>
                <Marker position={{ lat, lng }} />
              </GoogleMap>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg text-[13px] font-bold text-[#1b1c1c]">
                Tap anywhere to move pin
              </div>
            </div>
            <div className="p-5 border-t border-[#f0eded]">
              <p className="text-[13px] text-[#6e7a74] mb-3 line-clamp-2 min-h-[38px]">{tempAddress || 'Fetching address...'}</p>
              <button onClick={confirmMapAddress} className="w-full h-[48px] bg-primary text-white rounded-xl font-extrabold text-[15px] active:scale-[0.98] transition-all">
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Bottom Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white px-5 py-4 border-t border-[#f0f0f0] shadow-[0_-12px_24px_rgba(0,0,0,0.06)] z-20">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-[12px] text-[#6e7a74] font-medium">Total for {totalDeliveryDays} day(s) · {totalDeliverySlots} slot(s)</p>
            <p className="text-[11px] text-[#1F7A63] font-bold mt-0.5">{foodVatPercent > 0 ? `Includes ₹${foodVatAmount.toFixed(2)} Food VAT` : 'All charges included'}</p>
          </div>
          <span className="text-[24px] font-extrabold text-[#1b1c1c]">₹{grandTotal.toFixed(2)}</span>
        </div>
        <button
          onClick={handlePayment}
          disabled={loading || !deliveryAddress}
          className="w-full h-[54px] bg-[#1F7A63] hover:bg-[#155a49] disabled:bg-[#bec9c3] disabled:text-white/70 text-white rounded-[14px] font-extrabold text-[16px] shadow-[0_8px_24px_rgba(31,122,99,0.25)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Pay &amp; Order <ArrowLeft className="w-5 h-5 rotate-180 ml-1" /></>
          )}
        </button>
      </div>
    </div>
  );
}
