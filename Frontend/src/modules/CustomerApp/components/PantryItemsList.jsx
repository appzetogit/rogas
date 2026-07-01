import { useState, useEffect } from 'react';
import { dmbCustomerAPI } from '@food/api';
import { API_BASE_URL } from '@food/api/config';

export function PantryItemsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await dmbCustomerAPI.getAllPantryItems();
        if (res.data?.success) {
          setItems(res.data.items || []);
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
        <span className="material-symbols-outlined text-[40px] text-[#bec9c3]">inventory_2</span>
        <p className="text-[16px] font-bold mt-2">No Pantry Items</p>
        <p className="text-[13px] text-[#6e7a74]">Vendors haven't added any items yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {items.map((item) => (
        <div key={item._id} className="bg-white rounded-2xl p-2.5 shadow-sm flex flex-col h-full border border-transparent hover:border-primary/20 transition-all cursor-pointer">
          <div className="w-full aspect-square rounded-xl overflow-hidden bg-[#e4e2e1] mb-3">
            <img src={normalizeImageUrl(item.image)} alt={item.title} className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col flex-1 px-1">
            <h3 className="font-medium text-[13px] text-[#1b1c1c] leading-tight mb-1 flex-1">{item.title}</h3>
            {item.vendorId && (
              <p className="text-[11px] text-[#6e7a74] mb-2 truncate">by {item.vendorId.restaurantName}</p>
            )}
            <div className="flex items-center justify-between mt-auto">
              <span className="font-extrabold text-[15px] text-[#1F7A63]">{item.price.toFixed(2)} PLN</span>
              <button className="w-7 h-7 rounded-full bg-[#1F7A63] text-white flex items-center justify-center active:scale-95 transition-transform hover:bg-[#155a49]">
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
