import React, { useState } from 'react';
import { ArrowRight, Info, HelpCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from "react-i18next";

export default function StepCompanyProfile({ onNext, data, updateData }) {
  const { t } = useTranslation("office");
  const [activeFocus, setActiveFocus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!data.companyName) {
      setValidationError(t("Please enter your company name."));
      return;
    }
    if (!data.address) {
      setValidationError(t("Please enter your registered address."));
      return;
    }
    if (!data.nip || data.nip.length < 10) {
      setValidationError(t("Please enter a valid 10-digit NIP number."));
      return;
    }
    if (!data.regon) {
      setValidationError(t("Please enter your REGON identifier."));
      return;
    }

    setValidationError('');
    setIsSubmitting(true);

    // Simulate validation against registry
    setTimeout(() => {
      setIsSubmitting(false);
      onNext('step2_docs');
    }, 1200);
  };

  const handleFocus = (field) => setActiveFocus(field);
  const handleBlur = () => setActiveFocus(null);

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6" id="onboarding_step1_container">
      {/* Brand & Progress Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-[#287965] tracking-tight">{t("DailyMealBox")}</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            {t("Onboarding Journey")}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
          <div className="bg-[#287965] h-full w-1/3 transition-all duration-500 ease-out" />
        </div>
        
        <div className="flex justify-between items-center text-xs font-medium text-gray-500">
          <p>{t("Step 1 of 3: Company Profile")}</p>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#287965]" />
            <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          </div>
        </div>
      </header>

      {/* Main Onboarding Card */}
      <div className="bg-white rounded-2xl p-8 md:p-10 shadow-xl border border-gray-100">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1A1C1E] tracking-tight">{t("Tell us about your company")}</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            {t("Provide your official registration details to set up your corporate account.")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {validationError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-semibold text-red-600 text-center">
              {validationError}
            </div>
          )}

          {/* Company Name */}
          <div className="flex flex-col gap-1.5">
            <label 
              htmlFor="companyName" 
              className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
                activeFocus === 'companyName' ? 'text-[#287965]' : 'text-gray-500'
              }`}
            >
              {t("Company Name")}
            </label>
            <input
              id="companyName"
              type="text"
              value={data.companyName}
              onChange={(e) => updateData({ companyName: e.target.value })}
              onFocus={() => handleFocus('companyName')}
              onBlur={handleBlur}
              placeholder={t("e.g. Acme Corp Logistics")}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-[#1A1C1E] placeholder-gray-400 text-sm focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
              required
            />
          </div>

          {/* Registered Address */}
          <div className="flex flex-col gap-1.5">
            <label 
              htmlFor="address" 
              className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
                activeFocus === 'address' ? 'text-[#287965]' : 'text-gray-500'
              }`}
            >
              {t("Registered Address")}
            </label>
            <textarea
              id="address"
              value={data.address}
              onChange={(e) => updateData({ address: e.target.value })}
              onFocus={() => handleFocus('address')}
              onBlur={handleBlur}
              placeholder={t("Full street address, building, city and postal code")}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-[#1A1C1E] placeholder-gray-400 text-sm focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all resize-none"
              required
            />
          </div>

          {/* Tax Identifiers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label 
                htmlFor="nip" 
                className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
                  activeFocus === 'nip' ? 'text-[#287965]' : 'text-gray-500'
                }`}
              >
                {t("NIP Number")}
              </label>
              <div className="relative">
                <input
                  id="nip"
                  type="text"
                  maxLength={10}
                  value={data.nip}
                  onChange={(e) => updateData({ nip: e.target.value.replace(/\D/g, '') })}
                  onFocus={() => handleFocus('nip')}
                  onBlur={handleBlur}
                  placeholder={t("10-digit tax ID")}
                  className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-[#1A1C1E] placeholder-gray-400 text-sm focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                  required
                />
                <span className="absolute right-3 top-3 text-gray-400" title={t("10-digit Tax Identification Number")}>
                  <Info className="w-4.5 h-4.5" />
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label 
                htmlFor="regon" 
                className={`text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
                  activeFocus === 'regon' ? 'text-[#287965]' : 'text-gray-500'
                }`}
              >
                {t("REGON Number")}
              </label>
              <input
                id="regon"
                type="text"
                value={data.regon}
                onChange={(e) => updateData({ regon: e.target.value.replace(/\D/g, '') })}
                onFocus={() => handleFocus('regon')}
                onBlur={handleBlur}
                placeholder={t("Registration ID")}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-[#1A1C1E] placeholder-gray-400 text-sm focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                required
              />
            </div>
          </div>

          {/* Legal Verification Section */}
          <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 flex items-center gap-4">
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 shadow-sm border border-gray-100 bg-white">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDlo_zUasgcGTKL5ZVkHBcrFIkuVLj4XztpfQK9v4aQ0pXmMdmVeo0EK4dE8bBueMH3EX50dF5UwKiHLapMy_ylFcH0zGXMKX04rGLl1z7WlAt7ZePAHSuHVZy6pHscDYSQ5ZzEbT7AFRAvmpZoC4M3TYh60GKAmJeSI9aGPJ03eANHoiazpfQ-jpjmkpcEnLDRk8MixugoPv15xTLKAVQV8ObVK1Xrc0MSUCijiU0yeNuBKECeQ5tZ"
                alt={t("Corporate Verification Lobby")}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A1C1E] flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-[#287965] shrink-0" />
                <span>{t("Legal Verification")}</span>
              </h4>
              <p className="text-[12px] leading-tight text-gray-500 mt-0.5">
                {t("Your data is verified against the official business register to ensure seamless meal logistics.")}
              </p>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 bg-[#287965] text-white font-bold text-sm rounded-lg hover:bg-[#1f6050] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-75 disabled:pointer-events-none"
              id="step1_next_btn"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>{t("Validating Profile...")}</span>
                </>
              ) : (
                <>
                  <span>{t("Next")}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Footer Help */}
      <footer className="flex items-center justify-center gap-4 text-xs font-semibold text-gray-400 pb-4">
        <a href="#help" className="hover:text-[#287965] transition-colors flex items-center gap-1">
          <HelpCircle className="w-4 h-4" />
          <span>{t("Need help?")}</span>
        </a>
        <span className="text-gray-300">•</span>
        <a href="#privacy" className="hover:text-[#287965] transition-colors">{t("Privacy Policy")}</a>
        <span className="text-gray-300">•</span>
        <a href="#terms" className="hover:text-[#287965] transition-colors">{t("Terms of Service")}</a>
      </footer>
    </div>
  );
}
