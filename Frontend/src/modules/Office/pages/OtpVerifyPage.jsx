import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck, RefreshCw, ArrowRight, HelpCircle } from 'lucide-react';
import { Trans, useTranslation } from "react-i18next";

export default function OtpVerifyPage() {
  const { t } = useTranslation("office");
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(59);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleInput = (e, index) => {
    const value = e.target.value;
    if (!/^[0-9]*$/.test(value)) return;

    const newOtp = [...otpValues];
    newOtp[index] = value;
    setOtpValues(newOtp);

    // Auto-advance
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsVerifying(true);

    setTimeout(() => {
      setIsVerifying(false);
      navigate('/office/onboarding');
    }, 1500);
  };

  const handleResend = () => {
    alert(t("Code resent to your email!"));
    setTimeLeft(59);
  };

  return (
    <div className="min-h-screen bg-[#F8F9F8] flex items-center justify-center p-4 font-sans relative">
      
      {/* Background decoration (optional soft gradient at top) */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-[#e4e7e4] to-transparent opacity-50 pointer-events-none"></div>

      <div className="w-full max-w-[480px] relative z-10">
        
        {/* Brand Header */}
        <div className="flex justify-center mb-6">
          <span className="text-[#287965] font-bold text-xl tracking-tight">{t("DailyMealBox")}</span>
        </div>

        {/* Verification Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10 text-center">
          
          {/* Icon */}
          <div className="mx-auto w-16 h-16 bg-[#E8F2F0] rounded-full flex items-center justify-center mb-6">
            <UserCheck className="text-[#287965] text-3xl" style={{ fontVariationSettings: "'FILL' 1" }} />
          </div>

          {/* Text */}
          <h1 className="text-2xl font-bold text-[#1A1C1E] mb-3">{t("Check your email")}</h1>
          <p className="text-[#6C7278] text-sm leading-relaxed mb-8 px-2">
            <Trans t={t} i18nKey={"We've sent a 6-digit verification code to<0></0><1>j.doe@example.com</1>. Please enter it below to continue."} defaults={"We've sent a 6-digit verification code to<0></0><1>j.doe@example.com</1>. Please enter it below to continue."} components={[<br />, <span className="font-semibold text-[#1A1C1E]" />]} />
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="flex justify-center gap-2 sm:gap-3 mb-8">
              {otpValues.map((val, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  autoFocus={index === 0}
                  className="w-11 h-12 sm:w-14 sm:h-16 text-center text-xl font-bold border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:border-[#287965] focus:ring-1 focus:ring-[#287965] transition-colors shadow-sm"
                  maxLength={1}
                  type="text"
                  value={val}
                  onChange={(e) => handleInput(e, index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                />
              ))}
            </div>

            <button
              className={`w-full bg-[#287965] text-white py-3.5 rounded-lg text-sm font-semibold hover:bg-[#1f6050] transition-colors flex items-center justify-center gap-2 mb-6 ${
                isVerifying ? 'opacity-80' : ''
              }`}
              disabled={isVerifying}
              type="submit"
            >
              {isVerifying ? (
                <RefreshCw className="animate-spin text-[20px]" />
              ) : (
                <>
                  {t("Verify & Continue")}
                  <ArrowRight className="text-[18px]" />
                </>
              )}
            </button>
          </form>

          {/* Resend */}
          <div className="text-sm text-[#6C7278] mb-8">
            {t("Didn't receive a code?")}{' '}
            <button
              onClick={handleResend}
              disabled={timeLeft > 0}
              className={`font-semibold transition-colors ${
                timeLeft > 0 ? 'text-[#A0A4AB] cursor-not-allowed' : 'text-[#287965] hover:underline'
              }`}
            >
              {t("Resend Code")} {timeLeft > 0 && `(0:${timeLeft.toString().padStart(2, '0')})`}
            </button>
          </div>

          {/* Help Link */}
          <a
            href="#"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#9EA3AE] hover:text-[#6C7278] uppercase tracking-wider transition-colors"
          >
            <HelpCircle className="text-[16px]" />
            {t("Need help or use another method?")}
          </a>

        </div>
      </div>
    </div>
  );
}
