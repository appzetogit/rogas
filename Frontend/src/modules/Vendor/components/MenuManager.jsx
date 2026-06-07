/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { uploadAPI } from '../../../services/api/index';












export default function MenuManager({
  meals,
  surpriseBoxes,
  onAddMeal,
  onEditMeal,
  onDeleteMeal,
  onAddSurpriseBox,
  onEndSurpriseBox,
  onToggleMealStatus
}) {
  const [activeDay, setActiveDay] = useState(12);
  const [subView, setSubView] = useState('list');
  const [editingMeal, setEditingMeal] = useState(null);

  // Form states for Add/Edit Meal
  const [mealName, setMealName] = useState('');
  const [mealPrice, setMealPrice] = useState('');
  const [mealVat, setMealVat] = useState('8% — Restaurant/processed food');
  const [mealDesc, setMealDesc] = useState('');
  const [mealCal, setMealCal] = useState('');
  const [mealProt, setMealProt] = useState('');
  const [mealCarb, setMealCarb] = useState('');
  const [mealFat, setMealFat] = useState('');
  const [mealAllergens, setMealAllergens] = useState([]);
  const [mealImageUrl, setMealImageUrl] = useState('');
  const [mealPortions, setMealPortions] = useState(10);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleMealPhotoChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        setIsUploadingPhoto(true);
        const res = await uploadAPI.uploadMedia(file, { folder: 'food/restaurants/menu' });
        const url = res.data?.data?.url || res.data?.url || res.data;
        if (url) {
          setMealImageUrl(url);
          triggerToast('Photo uploaded successfully ✓');
        } else {
          triggerToast('Failed to parse uploaded photo URL');
        }
      } catch (err) {
        triggerToast(err.message || 'Failed to upload photo');
      } finally {
        setIsUploadingPhoto(false);
      }
    }
  };

  // Form states for Surprise Box creation
  const [selectedMealId, setSelectedMealId] = useState('');
  const [unsoldPortions, setUnsoldPortions] = useState(3);
  const [discountPercent, setDiscountPercent] = useState(50);

  // Toast notice state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleEditClick = (meal) => {
    setEditingMeal(meal);
    setMealName(meal.name);
    setMealPrice(meal.price.toString());
    setMealVat(meal.vat);
    setMealDesc(meal.description);
    setMealCal(meal.calories);
    setMealProt(meal.prot);
    setMealCarb(meal.carb);
    setMealFat(meal.fat);
    setMealAllergens(meal.allergens);
    setMealImageUrl(meal.imageUrl);
    setMealPortions(meal.portions);
    setSubView('addEdit');
  };

  const handleAddClick = () => {
    setEditingMeal(null);
    setMealName('');
    setMealPrice('');
    setMealVat('8% — Restaurant/processed food');
    setMealDesc('');
    setMealCal('');
    setMealProt('');
    setMealCarb('');
    setMealFat('');
    setMealAllergens([]);
    // Provide a nice default delicious image
    setMealImageUrl('https://lh3.googleusercontent.com/aida-public/AB6AXuDpWQRQIS01PQ5QzZ92J_MbnhfqpTNe-1MsukLb99JWU83WxSJxZA7MXWhmOq0UpzbJ5Qmcr6fMrU0VWlJ4F9tb_Rpb6dZ5BE3ZZwKf-NMV7z99im4yiprq3W6TBAHmzpoLqjBuizemyCgGnCr9TMbONBFJS2gooGXZ-got7BBRnQmNyCz9ICypYQsq5MJ3ywl5TkqddwGkuvDpdL8QXYkSjX7bMM7odMGUc0Nj45WxtfAFBxrdNiXszPnKkGAJ7evVjitlRk5kOQ');
    setMealPortions(12);
    setSubView('addEdit');
  };

  const toggleAllergen = (allergen) => {
    setMealAllergens((prev) =>
    prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
  };

  const handleSaveMeal = (e) => {
    e.preventDefault();
    const priceNum = parseFloat(mealPrice) || 12.00;

    const payload = {
      name: mealName || 'New Culinary Secret',
      price: priceNum,
      vat: mealVat,
      description: mealDesc || 'Freshly prepared delicious item.',
      calories: mealCal || '300 kcal',
      prot: mealProt || '15g',
      carb: mealCarb || '20g',
      fat: mealFat || '10g',
      allergens: mealAllergens,
      imageUrl: mealImageUrl,
      portions: mealPortions,
      status: 'Active'
    };

    if (editingMeal) {
      onEditMeal(editingMeal.id, payload);
      triggerToast('Meal updated successfully');
    } else {
      onAddMeal(payload);
      triggerToast('Meal added successfully');
    }
    setSubView('list');
  };

  const handleDeleteClick = () => {
    if (editingMeal) {
      onDeleteMeal(editingMeal.id);
      triggerToast('Meal removed from menu');
    }
    setSubView('list');
  };

  const handleCreateSurpriseBox = (e) => {
    e.preventDefault();
    const selectedMeal = meals.find((m) => m.id === selectedMealId);
    if (!selectedMeal) {
      triggerToast('Please select a valid meal');
      return;
    }

    const calculatedPrice = selectedMeal.price * (1 - discountPercent / 100);

    onAddSurpriseBox({
      mealId: selectedMeal.id,
      mealName: `${selectedMeal.name} box`,
      portions: unsoldPortions,
      discount: discountPercent,
      originalPrice: selectedMeal.price,
      discountedPrice: parseFloat(calculatedPrice.toFixed(2)),
      closesAt: '14:00 today',
      claimedCount: 0,
      status: 'Active'
    });

    triggerToast('Surprise Box Deal Posted! 🌟');
    setSubView('list');
  };

  return (
    <div className="flex-grow pt-14 pb-[99px] font-sans px-4 select-none max-w-[390px] mx-auto w-full text-left relative">
      
      {/* List Subview */}
      {subView === 'list' &&
      <div className="space-y-4 animate-fadeIn">
          
          {/* Weekly Day Strip */}
          <section className="mt-4 bg-surface-container-lowest rounded-xl p-3 shadow-xs border border-outline-variant/20">
            <div className="flex justify-between items-center text-center">
              {[12, 13, 14, 15, 16, 17, 18].map((day) => {
              const mapDaysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
              const letter = mapDaysOfWeek[day - 12];
              const isActive = activeDay === day;
              return (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className="flex flex-col items-center gap-1 group cursor-pointer">
                  
                    <span className="text-[10px] font-bold text-outline uppercase tracking-wider">{letter}</span>
                    <div
                    className={`w-8 h-8 flex items-center justify-center font-bold text-[13px] rounded-full transition-all ${
                    isActive ? 'bg-primary-container text-white shadow-xs' : 'text-on-surface hover:bg-outline-variant/10'}`
                    }>
                    
                      {day}
                    </div>
                  </button>);

            })}
            </div>
          </section>

          {/* Subheader page actions */}
          <div className="flex justify-between items-center pt-2">
            <h2 className="text-[16px] font-bold text-on-surface">Monday {activeDay} May</h2>
            <div className="flex gap-2">
              <button
              onClick={() => setSubView('surpriseBox')}
              className="text-secondary font-bold text-[13px] flex items-center gap-0.5 hover:underline">
              
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                Boxes ({surpriseBoxes.filter((s) => s.status === 'Active').length})
              </button>
              <button
              onClick={handleAddClick}
              className="text-primary font-bold text-[13px] flex items-center gap-0.5 hover:underline">
              
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add meal
              </button>
            </div>
          </div>

          {/* Meals list */}
          <div className="space-y-4">
            {meals.filter((m) => m.status !== 'Removed').length === 0 ? (
              <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/15 text-center flex flex-col items-center justify-center min-h-[220px] animate-fadeIn">
                <span className="material-symbols-outlined text-[48px] text-primary/40 mb-3">restaurant_menu</span>
                <p className="text-[14px] font-bold text-on-surface">No meals added yet</p>
                <p className="text-[12px] text-outline mt-1 leading-relaxed max-w-[220px]">
                  Click the "Add meal" button above to publish your first subscription meal plan.
                </p>
              </div>
            ) : (
              meals.
              filter((m) => m.status !== 'Removed').
              map((meal) =>
              <div
                key={meal.id}
                className="bg-surface-container-lowest rounded-xl p-3 shadow-xs flex flex-col gap-3 border border-outline-variant/10 transition-all hover:scale-[1.01]">
                
                      <div className="flex gap-4">
                        <div className="w-[60px] h-[60px] bg-surface-variant rounded-lg overflow-hidden flex-shrink-0 shadow-xs">
                          <img alt={meal.name} className="w-full h-full object-cover" src={meal.imageUrl} />
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start">
                            <h3 className="text-[15px] font-bold text-on-surface truncate block pr-1">{meal.name}</h3>
                            <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        meal.status === 'Active' ? 'bg-primary/10 text-primary' : 'bg-secondary-container/10 text-on-secondary-container'}`
                        }>
                        
                              {meal.status}
                            </span>
                          </div>
                          <p className="text-[14px] font-extrabold text-on-surface mt-0.5">
                            {meal.price.toFixed(2)} PLN{' '}
                            <span className="text-outline font-normal text-[11px]">· 8% VAT</span>
                          </p>
                          <p className="text-[12px] text-outline font-medium">
                            {meal.calories} · {meal.portions} portions
                          </p>
                        </div>
                      </div>
    
                      {/* Actions Row bar */}
                      <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
                        <button
                    onClick={() => handleEditClick(meal)}
                    className="flex-1 py-1.5 rounded-lg border border-primary text-primary font-semibold text-[13px] hover:bg-primary/5 active:scale-95 transition-all text-center">
                    
                          Edit
                        </button>
                        <button
                    onClick={() => triggerToast(`Nutrition facts: ${meal.calories} | Prot: ${meal.prot} | Carb: ${meal.carb}`)}
                    className="flex-1 py-1.5 rounded-lg border border-primary text-primary font-semibold text-[13px] hover:bg-primary/5 active:scale-95 transition-all text-center">
                    
                          Nutrition
                        </button>
                        <button
                    onClick={() => {
                      if (onToggleMealStatus) {
                        // Task 3: calls backend toggle-status which notifies subscribers via FCM
                        onToggleMealStatus(meal.id);
                      } else {
                        onEditMeal(meal.id, { status: meal.status === 'Active' ? 'Draft' : 'Active' });
                        triggerToast(`Status switched to ${meal.status === 'Active' ? 'Draft' : 'Active'}`);
                      }
                    }}
                    className={`flex-1 py-1.5 rounded-lg border font-semibold text-[13px] active:scale-95 transition-all text-center flex items-center justify-center gap-1 ${
                      meal.status === 'Active'
                        ? 'border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100'
                        : 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
                    }`}>
                          <span className="material-symbols-outlined text-[15px]">
                            {meal.status === 'Active' ? 'pause_circle' : 'play_circle'}
                          </span>
                          {meal.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
              )
            )}
          </div>
        </div>
      }

      {/* Screen 1: Add / Edit Meal Screen */}
      {subView === 'addEdit' &&
      <form onSubmit={handleSaveMeal} className="space-y-5 animate-fadeIn">
          {/* Header row simulation */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button
            type="button"
            onClick={() => setSubView('list')}
            className="flex items-center active:scale-90 transition-transform">
            
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="text-[16px] font-semibold">{editingMeal ? 'Edit Meal' : 'Add Meal'}</h2>
            <div className="w-6"></div>
          </div>

          <div className="pt-6 space-y-5">
            {/* Meal Name Input */}
            <div className="space-y-1">
              <label className="text-[10px] text-outline uppercase font-semibold">Meal Name</label>
              <input
              type="text"
              required
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="e.g. Tomato Basil Gnocchi"
              className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white transition-all" />
            
            </div>

            {/* Price & VAT Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-outline uppercase font-semibold">Price per Meal (PLN)</label>
                <input
                type="number"
                step="0.01"
                required
                value={mealPrice}
                onChange={(e) => setMealPrice(e.target.value)}
                placeholder="15.00"
                className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-extrabold outline-none focus:ring-1 focus:ring-primary bg-white transition-all" />
              
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-outline uppercase font-semibold">VAT Category</label>
                <div className="flex items-center gap-1.5 bg-primary-container/10 border border-primary-container/20 rounded-lg px-3 py-2.5">
                  <span className="material-symbols-outlined text-[18px] text-primary">info</span>
                  <span className="text-[11px] leading-tight text-primary font-semibold truncate">8% — Restaurant</span>
                </div>
              </div>
            </div>

            {/* Description Textarea */}
            <div className="space-y-1">
              <label className="text-[10px] text-outline uppercase font-semibold">Description</label>
              <textarea
              required
              rows={3}
              value={mealDesc}
              onChange={(e) => setMealDesc(e.target.value)}
              placeholder="Describe the wonderful ingredients, seasoning style, and textures..."
              className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white transition-all resize-none" />
            
            </div>

            {/* Nutritional Info grid */}
            <div className="space-y-2">
              <label className="text-[10px] text-outline uppercase font-semibold">Nutritional Info (Optional)</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Cal:</span>
                  <input
                  type="text"
                  value={mealCal}
                  onChange={(e) => setMealCal(e.target.value)}
                  placeholder="345 kcal"
                  className="w-full pl-10 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white" />
                
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Prot:</span>
                  <input
                  type="text"
                  value={mealProt}
                  onChange={(e) => setMealProt(e.target.value)}
                  placeholder="26.5 g"
                  className="w-full pl-11 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white" />
                
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Carb:</span>
                  <input
                  type="text"
                  value={mealCarb}
                  onChange={(e) => setMealCarb(e.target.value)}
                  placeholder="20.9 g"
                  className="w-full pl-11 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white" />
                
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Fat:</span>
                  <input
                  type="text"
                  value={mealFat}
                  onChange={(e) => setMealFat(e.target.value)}
                  placeholder="12.0 g"
                  className="w-full pl-10 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white" />
                
                </div>
              </div>
            </div>

            {/* Allergens selectable pills grid list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-outline uppercase font-semibold">Allergens (EU 14)</label>
                <span className="text-[10px] text-error font-semibold italic">Select all that apply</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Gluten', 'Dairy', 'Egg', 'Celery', 'Nuts', 'Soy'].map((allergen) => {
                const isActive = mealAllergens.includes(allergen);
                return (
                  <button
                    type="button"
                    key={allergen}
                    onClick={() => toggleAllergen(allergen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all duration-200 active:scale-95 ${
                    isActive ?
                    'bg-error text-on-error shadow-xs' :
                    'border-2 border-error/55 text-error font-semibold bg-white'}`
                    }>
                    
                      {isActive &&
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check_circle
                        </span>
                    }
                      {allergen}
                    </button>);

              })}
              </div>
            </div>

            {/* Meal image upload slot representation */}
            <div className="space-y-1 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold block">Meal Photo</label>
              <input
                type="file"
                id="meal-photo-upload"
                accept="image/*"
                className="hidden"
                onChange={handleMealPhotoChange}
                disabled={isUploadingPhoto}
              />
              <label
                htmlFor="meal-photo-upload"
                className={`relative w-full aspect-video rounded-xl overflow-hidden bg-surface-container group cursor-pointer border-2 border-dashed border-outline-variant hover:border-primary transition-all duration-300 block ${isUploadingPhoto ? 'opacity-80 pointer-events-none' : ''}`}
              >
                <img
                  alt="Meal preview"
                  className="w-full h-full object-cover"
                  src={mealImageUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpWQRQIS01PQ5QzZ92J_MbnhfqpTNe-1MsukLb99JWU83WxSJxZA7MXWhmOq0UpzbJ5Qmcr6fMrU0VWlJ4F9tb_Rpb6dZ5BE3ZZwKf-NMV7z99im4yiprq3W6TBAHmzpoLqjBuizemyCgGnCr9TMbONBFJS2gooGXZ-got7BBRnQmNyCz9ICypYQsq5MJ3ywl5TkqddwGkuvDpdL8QXYkSjX7bMM7odMGUc0Nj45WxtfAFBxrdNiXszPnKkGAJ7evVjitlRk5kOQ'}
                />
              
                {isUploadingPhoto ? (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white animate-pulse">
                    <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
                    <span className="font-bold text-[13px] mt-2 tracking-wider">Uploading Photo...</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-[32px]">photo_camera</span>
                    <span className="font-bold text-[13px] mt-1">Change Photo</span>
                  </div>
                )}
              </label>
            </div>

            {/* Submit button bar */}
            <div className="pt-4 flex flex-col gap-2.5">
              <button
              type="submit"
              className="w-full py-4 bg-primary text-on-primary font-bold text-[15px] rounded-xl shadow-lg active:scale-98 transition-transform flex items-center justify-center gap-2 cursor-pointer">
              
                <span className="material-symbols-outlined leading-none text-[20px]">save</span>
                Save Meal
              </button>

              {editingMeal &&
            <button
              type="button"
              onClick={handleDeleteClick}
              className="w-full py-2.5 text-center text-[12px] font-bold text-error uppercase tracking-wider hover:underline active:scale-95 transition-transform">
              
                  Delete Meal
                </button>
            }
            </div>
          </div>
        </form>
      }

      {/* Screen 13: Surprise Boxes management */}
      {subView === 'surpriseBox' &&
      <div className="space-y-6 animate-fadeIn">
          {/* Header bar back button */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button
            onClick={() => setSubView('list')}
            className="flex items-center active:scale-90 transition-transform">
            
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="text-[16px] font-semibold">Surprise Boxes</h2>
            <div className="w-6"></div>
          </div>

          <div className="pt-6 space-y-6">
            {/* Active surprise boxes column list */}
            <div>
              <h2 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                ACTIVE SURPRISE BOXES
              </h2>
              
              {surpriseBoxes.filter((s) => s.status === 'Active').length === 0 ?
            <div className="text-center py-6 bg-white rounded-xl border border-dashed border-outline-variant p-4">
                  <span className="material-symbols-outlined text-[30px] text-outline">shopping_bag</span>
                  <p className="text-[13px] text-outline mt-1 font-bold">No active promotional surprise boxes</p>
                </div> :

            surpriseBoxes.
            filter((s) => s.status === 'Active').
            map((box) =>
            <div
              key={box.id}
              className="bg-surface-container-lowest rounded-xl border-l-[5px] border-primary shadow-xs p-4 relative border border-outline-variant/15 text-left transition-transform hover:scale-[1.01]">
              
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-[14px] text-on-surface mb-0.5">{box.mealName}</h3>
                          <p className="text-[12px] text-outline">
                            {box.portions} portions · {box.discount}% off · Closes 2pm
                          </p>
                        </div>
                        <div className="bg-primary/10 border border-primary/20 text-primary px-3 py-1 rounded-full text-[11px] font-bold">
                          {box.claimedCount} claimed
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-1.5 font-bold text-[13px]">
                          <span className="text-outline line-through">{box.originalPrice.toFixed(2)} PLN</span>
                          <span className="material-symbols-outlined text-primary text-[14px]">arrow_forward</span>
                          <span className="text-primary text-[15px]">{box.discountedPrice.toFixed(2)} PLN</span>
                        </div>
                        <button
                  onClick={() => {
                    onEndSurpriseBox(box.id);
                    triggerToast('Surprise box campaign ended');
                  }}
                  className="bg-secondary-container text-white px-3.5 py-2 rounded-lg font-bold text-[12px] hover:brightness-110 active:scale-95 transition-all cursor-pointer">
                  
                          End deal
                        </button>
                      </div>
                    </div>
            )
            }
            </div>

            {/* CREATE NEW SURPRISE BOX card */}
            <form onSubmit={handleCreateSurpriseBox} className="space-y-4">
              <h2 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
                CREATE NEW SURPRISE BOX
              </h2>
              
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 space-y-4 shadow-xs">
                {/* Select Meal */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-on-surface-variant">SELECT MEAL</label>
                  <div className="relative">
                    <select
                    value={selectedMealId}
                    required
                    onChange={(e) => setSelectedMealId(e.target.value)}
                    className="w-full bg-surface border border-outline-variant rounded-lg h-11 px-3 pr-10 text-[13px] font-medium text-on-surface focus:outline-none focus:border-primary appearance-none transition-all">
                    
                      <option value="">Choose from today's menu</option>
                      {meals.
                    filter((m) => m.status === 'Active').
                    map((m) =>
                    <option key={m.id} value={m.id}>
                            {m.name} ({m.price.toFixed(2)} PLN)
                          </option>
                    )}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Unsold Portions */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase">UNSOLD PORTIONS</label>
                  <div className="flex gap-2.5">
                    {[1, 2, 3, 4, 5].map((val) => {
                    const isActive = val === unsoldPortions;
                    return (
                      <button
                        type="button"
                        key={val}
                        onClick={() => setUnsoldPortions(val)}
                        className={`w-9 h-9 rounded-full font-bold text-[13px] flex items-center justify-center transition-all ${
                        isActive ? 'bg-primary text-on-primary shadow-xs' : 'border border-outline-variant text-outline hover:border-primary bg-white'}`
                        }>
                        
                          {val}
                        </button>);

                  })}
                  </div>
                </div>

                {/* Discount Slider */}
                <div className="space-y-2 pt-2">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase">DISCOUNT %</label>
                  <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(parseInt(e.target.value))}
                  className="w-full h-2 bg-surface-container-highest rounded-full appearance-none accent-secondary-container cursor-pointer" />
                
                  <div className="text-center pt-1">
                    <p className="font-bold text-on-surface text-[13px]">{discountPercent}% off</p>
                    {selectedMealId && meals.find((m) => m.id === selectedMealId) &&
                  <div className="flex items-center justify-center gap-2 text-[12px] font-bold text-secondary mt-0.5">
                        <span className="text-outline line-through">
                          {meals.find((m) => m.id === selectedMealId).price.toFixed(2)} PLN
                        </span>
                        <span className="material-symbols-outlined text-[14px]">trending_flat</span>
                        <span>
                          {(meals.find((m) => m.id === selectedMealId).price * (1 - discountPercent / 100)).toFixed(2)} PLN
                        </span>
                      </div>
                  }
                  </div>
                </div>

                {/* Closing hours */}
                <div className="flex justify-between items-center py-3 border-t border-outline-variant/20">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase">CLOSES AT</label>
                  <div className="flex items-center gap-1.5 font-bold text-[13px] text-on-surface">
                    <span className="material-symbols-outlined text-[#F59E0B] text-[18px]">schedule</span>
                    <span>14:00 today</span>
                  </div>
                </div>

                {/* Submit button */}
                <button
                type="submit"
                className="w-full bg-secondary-container h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white text-[15px] shadow-md hover:brightness-105 active:scale-95 transition-all cursor-pointer">
                
                  <span className="material-symbols-outlined">auto_awesome</span>
                  Submit Surprise Box
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      {/* Persistent success message toast overlay */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 transition-all duration-300 z-100 ${
        showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
        }>
        
        <span className="material-symbols-outlined text-primary-fixed text-green-400">check_circle</span>
        <span className="font-bold text-[13px]">{toastMessage}</span>
      </div>
    </div>);

}