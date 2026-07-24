import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Calendar as CalendarIcon, MapPin, Receipt, CheckCircle, Info, X } from 'lucide-react';
import { usePantryCart } from './PantryCartContext';
import { dmbCustomerAPI } from '@food/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

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
  const normalized = new Date(d.getTime() - (offset*60*1000));
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

export function PantryCheckoutScreen() {
  const navigate = useNavigate();
  const { cart, cartTotal, totalItems, clearCart } = usePantryCart();
  
  const [dates] = useState(generateDates());
  const [selectedDates, setSelectedDates] = useState([formatDateForApi(new Date())]);
  const [selectedSlots, setSelectedSlots] = useState(['lunch']);
  const [loading, setLoading] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState(null);

  // Map state
  const [showMap, setShowMap] = useState(false);
  const [lat, setLat] = useState(28.6139); // default
  const [lng, setLng] = useState(77.2090);
  const [tempAddress, setTempAddress] = useState("");

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: MAP_LIBRARIES
  });

  const SLOTS = [
    { id: 'breakfast', label: 'Breakfast (6AM-11AM)' },
    { id: 'lunch', label: 'Lunch (11AM-4PM)' },
    { id: 'dinner', label: 'Dinner (4PM-11PM)' }
  ];

  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      navigate('/user/plans');
      return;
    }
    
    // Fetch user profile to get address
    const fetchUser = async () => {
      try {
        const userStr = localStorage.getItem('user_user');
        if (userStr) {
          const u = JSON.parse(userStr);
          if (u.deliveryAddress) setDeliveryAddress(u.deliveryAddress);
        }
      } catch (err) {}
    };
    fetchUser();
  }, [cart, navigate]);

  const toggleDate = (dateStr) => {
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        if (prev.length === 1) {
          toast.error("Please select at least one delivery date.");
          return prev;
        }
        return prev.filter(d => d !== dateStr);
      }
      return [...prev, dateStr];
    });
  };

  const toggleSlot = (slotId) => {
    setSelectedSlots(prev => {
      if (prev.includes(slotId)) {
        if (prev.length === 1) {
          toast.error("Please select at least one delivery slot.");
          return prev;
        }
        return prev.filter(s => s !== slotId);
      }
      return [...prev, slotId];
    });
  };

  const fetchAddressFromCoordinates = (latitude, longitude) => {
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        if (status === 'OK' && results[0]) {
          setTempAddress(results[0].formatted_address);
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
      }, () => {
        toast.error('Failed to get live location. Please allow location permissions.');
        setShowMap(true); // show map anyway
      });
    } else {
      toast.error('Geolocation is not supported by your browser');
      setShowMap(true);
    }
  };

  const onMapClick = (e) => {
    const latitude = e.latLng.lat();
    const longitude = e.latLng.lng();
    setLat(latitude);
    setLng(longitude);
    fetchAddressFromCoordinates(latitude, longitude);
  };

  const confirmMapAddress = () => {
    if (!tempAddress) {
      toast.error('Please drop a pin on the map');
      return;
    }
    
    // Assuming simple parsing for demonstration, ideally we use address components
    const addrParts = tempAddress.split(', ');
    const street = addrParts[0] || tempAddress;
    const city = addrParts[1] || 'City';
    const state = addrParts[2] || 'State';
    const pincode = addrParts.length > 3 ? addrParts[3] : '000000';
    
    setDeliveryAddress({
      label: 'Selected from Map',
      street: street,
      city: city,
      state: state,
      pincode: pincode,
      location: {
        type: 'Point',
        coordinates: [lng, lat]
      }
    });
    setShowMap(false);
  };

  const deliveryFeePerDay = 5; // Configurable admin fee fallback
  const deliveryFee = deliveryFeePerDay * selectedDates.length;
  const itemsTotal = cartTotal * selectedDates.length;
  const grandTotal = itemsTotal + deliveryFee;

  const handlePayment = async () => {
    if (!deliveryAddress) {
      toast.error('Please select a delivery address');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        vendorId: cart.vendorId,
        items: cart.items.map(i => ({ pantryItemId: i.pantryItemId, quantity: i.quantity })),
        deliveryDates: selectedDates,
        deliverySlots: selectedSlots,
        deliveryAddress
      };

      const res = await dmbCustomerAPI.createPantryOrder(payload);
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to create order');

      const { order, razorpayOrderId, razorpayKeyId } = res.data;

      // Handle Razorpay
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        toast.error('Razorpay SDK not loaded');
        setLoading(false);
        return;
      }

      const options = {
        key: razorpayKeyId,
        amount: grandTotal * 100,
        currency: 'INR',
        name: 'Rogas Pantry',
        description: 'Pantry Items Order',
        order_id: razorpayOrderId,
        handler: async (response) => {
          try {
            const verifyRes = await dmbCustomerAPI.verifyPantryPayment({
              orderId: order.orderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (verifyRes.data?.success) {
              clearCart();
              toast.success('Payment successful! Order placed.');
              navigate('/user/orders'); // Navigate to orders screen
            }
          } catch (err) {
            toast.error('Payment verification failed');
          }
        },
        theme: { color: '#1F7A63' }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => toast.error('Payment failed or cancelled'));
      rzp.open();

    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Payment initiation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!cart || cart.items.length === 0) return null;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-[100px]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur-xl px-5 pt-16 pb-4">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#1b1c1c] active:scale-95 transition-transform mb-4">
          <ArrowLeft className="text-[20px]" />
        </button>
        <h1 className="text-[28px] font-extrabold text-[#1b1c1c] tracking-tight leading-tight">Checkout</h1>
      </div>

      <div className="px-5 space-y-6">
        
        {/* Items Summary */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <h2 className="text-[16px] font-extrabold text-[#1b1c1c] mb-4 flex items-center gap-2">
            <Receipt className="text-[18px] text-primary" />
            Selected Items
          </h2>
          <div className="space-y-3">
            {cart.items.map(item => (
              <div key={item.pantryItemId} className="flex justify-between items-center pb-3 border-b border-[#f0f0f0] last:border-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#eef0ec] flex items-center justify-center text-[13px] font-bold text-primary">
                    {item.quantity}x
                  </div>
                  <p className="text-[14px] font-bold text-[#1b1c1c]">{item.title}</p>
                </div>
                <span className="font-extrabold text-[14px] text-primary">₹{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Dates */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <h2 className="text-[16px] font-extrabold text-[#1b1c1c] mb-4 flex items-center gap-2">
            <CalendarIcon className="text-[18px] text-primary" />
            Delivery Dates
          </h2>
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 -mx-2 px-2">
            {dates.map((d, i) => {
              const apiDate = formatDateForApi(d);
              const isSelected = selectedDates.includes(apiDate);
              const dayStr = d.toLocaleDateString('en-US', { weekday: 'narrow' });
              const dateNum = d.getDate();
              return (
                <button
                  key={i}
                  onClick={() => toggleDate(apiDate)}
                  className={`flex flex-col items-center justify-center min-w-[50px] h-[60px] rounded-[16px] transition-all flex-shrink-0 ${
                    isSelected ? 'bg-primary text-white shadow-md' : 'bg-[#eef0ec] text-[#6e7a74] hover:bg-[#dfe4df]'
                  }`}
                >
                  <span className={`text-[12px] font-bold ${isSelected ? 'text-white/90' : 'text-[#a1a8a5]'}`}>{dayStr}</span>
                  <span className={`text-[16px] font-extrabold mt-0.5`}>{dateNum}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-[#6e7a74] mt-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0" /> Items will be delivered on each selected date.
          </p>
        </div>

        {/* Delivery Slots */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <h2 className="text-[16px] font-extrabold text-[#1b1c1c] mb-4 flex items-center gap-2">
            <Clock className="text-[18px] text-primary" />
            Delivery Slots
          </h2>
          <div className="flex flex-col gap-2.5">
            {SLOTS.map(slot => {
              const isSelected = selectedSlots.includes(slot.id);
              return (
                <label key={slot.id} className={`flex items-center p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-[#e4e2e1] hover:border-primary/30'
                }`}>
                  <input 
                    type="checkbox" 
                    value={slot.id} 
                    checked={isSelected} 
                    onChange={() => toggleSlot(slot.id)}
                    className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                  />
                  <span className="ml-3 text-[14px] font-bold text-[#1b1c1c]">{slot.label}</span>
                </label>
              );
            })}
          </div>
          <p className="text-[12px] text-[#6e7a74] mt-3 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0" /> Selected items will be delivered for each selected slot.
          </p>
        </div>

        {/* Address */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-[#e4e2e1]/50">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[16px] font-extrabold text-[#1b1c1c] flex items-center gap-2">
              <MapPin className="text-[18px] text-primary" />
              Delivery Address
            </h2>
            {deliveryAddress && (
              <button 
                onClick={handleLiveLocation}
                className="text-primary text-[12px] font-bold underline"
              >
                Change Map Pin
              </button>
            )}
          </div>
          
          {deliveryAddress ? (
            <div className="bg-[#eef0ec] rounded-2xl p-4">
              <p className="text-[14px] font-bold text-[#1b1c1c]">{deliveryAddress.label || 'Home'}</p>
              <p className="text-[13px] text-[#6e7a74] mt-1 line-clamp-2">
                {deliveryAddress.street}, {deliveryAddress.city}
              </p>
            </div>
          ) : (
            <button onClick={handleLiveLocation} className="w-full py-3 border-2 border-dashed border-primary/30 rounded-2xl text-primary font-bold text-[14px] flex items-center justify-center gap-2">
              <MapPin className="text-[16px]" />
              Set Address on Map
            </button>
          )}
        </div>

      </div>

      {/* Map Modal */}
      {showMap && isLoaded && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden w-full max-w-[420px] shadow-2xl flex flex-col h-[70vh]">
            <div className="px-5 py-4 border-b border-[#f0eded] flex justify-between items-center bg-white">
              <h2 className="text-[18px] font-extrabold text-[#1b1c1c]">Set Delivery Location</h2>
              <button onClick={() => setShowMap(false)} className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center active:scale-95 text-gray-500">
                <X className="text-[20px]" />
              </button>
            </div>
            <div className="flex-1 relative bg-gray-100">
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={{ lat, lng }}
                zoom={15}
                onClick={onMapClick}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                }}
              >
                <Marker position={{ lat, lng }} />
              </GoogleMap>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg text-[13px] font-bold text-[#1b1c1c]">
                Tap anywhere to move pin
              </div>
            </div>
            <div className="p-5 bg-white border-t border-[#f0eded]">
              <p className="text-[13px] text-[#6e7a74] mb-3 line-clamp-2 min-h-[38px]">
                {tempAddress || 'Fetching address...'}
              </p>
              <button
                onClick={confirmMapAddress}
                className="w-full h-[48px] bg-primary hover:bg-[#155a49] text-white rounded-xl font-extrabold text-[15px] shadow-md active:scale-[0.98] transition-all"
              >
                Confirm Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto bg-white p-5 border-t border-[#f0f0f0] shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-20">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-[13px] text-[#6e7a74] font-medium">Total for {selectedDates.length} delivery(s)</p>
            <p className="text-[12px] text-primary font-medium mt-0.5">Includes ₹{deliveryFee.toFixed(2)} delivery</p>
          </div>
          <span className="text-[24px] font-extrabold text-[#1b1c1c]">₹{grandTotal.toFixed(2)}</span>
        </div>
        <button
          onClick={handlePayment}
          disabled={loading || !deliveryAddress}
          className="w-full h-[52px] bg-primary hover:bg-[#155a49] disabled:bg-[#bec9c3] disabled:text-white/70 text-white rounded-[20px] font-extrabold text-[16px] shadow-[0_8px_24px_rgba(31,122,99,0.25)] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>Pay & Order</>
          )}
        </button>
      </div>
    </div>
  );
}

