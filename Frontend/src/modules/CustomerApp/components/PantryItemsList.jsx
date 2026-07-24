import { useState, useEffect } from 'react';
import { dmbCustomerAPI } from '@food/api';
import { API_BASE_URL } from '@food/api/config';
import { Plus, Minus, ShoppingBag, Package, ChevronRight } from 'lucide-react';
import { usePantryCart } from './PantryCartContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export function PantryItemsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { cart, addItem, removeItem, getItemQuantity, cartTotal, totalItems } = usePantryCart();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await dmbCustomerAPI.getAllPantryItems();
        if (res.data?.success) {
          // Only show items that are available
          setItems((res.data.items || []).filter(i => i.isAvailable));
        }
      } catch (err) {
        console.error('Failed to fetch pantry items:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

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

  const handleAddItem = (item) => {
    if (cart.vendorId && cart.vendorId !== (item.vendorId?._id || item.vendorId)) {
      toast.error('You can only order from one vendor at a time. Clear cart to switch.');
      return;
    }
    addItem(item, item.vendorId?._id || item.vendorId);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center p-10">
        <Package className="text-[40px] text-[#bec9c3]" />
        <p className="text-[16px] font-bold mt-2">No Pantry Items</p>
        <p className="text-[13px] text-[#6e7a74]">Vendors haven't added any items yet.</p>
      </div>
    );
  }

  return (
    <div className="relative pb-24">
      <div className="grid grid-cols-2 gap-3 mb-4 px-2">
        {items.map((item) => {
          const qty = getItemQuantity(item._id);
          return (
            <div 
              key={item._id} 
              onClick={() => navigate(`/user/pantry-item/${item._id}`, { state: { item } })}
              className="bg-white rounded-2xl p-2.5 shadow-sm flex flex-col h-full border border-transparent hover:border-primary/20 transition-all cursor-pointer"
            >
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-[#e4e2e1] mb-3">
                <img src={normalizeImageUrl(item.image)} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col flex-1 px-1">
                <h3 className="font-medium text-[13px] text-[#1b1c1c] leading-tight mb-1 flex-1">{item.title}</h3>
                {item.vendorId && (
                  <p className="text-[11px] text-[#6e7a74] mb-2 truncate">by {item.vendorId.restaurantName}</p>
                )}
                <div className="flex items-center justify-between mt-auto h-[32px]">
                  <span className="font-extrabold text-[15px] text-[#1F7A63]">{item.price.toFixed(2)} PLN</span>
                  
                  {qty === 0 ? (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAddItem(item); }}
                      className="w-7 h-7 rounded-full bg-[#1F7A63] text-white flex items-center justify-center active:scale-95 transition-transform hover:bg-[#155a49]"
                    >
                      <Plus className="text-[18px]" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-[#eef0ec] rounded-full p-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeItem(item._id); }}
                        className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-primary active:scale-95"
                      >
                        <Minus className="text-[14px]" />
                      </button>
                      <span className="text-[13px] font-bold min-w-[12px] text-center">{qty}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleAddItem(item); }}
                        className="w-6 h-6 rounded-full bg-primary shadow-sm flex items-center justify-center text-white active:scale-95"
                      >
                        <Plus className="text-[14px]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cart Sticky Bottom Bar */}
      {totalItems > 0 && (
        <div className="fixed bottom-[80px] left-1/2 -translate-x-1/2 max-w-[420px] w-full px-4 z-30">
          <button 
            onClick={() => navigate('/user/pantry-checkout')}
            className="w-full bg-[#1F7A63] hover:bg-[#155a49] text-white py-4 px-5 rounded-[20px] flex items-center justify-between shadow-[0_8px_24px_rgba(31,122,99,0.3)] transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <ShoppingBag className="text-[18px]" />
              </div>
              <div className="text-left">
                <p className="text-[12px] font-medium text-white/80">{totalItems} items</p>
                <p className="text-[15px] font-extrabold">{cartTotal.toFixed(2)} PLN</p>
              </div>
            </div>
            <span className="text-[15px] font-extrabold flex items-center gap-1">
              Checkout <ChevronRight className="text-[18px]" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
