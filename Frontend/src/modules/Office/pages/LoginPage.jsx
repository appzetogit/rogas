import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setTimeout(() => {
      navigate('/office/verify-otp');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9F8] flex items-center justify-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-[1000px] bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row">
        
        {/* Left Side: Branding */}
        <div className="hidden md:flex w-1/2 bg-[#287965] relative p-12 flex-col justify-between min-h-[600px]">
          
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 opacity-20 mix-blend-overlay">
            <div
              className="w-full h-full bg-cover bg-center"
              style={{
                backgroundImage:
                  "url('https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=1200')"
              }}
            ></div>
            <div className="absolute inset-0 bg-[#287965] mix-blend-multiply opacity-60"></div>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-16">
              <span className="material-symbols-outlined text-white text-2xl font-bold">
                restaurant
              </span>
              <span className="text-white font-bold text-xl tracking-tight">DailyMealBox</span>
            </div>
            
            <div>
              <h1 className="text-white text-4xl font-bold leading-[1.2] mb-6">
                Simplify your company's<br />meal logistics.
              </h1>
              <p className="text-white/90 text-sm max-w-[85%] leading-relaxed">
                Efficient corporate meal subscription management<br />
                for high-performance teams.
              </p>
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-3 mt-12">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full border border-[#287965] bg-gray-200 overflow-hidden">
                <img alt="User" className="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=4" />
              </div>
              <div className="w-8 h-8 rounded-full border border-[#287965] bg-gray-200 overflow-hidden">
                <img alt="User" className="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=5" />
              </div>
              <div className="w-8 h-8 rounded-full border border-[#287965] bg-gray-200 overflow-hidden">
                <img alt="User" className="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=6" />
              </div>
            </div>
            <span className="text-white/90 text-xs font-medium">Trusted by 500+ regional vendors</span>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-1/2 p-8 sm:p-12 flex flex-col justify-center bg-white">
          <div className="max-w-[360px] w-full mx-auto">
            
            {/* Mobile Header */}
            <div className="md:hidden flex items-center gap-2 mb-8">
              <span className="material-symbols-outlined text-[#287965] text-2xl font-bold">
                restaurant
              </span>
              <span className="text-[#287965] font-bold text-xl tracking-tight">DailyMealBox</span>
            </div>

            <div className="mb-8">
              <h2 className="text-[#1A1C1E] text-2xl font-bold mb-2">Welcome back</h2>
              <p className="text-[#6C7278] text-sm">Please enter your details to access your dashboard.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Email */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#4A4C56]">Email Address</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9EA3AE] text-[20px]">
                    mail
                  </span>
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-sm text-[#1A1C1E] focus:outline-none focus:border-[#287965] focus:ring-1 focus:ring-[#287965] transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[#4A4C56]">Password</label>
                  <a href="#" className="text-sm font-medium text-[#287965] hover:underline">
                    Forgot Password?
                  </a>
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#9EA3AE] text-[20px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-sm text-[#1A1C1E] focus:outline-none focus:border-[#287965] focus:ring-1 focus:ring-[#287965] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9EA3AE] hover:text-[#4A4C56] transition-colors flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center pt-1">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-4 h-4 rounded border-[#D1D5DB] text-[#287965] focus:ring-[#287965]"
                />
                <label htmlFor="remember" className="ml-2 text-sm text-[#6C7278] cursor-pointer">
                  Remember for 30 days
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#287965] text-white py-3 rounded-lg text-sm font-medium hover:bg-[#1f6050] transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                ) : (
                  <>
                    Sign In
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E5E7EB]"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-4 text-[#6C7278] uppercase font-medium tracking-wider">
                  OR CONTINUE WITH
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center">
              <p className="text-sm text-[#6C7278]">
                Don't have an account?{' '}
                <a href="#" className="text-[#287965] font-medium hover:underline">
                  Contact Sales
                </a>
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
