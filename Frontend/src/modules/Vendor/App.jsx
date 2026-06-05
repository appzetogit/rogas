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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Global States
  const [profile, setProfile] = useState({ ...INITIAL_PROFILE, isRegistered: false }); // Resetting for demo
  const [meals, setMeals] = useState([...INITIAL_MEALS]);
  const [orders, setOrders] = useState([...INITIAL_ORDERS]);
  const [transactions, setTransactions] = useState([...INITIAL_TRANSACTIONS]);
  const [vacation, setVacation] = useState({ ...INITIAL_VACATION });
  const [cutoff, setCutoff] = useState({ ...INITIAL_CUTOFF });
  const [surpriseBoxes, setSurpriseBoxes] = useState([...INITIAL_SURPRISE_BOXES]);

  const [authPhone, setAuthPhone] = useState('');
  const [showSubView, setShowSubView] = useState(null);

  const [showGlobalToast, setShowGlobalToast] = useState(false);
  const [toastText, setToastText] = useState('');

  const triggerGlobalToast = (msg) => {
    setToastText(msg);
    setShowGlobalToast(true);
    setTimeout(() => setShowGlobalToast(false), 3000);
  };

  // Check auth
  useEffect(() => {
    const isAuthRoute = location.pathname.includes('/auth') || location.pathname.includes('/welcome');
    if (!profile.isRegistered && !isAuthRoute && location.pathname !== '/') {
      navigate('/vendor/welcome');
    } else if (profile.isRegistered && isAuthRoute) {
      navigate('/vendor/dashboard');
    }
  }, [profile.isRegistered, location.pathname, navigate]);

  // Actions
  const handleCompleteRegistration = () => {
    setProfile((prev) => ({ ...prev, isRegistered: true }));
    triggerGlobalToast('Welcome! Vendor account active 🍳');
    navigate('/vendor/dashboard');
  };

  const handleSignOut = () => {
    setProfile((prev) => ({ ...prev, isRegistered: false }));
    triggerGlobalToast('Signed out of partner session');
    navigate('/vendor/welcome');
  };

  const handleUpdateVacation = (v) => setVacation((prev) => ({ ...prev, ...v }));
  const handleUpdateCutoff = (c) => setCutoff((prev) => ({ ...prev, ...c }));
  const handleMarkAllReady = () => {
    setOrders((prev) => prev.map((o) => o.status === 'Preparing' || o.status === 'Accepted' ? { ...o, status: 'Ready' } : o));
    triggerGlobalToast('All kitchen orders marked as READY ✓');
  };
  const handleUpdateOrderStatus = (id, status) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
    triggerGlobalToast(`Order status updated to ${status}`);
  };
  const handleBatchUpdateStatus = (from, to) => {
    setOrders((prev) => prev.map((o) => from === 'any' || o.status === from ? { ...o, status: to } : o));
    triggerGlobalToast(`Batch update: marked items as ${to}`);
  };
  const handleAddMeal = (newMeal) => setMeals((prev) => [...prev, { ...newMeal, id: 'm' + (prev.length + 1) }]);
  const handleEditMeal = (id, updatedFields) => setMeals((prev) => prev.map((m) => m.id === id ? { ...m, ...updatedFields } : m));
  const handleDeleteMeal = (id) => setMeals((prev) => prev.map((m) => m.id === id ? { ...m, status: 'Removed' } : m));
  const handleAddTransaction = (t) => setTransactions((prev) => [t, ...prev]);
  const handleAddSurpriseBox = (sb) => setSurpriseBoxes((prev) => [{ ...sb, id: 'sb' + (prev.length + 1) }, ...prev]);
  const handleEndSurpriseBox = (id) => setSurpriseBoxes((prev) => prev.map((s) => s.id === id ? { ...s, status: 'Ended' } : s));

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
          <PhoneScreen mode="login" onBack={() => navigate('/vendor/welcome')} onSendOtp={(p) => {setAuthPhone(p);navigate('/vendor/auth/login-otp');}} />
          } />
          <Route path="/auth/register-phone" element={
          <PhoneScreen mode="register" onBack={() => navigate('/vendor/welcome')} onSendOtp={(p) => {setAuthPhone(p);navigate('/vendor/auth/register-otp');}} />
          } />
          <Route path="/auth/login-otp" element={
          <OtpScreen phone={authPhone} onBack={() => navigate('/vendor/auth/login-phone')} onVerify={handleCompleteRegistration} />
          } />
          <Route path="/auth/register-otp" element={
          <OtpScreen phone={authPhone} onBack={() => navigate('/vendor/auth/register-phone')} onVerify={() => navigate('/vendor/auth/register-details')} />
          } />
          <Route path="/auth/register-details" element={
          <RegisterFormScreen onBack={() => navigate('/vendor/auth/register-otp')} onContinue={(p) => {
            setProfile((prev) => ({ ...prev, ...p, phone: authPhone }));
            navigate('/vendor/auth/under-review');
          }} />
          } />
          <Route path="/auth/under-review" element={<UnderReviewScreen onApproved={handleCompleteRegistration} />} />
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
          <Route path="/dashboard" element={<HomeDashboard profile={profile} orders={orders} meals={meals} transactions={transactions} onMarkAllReady={handleMarkAllReady} onNavigateToTab={(t) => navigate(`/vendor/${t.toLowerCase()}`)} onOpenSubView={setShowSubView} />} />
          <Route path="/orders" element={<OrdersManager orders={orders} onUpdateOrderStatus={handleUpdateOrderStatus} onBatchUpdateStatus={handleBatchUpdateStatus} />} />
          <Route path="/menu" element={<MenuManager meals={meals} surpriseBoxes={surpriseBoxes} onAddMeal={handleAddMeal} onEditMeal={handleEditMeal} onDeleteMeal={handleDeleteMeal} onAddSurpriseBox={handleAddSurpriseBox} onEndSurpriseBox={handleEndSurpriseBox} />} />
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