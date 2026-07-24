import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Check } from 'lucide-react';

export function VendorWelcomeScreen() {
  const navigate = useNavigate();
  const logoUrl = localStorage.getItem('restaurant_app_logo');

  return (
    <div className="bg-primary-container text-on-primary min-h-screen flex flex-col items-center justify-between overflow-hidden">
      {/* Status Bar Area (Simulated) */}

      {/* Main Content Container */}
      <main className="w-full max-w-[390px] flex-1 flex flex-col items-center px-4 pt-12 animate-fade-in z-10">
        {/* Brand Identity Section */}
        <div className="flex flex-col items-center text-center space-y-4">
          {/* Avatar Icon / Logo */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="App Logo"
              className="w-auto h-24 rounded-2xl object-contain shadow-md"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-white to-[#f0fdf4] flex items-center justify-center shadow-lg border-4 border-white/20 overflow-hidden">
              <ChefHat className="text-primary-container text-[48px]" style={{ fontVariationSettings: "'FILL' 1" }} />
            </div>
          )}
          <div className="space-y-1">
            <h1 className="font-sans text-[32px] font-bold text-white tracking-tight">DailyMealBox</h1>
            <p className="font-sans text-[16px] text-white/90 font-normal">Vendor Partner</p>
          </div>
          <p className="font-sans text-[20px] leading-tight text-white max-w-[280px] mt-16 font-bold">
            Reach 100s of subscribers in your neighbourhood.
          </p>
        </div>

        {/* Action Section */}
        <div className="w-full mt-12 flex flex-col items-center space-y-6">
          <button
            onClick={() => navigate('/vendor/auth/register-phone')}
            className="w-full bg-white text-primary-container font-sans font-bold text-[16px] py-4 rounded-xl shadow-xl hover:bg-surface-container-lowest transition-all active:scale-[0.98]">

            Register as Vendor
          </button>
          <button
            onClick={() => navigate('/vendor/auth/login-phone')}
            className="font-sans font-bold text-[13px] text-white underline underline-offset-4 hover:text-white/80 transition-colors">

            I already have an account
          </button>
        </div>

        {/* Decorative Spacer */}
        <div className="flex-1 min-h-[40px]"></div>

        {/* Value Propositions Section */}
        <section className="w-full bg-white/10 rounded-2xl p-6 mb-12 backdrop-blur-sm border border-white/10">
          <h2 className="font-sans text-[11px] font-semibold text-white/70 uppercase tracking-widest mb-6">WHY JOIN US?</h2>
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-white flex items-center justify-center">
                <Check className="text-primary-container text-[18px] font-bold" />
              </div>
              <span className="font-sans text-[13px] font-bold text-white">Earn 80–85% of meal price</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-white flex items-center justify-center">
                <Check className="text-primary-container text-[18px] font-bold" />
              </div>
              <span className="font-sans text-[13px] font-bold text-white">We handle all delivery</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-white flex items-center justify-center">
                <Check className="text-primary-container text-[18px] font-bold" />
              </div>
              <span className="font-sans text-[13px] font-bold text-white">Full analytics dashboard</span>
            </div>
          </div>
        </section>
      </main>

      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay overflow-hidden">
        <svg height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
          <filter id="noise">
            <feTurbulence baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" type="fractalNoise" />
          </filter>
          <rect filter="url(#noise)" height="100%" width="100%" />
        </svg>
      </div>
    </div>);

}