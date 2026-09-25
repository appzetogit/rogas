import React, { useState, useEffect } from 'react';
import { restaurantAPI, uploadAPI } from '../../../services/api/index';
import { Plus, Edit2, Trash2, X, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from "react-i18next";

export default function PantryMenuManager({ items, setItems }) {
  const { t } = useTranslation("vendor");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Form state
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [priceOnOtherPlatforms, setPriceOnOtherPlatforms] = useState('');
  const [foodType, setFoodType] = useState('Veg');
  const [description, setDescription] = useState('');
  const [variants, setVariants] = useState([]);
  
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    restaurantAPI.getAllCategories()
      .then(res => {
        setCategories(res?.data?.data?.categories || res?.data?.categories || []);
      })
      .catch(err => console.error("Failed to fetch categories:", err));
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setCategoryId('');
    setName('');
    setPrice('');
    setPriceOnOtherPlatforms('');
    setFoodType('Veg');
    setDescription('');
    setVariants([]);
    setImageFile(null);
    setImagePreview(null);
    setIsAvailable(true);
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setCategoryId(item.categoryId || '');
    setName(item.name || item.title || '');
    setPrice(item.price?.toString() || '');
    setPriceOnOtherPlatforms(item.priceOnOtherPlatforms?.toString() || '');
    setFoodType(item.foodType || 'Veg');
    setDescription(item.description || '');
    setVariants(item.variants || []);
    setImageFile(null);
    setImagePreview(item.image || null);
    setIsAvailable(item.isAvailable !== false);
    setIsModalOpen(true);
  };

  const handleDelete = async (item) => {
    if (window.confirm(t("Are you sure you want to delete this item?"))) {
      try {
        const res = await restaurantAPI.deleteFood(item._id || item.id);
        if (res.data?.success) {
          setItems(items.filter(i => (i._id || i.id) !== (item._id || item.id)));
          toast.success(t("Item deleted successfully"));
        }
      } catch (err) {
        console.error(err);
        toast.error(t("Failed to delete item"));
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name || (!price && variants.length === 0)) {
        toast.error(t("Name and either Base Price or Variants are required"));
        return;
    }
    
    // Upload image if selected
    let imageUrl = imagePreview;
    if (imageFile) {
      setIsLoading(true);
      try {
        const uploadRes = await uploadAPI.uploadMedia(imageFile, { folder: "food/restaurants/menu" });
        imageUrl = uploadRes?.data?.data?.url || uploadRes?.data?.url || imageUrl;
      } catch (err) {
        console.error("Image upload failed:", err);
        toast.error(t("Failed to upload image"));
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    try {
      const selectedCategory = categories.find(c => c._id === categoryId || c.id === categoryId);
      const payload = {
        name: name.trim(),
        description: description.trim(),
        price: variants.length > 0 ? undefined : Number(price),
        priceOnOtherPlatforms: priceOnOtherPlatforms ? Number(priceOnOtherPlatforms) : undefined,
        foodType: foodType,
        variants: variants.map(v => ({ name: v.name, price: Number(v.price) })),
        image: imageUrl || "",
        isAvailable: isAvailable,
        categoryId: categoryId || undefined,
        categoryName: selectedCategory ? selectedCategory.name : undefined,
      };

      if (editingItem) {
        const res = await restaurantAPI.updateFood(editingItem._id || editingItem.id, payload);
        if (res.data?.success || res.data?.data) {
          toast.success(t("Pantry item updated and sent for approval!"));
          // Refresh list via parent or just update state (though it might be pending now)
          const updatedItem = res.data?.data?.food || res.data?.food || { ...editingItem, ...payload, approvalStatus: 'pending' };
          setItems(items.map(i => (i._id || i.id) === (editingItem._id || editingItem.id) ? updatedItem : i));
          setIsModalOpen(false);
        }
      } else {
        const res = await restaurantAPI.createFood(payload);
        if (res.data?.success || res.data?.data) {
          toast.success(t("Pantry item created and sent for approval!"));
          const newItem = res.data?.data?.food || res.data?.food;
          if (newItem) {
            setItems([newItem, ...items]);
          }
          setIsModalOpen(false);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || t("Failed to save pantry item"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      const res = await restaurantAPI.updateFood(item._id || item.id, { isAvailable: !item.isAvailable });
      if (res.data?.success || res.data?.data) {
        setItems(items.map((i) => ((i._id || i.id) === (item._id || item.id) ? { ...i, isAvailable: !item.isAvailable } : i)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addVariant = () => {
    setVariants([...variants, { name: '', price: '' }]);
  };

  const updateVariant = (index, field, value) => {
    const newVariants = [...variants];
    newVariants[index][field] = value;
    setVariants(newVariants);
  };

  const removeVariant = (index) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 pb-[100px]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xl px-5 pt-16 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold text-primary tracking-tight">{t("Pantry Menu")}</h1>
          <button
            onClick={openAddModal}
            className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center active:scale-95 transition-transform shadow-md hover:bg-[#155a49]"
          >
            <Plus />
          </button>
        </div>
        <p className="text-on-surface-variant text-[14px] mt-1 font-medium">{t("Manage your pantry shop inventory.")}</p>
      </div>

      {/* List */}
      <div className="px-5 mt-2">
        {items.length === 0 ? (
          <div className="text-center mt-12 bg-white rounded-3xl p-8 border border-[#e4e2e1]/50 shadow-sm max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-[#eef0ec] mx-auto flex items-center justify-center mb-4">
              <span className="text-[32px]">📦</span>
            </div>
            <p className="text-[17px] text-[#1b1c1c] font-extrabold">{t("No pantry items yet")}</p>
            <p className="text-[14px] text-[#6e7a74] mt-1 font-medium mb-5">{t("Add some items to start selling.")}</p>
            <button onClick={openAddModal} className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-[14px] active:scale-95 transition-transform">
              {t("Add First Item")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const itemId = item._id || item.id;
            const itemName = item.name || item.title || "Unnamed Item";
            return (
              <div key={itemId} className="bg-white rounded-3xl p-3 shadow-sm border border-transparent hover:border-primary/20 transition-all flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-[20px] overflow-hidden bg-[#eef0ec] shrink-0 border border-black/5 relative">
                    <img src={item.image || 'https://via.placeholder.com/150'} alt={itemName} className="w-full h-full object-cover" />
                    {item.approvalStatus && item.approvalStatus !== 'approved' && (
                        <div className="absolute top-0 left-0 w-full bg-yellow-500/90 text-white text-[10px] font-bold text-center py-0.5">
                            {item.approvalStatus.toUpperCase()}
                        </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-24">
                    <div>
                      <h3 className="font-extrabold text-[15px] text-[#1b1c1c] leading-tight truncate">{itemName}</h3>
                      <p className="text-[16px] font-extrabold text-primary mt-1">
                        {item.variants?.length > 0 
                            ? t("{{length}} Variants", { length: item.variants.length }) 
                            : `₹${Number(item.price).toFixed(2)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-auto">
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        className={`flex-1 text-[12px] font-extrabold py-2 rounded-xl border ${item.isAvailable !== false ? 'bg-[#eef0ec] text-primary border-transparent' : 'bg-red-50 text-red-600 border-red-100'}`}
                      >
                        {item.isAvailable !== false ? t("In Stock") : t("Out of Stock")}
                      </button>
                      <button onClick={() => openEditModal(item)} className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center active:scale-95 transition-transform">
                        <Edit2 className="text-[16px] text-primary" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center active:scale-95 transition-transform">
                        <Trash2 className="text-[16px] text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
          }
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-[#F5F5F0] w-full sm:w-[450px] rounded-t-[32px] sm:rounded-[32px] p-6 pb-8 sm:pb-6 animate-slide-up shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-[#F5F5F0] pt-2 pb-2 z-10">
              <h2 className="text-[20px] font-extrabold text-primary">{editingItem ? t("Edit Pantry Item") : t("Add Pantry Item")}</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center active:scale-95 transition-transform">
                <X className="text-[20px] text-primary" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Image Upload */}
              <div className="flex flex-col items-center justify-center w-full">
                <label className={`w-full h-40 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden relative ${imagePreview ? 'border-transparent bg-white shadow-sm' : 'border-[#bec9c3] bg-white hover:bg-surface-container'}`}>
                  {imagePreview ? (
                    <img src={imagePreview} alt={t("Preview")} className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="text-[#bec9c3] text-[32px] mb-2" />
                      <span className="text-[14px] font-bold text-on-surface-variant">{t("Upload Photo")}</span>
                    </>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">{t("Category")}</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                >
                  <option value="">{t("Select Category")}</option>
                  {categories.map(c => (
                      <option key={c._id || c.id} value={c._id || c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">{t("Food Name (Title)")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("e.g. Cold Pressed Olive Oil")}
                  className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">{t("Base Price (₹)")}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder={t("e.g. 45.00")}
                      disabled={variants.length > 0}
                      className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm disabled:bg-slate-100 disabled:text-slate-400"
                      required={variants.length === 0}
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">{t("Other Platforms Price")}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={priceOnOtherPlatforms}
                      onChange={(e) => setPriceOnOtherPlatforms(e.target.value)}
                      placeholder={t("Optional")}
                      className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                    />
                  </div>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">{t("Food Type")}</label>
                <select
                  value={foodType}
                  onChange={(e) => setFoodType(e.target.value)}
                  className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                >
                  <option value="Veg">{t("Veg")}</option>
                  <option value="Non-Veg">{t("Non-Veg")}</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">{t("Description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("Enter item description...")}
                  className="w-full bg-white rounded-2xl p-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm resize-none min-h-[100px]"
                />
              </div>

              {/* Variants Section */}
              <div className="bg-white p-4 rounded-2xl border border-[#e4e2e1] shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-[13px] font-bold text-[#1b1c1c]">{t("Variants (Optional)")}</label>
                  <button type="button" onClick={addVariant} className="text-primary text-[12px] font-bold flex items-center gap-1">
                      <Plus className="w-4 h-4" /> {t("Add")}
                  </button>
                </div>
                {variants.length === 0 ? (
                    <p className="text-[13px] text-slate-500 italic">{t("No variants added. Base price will be used.")}</p>
                ) : (
                    <div className="space-y-3">
                        {variants.map((v, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder={t("Name (e.g. 500g)")}
                                    value={v.name}
                                    onChange={(e) => updateVariant(idx, 'name', e.target.value)}
                                    className="flex-1 h-[40px] bg-slate-50 rounded-xl px-3 text-[14px] border border-slate-200 outline-none focus:border-primary"
                                    required
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder={t("Price")}
                                    value={v.price}
                                    onChange={(e) => updateVariant(idx, 'price', e.target.value)}
                                    className="w-24 h-[40px] bg-slate-50 rounded-xl px-3 text-[14px] border border-slate-200 outline-none focus:border-primary"
                                    required
                                />
                                <button type="button" onClick={() => removeVariant(idx)} className="w-8 h-8 flex items-center justify-center text-red-500 bg-red-50 rounded-lg">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-2 bg-white p-4 rounded-2xl border border-[#e4e2e1] shadow-sm">
                <span className="text-[14px] font-bold text-[#1b1c1c]">{t("Item Available")}</span>
                <button
                  type="button"
                  onClick={() => setIsAvailable(!isAvailable)}
                  className={`w-14 h-8 rounded-full p-1 transition-colors ${isAvailable ? 'bg-primary' : 'bg-[#e4e2e1]'}`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white shadow-md transition-transform ${isAvailable ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-[56px] bg-primary hover:bg-[#155a49] text-white rounded-2xl font-extrabold text-[16px] mt-6 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center shadow-lg"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (editingItem ? t("Update Item") : t("Save Item"))}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
