import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Heart, Store, MapPin, Minus, Plus, ShoppingBasket } from 'lucide-react';
import { usePantryCart } from './PantryCartContext';
import { API_BASE_URL } from '@food/api/config';
import { toast } from 'sonner';

export function PantryItemDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  
  // Try to get item from state, otherwise we would need to fetch it (for now rely on state)
  const item = location.state?.item;
  
  const { cart, addItem } = usePantryCart();
  const [count, setCount] = useState(1);
  const [scrolled, setScrolled] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(item?.variants?.[0] || null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!item) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#F5F5F0]">
        <p className="text-[#1b1c1c] font-bold">Item not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-[#00604c] text-white rounded-full">Go Back</button>
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

  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c > 1 ? c - 1 : 1);

  const handleAddToCart = () => {
    if (cart.vendorId && cart.vendorId !== (item.vendorId?._id || item.vendorId)) {
      toast.error('You can only order from one vendor at a time. Clear cart to switch.');
      return;
    }
    
    // Add the specific variant if selected, else add base item
    const itemToAdd = selectedVariant 
        ? { ...item, _id: `${item._id}-${selectedVariant.name}`, title: `${item.title} - ${selectedVariant.name}`, price: selectedVariant.price }
        : item;

    for(let i = 0; i < count; i++) {
        addItem(itemToAdd, item.vendorId?._id || item.vendorId);
    }
    toast.success('Added to Box');
    navigate(-1);
  };

  const displayPrice = selectedVariant ? selectedVariant.price : item.price;
  const vendorName = item.vendorId?.restaurantName || 'Unknown Vendor';
  const vendorCity = item.vendorId?.city || 'Local Region';

  return (
    <div className="font-body-md text-on-surface antialiased overflow-x-hidden min-h-[max(884px,100dvh)]" style={{ backgroundColor: '#F5F5F0', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
      {/* Top Navigation */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 justify-between transition-all duration-300 ${scrolled ? 'shadow-sm bg-[rgba(252,249,248,0.95)]' : 'bg-[rgba(252,249,248,0.8)] backdrop-blur-md'}`}
      >
        <button 
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors" 
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="text-[#1b1c1c] w-6 h-6" />
        </button>
        <h1 className="font-headline-sm text-[18px] font-bold text-[#1b1c1c]">Details</h1>
        <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors">
          <Heart className="text-[#1b1c1c] w-6 h-6" />
        </button>
      </header>

      <main className="pt-14 pb-32">
        {/* Hero Product Image */}
        <div className="relative w-full aspect-square bg-[#f6f3f2] overflow-hidden">
          <img 
            className="w-full h-full object-cover" 
            alt={item.title} 
            src={normalizeImageUrl(item.image)} 
          />
          <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm">
            <p className="font-label-caps text-[12px] font-bold text-[#00604c] uppercase tracking-wider">
              {item.isAvailable ? 'Stock: High' : 'Out of Stock'}
            </p>
          </div>
        </div>

        {/* Content Container */}
        <div className="px-5 -mt-6 relative z-10">
          <div className="bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-6 space-y-4">
            
            {/* Header Info */}
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-4">
                <h2 className="text-[22px] font-bold text-[#1b1c1c] leading-tight tracking-tight">{item.title}</h2>
                <p className="text-[14px] font-semibold text-[#00604c] mt-1 flex items-center gap-1">
                  <Store className="w-[18px] h-[18px]" />
                  {vendorName}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[20px] font-bold text-[#00604c]">{Number(displayPrice).toFixed(2)} PLN</span>
              </div>
            </div>
            
            <div className="h-[1px] bg-[#bec9c3]/30 w-full"></div>

            {/* Description */}
            <section>
              <h3 className="text-[16px] font-semibold text-[#1b1c1c] mb-2">Description</h3>
              <p className="text-[14px] text-[#3e4945] leading-relaxed">
                {item.description || "Premium pantry item crafted with care. Enjoy the rich flavors and high-quality ingredients selected specially for you."}
              </p>
            </section>

            {/* Select Size (Variants) */}
            {item.variants && item.variants.length > 0 && (
              <section className="mt-4">
                <h3 className="text-[16px] font-semibold text-[#1b1c1c] mb-3">Select Size</h3>
                <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {item.variants.map((v, i) => (
                    <button 
                      key={i}
                      onClick={() => setSelectedVariant(v)}
                      className={`px-4 py-2 rounded-full font-semibold text-[14px] whitespace-nowrap transition-colors ${
                        selectedVariant?.name === v.name 
                          ? 'bg-[#00604c] text-white shadow-sm' 
                          : 'border border-[#bec9c3]/40 text-[#3e4945] hover:bg-[#eae7e7]'
                      }`}
                    >
                      {v.name} - {Number(v.price).toFixed(2)} PLN
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Bento Info Grid */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-[#f6f3f2] p-4 rounded-lg flex flex-col gap-2 col-span-2">
                <MapPin className="text-[#00604c] w-6 h-6 fill-current" />
                <div>
                  <p className="text-[12px] font-bold text-[#6e7a74] uppercase tracking-wider">Origin</p>
                  <p className="text-[14px] font-semibold text-[#1b1c1c]">{vendorCity}, PL</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Fixed Footer Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#bec9c3]/30 z-50">
        <div className="flex items-center gap-4 max-w-md mx-auto">
          <div className="flex items-center bg-[#eae7e7] rounded-full px-2 py-1">
            <button 
              onClick={decrement}
              className="w-10 h-10 flex items-center justify-center text-[#3e4945] active:scale-90 transition-transform"
            >
              <Minus className="w-6 h-6" />
            </button>
            <span className="w-8 text-center text-[16px] font-semibold text-[#1b1c1c]">{count}</span>
            <button 
              onClick={increment}
              className="w-10 h-10 flex items-center justify-center text-[#3e4945] active:scale-90 transition-transform"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
          <button 
            onClick={handleAddToCart}
            disabled={!item.isAvailable}
            className={`flex-1 text-[16px] font-semibold py-4 rounded-full shadow-lg transition-all duration-150 flex items-center justify-center gap-2 ${
              item.isAvailable ? 'bg-[#00604c] text-white active:scale-[0.98]' : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }`}
          >
            <ShoppingBasket className="w-5 h-5 fill-current" />
            {item.isAvailable ? 'Add to Box' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}
