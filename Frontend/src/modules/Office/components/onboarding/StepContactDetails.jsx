import React, { useState } from 'react';
import { ArrowLeft, CheckCircle, UserCheck, Landmark, Check, ShieldCheck, Sparkles } from 'lucide-react';

export default function StepContactDetails({ onNext, onBack, data, updateData }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [redirectProgress, setRedirectProgress] = useState(0);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Simple validation
    if (!data.contactName) {
      setValidationError('Please enter the contact person name.');
      return;
    }
    if (!data.designation) {
      setValidationError('Please enter the contact designation.');
      return;
    }
    if (!data.contactEmail) {
      setValidationError('Please enter the contact email address.');
      return;
    }
    if (!data.phone) {
      setValidationError('Please enter the contact phone number.');
      return;
    }
    if (!data.bankName) {
      setValidationError('Please enter your company bank name.');
      return;
    }
    if (!data.accountName) {
      setValidationError('Please enter your company bank account name.');
      return;
    }
    if (!data.iban) {
      setValidationError('Please enter your bank IBAN or Account Number.');
      return;
    }

    setValidationError('');
    setIsSubmitting(true);

    // Simulate completion process
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccessOverlay(true);

      // Animate progress bar inside success overlay
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 5;
        setRedirectProgress(currentProgress);
        if (currentProgress >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onNext('dashboard');
          }, 400);
        }
      }, 80);
    }, 1500);
  };

  const handleAutoFill = () => {
    updateData({
      contactName: 'Alexander Vance',
      designation: 'Director of HR & Operations',
      contactEmail: data.email || 'alexander.vance@company.com',
      phone: '+1 (555) 782-9013',
      bankName: 'Silicon Valley Business Bank',
      accountName: data.companyName ? `${data.companyName} Corp` : 'Acme Logistics Services Ltd',
      iban: 'US89 4002 9102 3847 9102 334',
    });
  };

  return (
    <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 border border-gray-100" id="onboarding_step3_container">
      {/* Left Visual Status Side */}
      <div className="md:col-span-4 bg-[#287965] p-8 md:p-10 flex flex-col justify-between text-white relative overflow-hidden">
        {/* Decorative circle */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full translate-x-10 -translate-y-10 blur-xl pointer-events-none" />

        <div>
          <h1 className="text-xl font-bold tracking-tight">DailyMealBox</h1>
          <p className="text-xs text-white/70 mt-1">Corporate meal management, simplified.</p>
        </div>

        <div className="space-y-6 my-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-none">Step 1: Profile</span>
              <span className="text-[10px] text-white/60">Company details saved</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold block leading-none">Step 2: Verification</span>
              <span className="text-[10px] text-white/60">Documents uploaded</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white text-[#287965] flex items-center justify-center text-xs font-extrabold ring-4 ring-white/10 shadow-md">
              3
            </div>
            <div>
              <span className="text-xs font-bold block leading-none text-white">Step 3: Billing</span>
              <span className="text-[10px] text-[#A3E6D8] font-semibold">Active & Finalizing</span>
            </div>
          </div>
        </div>

        <div className="text-[10px] text-white/50 font-mono">
          Security standard PCI-DSS compliant.
        </div>
      </div>

      {/* Right Form Column */}
      <div className="md:col-span-8 p-8 md:p-10 flex flex-col">
        {/* Progress Header */}
        <div className="mb-6">
          <div className="flex justify-between items-end mb-2">
            <h2 className="text-xl font-bold text-[#1A1C1E] tracking-tight">Final Step</h2>
            <span className="text-xs font-bold text-[#287965] uppercase tracking-widest">Step 3 of 3</span>
          </div>
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div className="bg-[#287965] h-full rounded-full w-full transition-all duration-700 ease-out" />
          </div>
        </div>

        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={handleAutoFill}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#287965]/20 text-xs font-bold text-[#287965] hover:bg-[#287965]/5 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Auto-Fill Details</span>
          </button>
        </div>

        {validationError && (
          <div className="mb-5 p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-semibold text-red-600 text-center">
            {validationError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 flex-grow">
          {/* Section 1: Contact Details */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100">
              <UserCheck className="w-4.5 h-4.5 text-[#287965]" />
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#287965]">Primary Contact</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500" htmlFor="contact_name">
                  Contact Person Name
                </label>
                <input
                  id="contact_name"
                  type="text"
                  value={data.contactName}
                  onChange={(e) => updateData({ contactName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500" htmlFor="designation">
                  Designation
                </label>
                <input
                  id="designation"
                  type="text"
                  value={data.designation}
                  onChange={(e) => updateData({ designation: e.target.value })}
                  placeholder="e.g. HR Manager"
                  className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500" htmlFor="contact_email">
                  Email Address
                </label>
                <input
                  id="contact_email"
                  type="email"
                  value={data.contactEmail}
                  onChange={(e) => updateData({ contactEmail: e.target.value })}
                  placeholder="john.doe@company.com"
                  className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500" htmlFor="phone">
                  Phone Number
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={data.phone}
                  onChange={(e) => updateData({ phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                  required
                />
              </div>
            </div>
          </section>

          {/* Section 2: Bank Details */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100">
              <Landmark className="w-4.5 h-4.5 text-[#287965]" />
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#287965]">Bank Account Details</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-gray-500" htmlFor="bank_name">
                  Bank Name
                </label>
                <input
                  id="bank_name"
                  type="text"
                  value={data.bankName}
                  onChange={(e) => updateData({ bankName: e.target.value })}
                  placeholder="e.g. International Business Bank"
                  className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-500" htmlFor="account_name">
                    Account Name
                  </label>
                  <input
                    id="account_name"
                    type="text"
                    value={data.accountName}
                    onChange={(e) => updateData({ accountName: e.target.value })}
                    placeholder="Daily Services Corp"
                    className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-gray-500" htmlFor="iban">
                    IBAN / Account Number
                  </label>
                  <input
                    id="iban"
                    type="text"
                    value={data.iban}
                    onChange={(e) => updateData({ iban: e.target.value })}
                    placeholder="US00 0000 0000 0000 0000"
                    className="bg-gray-50/50 border border-gray-200 rounded-lg px-3.5 py-2 text-sm text-[#1A1C1E] placeholder-gray-400 focus:outline-none focus:border-[#287965] focus:bg-white focus:ring-4 focus:ring-[#287965]/10 transition-all"
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-bold text-xs hover:bg-gray-50 transition-all cursor-pointer focus:outline-none"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-7 py-2.5 rounded-lg font-bold text-xs text-white bg-[#287965] hover:bg-[#1f6050] shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-75"
              id="step3_submit_btn"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Complete Setup</span>
                  <CheckCircle className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Success Fullscreen Overlay */}
      {showSuccessOverlay && (
        <div className="fixed inset-0 bg-[#1A1C1E]/60 backdrop-blur-md flex items-center justify-center z-50 transition-opacity duration-300">
          <div className="bg-white p-8 sm:p-10 rounded-3xl w-[90%] sm:w-[420px] text-center shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100 flex flex-col items-center transform transition-all">
            
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-[#A3E6D8] rounded-full blur-xl opacity-60 animate-pulse" />
              <div className="relative w-20 h-20 bg-gradient-to-br from-[#287965] to-[#3a9c84] rounded-full flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-300">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
            </div>
            
            <h2 className="text-2xl font-extrabold text-[#1A1C1E] tracking-tight mb-3">Setup Complete!</h2>
            <p className="text-sm text-[#6C7278] leading-relaxed px-2">
              Your company profile has been successfully verified. Welcome to <span className="font-semibold text-[#287965]">DailyMealBox</span>.
            </p>
            
            <div className="w-full mt-10 p-5 bg-[#F8F9F8] rounded-2xl border border-gray-100">
              <div className="flex justify-between items-center mb-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  Redirecting to Dashboard...
                </p>
                <span className="text-xs font-bold text-[#287965]">{redirectProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-[#287965] to-[#45a48b] h-full transition-all duration-75 ease-out" 
                  style={{ width: `${redirectProgress}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
