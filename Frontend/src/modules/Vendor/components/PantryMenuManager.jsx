import React, { useState } from 'react';
import { dmbVendorAPI } from '../../../services/api/index';
import { Plus, Edit2, Trash2, X, Camera } from 'lucide-react';

export default function PantryMenuManager({ items, setItems }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setTitle('');
    setPrice('');
    setImageFile(null);
    setImagePreview(null);
    setIsAvailable(true);
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setTitle(item.title);
    setPrice(item.price);
    setImageFile(null);
    setImagePreview(item.image);
    setIsAvailable(item.isAvailable);
    setIsModalOpen(true);
  };

  const handleDelete = async (item) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const res = await dmbVendorAPI.deletePantryItem(item._id);
        if (res.data?.success) {
          setItems(items.filter(i => i._id !== item._id));
        }
      } catch (err) {
        console.error(err);
        alert('Failed to delete item');
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title || !price) return;
    if (!editingItem && !imageFile) return;

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('price', price);
      formData.append('isAvailable', isAvailable);
      if (imageFile) {
        formData.append('image', imageFile);
      }

      if (editingItem) {
        const res = await dmbVendorAPI.updatePantryItem(editingItem._id, formData);
        if (res.data?.success) {
          setItems(items.map(i => i._id === editingItem._id ? res.data.item : i));
          setIsModalOpen(false);
        }
      } else {
        const res = await dmbVendorAPI.createPantryItem(formData);
        if (res.data?.success) {
          setItems([res.data.item, ...items]);
          setIsModalOpen(false);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save pantry item');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      const res = await dmbVendorAPI.updatePantryItem(item._id, { isAvailable: !item.isAvailable });
      if (res.data?.success) {
        setItems(items.map((i) => (i._id === item._id ? { ...i, isAvailable: !item.isAvailable } : i)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 pb-[100px]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-xl px-5 pt-16 pb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-extrabold text-primary tracking-tight">Pantry Menu</h1>
          <button
            onClick={openAddModal}
            className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center active:scale-95 transition-transform shadow-md hover:bg-[#155a49]"
          >
            <Plus />
          </button>
        </div>
        <p className="text-on-surface-variant text-[14px] mt-1 font-medium">Manage your pantry shop inventory.</p>
      </div>

      {/* List */}
      <div className="px-5 mt-2 space-y-4">
        {items.length === 0 ? (
          <div className="text-center mt-12 bg-white rounded-3xl p-8 border border-[#e4e2e1]/50 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-[#eef0ec] mx-auto flex items-center justify-center mb-4">
              <Package className="text-[32px] text-primary" />
            </div>
            <p className="text-[17px] text-[#1b1c1c] font-extrabold">No pantry items yet</p>
            <p className="text-[14px] text-[#6e7a74] mt-1 font-medium mb-5">Add some items to start selling.</p>
            <button onClick={openAddModal} className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-[14px] active:scale-95 transition-transform">
              Add First Item
            </button>
          </div>
        ) : (
          items.map((item) => (
            <div key={item._id} className="bg-white rounded-3xl p-3 shadow-sm border border-transparent hover:border-primary/20 transition-all flex items-center gap-4">
              <div className="w-24 h-24 rounded-[20px] overflow-hidden bg-[#eef0ec] shrink-0 border border-black/5">
                <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0 py-1 flex flex-col justify-between h-24">
                <div>
                  <h3 className="font-extrabold text-[15px] text-[#1b1c1c] leading-tight truncate">{item.title}</h3>
                  <p className="text-[16px] font-extrabold text-primary mt-1">₹{item.price.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  <button
                    onClick={() => handleToggleAvailability(item)}
                    className={`flex-1 text-[12px] font-extrabold py-2 rounded-xl border ${item.isAvailable ? 'bg-[#eef0ec] text-primary border-transparent' : 'bg-red-50 text-red-600 border-red-100'}`}
                  >
                    {item.isAvailable ? 'In Stock' : 'Out of Stock'}
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
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-[#F5F5F0] w-full sm:w-[400px] rounded-t-[32px] sm:rounded-[32px] p-6 pb-8 sm:pb-6 animate-slide-up shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[20px] font-extrabold text-primary">{editingItem ? 'Edit Pantry Item' : 'Add Pantry Item'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center active:scale-95 transition-transform">
                <X className="text-[20px] text-primary" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Image Upload */}
              <div className="flex flex-col items-center justify-center w-full">
                <label className={`w-full h-40 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden relative ${imagePreview ? 'border-transparent bg-white shadow-sm' : 'border-[#bec9c3] bg-white hover:bg-surface-container'}`}>
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="text-[#bec9c3] text-[32px] mb-2" />
                      <span className="text-[14px] font-bold text-on-surface-variant">Upload Photo</span>
                    </>
                  )}
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </label>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cold Pressed Olive Oil"
                  className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-on-surface-variant mb-1.5 ml-1">Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 45.00"
                  className="w-full h-[52px] bg-white rounded-2xl px-4 text-[15px] font-medium text-[#1b1c1c] outline-none border border-[#e4e2e1] focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                  required
                />
              </div>

              <div className="flex items-center justify-between mt-2 bg-white p-4 rounded-2xl border border-[#e4e2e1] shadow-sm">
                <span className="text-[14px] font-bold text-[#1b1c1c]">Item Available</span>
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
                disabled={isLoading || !title || !price || (!editingItem && !imageFile)}
                className="w-full h-[56px] bg-primary hover:bg-[#155a49] text-white rounded-2xl font-extrabold text-[16px] mt-6 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center shadow-lg"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (editingItem ? 'Update Item' : 'Save Item')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
