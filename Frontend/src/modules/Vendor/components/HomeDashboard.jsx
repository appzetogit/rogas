/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useRestaurantNotifications } from '../../Food/hooks/useRestaurantNotifications';
import { dmbVendorAPI } from '../../../services/api';
import { Bell, X, AlertTriangle, Activity, Clock, User, Phone, BadgeCheck, MapPin, ArrowRight, CheckCircle, BarChart, ChefHat } from 'lucide-react';
import useDeliverySlots, { pickCurrentSlot } from '../../../shared/hooks/useDeliverySlots';

export default function HomeDashboard({
  profile,
  orders,
  meals,
  transactions,
  onMarkAllReady,
  onNavigateToTab,
  onOpenSubView,
  subscriberCount
}) {
  const [showOtaUpdate, setShowOtaUpdate] = useState(true);
  const { acceptedBatch, clearAcceptedBatch } = useRestaurantNotifications();
  const [otpInput, setOtpInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isTrackingDriver, setIsTrackingDriver] = useState(false);
  const [localBatch, setLocalBatch] = useState(null);

  const [timingConfig, setTimingConfig] = useState(null);
  const { slots: slotList } = useDeliverySlots();

  // Fetch admin timing config once on mount
  useEffect(() => {
    dmbVendorAPI.getTimingSettings()
      .then(res => {
        if (res?.data?.data) {
          setTimingConfig(res.data.data);
        }
      })
      .catch(() => { /* fail silently */ });
  }, []);

  const hhmmToMin = (str) => {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };

  const getArrivalTime = (slotKey) => {
    const def = slotList.find((sl) => sl.key === (slotKey || getCurrentSlot()));
    return def?.startTime || '';
  };


  const getCurrentSlot = (config = timingConfig) => pickCurrentSlot(config, slotList);

  // Recover state if page was refreshed
  useEffect(() => {
    const checkActiveBatch = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const res = await dmbVendorAPI.getAssignedDriver(todayStr, getCurrentSlot());
        if (res.data?.success && res.data.batchId) {
          // Normalize to match what socket event expects
          setLocalBatch({
            batchId: res.data.batchId,
            driverName: res.data.driver?.name || null,
            driverPhone: res.data.driver?.phone || null,
            driverPhoto: res.data.driver?.profilePhoto || null,
            driverVehicle: res.data.driver?.vehicleNumber || null,
            totalOrders: res.data.boxCount || 0,
            otp: res.data.otp,
            status: res.data.batchStatus || null,
            slot: res.data.slot || getCurrentSlot()
          });
        } else {
          setLocalBatch(null);
        }
      } catch (err) {
        // Ignore, probably no active batch
      }
    };
    if (!acceptedBatch) checkActiveBatch();
  }, [acceptedBatch, timingConfig]);

  const displayBatch = acceptedBatch || localBatch;

  const handleResendBatch = async () => {
    try {
      setIsResending(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await dmbVendorAPI.resendBatch(todayStr, getCurrentSlot());
      if (res.data?.success) {
        alert("Request resent to delivery boys successfully!");
        clearAcceptedBatch();
        setLocalBatch(null);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to resend request. Make sure you marked orders as ready.");
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!acceptedBatch || !otpInput) return;
    try {
      setIsVerifying(true);
      const res = await dmbVendorAPI.verifyBatchOtp(acceptedBatch.batchId, otpInput);
      if (res.data?.success) {
        alert("Batch verified and collected successfully!");
        clearAcceptedBatch();
      }
    } catch (err) {
      alert("Verification failed: " + (err.response?.data?.message || err.message));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleTrackDriver = async () => {
    try {
      setIsTrackingDriver(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await dmbVendorAPI.getAssignedDriver(todayStr, getCurrentSlot());
      if (res.data?.success && res.data.driver) {
        const { lastLat, lastLng, name } = res.data.driver;
        if (lastLat && lastLng) {
          window.open(`https://www.google.com/maps?q=${lastLat},${lastLng}&z=16`, '_blank');
        } else {
          alert(`Driver ${name} has not shared their location yet.`);
        }
      }
    } catch (err) {
      alert("Driver location not available yet. Please wait for them to go online.");
    } finally {
      setIsTrackingDriver(false);
    }
  };

  // Derive stats dynamically from state
  const totalOrders = orders.length;
  const subsCount = orders.filter((o) => o.type === 'Subscription').length;
  const oneTimeCount = orders.filter((o) => o.type === 'One-time').length;

  // Let's count some beautiful portions
  const activeMealsPortionsText = meals.
  filter((m) => m.status === 'Active').
  map((m) => `${m.name.split(' ')[0]} ×${m.portions}`).
  join(' · ');

  return (
    <div className="flex-grow pt-0 md:pt-6 pb-20 md:pb-6 font-sans px-4 select-none max-w-7xl mx-auto w-full text-left">
      {/* Premium Hero Header Banner */}
      <div className="bg-gradient-to-r from-[#00604c] via-[#056f59] to-[#0a7e65] rounded-b-3xl rounded-t-none md:rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden mb-6 -mx-4 md:mx-0">
        {/* Decorative glows */}
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          {/* Greeting & Profile */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3">
              <span className="bg-white/20 p-2.5 rounded-xl backdrop-blur-md inline-flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </span>
              <div>
                <h1 className="text-xl md:text-2xl font-black tracking-tight">Good morning, {profile.name.split(' ')[0]}</h1>
                <p className="text-xs text-white/80 font-medium">Monday · 22 May 2026</p>
              </div>
            </div>

            {/* Profile Avatar button */}
            <div
              onClick={() => onNavigateToTab('profile')}
              className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 cursor-pointer shadow-md transition-all active:scale-95 ml-4"
              title="Go to Profile"
            >
              {profile?.profileImage?.url || (typeof profile?.profileImage === 'string' && profile?.profileImage) ? (
                <img src={profile?.profileImage?.url || profile?.profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                profile.avatarInitials || 'VP'
              )}
            </div>
          </div>

          {/* Stats Segment (Glassmorphic layout) */}
          <div className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10 md:w-96 text-center">
            <div className="border-r border-white/10">
              <p className="text-2xl md:text-3xl font-extrabold text-white">{totalOrders || 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold mt-0.5">Today</p>
            </div>
            <div className="border-r border-white/10">
              <p className="text-2xl md:text-3xl font-extrabold text-white">{subscriberCount ?? subsCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold mt-0.5">Subscribers</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold text-white">{oneTimeCount || 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold mt-0.5">One-time</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (spans 2 on desktop) */}
        <div className="lg:col-span-2 space-y-5">
          {/* Amber alert card for cutoff */}
          <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-4 flex items-center gap-3 shadow-xs text-left transition-all hover:bg-amber-50 duration-300">
            <div className="bg-amber-500/10 p-2.5 rounded-xl text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="font-extrabold text-[14px] text-amber-900">Lunch cutoff in 1h 24min</p>
              <p className="text-[12px] text-amber-700 font-medium mt-0.5">Close orders by 10:00am</p>
            </div>
          </div>

          {/* Driver status card */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4 text-left transition-all hover:shadow-md duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                NEXT PICKUP
              </h3>
              {displayBatch ? (
                displayBatch.status === 'collected' ? (
                  <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Completed
                  </span>
                ) : (
                  <span className="bg-[#e6f7ed] text-[#116e32] border border-[#c2f0d5] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Incoming
                  </span>
                )
              ) : (
                <span className="bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Waiting for driver
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-slate-50 border-2 border-slate-100 shadow-sm flex items-center justify-center">
                {displayBatch?.driverPhoto ? (
                  <img alt="Driver" className="w-full h-full object-cover" src={displayBatch.driverPhoto} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/5 text-primary">
                    <User className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="flex-grow min-w-0">
                <p className="font-extrabold text-[14px] text-slate-800 leading-tight">
                  {displayBatch 
                    ? (displayBatch.status === 'collected'
                      ? `Collected by ${displayBatch.driverName || 'Driver'}`
                      : (displayBatch.driverName 
                        ? `Driver ${displayBatch.driverName} arrives at ~${getArrivalTime(displayBatch.slot)}`
                        : "No driver assigned yet"))
                    : "No driver assigned yet"}
                </p>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                  {displayBatch
                    ? (displayBatch.status === 'collected'
                      ? `${displayBatch.totalOrders} boxes successfully collected`
                      : `${displayBatch.totalOrders} boxes ready to hand over`)
                    : "Waiting to assign batch"}
                </p>
                {displayBatch?.driverPhone && displayBatch.status !== 'collected' && (
                  <a
                    href={`tel:${displayBatch.driverPhone}`}
                    className="text-[12px] text-primary font-bold flex items-center gap-1 mt-1 hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {displayBatch.driverPhone}
                  </a>
                )}
              </div>
            </div>

            {/* Collection PIN slot */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              {displayBatch?.status === 'collected' ? (
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 flex justify-between items-center transition-all">
                  <span className="text-[12px] text-blue-700 font-bold uppercase tracking-wider">OTP Confirmed</span>
                  <BadgeCheck className="text-blue-600 w-6 h-6" />
                </div>
              ) : (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 flex justify-between items-center transition-all">
                  <span className="text-[12px] text-emerald-800 font-bold uppercase tracking-wider">Collection PIN</span>
                  <span className="text-xl font-mono font-black tracking-widest text-emerald-800">
                    {displayBatch?.otp || 'Pending'}
                  </span>
                </div>
              )}
              
              <div className="flex justify-between items-center gap-2">
                <p className="text-[11px] text-slate-400 font-medium leading-normal max-w-[280px]">
                  {displayBatch?.status === 'collected'
                    ? "All meal boxes have been handed over to the driver."
                    : (displayBatch?.otp 
                        ? "Share this PIN with the driver to confirm pickup." 
                        : "PIN will be available once orders are marked ready.")}
                </p>
                {displayBatch && displayBatch.status !== 'collected' && (
                  <button
                    onClick={handleTrackDriver}
                    disabled={isTrackingDriver}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-primary/20 text-primary font-bold text-[11px] rounded-lg shadow-xs hover:bg-primary/5 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    {isTrackingDriver ? 'Loading...' : 'Track Driver'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar column (spans 1 column on desktop) */}
        <div className="space-y-5">
          {/* Dismissible OTA Banners */}
          <div className="space-y-3 animate-fadeIn">
            {showOtaUpdate && (
              <div
                id="banner-update"
                className="bg-primary/10 border border-primary/20 text-primary px-4 py-3 rounded-2xl flex items-start justify-between shadow-xs"
              >
                <div className="flex gap-2.5">
                  <Bell className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
                  <p className="text-[12px] leading-snug font-semibold text-primary-900">
                    App updated: New: Flash deals + Revenue forecast
                  </p>
                </div>
                <button
                  onClick={() => setShowOtaUpdate(false)}
                  className="active:scale-90 transition-transform text-primary/70 hover:text-primary shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="bg-secondary/10 border border-secondary/20 text-secondary-900 px-4 py-3 rounded-2xl flex items-start gap-2.5 shadow-xs">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-secondary" />
              <p className="text-[12px] leading-snug font-semibold">
                Flash deals disabled in your city. Admin will enable when ready.
              </p>
            </div>
          </div>

          {/* Today's Net Earnings display */}
          <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex justify-between items-center text-left hover:shadow-md transition-all duration-300">
            <div>
              <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-widest">Today's Earnings</p>
              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Updated live</p>
            </div>
            <p className="text-2xl font-black text-primary">337 PLN</p>
          </div>

          {/* Tomorrow forecast card */}
          <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-100 space-y-4 text-left hover:shadow-md transition-all duration-300">
            <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
              Tomorrow Forecast
            </h3>
            
            <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center border border-slate-100">
              <span className="text-[13px] text-slate-600 font-bold">Expected orders:</span>
              <span className="text-lg font-black text-primary">~19</span>
            </div>

            {/* Active portions list rendered as visual pills/chips */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-400 font-extrabold uppercase tracking-wider">Required Portions</p>
              <div className="flex flex-wrap gap-1.5">
                {activeMealsPortionsText.split(' · ').map((portion, idx) => {
                  if (!portion) return null;
                  const [name, count] = portion.split(' ×');
                  return (
                    <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/5 text-primary border border-primary/10 rounded-lg text-[11px] font-bold">
                      <span className="text-primary-900 font-extrabold">{name}</span>
                      <span className="opacity-60 font-semibold">×</span>
                      <span className="text-primary-700 font-extrabold">{count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            
            {/* Navigation links styled as premium action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => onNavigateToTab('Menu')}
                className="w-full flex items-center justify-center gap-1 py-2 border border-primary/20 text-primary font-bold text-[12px] rounded-xl hover:bg-primary/5 active:scale-95 transition-all cursor-pointer"
              >
                <span>Ingredient plan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              
              <button
                onClick={() => onNavigateToTab('Orders')}
                className="w-full flex items-center justify-center gap-1 py-2 border border-primary/20 text-primary font-bold text-[12px] rounded-xl hover:bg-primary/5 active:scale-95 transition-all cursor-pointer"
              >
                <span>Portion checklist</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

}