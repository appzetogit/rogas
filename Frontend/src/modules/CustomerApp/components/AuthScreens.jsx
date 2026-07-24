import React, { useState, useRef } from "react";
import { IMAGES } from "../types";
import { SUPPORTED_COUNTRIES } from "../../../config/countries";
import CountrySelector from "../../../shared/components/CountrySelector";
import { ArrowLeft, Utensils, ShieldCheck, Lock, Leaf, Mail, ArrowRight } from 'lucide-react';
import { Link } from "react-router-dom";

export function AuthPhoneScreen({ isLogin, onToggleMode, onSendOtp, onBack }) {
  const [selectedCountry, setSelectedCountry] = useState(() => {
    return SUPPORTED_COUNTRIES.find(c => c.code === "+48") || SUPPORTED_COUNTRIES[0];
  });
  const [phone, setPhone] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length === selectedCountry.phoneLength) {
      const fullPhone = `${selectedCountry.code}${cleanDigits}`;
      onSendOtp(fullPhone);
    } else {
      alert(`Please enter a valid ${selectedCountry.phoneLength}-digit phone number`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F9F9] text-on-surface">
      <header className="px-5 h-14 flex items-center">
        <ArrowLeft className="text-primary cursor-pointer active:scale-95" onClick={onBack} />
      </header>

      <main className="px-5 flex-1 flex flex-col pb-6">
        {localStorage.getItem('user_app_logo') ? (
          <img 
            src={localStorage.getItem('user_app_logo')} 
            alt="App Logo" 
            className="w-full h-56 rounded-2xl shadow-sm object-contain bg-white p-4 mb-6" 
          />
        ) : (
          <div className="w-full h-56 rounded-2xl overflow-hidden mb-6 shadow-sm">
            <div className="w-full h-full bg-gradient-to-tr from-primary/30 to-primary/10 flex items-center justify-center">
              <Utensils className="text-[64px] text-primary/40" />
            </div>
          </div>
        )}

        <h1 className="text-[24px] font-extrabold text-[#1b1c1c] tracking-tight">
          {isLogin ? "Welcome back!" : "Create an account"}
        </h1>
        <p className="text-[13px] text-on-surface-variant mt-1 mb-6">
          {isLogin ? "Log in with your phone number" : "Sign up with your phone number"}
        </p>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">

          <div className="mb-8">
            <label className="text-[10px] font-bold text-[#6e7a74] uppercase tracking-wider mb-2 block">
              Mobile Number
            </label>
            <div className="flex h-14 bg-white border border-[#bec9c3] rounded-xl overflow-hidden shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
              <CountrySelector
                selectedCountry={selectedCountry}
                onSelect={(country) => {
                  setSelectedCountry(country);
                  setPhone("");
                }}
                className="shrink-0"
                buttonClassName="flex items-center justify-between gap-1 px-4 h-14 border-r border-[#bec9c3] bg-transparent text-gray-800 text-sm font-bold min-w-[95px] cursor-pointer"
              />
              <input 
                type="tel"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, selectedCountry.phoneLength);
                  setPhone(val);
                }}
                placeholder={selectedCountry.placeholder}
                className="flex-1 px-4 text-[14px] font-semibold text-[#1b1c1c] focus:outline-none"
                maxLength={selectedCountry.phoneLength}
                autoFocus={isLogin}
              />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-5">
            <button 
              type="submit"
              disabled={phone.replace(/\D/g, "").length !== selectedCountry.phoneLength}
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
              By continuing, you agree to our <Link to="/user/termsandcondition" state={{ backTo: "/user/auth/login" }} className="underline">Terms of Service</Link> and <Link to="/user/privacy" state={{ backTo: "/user/auth/login" }} className="underline">Privacy Policy</Link>.
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
        <ArrowLeft className="text-primary cursor-pointer active:scale-95" onClick={onBack} />
      </header>

      <main className="px-5 flex-1 flex flex-col items-center pt-8">
        <div className="w-20 h-20 rounded-full border border-[#1F7A63]/30 bg-[#1F7A63]/5 flex items-center justify-center mb-6 border-dashed">
          <ShieldCheck className="text-4xl text-[#1F7A63]" />
        </div>

        <h1 className="text-[24px] font-extrabold text-[#1b1c1c] tracking-tight mb-2">
          Verify OTP
        </h1>
        <p className="text-[13px] text-on-surface-variant text-center px-4 mb-8 leading-relaxed">
          Enter the 6-digit code sent to <span className="text-[#1F7A63] font-semibold">{phone || "your phone number"}</span>
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
            <Lock className="text-[#1F7A63] text-[20px] mt-0.5" />
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
        <ArrowLeft className="text-primary cursor-pointer active:scale-95" onClick={onBack} />
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
          <div className="w-full h-full bg-gradient-to-tr from-primary/30 to-primary/10 flex items-center justify-center">
            <Leaf className="text-[48px] text-primary/40" />
          </div>
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
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bec9c3] text-[18px]" />
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
              <ArrowRight className="text-[18px]" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
