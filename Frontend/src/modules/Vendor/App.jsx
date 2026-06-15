/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './index.css';

import {
  INITIAL_MEALS,
  INITIAL_ORDERS,
  INITIAL_TRANSACTIONS,
  INITIAL_PROFILE,
  INITIAL_VACATION,
  INITIAL_CUTOFF,
  INITIAL_SURPRISE_BOXES } from
'./mockData';
import { VendorWelcomeScreen } from './components/VendorWelcomeScreen';
import { PhoneScreen, OtpScreen, RegisterFormScreen, UnderReviewScreen } from './components/VendorAuthScreens';
import HomeDashboard from './components/HomeDashboard';
import OrdersManager from './components/OrdersManager';
import MenuManager from './components/MenuManager';
import EarningsManager from './components/EarningsManager';
import ProfileSettings from './components/ProfileSettings';
import SubViewsOverlay from './components/SubViewsOverlay';

// Import DMB Services & Clients
import { requestRestaurantOtp, verifyRestaurantOtp, getMe, logout } from '../../services/api/auth';
import { restaurantClient } from '../../services/api/axios';
import { dmbVendorAPI } from '../../services/api/index';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Global States
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('restaurant_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, isRegistered: true };
      }
    } catch (_) {}
    return { ...INITIAL_PROFILE, isRegistered: false };
  });
  const [meals, setMeals] = useState([]);
  const [orders, setOrders] = useState([...INITIAL_ORDERS]);
  const [transactions, setTransactions] = useState([...INITIAL_TRANSACTIONS]);
  const [vacation, setVacation] = useState({ ...INITIAL_VACATION });
  const [cutoff, setCutoff] = useState({ ...INITIAL_CUTOFF });
  const [surpriseBoxes, setSurpriseBoxes] = useState([...INITIAL_SURPRISE_BOXES]);
  const [subscriberCount, setSubscriberCount] = useState(null);
  const [timingConfig, setTimingConfig] = useState(null);

  const [authPhone, setAuthPhone] = useState('');
  const [showSubView, setShowSubView] = useState(null);

  const [showGlobalToast, setShowGlobalToast] = useState(false);
  const [toastText, setToastText] = useState('');

  const triggerGlobalToast = (msg) => {
    setToastText(msg);
    setShowGlobalToast(true);
    setTimeout(() => setShowGlobalToast(false), 3000);
  };

  // Auth Initialization on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('restaurant_accessToken');
      if (token) {
        try {
          const res = await getMe('restaurant');
          const userObj = res.data?.data?.user || res.data?.user || res.data;
          if (userObj) {
            if (userObj.status && userObj.status !== 'approved') {
              localStorage.removeItem('restaurant_accessToken');
              localStorage.removeItem('restaurant_refreshToken');
              localStorage.removeItem('restaurant_authenticated');
              localStorage.removeItem('restaurant_user');
              setProfile((prev) => ({ ...prev, isRegistered: false }));
              localStorage.setItem('restaurant_register_phone', userObj.ownerPhone);
              navigate('/vendor/auth/under-review', { 
                state: { 
                  phone: userObj.ownerPhone, 
                  status: userObj.status, 
                  rejectionReason: userObj.rejectionReason, 
                  restaurantName: userObj.restaurantName 
                } 
              });
              return;
            }
            setProfile({
              ...userObj,
              city: userObj.location?.city || userObj.city || 'indore',
              name: userObj.restaurantName || userObj.name || 'Vendor Partner',
              partner: userObj.kitchenPartnerId?.companyName || 'FreshKitchen Partners Sp. z o.o.',
              rating: typeof userObj.rating === 'number' ? userObj.rating : 4.9,
              isRegistered: true,
              avatarInitials: (userObj.restaurantName || userObj.name || 'Vendor').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            });
            
            // Set vacation mode states from backend
            setVacation(prev => ({
              ...prev,
              isKitchenOpen: !userObj.vacationMode,
              fromDate: userObj.vacationStart ? new Date(userObj.vacationStart).toISOString().split('T')[0] : '',
              toDate: userObj.vacationEnd ? new Date(userObj.vacationEnd).toISOString().split('T')[0] : ''
            }));
          }
        } catch (err) {
          console.error("Auth init failed:", err);
          // Token expired or invalid
          localStorage.removeItem('restaurant_accessToken');
          localStorage.removeItem('restaurant_refreshToken');
          localStorage.removeItem('restaurant_authenticated');
          localStorage.removeItem('restaurant_user');
          setProfile((prev) => ({ ...prev, isRegistered: false }));
        }
      }
    };
    initAuth();
  }, []);

  // Check auth route redirection
  useEffect(() => {
    const isAuthRoute = location.pathname.includes('/auth') || location.pathname.includes('/welcome');
    if (!profile.isRegistered && !isAuthRoute && location.pathname !== '/') {
      navigate('/vendor/welcome');
    } else if (profile.isRegistered && isAuthRoute) {
      navigate('/vendor/dashboard');
    }
  }, [profile.isRegistered, location.pathname, navigate]);

  // Load vendor timing settings
  useEffect(() => {
    if (!profile.isRegistered) return;
    dmbVendorAPI.getTimingSettings()
      .then(res => {
        if (res?.data?.data) {
          setTimingConfig(res.data.data);
        }
      })
      .catch(() => { /* fail silently */ });
  }, [profile.isRegistered]);

  // Load vendor data from backend
  useEffect(() => {
    if (!profile.isRegistered) return;

    const loadData = async () => {
      try {
        const [ordersRes, plansRes, earningsRes, subscriberRes] = await Promise.all([
          dmbVendorAPI.getOrders(),
          dmbVendorAPI.getMealPlans(),
          dmbVendorAPI.getEarnings(),
          dmbVendorAPI.getSubscriberStats().catch(() => ({ data: { stats: { active: 0 } } }))
        ]);

        if (ordersRes.data?.orders) {
          const mappedOrders = ordersRes.data.orders.map(o => ({
            id: o._id,
            zone: o.userId?.city || 'Ursynow',
            itemsName: o.mealPlanId?.name || 'Weekly Meal Plan',
            type: o.orderType === 'subscription' ? 'Subscription' : 'One-time',
            status: o.orderStatus === 'ready_for_pickup' ? 'Ready' : (o.orderStatus === 'preparing' ? 'Preparing' : 'Accepted'),
            code: o.collectionPin || 'C-000',
            day: new Date(o.deliveryDate).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short' }),
            deliveryDate: o.deliveryDate,
            deliverySlot: o.deliverySlot
          }));
          setOrders(mappedOrders);
        }

        if (plansRes.data?.plans) {
          const mappedMeals = plansRes.data.plans
            .filter(p => p.status !== 'archived')
            .map(p => ({
              id: p._id,
              name: p.name,
              price: p.pricePerDay || 15.00,
              description: p.description,
              imageUrl: p.photos?.[0] || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDpWQRQIS01PQ5QzZ92J_MbnhfqpTNe-1MsukLb99JWU83WxSJxZA7MXWhmOq0UpzbJ5Qmcr6fMrU0VWlJ4F9tb_Rpb6dZ5BE3ZZwKf-NMV7z99im4yiprq3W6TBAHmzpoLqjBuizemyCgGnCr9TMbONBFJS2gooGXZ-got7BBRnQmNyCz9ICypYQsq5MJ3ywl5TkqddwGkuvDpdL8QXYkSjX7bMM7odMGUc0Nj45WxtfAFBxrdNiXszPnKkGAJ7evVjitlRk5kOQ',
              vat: '8% — Restaurant/processed food',
              calories: `${p.nutrition?.calories || 300} kcal`,
              prot: `${p.nutrition?.protein || 15} g`,
              carb: `${p.nutrition?.carbs || 25} g`,
              fat: `${p.nutrition?.fats || 10} g`,
              allergens: p.allergens || [],
              status: p.status === 'active' ? 'Active' : 'Draft',
              portions: p.capacity || 10
            }));
          setMeals(mappedMeals);
        }

        if (earningsRes.data?.earnings) {
          const earnings = earningsRes.data.earnings;
          const derivedTransactions = [
            {
              id: 't_earnings',
              date: 'This Week',
              type: 'Delivery',
              amount: parseFloat(earnings.vendorNetPayout) || 0,
              description: `${ordersRes.data?.orders?.length || 0} deliveries completed`,
              details: `Gross revenue: ${earnings.grossFoodRevenue} PLN, Commission: ${earnings.platformCommission} PLN`
            }
          ];
          setTransactions(derivedTransactions);
        }

        if (subscriberRes.data?.stats) {
          setSubscriberCount(subscriberRes.data.stats.active ?? 0);
        }
      } catch (err) {
        console.error("Error loading vendor data:", err);
      }

    };

    loadData();
  }, [profile.isRegistered]);

  // Actions
  const handleCompleteRegistration = (userData) => {
    setProfile({
      ...userData,
      city: userData.location?.city || userData.city || 'indore',
      name: userData.restaurantName || userData.name || 'Vendor Partner',
      partner: 'FreshKitchen Partners Sp. z o.o.',
      isRegistered: true,
      avatarInitials: (userData.restaurantName || userData.name || 'Vendor').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    });
    triggerGlobalToast('Welcome! Vendor account active 🍳');
    navigate('/vendor/dashboard');
  };

  const handleSignOut = async () => {
    try {
      const refreshToken = localStorage.getItem('restaurant_refreshToken');
      await logout(refreshToken);
    } catch (_) {}
    
    localStorage.removeItem('restaurant_accessToken');
    localStorage.removeItem('restaurant_refreshToken');
    localStorage.removeItem('restaurant_authenticated');
    localStorage.removeItem('restaurant_user');
    setProfile((prev) => ({ ...prev, isRegistered: false }));
    triggerGlobalToast('Signed out of partner session');
    navigate('/vendor/welcome');
  };

  const handleUpdateVacation = async (v) => {
    try {
      const payload = {
        vacationMode: !v.isKitchenOpen,
        vacationStart: v.fromDate || null,
        vacationEnd: v.toDate || null
      };
      await dmbVendorAPI.updateSettings(payload);
      setVacation((prev) => ({ ...prev, ...v }));
      triggerGlobalToast(v.isKitchenOpen ? 'Kitchen is now OPEN! 🍳' : 'Vacation mode activated 🌴');
    } catch (err) {
      triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to update vacation settings');
    }
  };

  const getCurrentSlot = (config = timingConfig) => {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();

    if (config) {
      for (const slot of ['breakfast', 'lunch', 'dinner']) {
        const cfg = config[slot];
        if (cfg && cfg.isEnabled !== false) {
          const hhmmToMin = (str) => {
            if (!str) return null;
            const [h, m] = str.split(':').map(Number);
            return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
          };
          const start = hhmmToMin(cfg.startTime);
          const end   = hhmmToMin(cfg.endTime);
          if (start !== null && end !== null && curMin >= start && curMin <= end) {
            return slot;
          }
        }
      }
    }

    const hr = now.getHours();
    if (hr < 10) return 'breakfast';
    if (hr < 15) return 'lunch';
    return 'dinner';
  };

  const handleUpdateCutoff = (c) => {
    setCutoff((prev) => ({ ...prev, ...c }));
    triggerGlobalToast('Cutoff settings updated');
  };

  const handleMarkAllReady = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await dmbVendorAPI.markReady(todayStr, getCurrentSlot());
      setOrders((prev) => prev.map((o) => ({ ...o, status: 'Ready' })));
      triggerGlobalToast('All kitchen orders marked as READY ✓');
    } catch (err) {
      triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to mark orders ready');
    }
  };

  const handleUpdateOrderStatus = async (id, status) => {
    const orderObj = orders.find(o => o.id === id);
    if (orderObj && status === 'Ready') {
      try {
        const dateStr = new Date(orderObj.deliveryDate).toISOString().split('T')[0];
        await dmbVendorAPI.markReady(dateStr, orderObj.deliverySlot || getCurrentSlot());
        setOrders((prev) => prev.map((o) => o.id === id || (o.deliveryDate === orderObj.deliveryDate && o.deliverySlot === orderObj.deliverySlot) ? { ...o, status: 'Ready' } : o));
        triggerGlobalToast(`Orders for ${orderObj.deliverySlot} marked as Ready`);
      } catch (err) {
        triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to update order status');
      }
    } else {
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
      triggerGlobalToast(`Order status updated to ${status}`);
    }
  };

  const handleBatchUpdateStatus = async (from, to) => {
    if (to === 'Ready') {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        await dmbVendorAPI.markReady(todayStr, getCurrentSlot());
        setOrders((prev) => prev.map((o) => from === 'any' || o.status === from ? { ...o, status: to } : o));
        triggerGlobalToast(`Batch update: marked items as READY ✓`);
      } catch (err) {
        triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to mark orders ready');
      }
    } else {
      setOrders((prev) => prev.map((o) => from === 'any' || o.status === from ? { ...o, status: to } : o));
      triggerGlobalToast(`Batch update: marked items as ${to}`);
    }
  };

  const handleAddMeal = async (newMeal) => {
    try {
      const payload = {
        name: newMeal.name,
        pricePerDay: newMeal.price,
        description: newMeal.description,
        capacity: newMeal.portions,
        nutrition: {
          calories: parseInt(newMeal.calories) || 300,
          protein: parseInt(newMeal.prot) || 15,
          carbs: parseInt(newMeal.carb) || 25,
          fats: parseInt(newMeal.fat) || 10,
          isProvided: true
        },
        allergens: newMeal.allergens,
        photos: [newMeal.imageUrl],
        status: 'active',
        city: profile.location?.city || profile.city || 'indore',
        availableSlots: ['lunch'],
        availableDays: ['mon', 'tue', 'wed', 'thu', 'fri']
      };
      
      const res = await dmbVendorAPI.createMealPlan(payload);
      const created = res.data.plan;
      
      setMeals((prev) => [...prev, {
        id: created._id,
        name: created.name,
        price: created.pricePerDay || 15.00,
        description: created.description,
        imageUrl: created.photos?.[0] || newMeal.imageUrl,
        vat: '8% — Restaurant/processed food',
        calories: `${created.nutrition?.calories || 300} kcal`,
        prot: `${created.nutrition?.protein || 15} g`,
        carb: `${created.nutrition?.carbs || 25} g`,
        fat: `${created.nutrition?.fats || 10} g`,
        allergens: created.allergens || [],
        status: created.status === 'active' ? 'Active' : 'Draft',
        portions: created.capacity || 10
      }]);
      triggerGlobalToast('Meal added successfully');
    } catch (err) {
      triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to add meal plan');
    }
  };

  const handleEditMeal = async (id, updatedFields) => {
    try {
      const payload = {};
      if (updatedFields.name) payload.name = updatedFields.name;
      if (updatedFields.price) payload.pricePerDay = updatedFields.price;
      if (updatedFields.description) payload.description = updatedFields.description;
      if (updatedFields.portions) payload.capacity = updatedFields.portions;
      if (updatedFields.status) payload.status = updatedFields.status.toLowerCase();
      if (updatedFields.imageUrl) payload.photos = [updatedFields.imageUrl];
      if (updatedFields.allergens) payload.allergens = updatedFields.allergens;
      if (updatedFields.calories || updatedFields.prot || updatedFields.carb || updatedFields.fat) {
        payload.nutrition = {
          calories: parseInt(updatedFields.calories) || 300,
          protein: parseInt(updatedFields.prot) || 15,
          carbs: parseInt(updatedFields.carb) || 25,
          fats: parseInt(updatedFields.fat) || 10,
          isProvided: true
        };
      }
      
      const res = await dmbVendorAPI.editMealPlan(id, payload);
      const updated = res.data.plan;
      
      setMeals((prev) => prev.map((m) => m.id === id ? {
        ...m,
        name: updated.name,
        price: updated.pricePerDay || 15.00,
        description: updated.description,
        imageUrl: updated.photos?.[0] || m.imageUrl,
        calories: `${updated.nutrition?.calories || 300} kcal`,
        prot: `${updated.nutrition?.protein || 15} g`,
        carb: `${updated.nutrition?.carbs || 25} g`,
        fat: `${updated.nutrition?.fats || 10} g`,
        allergens: updated.allergens || [],
        status: updated.status === 'active' ? 'Active' : 'Draft',
        portions: updated.capacity || 10
      } : m));
      triggerGlobalToast('Meal updated successfully');
    } catch (err) {
      triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to edit meal plan');
    }
  };

  const handleDeleteMeal = async (id) => {
    try {
      await dmbVendorAPI.editMealPlan(id, { status: 'archived' });
      setMeals((prev) => prev.map((m) => m.id === id ? { ...m, status: 'Removed' } : m));
      triggerGlobalToast('Meal removed from menu');
    } catch (err) {
      triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to delete meal plan');
    }
  };

  const handleAddTransaction = (t) => setTransactions((prev) => [t, ...prev]);
  const handleAddSurpriseBox = (sb) => setSurpriseBoxes((prev) => [{ ...sb, id: 'sb' + (prev.length + 1) }, ...prev]);
  const handleEndSurpriseBox = (id) => setSurpriseBoxes((prev) => prev.map((s) => s.id === id ? { ...s, status: 'Ended' } : s));

  // Task 3: Toggle meal status + backend notifies subscribers
  const handleToggleMealStatus = async (mealId) => {
    try {
      const res = await dmbVendorAPI.toggleMealStatus(mealId);
      const updatedPlan = res.data?.plan;
      const newStatus = res.data?.newStatus;
      setMeals((prev) => prev.map((m) => m.id === mealId ? { ...m, status: newStatus === 'active' ? 'Active' : 'Draft' } : m));
      triggerGlobalToast(
        newStatus === 'active'
          ? `✅ Meal activated — subscribers notified! 🔔`
          : `⏸️ Meal deactivated successfully`
      );
    } catch (err) {
      triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to toggle meal status');
    }
  };

  // If subview
  if (showSubView) {
    return <SubViewsOverlay viewType={showSubView} onClose={() => setShowSubView(null)} />;
  }

  const isAuthView = location.pathname.includes('/auth') || location.pathname.includes('/welcome');

  if (isAuthView) {
    return (
      <div className="vendor-app-container">
        <Routes>
          <Route path="/welcome" element={<VendorWelcomeScreen />} />
          <Route path="/auth/login-phone" element={
            <PhoneScreen mode="login" onBack={() => navigate('/vendor/welcome')} onSendOtp={async (p) => {
              try {
                const fullPhone = p.startsWith('+') ? p : '+48' + p;
                await requestRestaurantOtp(fullPhone);
                setAuthPhone(fullPhone);
                triggerGlobalToast('OTP sent successfully!');
                navigate('/vendor/auth/login-otp');
              } catch (err) {
                triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to send OTP');
              }
            }} />
          } />
          <Route path="/auth/register-phone" element={
            <PhoneScreen mode="register" onBack={() => navigate('/vendor/welcome')} onSendOtp={async (p) => {
              try {
                const fullPhone = p.startsWith('+') ? p : '+48' + p;
                await requestRestaurantOtp(fullPhone);
                setAuthPhone(fullPhone);
                triggerGlobalToast('OTP sent successfully!');
                navigate('/vendor/auth/register-otp');
              } catch (err) {
                triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to send OTP');
              }
            }} />
          } />
          <Route path="/auth/login-otp" element={
            <OtpScreen phone={authPhone} onBack={() => navigate('/vendor/auth/login-phone')} onVerify={async (otpCode) => {
              try {
                const res = await verifyRestaurantOtp(authPhone, otpCode);
                const data = res.data?.data || res.data;
                
                if (data.needsRegistration) {
                  triggerGlobalToast('Account not found. Please register.');
                  navigate('/vendor/auth/register-phone');
                  return;
                }
                
                if (data.pendingApproval) {
                  triggerGlobalToast(data.status === 'rejected' ? 'Application was rejected.' : 'Your application is under review.');
                  localStorage.setItem('restaurant_register_phone', authPhone);
                  navigate('/vendor/auth/under-review', { 
                    state: { 
                      phone: authPhone, 
                      status: data.status, 
                      rejectionReason: data.rejectionReason, 
                      restaurantName: data.restaurantName 
                    } 
                  });
                  return;
                }

                const { accessToken, refreshToken, user } = data;
                localStorage.setItem('restaurant_accessToken', accessToken);
                localStorage.setItem('restaurant_refreshToken', refreshToken);
                localStorage.setItem('restaurant_authenticated', 'true');
                localStorage.setItem('restaurant_user', JSON.stringify(user));
                
                handleCompleteRegistration(user);
              } catch (err) {
                triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to verify OTP');
              }
            }} />
          } />
          <Route path="/auth/register-otp" element={
            <OtpScreen phone={authPhone} onBack={() => navigate('/vendor/auth/register-phone')} onVerify={async (otpCode) => {
              try {
                const res = await verifyRestaurantOtp(authPhone, otpCode);
                const data = res.data?.data || res.data;
                // If it is verified but needs registration, we transition to details form
                triggerGlobalToast('Phone verified. Please fill in details.');
                navigate('/vendor/auth/register-details');
              } catch (err) {
                // If phone is already registered, verify will return the user or an error
                triggerGlobalToast(err.response?.data?.message || err.message || 'OTP Verification failed');
              }
            }} />
          } />
          <Route path="/auth/register-details" element={
            <RegisterFormScreen phone={authPhone} onBack={() => navigate('/vendor/auth/register-otp')} onContinue={async (p) => {
              try {
                // Construct FormData for multipart/form-data upload
                const formData = new FormData();
                formData.append('restaurantName', p.name);
                formData.append('ownerName', p.name);
                formData.append('ownerPhone', authPhone);
                formData.append('primaryContactNumber', authPhone);
                formData.append('pureVegRestaurant', 'false');
                formData.append('city', p.city);
                formData.append('openingTime', '08:00');
                formData.append('closingTime', '22:00');
                formData.append('cuisines', 'Polish, Healthy');
                formData.append('openDays', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun');

                // Map frontend type selection to backend vendorType enum
                let backendVendorType = 'restaurant';
                if (p.type === 'Home Cook') backendVendorType = 'home_cook';
                else if (p.type === 'Cloud Kitchen') backendVendorType = 'cloud_kitchen';
                else if (p.type === 'Restaurant') backendVendorType = 'restaurant';
                else if (p.type === 'Catering') backendVendorType = 'catering';
                formData.append('vendorType', backendVendorType);

                // Append foodLicence file
                if (p.licenceFile) {
                  formData.append('foodLicence', p.licenceFile);
                }

                // Append coverImage/banner file
                if (p.coverFile) {
                  formData.append('coverImage', p.coverFile);
                }

                // Call real backend registration
                const res = await restaurantClient.post("/food/restaurant/register", formData);
                const registeredUser = res.data?.data || res.data;
                
                setProfile((prev) => ({ ...prev, ...p, phone: authPhone }));
                localStorage.setItem('restaurant_register_phone', authPhone);
                triggerGlobalToast('Registration submitted successfully!');
                navigate('/vendor/auth/under-review', { state: { phone: authPhone, status: 'pending', restaurantName: p.name } });
              } catch (err) {
                triggerGlobalToast(err.response?.data?.message || err.message || 'Failed to register vendor');
              }
            }} />
          } />
          <Route path="/auth/under-review" element={<UnderReviewScreen />} />
          <Route path="*" element={<Navigate to="/vendor/welcome" />} />
        </Routes>
      </div>);
  }

  const getPageTitle = () => {
    if (location.pathname.includes('/orders')) return "Today's Orders";
    if (location.pathname.includes('/menu')) return 'Menu Management';
    if (location.pathname.includes('/earnings')) return 'Earnings Ledger';
    if (location.pathname.includes('/profile')) return 'My Profile';
    return 'Vendor Hub';
  };

  return (
    <div className="vendor-app-container">
      <div className="w-[390px] min-h-screen relative flex flex-col bg-surface overflow-x-hidden font-sans mx-auto shadow-2xl pb-10">
      
      {/* Top Application Bar Header details */}
      <header className="fixed top-0 left-0 right-0 w-[390px] mx-auto z-50 h-14 flex items-center px-4 bg-primary text-on-primary shadow-sm">
        <div className="flex items-center justify-between w-full">
          <button
              onClick={() => triggerGlobalToast('Side drawer menu requires admin credentials.')}
              className="flex items-center justify-center p-2 hover:opacity-90 active:scale-95 transition-transform">
              
            <span className="material-symbols-outlined">menu</span>
          </button>
          <h1 className="font-semibold text-[16px] tracking-tight">
            {getPageTitle()}
          </h1>
          <button
              title="More Options"
              className="flex items-center justify-center p-2 hover:opacity-90 active:scale-95 transition-transform">
              
            <span className="material-symbols-outlined font-normal">more_vert</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow pb-[83px] bg-slate-50/50 flex flex-col">
        <Routes>
          <Route path="/dashboard" element={<HomeDashboard profile={profile} orders={orders} meals={meals} transactions={transactions} onMarkAllReady={handleMarkAllReady} onNavigateToTab={(t) => navigate(`/vendor/${t.toLowerCase()}`)} onOpenSubView={setShowSubView} subscriberCount={subscriberCount} />} />
          <Route path="/orders" element={<OrdersManager orders={orders} onUpdateOrderStatus={handleUpdateOrderStatus} onBatchUpdateStatus={handleBatchUpdateStatus} />} />
          <Route path="/menu" element={<MenuManager meals={meals} surpriseBoxes={surpriseBoxes} onAddMeal={handleAddMeal} onEditMeal={handleEditMeal} onDeleteMeal={handleDeleteMeal} onAddSurpriseBox={handleAddSurpriseBox} onEndSurpriseBox={handleEndSurpriseBox} onToggleMealStatus={handleToggleMealStatus} />} />
          <Route path="/earnings" element={<EarningsManager transactions={transactions} onAddTransaction={handleAddTransaction} />} />
          <Route path="/profile" element={<ProfileSettings profile={profile} vacation={vacation} cutoff={cutoff} onUpdateProfile={(p) => setProfile((pr) => ({ ...pr, ...p }))} onUpdateVacation={handleUpdateVacation} onUpdateCutoff={handleUpdateCutoff} onSignOut={handleSignOut} />} />
          <Route path="/" element={<Navigate to={profile.isRegistered ? "/vendor/dashboard" : "/vendor/welcome"} />} />
          <Route path="*" element={<Navigate to={profile.isRegistered ? "/vendor/dashboard" : "/vendor/welcome"} />} />
        </Routes>
      </main>

      {/* Bottom Navigation Ribbon Bar */}
      <nav className="fixed bottom-0 left-0 right-0 w-[390px] mx-auto z-50 h-[83px] bg-white border-t border-outline-variant/15 flex justify-around items-center px-2 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        
        <button
            onClick={() => navigate('/vendor/dashboard')}
            className={`flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-200 active:scale-90 ${location.pathname.includes('/dashboard') ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
            
          <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname.includes('/dashboard') ? "'FILL' 1" : "'FILL' 0" }}>home</span>
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Home</span>
        </button>

        <button
            onClick={() => navigate('/vendor/orders')}
            className={`flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-200 active:scale-90 ${location.pathname.includes('/orders') ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
            
          <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname.includes('/orders') ? "'FILL' 1" : "'FILL' 0" }}>receipt_long</span>
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Orders</span>
        </button>

        <button
            onClick={() => navigate('/vendor/menu')}
            className={`flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-200 active:scale-90 ${location.pathname.includes('/menu') ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
            
          <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname.includes('/menu') ? "'FILL' 1" : "'FILL' 0" }}>restaurant_menu</span>
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Menu</span>
        </button>

        <button
            onClick={() => navigate('/vendor/earnings')}
            className={`flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-200 active:scale-90 ${location.pathname.includes('/earnings') ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
            
          <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname.includes('/earnings') ? "'FILL' 1" : "'FILL' 0" }}>payments</span>
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">Earn</span>
        </button>

        <button
            onClick={() => navigate('/vendor/profile')}
            className={`flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-200 active:scale-90 ${location.pathname.includes('/profile') ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>
            
          <span className="material-symbols-outlined" style={{ fontVariationSettings: location.pathname.includes('/profile') ? "'FILL' 1" : "'FILL' 0" }}>more_horiz</span>
          <span className="text-[10px] uppercase font-bold tracking-wider mt-1">More</span>
        </button>

      </nav>

      {/* Global Toast notifications overlay */}
      <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full flex items-center gap-3 transition-all duration-300 shadow-xl z-[150] ${
          showGlobalToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
          }>
          
        <span className="material-symbols-outlined text-green-400">check_circle</span>
        <span className="font-bold text-[13px]">{toastText}</span>
      </div>

      </div>
    </div>);

}