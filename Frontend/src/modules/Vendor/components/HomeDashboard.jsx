/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useRestaurantNotifications } from '../../Food/hooks/useRestaurantNotifications';
import { dmbVendorAPI } from '../../../services/api';

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

  const getArrivalTime = (slotName) => {
    const s = (slotName || getCurrentSlot()).toLowerCase();
    if (s === 'breakfast') return '07:45';
    if (s === 'dinner') return '18:15';
    return '11:45'; // default lunch
  };


  const getCurrentSlot = (config = timingConfig) => {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();

    if (config) {
      for (const slot of ['breakfast', 'lunch', 'dinner']) {
        const cfg = config[slot];
        if (cfg && cfg.isEnabled !== false) {
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

  // Recover state if page was refreshed
  useEffect(() => {
    const checkActiveBatch = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const res = await dmbVendorAPI.getAssignedDriver(todayStr, getCurrentSlot());
        if (res.data?.success) {
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
    <div className="flex-grow pt-14 pb-20 font-sans px-4 select-none max-w-[390px] mx-auto w-full">
      {/* Good Morning Header Greeting banner details */}
      <div className="bg-primary text-on-primary rounded-b-3xl -mx-4 px-4 pt-3 pb-5 shadow-sm text-left">
        <p className="text-[13px] font-semibold text-white">Good morning, {profile.name.split(' ')[0]} 👨‍🍳</p>
        <p className="text-[11px] text-white/80 mt-0.5">Monday · 22 May 2026</p>
      </div>

      {/* Dismissible OTA Banners */}
      <div className="space-y-2 mt-4 animate-fadeIn">
        {showOtaUpdate &&
        <div
          id="banner-update"
          className="bg-primary/95 text-white px-4 py-3 rounded-xl flex items-start justify-between shadow-sm">
          
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-[20px] text-on-primary-container">notifications</span>
              <p className="text-[13px] leading-tight font-medium">App updated: New: Flash deals + Revenue forecast</p>
            </div>
            <button
            onClick={() => setShowOtaUpdate(false)}
            className="active:scale-90 transition-transform flex items-center h-full">
            
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        }

        <div className="bg-secondary-container/95 text-on-secondary-container px-4 py-3 rounded-xl flex items-start gap-3 shadow-xs">
          <span className="material-symbols-outlined text-[20px] text-secondary">warning</span>
          <p className="text-[13px] leading-tight font-medium">Flash deals disabled in your city. Admin will enable when ready.</p>
        </div>
      </div>

      {/* Stats Card (Traditional Green) */}
      <div className="bg-primary-container p-5 rounded-2xl text-on-primary shadow-sm flex flex-col gap-1 mt-4 relative overflow-hidden transition-all hover:scale-[1.01] duration-300">
        <div className="absolute -right-4 -top-4 opacity-10">
          <span className="material-symbols-outlined !text-[90px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            monitoring
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center relative z-10">
          <div className="border-r border-white/20">
            <p className="text-3xl font-bold text-white">{totalOrders || 0}</p>
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold mt-1">Today</p>
          </div>
          <div className="border-r border-white/20">
            <p className="text-3xl font-bold text-white">{subscriberCount ?? subsCount}</p>
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold mt-1">Subscribers</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">{oneTimeCount || 0}</p>
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold mt-1">One-time</p>
          </div>
        </div>
      </div>

      {/* Today's Net Earnings display */}
      <div className="flex justify-end items-center px-1 mt-2.5">
        <p className="text-[14px] text-primary font-semibold">
          Today's net earnings:{' '}
          <span className="text-primary font-extrabold text-[15px]">337 PLN</span>
        </p>
      </div>

      {/* Amber alert card for cutoff */}
      <div className="bg-white rounded-xl border-l-[5px] border-secondary p-4 shadow-xs flex items-start gap-3 mt-4 transition-all hover:scale-[1.01]">
        <span className="material-symbols-outlined text-secondary">schedule</span>
        <div className="text-left">
          <p className="font-bold text-[14px] text-on-surface">Lunch cutoff in 1h 24min</p>
          <p className="text-[13px] text-on-surface-variant mt-0.5">Close orders by 10:00am</p>
        </div>
      </div>

      {/* Driver status card */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 mt-4 border border-outline-variant/30 text-left animate-fadeIn">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold text-outline uppercase tracking-wider">
            NEXT PICKUP
          </h3>
          {displayBatch ? (
            displayBatch.status === 'collected' ? (
              <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                COMPLETED
              </span>
            ) : (
              <span className="bg-[#e6f7ed] text-[#116e32] px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                INCOMING
              </span>
            )
          ) : (
            <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
              WAITING FOR DRIVER
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container shadow-xs">
            {displayBatch?.driverPhoto ? (
              <img alt="Driver" className="w-full h-full object-cover" src={displayBatch.driverPhoto} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                <span className="material-symbols-outlined text-primary text-[24px]">person</span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-bold text-[14px] text-on-surface">
              {displayBatch 
                ? (displayBatch.status === 'collected'
                  ? `Collected by ${displayBatch.driverName || 'Driver'}`
                  : (displayBatch.driverName 
                    ? `Driver ${displayBatch.driverName} arrives at ~${getArrivalTime(displayBatch.slot)}`
                    : "No driver assigned yet"))
                : "No driver assigned yet"}
            </p>
            <p className="text-[13px] text-on-surface-variant">
              {displayBatch
                ? (displayBatch.status === 'collected'
                  ? `${displayBatch.totalOrders} boxes successfully collected`
                  : `${displayBatch.totalOrders} boxes ready to hand over`)
                : "Waiting to assign batch"}
            </p>
            {displayBatch?.driverPhone && displayBatch.status !== 'collected' && (
              <a
                href={`tel:${displayBatch.driverPhone}`}
                className="text-[12px] text-primary font-semibold flex items-center gap-1 mt-0.5"
              >
                <span className="material-symbols-outlined text-[14px]">call</span>
                {displayBatch.driverPhone}
              </a>
            )}
          </div>
        </div>

        {/* Collection PIN slot */}
        <div className="space-y-2 mt-2">
          {displayBatch?.status === 'collected' ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex justify-between items-center transition-all shadow-xs">
              <span className="text-[13px] text-blue-700 font-bold uppercase tracking-wider">OTP Confirmed</span>
              <span className="material-symbols-outlined text-blue-600 text-[28px]">verified</span>
            </div>
          ) : (
            <div className="bg-[#e6f7ed] border border-[#c2f0d5] rounded-xl p-3.5 flex justify-between items-center transition-all shadow-xs">
              <span className="text-[13px] text-[#116e32] font-bold uppercase tracking-wider">Collection PIN</span>
              <span className="text-2xl font-mono font-black tracking-widest text-[#116e32]">
                {displayBatch?.otp || 'Pending'}
              </span>
            </div>
          )}
          
          <div className="flex justify-between items-center px-1">
            <p className="text-[11px] text-on-surface-variant font-medium">
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
                className="text-[11px] text-primary font-bold flex items-center gap-1 hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                {isTrackingDriver ? 'Loading...' : 'Track Driver'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tomorrow forecast card */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-2.5 mt-4 border border-outline-variant/30 text-left">
        <h3 className="text-[11px] font-bold text-outline uppercase tracking-wider">Tomorrow Forecast</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-bold text-on-surface">Expected orders:</span>
          <span className="text-[16px] font-extrabold text-primary">~19</span>
        </div>
        <p className="text-[13px] text-on-surface-variant font-medium">{activeMealsPortionsText}</p>
        
        {/* Navigations links */}
        <div className="flex gap-4 pt-1">
          <button
            onClick={() => onOpenSubView('ingredientPlan')}
            className="text-primary font-bold text-[13px] flex items-center gap-0.5 hover:underline active:scale-95 transition-transform">
            
            Ingredient plan
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
          
          <button
            onClick={() => onOpenSubView('foodForecast')}
            className="text-primary font-bold text-[13px] flex items-center gap-0.5 hover:underline active:scale-95 transition-transform">
            
            Portion checklist
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Quick Actions grid layout */}
      <section className="space-y-2 mt-5 text-left">
        <h3 className="text-[11px] font-bold text-outline uppercase tracking-wider px-1">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3 pb-4">
          <button
            onClick={onMarkAllReady}
            className="bg-primary text-on-primary h-[48px] rounded-lg font-bold text-[13px] flex items-center justify-center gap-2 active:scale-98 shadow-md hover:brightness-110 transition-all cursor-pointer">
            
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              check_circle
            </span>
            <span>Mark All Ready</span>
          </button>

          <button
            onClick={() => onNavigateToTab('Earn')}
            className="bg-white border border-primary text-primary h-[48px] rounded-lg font-bold text-[13px] flex items-center justify-center gap-2 active:scale-98 shadow-xs hover:bg-primary/5 transition-all cursor-pointer">
            
            <span className="material-symbols-outlined text-[18px]">bar_chart</span>
            <span>View Forecast</span>
          </button>
        </div>
      </section>
    </div>);

}