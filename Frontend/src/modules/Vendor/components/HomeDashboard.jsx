/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';












export default function HomeDashboard({
  profile,
  orders,
  meals,
  transactions,
  onMarkAllReady,
  onNavigateToTab,
  onOpenSubView
}) {
  const [showOtaUpdate, setShowOtaUpdate] = useState(true);

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
            <p className="text-3xl font-bold text-white">22</p>
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold mt-1">Today</p>
          </div>
          <div className="border-r border-white/20">
            <p className="text-3xl font-bold text-white">15</p>
            <p className="text-[11px] uppercase tracking-wider text-white/80 font-semibold mt-1">Subs</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">7</p>
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
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3 mt-4 border border-outline-variant/30 text-left">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold text-outline uppercase tracking-wider">Next Pickup</h3>
          <span className="bg-primary/15 text-primary px-2.5 py-0.5 rounded-full text-[10px] font-bold">INCOMING</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-surface-container shadow-xs">
            <img
              alt="Driver Headshot"
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuABNCkUA7UlwmXWWi0In2EaDgxsLpoz95K9Ry6ONuPxVJus8yZfDfwzj3a-TTtybS41H2HxAi4Eb5F6MrgTM9sJcZtSq_tC876NnNRHzHQT43N3WXPXTvvsK0z02OugwZpaIDSzllwHb5WTPbGrmhZbxZ50bs62HCTtbWr150YW6HNdnjgrYhYP3v90IWj6gwAKU4D1GooeWgKE27BzeY9USwXAFavXdY1VwDRQ-Ta-FZ1ybl6FGtf-KHZ8UzzdV64XYOAdTmhK-Q" />
            
          </div>
          <div>
            <p className="font-bold text-[14px] text-on-surface">Driver Jan W. arrives at ~11:45</p>
            <p className="text-[13px] text-on-surface-variant">22 boxes ready to hand over</p>
          </div>
        </div>

        {/* Collection PIN slot */}
        <div className="bg-primary-container/10 border border-primary-container/20 rounded-lg p-3 flex justify-between items-center transition-colors hover:bg-primary-container/15">
          <span className="text-[13px] text-primary font-semibold">Collection PIN</span>
          <span className="text-[16px] font-extrabold text-primary tracking-widest font-mono">7842</span>
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