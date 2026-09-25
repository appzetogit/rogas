import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, Store, MapPin, Minus, Plus, ShoppingBasket } from 'lucide-react';
import { usePantryCart } from './PantryCartContext';
import { API_BASE_URL } from '@food/api/config';
import { toast } from 'sonner';
import { dmbCustomerAPI } from '../../../services/api';
import { useTranslation } from "react-i18next";

export function PantryItemDetails() {
  const { t } = useTranslation("customer");
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  
  // Try to get item from state as initial, but fetch from API for latest data + other platform price
  const initialItem = location.state?.item;
  
  const { cart, addItem, removeItem, getItemQuantity, totalItems } = usePantryCart();
  const [item, setItem] = useState(initialItem || null);
  const [loading, setLoading] = useState(!initialItem);
  const [scrolled, setScrolled] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(item?.variants?.[0] || null);

  const itemToAdd = selectedVariant && item
      ? { ...item, _id: `${item._id}-${selectedVariant.name}`, title: `${item.title} - ${selectedVariant.name}`, price: selectedVariant.price }
      : item;
  
  const vendorId = item?.vendorId?._id || item?.vendorId;
  const count = itemToAdd ? getItemQuantity(itemToAdd._id) : 0;

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const res = await dmbCustomerAPI.getPantryItemById(id);
        if (res.data.success) {
            setItem(res.data.item);
            if (!selectedVariant) setSelectedVariant(res.data.item?.variants?.[0] || null);
        }
      } catch (err) {
        console.error('Failed to fetch pantry item:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
  }, [id]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-10 h-screen items-center bg-[#F5F5F0]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#F5F5F0]">
        <p className="text-[#1b1c1c] font-bold">{t("Item not found.")}</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-[#00604c] text-white rounded-full">{t("Go Back")}</button>
      </div>
    );
  }

  const normalizeImageUrl = (imageUrl) => {
    if (!imageUrl) return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80";
    if (typeof imageUrl === "object") return imageUrl.url || imageUrl.secure_url || "";
    if (typeof imageUrl === "string") {
      if (/^(https?:)?\/\//i.test(imageUrl)) return imageUrl;
      const origin = API_BASE_URL.replace(/\/api\/?$/, "");
      return `${origin}${imageUrl.startsWith("/") ? imageUrl : "/" + imageUrl}`;
    }
    return "";
  };

  const handleIncrement = () => {
    if (cart.vendorId && cart.vendorId !== vendorId) {
      toast.error(t("You can only order from one vendor at a time. Clear cart to switch."));
      return;
    }
    addItem(itemToAdd, vendorId);
    toast.success(t("Added to Box"));
  };

  const handleDecrement = () => {
    if (itemToAdd) removeItem(itemToAdd._id);
  };

  const displayPrice = selectedVariant ? selectedVariant.price : item.price;
  const vendorName = item.vendorId?.restaurantName || 'Unknown Vendor';
  const vendorCity = item.vendorId?.city || 'Local Region';

  return (
    <div className="font-body-md text-on-surface antialiased overflow-x-hidden min-h-[max(884px,100dvh)]" style={{ backgroundColor: '#F5F5F0', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button 
          className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100" 
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">{t("Item Details")}</h1>
        <button className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100">
          <Heart size={20} />
        </button>
      </header>

      <main className="pt-20 pb-32 px-4 sm:px-8 lg:px-10 w-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          {/* LEFT COLUMN: Hero Product Image */}
          <div className="relative w-full h-72 sm:h-96 md:h-full min-h-[380px] rounded-3xl bg-[#f6f3f2] overflow-hidden shadow-sm border border-slate-200/80">
            <img 
              className="w-full h-full object-cover" 
              alt={item.title} 
              src={normalizeImageUrl(item.image)} 
            />
            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3.5 py-1.5 rounded-full shadow-sm border border-slate-200/60">
              <p className="text-[12px] font-bold text-[#00604c] uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${item.isAvailable ? 'bg-emerald-500' : 'bg-red-500'}`} />
                {item.isAvailable ? t("Stock: High") : t("Out of Stock")}
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN: Product Content Details */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-8 space-y-6 flex flex-col justify-between">
            <div>
              {/* Title & Price */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-headline-sm text-2xl font-bold text-[#1b1c1c] mb-1">{item.title}</h2>
                  <div className="flex items-center gap-1.5 text-[#00604c] text-xs font-bold">
                    <Store className="w-4 h-4" />
                    <span>{vendorName}</span>
                  </div>
                </div>
                <div className="text-right">
                   {item.otherPlatformPrice && item.otherPlatformPrice > displayPrice && (
                      <div className="text-xs text-gray-400 line-through font-medium mb-0.5">
                         {Number(item.otherPlatformPrice).toFixed(2)} {t("PLN")}
                      </div>
                   )}
                   <div className="text-xl font-extrabold text-[#00604c]">{Number(displayPrice).toFixed(2)} {t("PLN")}</div>
                </div>
              </div>
              
              <div className="h-[1px] bg-[#bec9c3]/30 w-full mb-6"></div>

              {/* Description */}
              <section className="mb-6">
                <h3 className="text-base font-semibold text-[#1b1c1c] mb-2">{t("Description")}</h3>
                <p className="text-sm text-[#3e4945] leading-relaxed">
                  {item.description || t("Premium pantry item crafted with care. Enjoy the rich flavors and high-quality ingredients selected specially for you.")}
                </p>
              </section>

              {/* Select Size (Variants) */}
              {item.variants && item.variants.length > 0 && (
                <section className="mb-6">
                  <h3 className="text-base font-semibold text-[#1b1c1c] mb-3">{t("Select Size")}</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {item.variants.map((v, i) => (
                      <button 
                        key={i}
                        onClick={() => setSelectedVariant(v)}
                        className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-colors cursor-pointer ${
                          selectedVariant?.name === v.name 
                            ? 'bg-[#00604c] text-white shadow-sm' 
                            : 'border border-[#bec9c3]/40 text-[#3e4945] hover:bg-[#eae7e7]'
                        }`}
                      >
                        {v.name} - {Number(v.price).toFixed(2)} {t("PLN")}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Bento Info Grid */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="bg-[#f6f3f2] p-4 rounded-2xl flex flex-col gap-2 col-span-2">
                <MapPin className="text-[#00604c] w-6 h-6 fill-current" />
                <div>
                  <p className="text-xs font-bold text-[#6e7a74] uppercase tracking-wider">{t("Origin")}</p>
                  <p className="text-sm font-semibold text-[#1b1c1c]">{t("{{vendorCity}}, PL", { vendorCity })}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Floating Footer Action */}
      <div className="fixed bottom-0 left-0 right-0 md:left-64 md:right-auto md:w-[calc(100%_-_16rem)] p-4 pb-6 z-50 pointer-events-none">
        
        {/* Separate Floating Cart Icon */}
        {totalItems > 0 && (
          <div className="max-w-md mx-auto relative pointer-events-auto">
            <button 
              onClick={() => navigate('/user/pantry-checkout')}
              className="absolute right-0 -top-20 w-14 h-14 bg-white rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex items-center justify-center border border-[#bec9c3]/30 hover:scale-105 active:scale-95 transition-transform"
            >
              <ShoppingBasket className="w-6 h-6 text-[#00604c]" />
              <span className="absolute -top-1 -right-1 bg-[#ffb100] text-[#1b1c1c] text-[12px] font-extrabold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                {totalItems}
              </span>
            </button>
          </div>
        )}

        <div className="max-w-md mx-auto pointer-events-auto">
          {count === 0 ? (
            <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white flex items-center justify-center">
              <button 
                onClick={handleIncrement}
                disabled={!item.isAvailable}
                className={`w-full h-14 rounded-full font-bold text-[16px] transition-all duration-300 flex items-center justify-center gap-2 ${
                  item.isAvailable 
                    ? 'bg-[#00604c] text-white shadow-[0_4px_16px_rgba(0,96,76,0.3)] hover:shadow-[0_8px_24px_rgba(0,96,76,0.4)] active:scale-[0.98]' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                <ShoppingBasket className="w-5 h-5" />
                {item.isAvailable ? t("Add to Box") : t("Out of Stock")}
              </button>
            </div>
          ) : (
            <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white flex items-center gap-3">
              
              {/* Quantity Selector */}
              <div className="flex items-center bg-[#f6f3f2] rounded-full p-1 border border-[#bec9c3]/30">
                <button 
                  onClick={handleDecrement}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-white text-[#1b1c1c] shadow-sm active:scale-95 transition-all hover:bg-gray-50"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <span className="w-10 text-center text-[16px] font-bold text-[#1b1c1c]">{count}</span>
                <button 
                  onClick={handleIncrement}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-white text-[#1b1c1c] shadow-sm active:scale-95 transition-all hover:bg-gray-50"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              
              {/* Add to Cart Button */}
              <button 
                onClick={handleIncrement}
                className="flex-1 h-14 rounded-full font-bold text-[16px] transition-all duration-300 flex items-center justify-center px-6 overflow-hidden relative group bg-[#00604c] text-white shadow-[0_4px_16px_rgba(0,96,76,0.3)] hover:shadow-[0_8px_24px_rgba(0,96,76,0.4)] active:scale-[0.98]"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out rounded-full" />
                <span className="relative z-10 flex items-center gap-2">
                  <ShoppingBasket className="w-5 h-5" />
                  {t("Add Another")}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
