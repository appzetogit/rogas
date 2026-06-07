import React, { useState, useRef } from "react";
import { IMAGES } from "../types";

export function AuthPhoneScreen({ isLogin, onToggleMode, onSendOtp, onBack }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phone.trim().length >= 6) {
      if (!isLogin && name.trim().length < 2) {
        alert("Please enter a valid name");
        return;
      }
      onSendOtp(phone, name.trim());
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F9] text-on-surface">
      <header className="px-5 h-14 flex items-center">
        <span onClick={onBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95">
          arrow_back
        </span>
      </header>

      <main className="px-5 flex-1 flex flex-col pb-6">
        <div className="w-full h-56 rounded-2xl overflow-hidden mb-6 shadow-sm">
          <img 
            src={IMAGES.foodBoxTomatoesBread} 
            alt="Food Banner" 
            className="w-full h-full object-cover" 
          />
        </div>

        <h1 className="text-[24px] font-extrabold text-[#1b1c1c] tracking-tight">
          {isLogin ? "Welcome back!" : "Create an account"}
        </h1>
        <p className="text-[13px] text-on-surface-variant mt-1 mb-6">
          {isLogin ? "Log in with your phone number" : "Sign up with your phone number"}
        </p>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          {!isLogin && (
            <div className="mb-4">
              <label className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider mb-2 block">
                Full Name
              </label>
              <div className="flex h-14 bg-white border border-[#bec9c3] rounded-xl overflow-hidden shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                <input 
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="flex-1 px-4 text-[14px] font-semibold text-[#1b1c1c] focus:outline-none"
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="mb-8">
            <label className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider mb-2 block">
              Mobile Number
            </label>
            <div className="flex h-14 bg-white border border-[#bec9c3] rounded-xl overflow-hidden shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
              <div className="flex items-center justify-center px-4 border-r border-[#bec9c3] text-[#3e4945] font-semibold text-[14px]">
                +48
              </div>
              <input 
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="000 000 000"
                className="flex-1 px-4 text-[14px] font-semibold text-[#1b1c1c] focus:outline-none"
                autoFocus={isLogin}
              />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-5">
            <button 
              type="submit"
              disabled={phone.trim().length < 6 || (!isLogin && name.trim().length < 2)}
              className="w-full bg-[#1F7A63] disabled:opacity-50 text-white font-bold h-12 rounded-xl active:scale-[0.98] transition-all shadow-md text-[14px]"
            >
              Send OTP
            </button>

            <button 
              type="button" 
              onClick={onToggleMode}
              className="text-[#1F7A63] text-[13px] font-semibold hover:underline"
            >
              {isLogin ? "New user? Create an account" : "Already have an account? Log in"}
            </button>

            <p className="text-[10px] text-center text-[#6e7a74] px-4 mt-2">
              By continuing, you agree to our <span className="underline">Terms of Service</span> and <span className="underline">Privacy Policy</span>.
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}

export function OtpVerificationScreen({ phone, onVerify, onResend, onBack }) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const inputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null)
  ];

  const handleChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      inputRefs[index + 1].current.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current.focus();
    }
  };

  const handleSubmit = () => {
    const code = otp.join("");
    onVerify(code);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F9] text-on-surface">
      <header className="px-5 h-14 flex items-center">
        <span onClick={onBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95">
          arrow_back
        </span>
      </header>

      <main className="px-5 flex-1 flex flex-col items-center pt-8">
        <div className="w-20 h-20 rounded-full border border-[#1F7A63]/30 bg-[#1F7A63]/5 flex items-center justify-center mb-6 border-dashed">
          <span className="material-symbols-outlined text-4xl text-[#1F7A63]">
            admin_panel_settings
          </span>
        </div>

        <h1 className="text-[24px] font-extrabold text-[#1b1c1c] tracking-tight mb-2">
          Verify OTP
        </h1>
        <p className="text-[13px] text-on-surface-variant text-center px-4 mb-8 leading-relaxed">
          Enter the 6-digit code sent to <span className="text-[#1F7A63] font-semibold">+48 {phone || "000 000 000"}</span>
        </p>

        <div className="flex gap-2 mb-6">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="text"
              inputMode="numeric"
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-12 bg-white border border-[#bec9c3] rounded-xl text-center text-lg font-bold text-[#1F7A63] shadow-sm focus:outline-none focus:border-[#1F7A63] focus:ring-1 focus:ring-[#1F7A63] transition-all"
            />
          ))}
        </div>

        <p className="text-[12px] text-[#6e7a74] mb-10">
          Hint: Try <span className="font-bold text-[#1F7A63]">123456</span>
        </p>

        <div className="w-full mt-auto mb-8 flex flex-col gap-5">
          <button 
            onClick={handleSubmit}
            disabled={otp.join("").length < 6}
            className="w-full bg-[#1F7A63] disabled:opacity-50 text-white font-bold h-12 rounded-xl active:scale-[0.98] transition-all shadow-md text-[14px]"
          >
            Verify OTP
          </button>

          <button 
            onClick={onResend}
            className="text-[#1F7A63] text-[13px] font-semibold hover:underline text-center"
          >
            Resend code
          </button>

          <div className="mt-4 bg-[#F2ECE5]/50 border border-[#e8dfd5] p-4 rounded-xl flex gap-3 text-left">
            <span className="material-symbols-outlined text-[#1F7A63] text-[20px] mt-0.5">
              lock
            </span>
            <div>
              <p className="text-[12px] font-bold text-[#1b1c1c]">Secure Verification</p>
              <p className="text-[11px] text-[#6e7a74] leading-tight mt-0.5">
                We use industry-standard encryption to keep your dietary journey safe and private.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function UserDetailsScreen({ onContinue, onBack }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (firstName && lastName && email) {
      onContinue({ firstName, lastName, email });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F9] text-on-surface">
      <header className="px-5 h-14 flex items-center justify-between">
        <span onClick={onBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95">
          arrow_back
        </span>
        <div className="flex items-center gap-1">
          <div className="w-6 h-1 rounded-full bg-[#1F7A63]"></div>
          <div className="w-6 h-1 rounded-full bg-[#1F7A63]"></div>
          <div className="w-6 h-1 rounded-full bg-[#1F7A63]"></div>
          <div className="w-6 h-1 rounded-full bg-[#bec9c3]"></div>
        </div>
      </header>

      <main className="px-5 flex-1 flex flex-col pb-6 pt-2">
        <h1 className="text-[24px] font-extrabold text-[#1b1c1c] tracking-tight">
          About You
        </h1>
        <p className="text-[13px] text-on-surface-variant mt-1 mb-5">
          Tell us a bit more to personalize your experience
        </p>

        <div className="w-full h-32 rounded-2xl overflow-hidden mb-6 shadow-sm relative">
          <img 
            src={IMAGES.earthyGrainsDiningIngredientsBanner} 
            alt="Healthy ingredients" 
            className="w-full h-full object-cover" 
          />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4">
          <div>
            <label className="text-[11px] font-bold text-[#1b1c1c] mb-1.5 block">
              First Name
            </label>
            <input 
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="e.g. John"
              className="w-full h-12 px-4 bg-white border border-[#bec9c3]/70 rounded-xl text-[13px] focus:outline-none focus:border-[#1F7A63] focus:ring-1 focus:ring-[#1F7A63] transition-all shadow-sm"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#1b1c1c] mb-1.5 block">
              Last Name
            </label>
            <input 
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="e.g. Doe"
              className="w-full h-12 px-4 bg-white border border-[#bec9c3]/70 rounded-xl text-[13px] focus:outline-none focus:border-[#1F7A63] focus:ring-1 focus:ring-[#1F7A63] transition-all shadow-sm"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#1b1c1c] mb-1.5 block">
              Email Address
            </label>
            <div className="relative">
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john.doe@example.com"
                className="w-full h-12 pl-4 pr-10 bg-white border border-[#bec9c3]/70 rounded-xl text-[13px] focus:outline-none focus:border-[#1F7A63] focus:ring-1 focus:ring-[#1F7A63] transition-all shadow-sm"
                required
              />
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#bec9c3] text-[18px]">
                mail
              </span>
            </div>
          </div>

          <div className="mt-auto pt-6 flex flex-col gap-4">
            <p className="text-[10px] text-center text-[#6e7a74] px-4">
              By continuing, you agree to our <span className="text-[#1F7A63] font-bold">Terms of Service</span> and <span className="text-[#1F7A63] font-bold">Privacy Policy</span>.
            </p>

            <button 
              type="submit"
              disabled={!firstName || !lastName || !email}
              className="w-full bg-[#1F7A63] disabled:opacity-50 text-white font-bold h-12 rounded-xl active:scale-[0.98] transition-all shadow-md text-[14px] flex items-center justify-center gap-2"
            >
              Continue
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
