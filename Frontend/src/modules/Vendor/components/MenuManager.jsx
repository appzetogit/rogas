/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { uploadAPI, dmbVendorAPI } from '../../../services/api/index';
import { Sparkles, Plus, UtensilsCrossed, ArrowRightLeft, PlusCircle, Utensils, Edit2, Trash2, ArrowLeft, Info, CheckCircle, Loader2, Camera, Save, ShoppingBag, ArrowRight, ChevronDown, Clock, X, ChevronRight, PauseCircle } from 'lucide-react';

const toLocalDateStr = (d) => {
  if (!d) return "";
  const dateObj = new Date(d);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};












export default function MenuManager({
  vendorType,
  meals,
  surpriseBoxes,
  onAddMeal,
  onEditMeal,
  onDeleteMeal,
  onAddSurpriseBox,
  onEndSurpriseBox,
  onToggleMealStatus
}) {
  const currentWeekDates = React.useMemo(() => {
    const days = [];
    const today = new Date();
    const currentDay = today.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);
    monday.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [activeDay, setActiveDay] = useState(() => selectedDate.getDate());
  const [mealSelectorOpenPlan, setMealSelectorOpenPlan] = useState(null);

  const [subView, setSubView] = useState('list');
  const [editingMeal, setEditingMeal] = useState(null);

  const [tab, setTab] = useState('menu');
  const [expandedDate, setExpandedDate] = useState(null);
  
  // Weekly Menu Scheduling states
  const [dailyMenus, setDailyMenus] = useState([]);
  const [isLoadingDailyMenus, setIsLoadingDailyMenus] = useState(false);
  const [selectedMealForSchedule, setSelectedMealForSchedule] = useState(null);
  const [selectedDateForSchedule, setSelectedDateForSchedule] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [addMealSelectorOpen, setAddMealSelectorOpen] = useState(false);
  const [dishNameSchedule, setDishNameSchedule] = useState('');
  const [descriptionSchedule, setDescriptionSchedule] = useState('');
  const [caloriesSchedule, setCaloriesSchedule] = useState('');
  const [proteinSchedule, setProteinSchedule] = useState('');
  const [carbsSchedule, setCarbsSchedule] = useState('');
  const [fatsSchedule, setFatsSchedule] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [photoSchedule, setPhotoSchedule] = useState('');
  const [selectedSlotForSchedule, setSelectedSlotForSchedule] = useState('lunch');

  const generateUpcomingDays = () => {
    const days = [];
    const start = new Date();
    // Start from tomorrow (today + 1 day)
    for (let i = 1; i <= 14; i++) {
      const nextDate = new Date(start);
      nextDate.setDate(start.getDate() + i);
      days.push(nextDate);
    }
    return days;
  };

  const fetchDailyMenus = async () => {
    try {
      setIsLoadingDailyMenus(true);
      const start = new Date();
      const currentDay = start.getDay();
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
      start.setDate(start.getDate() - daysToMonday);
      start.setHours(0, 0, 0, 0);

      const end = new Date(start);
      end.setDate(start.getDate() + 14);

      const res = await dmbVendorAPI.getDailyMenus({
        startDate: toLocalDateStr(start),
        endDate: toLocalDateStr(end)
      });

      if (res.data?.success) {
        setDailyMenus(res.data.dailyMenus || []);
      }
    } catch (err) {
      console.error("Failed to load daily menus:", err);
    } finally {
      setIsLoadingDailyMenus(false);
    }
  };

  const getScheduledDishForMealAndDate = (mealId, date, slot = 'lunch') => {
    const dateStr = toLocalDateStr(date);
    return dailyMenus.find(dm => {
      const dmDateStr = new Date(dm.date).toISOString().split('T')[0];
      const dmMealPlanId = dm.mealPlanId?._id || dm.mealPlanId;
      const dmSlot = dm.slot || 'lunch';
      return dmMealPlanId === mealId && dmDateStr === dateStr && dmSlot === slot;
    });
  };

  const getScheduledDishForSlotAndDate = (slot, date) => {
    const dateStr = toLocalDateStr(date);
    return dailyMenus.find(dm => {
      const dmDateStr = new Date(dm.date).toISOString().split('T')[0];
      const dmSlot = dm.slot || 'lunch';
      return dmSlot === slot && dmDateStr === dateStr;
    });
  };

  // Get any scheduled dish for this vendor on a given date (regardless of meal plan or slot)
  const getAnyScheduledDishForDate = (date) => {
    const dateStr = toLocalDateStr(date);
    return dailyMenus.find(dm => {
      const dmDateStr = new Date(dm.date).toISOString().split('T')[0];
      return dmDateStr === dateStr;
    });
  };

  const handleSelectMealForSchedule = async (targetPlan, selectedMeal, slot = 'lunch') => {
    try {
      const targetDate = selectedDateForSchedule || selectedDate;
      const payload = {
        mealPlanId: targetPlan.id,
        date: toLocalDateStr(targetDate),
        slot: slot,
        dishName: selectedMeal.name,
        description: selectedMeal.description,
        photo: selectedMeal.imageUrl || selectedMeal.photo || '',
        nutrition: {
          calories: parseInt(selectedMeal.calories) || null,
          protein: parseInt(selectedMeal.prot) || null,
          carbs: parseInt(selectedMeal.carb) || null,
          fats: parseInt(selectedMeal.fat) || null
        }
      };

      const res = await dmbVendorAPI.saveDailyMenu(payload);
      if (res.data?.success) {
        triggerToast(`Scheduled "${selectedMeal.name}" for ${targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} [${slot}]! ✓`);
        await fetchDailyMenus();
        setMealSelectorOpenPlan(null);
      } else {
        triggerToast(res.data?.message || 'Failed to schedule meal');
      }
    } catch (err) {
      triggerToast(err.response?.data?.message || err.message || 'Error scheduling meal');
    }
  };

  const handleDeleteScheduledMeal = async (mealPlanId, date, slot = 'lunch') => {
    if (!window.confirm("Are you sure you want to remove this meal from today's weekly schedule?")) {
      return;
    }
    try {
      const dateStr = toLocalDateStr(date);
      const res = await dmbVendorAPI.deleteDailyMenu({ mealPlanId, date: dateStr, slot });
      if (res.data?.success) {
        triggerToast('Meal removed from schedule! ✓');
        await fetchDailyMenus();
      } else {
        triggerToast(res.data?.message || 'Failed to remove meal');
      }
    } catch (err) {
      triggerToast(err.response?.data?.message || err.message || 'Error removing meal');
    }
  };


  useEffect(() => {
    fetchDailyMenus();
  }, []);

  const handleOpenScheduler = (meal, date, slot = 'lunch', existingDish) => {
    setSelectedMealForSchedule(meal);
    setSelectedDateForSchedule(date);
    setSelectedSlotForSchedule(slot);
    if (existingDish) {
      setDishNameSchedule(existingDish.dishName || '');
      setDescriptionSchedule(existingDish.description || '');
      setPhotoSchedule(existingDish.photo || '');
      setCaloriesSchedule(existingDish.nutrition?.calories ? String(existingDish.nutrition.calories) : '');
      setProteinSchedule(existingDish.nutrition?.protein ? String(existingDish.nutrition.protein) : '');
      setCarbsSchedule(existingDish.nutrition?.carbs ? String(existingDish.nutrition.carbs) : '');
      setFatsSchedule(existingDish.nutrition?.fats ? String(existingDish.nutrition.fats) : '');
    } else {
      setDishNameSchedule('');
      setDescriptionSchedule('');
      setPhotoSchedule('');
      setCaloriesSchedule('');
      setProteinSchedule('');
      setCarbsSchedule('');
      setFatsSchedule('');
    }
    setScheduleModalOpen(true);
  };

  const handleSaveDailyMenu = async (e) => {
    e.preventDefault();
    if (!selectedMealForSchedule || !dishNameSchedule) {
      triggerToast('Dish name is required');
      return;
    }
    
    try {
      setIsSavingSchedule(true);
      const payload = {
        mealPlanId: selectedMealForSchedule.id,
        date: toLocalDateStr(selectedDateForSchedule),
        slot: selectedSlotForSchedule,
        dishName: dishNameSchedule,
        description: descriptionSchedule,
        photo: photoSchedule || selectedMealForSchedule.imageUrl || selectedMealForSchedule.photo || '',
        nutrition: {
          calories: parseInt(caloriesSchedule) || null,
          protein: parseInt(proteinSchedule) || null,
          carbs: parseInt(carbsSchedule) || null,
          fats: parseInt(fatsSchedule) || null
        }
      };
      
      const res = await dmbVendorAPI.saveDailyMenu(payload);
      if (res.data?.success) {
        triggerToast('Daily menu scheduled successfully! ✓');
        await fetchDailyMenus();
        setScheduleModalOpen(false);
      } else {
        triggerToast(res.data?.message || 'Failed to save daily menu');
      }
    } catch (err) {
      triggerToast(err.response?.data?.message || err.message || 'Error saving daily menu');
    } finally {
      setIsSavingSchedule(false);
    }
  };

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
  const [mealDietType, setMealDietType] = useState('No preference');
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

  const handleSchedulePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        setIsUploadingPhoto(true);
        const res = await uploadAPI.uploadMedia(file, { folder: 'food/restaurants/menu' });
        const url = res.data?.data?.url || res.data?.url || res.data;
        if (url) {
          setPhotoSchedule(url);
          triggerToast('Schedule photo uploaded successfully ✓');
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
    setMealAllergens(meal.allergens || []);
    setMealDietType(meal.dietType || 'No preference');
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
    setMealDietType('No preference');
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
      dietType: mealDietType,
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
      {subView === 'list' && (
      <div className="space-y-4 animate-fadeIn">
          {/* Tab Switcher */}
          {vendorType !== 'pantry_shop' && (
          <div className="flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/10 mb-4 mt-2">
            <button
              type="button"
              onClick={() => setTab('menu')}
              className={`flex-1 py-2 text-center text-[13px] font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'menu'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-outline-variant/5'
              }`}
            >
              Menu
            </button>
            <button
              type="button"
              onClick={() => setTab('week_menu')}
              className={`flex-1 py-2 text-center text-[13px] font-bold rounded-lg transition-all cursor-pointer ${
                tab === 'week_menu'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-outline-variant/5'
              }`}
            >
              Week Menu
            </button>
          </div>
          )}

          {tab === 'menu' ? (
            <>
              {/* Subheader page actions */}
              <div className="flex justify-between items-center pt-2">
                <h2 className="text-[16px] font-bold text-on-surface">Subscription Meals</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSubView('surpriseBox')}
                    className="text-secondary font-bold text-[13px] flex items-center gap-0.5 hover:underline"
                  >
                    <Sparkles className="text-[18px]" />
                    Boxes ({surpriseBoxes.filter((s) => s.status === 'Active').length})
                  </button>
                  <button
                    type="button"
                    onClick={handleAddClick}
                    className="text-primary font-bold text-[13px] flex items-center gap-0.5 hover:underline"
                  >
                    <Plus className="text-[18px]" />
                    Add meal
                  </button>
                </div>
              </div>

              {/* Meals list */}
              <div className="space-y-4">
                {meals.filter((m) => m.status !== 'Removed').length === 0 ? (
                  <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm border border-outline-variant/15 text-center flex flex-col items-center justify-center min-h-[220px] animate-fadeIn">
                    <UtensilsCrossed className="text-[48px] text-primary/40 mb-3" />
                    <p className="text-[14px] font-bold text-on-surface">No meals added yet</p>
                    <p className="text-[12px] text-outline mt-1 leading-relaxed max-w-[220px]">
                      Click the "Add meal" button above to publish your first subscription meal plan.
                    </p>
                  </div>
                ) : (
                  meals
                    .filter((m) => m.status !== 'Removed')
                    .map((meal) => {
                      return (
                        <div
                          key={meal.id}
                          className="bg-surface-container-lowest rounded-xl p-3.5 shadow-xs flex flex-col gap-3 border border-outline-variant/10 transition-all hover:scale-[1.01]"
                        >
                          <div className="flex gap-4">
                            <div className="w-[60px] h-[60px] bg-surface-variant rounded-lg overflow-hidden flex-shrink-0 shadow-xs">
                              <img alt={meal.name} className="w-full h-full object-cover" src={meal.imageUrl} />
                            </div>
                            <div className="flex-grow min-w-0">
                              <div className="flex justify-between items-start">
                                <h3 className="text-[15px] font-bold text-on-surface truncate block pr-1">{meal.name}</h3>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    meal.status === 'Active' ? 'bg-primary/10 text-primary' : 'bg-secondary-container/10 text-on-secondary-container'
                                  }`}
                                >
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
                              type="button"
                              onClick={() => handleEditClick(meal)}
                              className="flex-1 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-[12px] hover:brightness-105 active:scale-95 transition-all text-center cursor-pointer"
                            >
                              Edit Plan
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerToast(`Nutrition facts: ${meal.calories} | Prot: ${meal.prot} | Carb: ${meal.carb} | Fat: ${meal.fat}`)}
                              className="flex-1 py-1.5 rounded-lg border border-primary text-primary font-semibold text-[12px] hover:bg-primary/5 active:scale-95 transition-all text-center cursor-pointer"
                            >
                              Nutrition
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (onToggleMealStatus) {
                                  onToggleMealStatus(meal.id);
                                } else {
                                  onEditMeal(meal.id, { status: meal.status === 'Active' ? 'Draft' : 'Active' });
                                  triggerToast(`Status switched to ${meal.status === 'Active' ? 'Draft' : 'Active'}`);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg border font-semibold text-[12px] active:scale-95 transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                                meal.status === 'Active'
                                  ? 'border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100'
                                  : 'border-primary text-primary bg-primary/5 hover:bg-primary/10'
                              }`}
                            >
                              {meal.status === 'Active' ? <PauseCircle className="text-[15px]" /> : <PlayCircle className="text-[15px]" />}
                              {meal.status === 'Active' ? 'Pause' : 'Play'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </>
          ) : (
            /* Week Menu Calendar Scheduling */
            <div className="space-y-4">
              {/* Weekly Day Strip — dot indicator for days with scheduled meals */}
              <section className="mt-4 bg-surface-container-lowest rounded-xl p-3 shadow-xs border border-outline-variant/20">
                <div className="flex justify-between items-center text-center">
                  {currentWeekDates.map((date) => {
                    const dayNum = date.getDate();
                    const dayIndex = date.getDay();
                    const mapDaysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
                    const letter = mapDaysOfWeek[dayIndex];
                    const isActive = selectedDateForSchedule &&
                      selectedDateForSchedule.getDate() === dayNum &&
                      selectedDateForSchedule.getMonth() === date.getMonth() &&
                      selectedDateForSchedule.getFullYear() === date.getFullYear();
                    const hasScheduled = getAnyScheduledDishForDate(date);
                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        onClick={() => setSelectedDateForSchedule(date)}
                        className="flex flex-col items-center gap-0.5 group cursor-pointer"
                      >
                        <span className={`text-[10px] font-bold ${isActive ? 'text-primary' : 'text-outline'} uppercase tracking-wider`}>
                          {letter}
                        </span>
                        <div
                          className={`w-8 h-8 flex items-center justify-center font-bold text-[13px] rounded-full transition-all ${
                            isActive
                              ? 'bg-primary text-white shadow-xs'
                              : 'text-on-surface hover:bg-outline-variant/10'
                          }`}
                        >
                          {dayNum}
                        </div>
                        {/* Green dot for days with a scheduled meal */}
                        <div className={`w-1.5 h-1.5 rounded-full transition-all ${hasScheduled ? 'bg-primary' : 'bg-transparent'}`} />
                      </button>
                    );
                  })}
                </div>
              </section>

              {(() => {
                const activeDate = selectedDateForSchedule || selectedDate;
                return (
                  <div className="space-y-4">
                    {/* Header row */}
                    <div className="flex justify-between items-center pt-2">
                      <h2 className="text-[15px] font-extrabold text-on-surface">
                        {activeDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </h2>
                    </div>

                    {/* Slots columns: Breakfast, Lunch, Dinner */}
                    <div className="space-y-4">
                      {['breakfast', 'lunch', 'dinner'].map((slot) => {
                        const existingDish = getScheduledDishForSlotAndDate(slot, activeDate);
                        const existingMeal = existingDish
                          ? meals.find(m => {
                              const planId = existingDish.mealPlanId?._id || existingDish.mealPlanId;
                              return String(m.id) === String(planId);
                            })
                          : null;

                        const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
                        const slotIcon = { breakfast: "☀️", lunch: "🌤️", dinner: "🌙" }[slot];

                        return (
                          <div key={slot} className="bg-surface-container-lowest rounded-xl p-4 shadow-sm border border-outline-variant/15 space-y-3">
                            <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{slotIcon}</span>
                                <span className="font-extrabold text-[13px] text-on-surface">{slotLabel} Slot</span>
                              </div>
                              {existingDish ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDateForSchedule(activeDate);
                                    setSelectedSlotForSchedule(slot);
                                    setMealSelectorOpenPlan(
                                      existingMeal || {
                                        id: existingDish.mealPlanId?._id || existingDish.mealPlanId,
                                        name: existingDish.dishName,
                                        imageUrl: '',
                                        description: '',
                                        calories: '',
                                        prot: '', carb: '', fat: ''
                                      }
                                    );
                                  }}
                                  className="text-amber-600 hover:text-amber-700 font-bold text-[12px] flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                                >
                                  <ArrowRightLeft className="text-[16px]" />
                                  Change
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDateForSchedule(activeDate);
                                    setSelectedSlotForSchedule(slot);
                                    setAddMealSelectorOpen(true);
                                  }}
                                  className="text-primary hover:text-primary-dark font-bold text-[12px] flex items-center gap-0.5 active:scale-95 transition-transform cursor-pointer"
                                >
                                  <PlusCircle className="text-[16px]" />
                                  Add Meal
                                </button>
                              )}
                            </div>

                            {isLoadingDailyMenus ? (
                              <div className="bg-surface-container-lowest rounded-xl p-4 text-center flex flex-col items-center justify-center min-h-[100px]">
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                                <p className="text-[11px] font-bold text-on-surface">Loading...</p>
                              </div>
                            ) : existingDish ? (
                              /* Scheduled meal card details */
                              <div className="flex flex-col gap-3">
                                <div className="flex gap-3 items-center">
                                  <div className="w-14 h-14 bg-surface-variant rounded-xl overflow-hidden flex-shrink-0 shadow-xs">
                                    {(existingDish?.photo || existingMeal?.imageUrl) ? (
                                      <img alt={existingDish.dishName || existingMeal?.name} className="w-full h-full object-cover" src={existingDish.photo || existingMeal.imageUrl} />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-primary/5">
                                        <Utensils className="text-[24px] text-primary/40" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-grow min-w-0">
                                    <h3 className="text-[14px] font-extrabold text-on-surface truncate">{existingDish.dishName}</h3>
                                    {existingMeal && (
                                      <p className="text-[11px] text-outline font-semibold">Plan: {existingMeal.name}</p>
                                    )}
                                    {existingDish.description && (
                                      <p className="text-[11px] text-on-surface-variant italic mt-0.5 line-clamp-1">"{existingDish.description}"</p>
                                    )}
                                  </div>
                                </div>

                                {/* Nutrition facts */}
                                {(existingDish.nutrition?.calories || existingDish.nutrition?.protein) && (
                                  <div className="bg-surface-container p-2 rounded-lg grid grid-cols-4 text-center gap-1">
                                    {[
                                      { label: 'Cal', val: existingDish.nutrition.calories },
                                      { label: 'Protein', val: existingDish.nutrition.protein ? `${existingDish.nutrition.protein}g` : null },
                                      { label: 'Carbs', val: existingDish.nutrition.carbs ? `${existingDish.nutrition.carbs}g` : null },
                                      { label: 'Fat', val: existingDish.nutrition.fats ? `${existingDish.nutrition.fats}g` : null },
                                    ].map(({ label, val }) => (
                                      <div key={label}>
                                        <p className="text-[8px] text-outline font-bold uppercase tracking-wide">{label}</p>
                                        <p className="text-[11px] font-extrabold text-on-surface">{val || '—'}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <div className="flex gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenScheduler(
                                      existingMeal || { id: existingDish.mealPlanId?._id || existingDish.mealPlanId, name: existingDish.dishName },
                                      activeDate,
                                      slot,
                                      existingDish
                                    )}
                                    className="px-3 py-1.5 rounded-lg border border-primary text-primary font-bold text-[11px] hover:bg-primary/5 active:scale-95 transition-all flex items-center justify-center gap-0.5 cursor-pointer"
                                  >
                                    <Edit2 className="text-[14px]" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteScheduledMeal(
                                      existingDish.mealPlanId?._id || existingDish.mealPlanId,
                                      activeDate,
                                      slot
                                    )}
                                    className="px-3 py-1.5 rounded-lg border border-error text-error hover:bg-error/5 active:scale-95 transition-all font-bold text-[11px] cursor-pointer flex items-center justify-center gap-0.5"
                                  >
                                    <Trash2 className="text-[14px]" />
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4 bg-slate-50 border border-dashed border-outline-variant/40 rounded-xl flex items-center justify-center gap-2">
                                <UtensilsCrossed className="text-[18px] text-outline" />
                                <span className="text-[12px] font-semibold text-outline">No meal scheduled</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Screen 1: Add / Edit Meal Screen */}
      {subView === 'addEdit' &&
      <form onSubmit={handleSaveMeal} className="space-y-5 animate-fadeIn">
          {/* Header row simulation */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button
            type="button"
            onClick={() => setSubView('list')}
            className="flex items-center active:scale-90 transition-transform">
            
              <ArrowLeft />
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
                  <Info className="text-[18px] text-primary" />
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

            {/* Diet Type selection */}
            <div className="space-y-2">
              <label className="text-[10px] text-outline uppercase font-semibold">Diet Type</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Keto', label: 'Keto', desc: 'High fat, low carb', icon: 'bolt' },
                  { id: 'Vegan', label: 'Vegan', desc: 'Plant-based only', icon: 'eco' },
                  { id: 'Vegetarian', label: 'Vegetarian', desc: 'No meat or fish', icon: 'nutrition' },
                  { id: 'Paleo', label: 'Paleo', desc: 'Whole foods only', icon: 'outdoor_grill' }
                ].map(diet => {
                  const isActive = mealDietType === diet.id;
                  return (
                    <div 
                      key={diet.id}
                      onClick={() => setMealDietType(isActive ? 'No preference' : diet.id)}
                      className={`bg-white p-3 rounded-xl shadow-sm transition-all cursor-pointer ${isActive ? 'border-2 border-primary ring-1 ring-primary/10 bg-[#f0fdf4]' : 'border border-outline-variant hover:border-primary/40'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-primary' : 'text-[#6e7a74]'}`} style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                          {diet.icon}
                        </span>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isActive ? 'border-primary' : 'border-[#bec9c3]'}`}>
                          {isActive && <div className="w-2 h-2 rounded-full bg-primary"></div>}
                        </div>
                      </div>
                      <p className="font-bold text-[13px] text-on-surface">{diet.label}</p>
                      <p className="text-[10px] text-outline leading-tight mt-0.5">{diet.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Allergens selectable pills grid list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-outline uppercase font-semibold">Allergens (EU 14)</label>
                <span className="text-[10px] text-error font-semibold italic">Select all that apply</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Gluten', 'Dairy', 'Eggs', 'Nuts', 'Peanuts', 'Soy', 'Fish', 'Shellfish', 'Sesame', 'Mustard', 'Celery', 'Lupin', 'Molluscs', 'Sulphites'].map((allergen) => {
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
                    <CheckCircle className="text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} />
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
                    <Loader2 className="text-[32px] animate-spin" />
                    <span className="font-bold text-[13px] mt-2 tracking-wider">Uploading Photo...</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-[32px]" />
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
              
                <Save className="leading-none text-[20px]" />
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
            
              <ArrowLeft />
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
                  <ShoppingBag className="text-[30px] text-outline" />
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
                          <ArrowRight className="text-primary text-[14px]" />
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
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-outline" />
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
                        <ArrowRight className="text-[14px]" />
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
                    <Clock className="text-[#F59E0B] text-[18px]" />
                    <span>14:00 today</span>
                  </div>
                </div>

                {/* Submit button */}
                <button
                type="submit"
                className="w-full bg-secondary-container h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-white text-[15px] shadow-md hover:brightness-105 active:scale-95 transition-all cursor-pointer">
                
                  <Sparkles />
                  Submit Surprise Box
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      {/* Schedule Custom Dish Overlay Modal */}
      {scheduleModalOpen && selectedMealForSchedule && (
        <form onSubmit={handleSaveDailyMenu} className="space-y-5 animate-fadeIn bg-surface min-h-screen z-[110] fixed inset-0 overflow-y-auto w-[390px] mx-auto text-left px-4 pb-20">
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-120">
            <button
              type="button"
              onClick={() => setScheduleModalOpen(false)}
              className="flex items-center active:scale-90 transition-transform cursor-pointer"
            >
              <ArrowLeft />
            </button>
            <h2 className="text-[15px] font-semibold truncate max-w-[240px]">
              Schedule: {selectedDateForSchedule?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </h2>
            <div className="w-6"></div>
          </div>

          <div className="pt-16 space-y-5">
            <div className="bg-primary/5 rounded-xl p-3.5 border border-primary/10">
              <h3 className="text-[12px] text-outline uppercase font-bold tracking-wider">Meal Plan</h3>
              <p className="text-[14px] font-extrabold text-primary mt-0.5">{selectedMealForSchedule.name}</p>
              <p className="text-[11px] text-on-surface-variant font-medium mt-1">
                Customize what you are cooking for this plan on {selectedDateForSchedule?.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.
              </p>
            </div>

            {/* Dish Name */}
            <div className="space-y-1">
              <label className="text-[10px] text-outline uppercase font-semibold block">Dish Name</label>
              <input
                type="text"
                required
                value={dishNameSchedule}
                onChange={(e) => setDishNameSchedule(e.target.value)}
                placeholder="e.g. Shahi Paneer & Lachha Paratha"
                className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white transition-all font-medium text-on-surface"
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-[10px] text-outline uppercase font-semibold block">Description</label>
              <textarea
                rows={3}
                value={descriptionSchedule}
                onChange={(e) => setDescriptionSchedule(e.target.value)}
                placeholder="Describe tomorrow's meal preparation, ingredients, spices, or special touch..."
                className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white transition-all resize-none font-medium text-on-surface"
              />
            </div>

            {/* Dish Photo */}
            <div className="space-y-1">
              <label className="text-[10px] text-outline uppercase font-semibold block">Dish Photo</label>
              <input
                type="file"
                id="schedule-photo-upload"
                accept="image/*"
                className="hidden"
                onChange={handleSchedulePhotoChange}
                disabled={isUploadingPhoto}
              />
              <label
                htmlFor="schedule-photo-upload"
                className={`relative w-full aspect-video rounded-xl overflow-hidden bg-surface-container group cursor-pointer border-2 border-dashed border-outline-variant hover:border-primary transition-all duration-300 block ${isUploadingPhoto ? 'opacity-80 pointer-events-none' : ''}`}
              >
                <img
                  alt="Schedule preview"
                  className="w-full h-full object-cover"
                  src={photoSchedule || selectedMealForSchedule.imageUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpWQRQIS01PQ5QzZ92J_MbnhfqpTNe-1MsukLb99JWU83WxSJxZA7MXWhmOq0UpzbJ5Qmcr6fMrU0VWlJ4F9tb_Rpb6dZ5BE3ZZwKf-NMV7z99im4yiprq3W6TBAHmzpoLqjBuizemyCgGnCr9TMbONBFJS2gooGXZ-got7BBRnQmNyCz9ICypYQsq5MJ3ywl5TkqddwGkuvDpdL8QXYkSjX7bMM7odMGUc0Nj45WxtfAFBxrdNiXszPnKkGAJ7evVjitlRk5kOQ'}
                />
                {isUploadingPhoto ? (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white animate-pulse">
                    <Loader2 className="text-[32px] animate-spin" />
                    <span className="font-bold text-[13px] mt-2 tracking-wider">Uploading Photo...</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="text-[32px]" />
                    <span className="font-bold text-[13px] mt-1">Change Photo</span>
                  </div>
                )}
              </label>
            </div>

            {/* Nutrition facts */}
            <div className="space-y-2">
              <label className="text-[10px] text-outline uppercase font-semibold block">Nutritional Info (Optional)</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Cal:</span>
                  <input
                    type="text"
                    value={caloriesSchedule}
                    onChange={(e) => setCaloriesSchedule(e.target.value)}
                    placeholder="350"
                    className="w-full pl-10 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white font-medium text-on-surface"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Prot:</span>
                  <input
                    type="text"
                    value={proteinSchedule}
                    onChange={(e) => setProteinSchedule(e.target.value)}
                    placeholder="18"
                    className="w-full pl-11 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white font-medium text-on-surface"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Carb:</span>
                  <input
                    type="text"
                    value={carbsSchedule}
                    onChange={(e) => setCarbsSchedule(e.target.value)}
                    placeholder="25"
                    className="w-full pl-11 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white font-medium text-on-surface"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-outline">Fat:</span>
                  <input
                    type="text"
                    value={fatsSchedule}
                    onChange={(e) => setFatsSchedule(e.target.value)}
                    placeholder="12"
                    className="w-full pl-10 pr-3 py-2 border border-outline-variant rounded-lg text-[13px] outline-none focus:ring-1 focus:ring-primary bg-white font-medium text-on-surface"
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-4 flex flex-col gap-2.5">
              <button
                type="submit"
                disabled={isSavingSchedule}
                className="w-full py-4 bg-primary text-on-primary font-bold text-[15px] rounded-xl shadow-lg active:scale-98 transition-transform flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
              >
                {isSavingSchedule ? <Loader2 className="leading-none text-[20px]" /> : <Save className="leading-none text-[20px]" />}
                {isSavingSchedule ? 'Saving Schedule...' : 'Save Schedule'}
              </button>
              <button
                type="button"
                onClick={() => setScheduleModalOpen(false)}
                className="w-full py-3 text-center border border-outline-variant/60 rounded-xl text-[13px] font-bold text-on-surface hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Meal Selection Modal Overlay */}
      {mealSelectorOpenPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end justify-center z-[110] animate-fadeIn">
          <div className="w-[390px] bg-white rounded-t-[28px] p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl animate-slideUp text-left">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <div>
                <h3 className="font-extrabold text-[16px] text-on-surface">Select Dish for Schedule</h3>
                <p className="text-[11px] text-outline mt-0.5 font-medium">
                  Plan: {mealSelectorOpenPlan.name} on {(selectedDateForSchedule || selectedDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} [{selectedSlotForSchedule}]
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMealSelectorOpenPlan(null)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-outline-variant/20 active:scale-90 transition-transform cursor-pointer"
              >
                <X className="text-[18px]" />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              {meals.filter(m => m.status === 'Active').length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-outline-variant p-4">
                  <UtensilsCrossed className="text-[32px] text-outline" />
                  <p className="text-[12px] text-outline mt-1 font-bold">No active meals found in your menu</p>
                  <p className="text-[11px] text-outline mt-0.5 px-4 font-medium leading-relaxed">
                    Create more active meals in your Menu first to select them here.
                  </p>
                </div>
              ) : (
                meals
                  .filter(m => m.status === 'Active')
                  .map(meal => (
                    <button
                      key={meal.id}
                      type="button"
                      onClick={() => handleSelectMealForSchedule(mealSelectorOpenPlan, meal, selectedSlotForSchedule)}
                      className="w-full bg-surface-container-lowest hover:bg-primary/5 active:scale-[0.99] border border-outline-variant/15 p-3 rounded-xl flex gap-3 text-left transition-all cursor-pointer"
                    >
                      <div className="w-12 h-12 bg-surface-variant rounded-lg overflow-hidden shrink-0 shadow-xs">
                        <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <h4 className="font-extrabold text-[13px] text-on-surface truncate">{meal.name}</h4>
                        <p className="text-[11px] text-outline mt-0.5 truncate font-medium">{meal.description}</p>
                        <p className="text-[11px] font-extrabold text-primary mt-1">
                          {meal.price.toFixed(2)} PLN <span className="font-medium text-outline">· {meal.calories}</span>
                        </p>
                      </div>
                      <ChevronRight className="text-primary self-center text-[18px]" />
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Meal to Schedule Modal Overlay */}
      {addMealSelectorOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end justify-center z-[110] animate-fadeIn">
          <div className="w-[390px] bg-white rounded-t-[28px] p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl animate-slideUp text-left">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <div>
                <h3 className="font-extrabold text-[16px] text-on-surface">Select Meal</h3>
                <p className="text-[11px] text-outline mt-0.5 font-medium">
                  For {selectedDateForSchedule?.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} [{selectedSlotForSchedule}]
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddMealSelectorOpen(false)}
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-outline-variant/20 active:scale-90 transition-transform cursor-pointer"
              >
                <X className="text-[18px]" />
              </button>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Info className="text-amber-600 text-[15px] mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }} />
              <p className="text-[11px] text-amber-800 font-semibold leading-relaxed">
                Whichever meal you select will be scheduled for this slot and will update the customer's orders in real-time.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {meals.filter(m => m.status === 'Active').length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-outline-variant p-4">
                  <UtensilsCrossed className="text-[32px] text-outline" />
                  <p className="text-[12px] text-outline mt-1 font-bold">No active meals in menu</p>
                  <p className="text-[11px] text-outline mt-0.5 px-4 font-medium leading-relaxed">
                    Add meals in the Menu tab first.
                  </p>
                </div>
              ) : (
                meals
                  .filter(m => m.status === 'Active')
                  .map(meal => (
                    <button
                      key={meal.id}
                      type="button"
                      onClick={async () => {
                        setAddMealSelectorOpen(false);
                        await handleSelectMealForSchedule(meal, meal, selectedSlotForSchedule);
                      }}
                      className="w-full bg-surface-container-lowest hover:bg-primary/5 active:scale-[0.99] border border-outline-variant/15 p-3 rounded-xl flex gap-3 text-left transition-all cursor-pointer"
                    >
                      <div className="w-14 h-14 bg-surface-variant rounded-xl overflow-hidden shrink-0 shadow-xs">
                        <img src={meal.imageUrl} alt={meal.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <h4 className="font-extrabold text-[14px] text-on-surface truncate">{meal.name}</h4>
                        <p className="text-[11px] text-outline mt-0.5 truncate font-medium">{meal.description}</p>
                        <p className="text-[11px] font-extrabold text-primary mt-1">
                          {meal.price.toFixed(2)} PLN <span className="font-medium text-outline">· {meal.calories}</span>
                        </p>
                      </div>
                      <PlusCircle className="text-primary self-center text-[18px]" />
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent success message toast overlay */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 transition-all duration-300 z-100 ${
        showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
        }>
        
        <CheckCircle className="text-primary-fixed text-green-400" />
        <span className="font-bold text-[13px]">{toastMessage}</span>
      </div>
    </div>);
}