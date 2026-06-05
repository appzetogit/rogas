import { useState } from "react";
import { IMAGES } from "../types";
export function ProfileScreen({ onGoBack, onGoToOnboarding, onGoToInvoiceSettings, onGoToCheckout, onShowNotificationToast, dietaryPrefs, invoicePrefs, points }) {
    const [walletCredits] = useState(35.0);
    const [showDangerDialog, setShowDangerDialog] = useState(null);
    const handleShareReferral = () => {
        navigator.clipboard.writeText("https://dailymealbox.pl/referral?code=ANNAK");
        onShowNotificationToast("🎁 Referral link copied to clipboard! Share with friends to earn PLN 15.");
    };
    const handleDangerActionConfirm = (action) => {
        onShowNotificationToast(`⚠️ Action '${action}' requested and sent to support division.`);
        setShowDangerDialog(null);
    };
    return (<div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Top action context header */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <div className="flex items-center gap-2">
          <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
            arrow_back
          </button>
        </div>
        <h1 className="text-xl font-extrabold text-primary text-center">DailyMealBox</h1>
        <button className="w-8 h-8 rounded-full overflow-hidden border border-[#bec9c3]/50">
          <img alt="Anna profile mini portrait thumbnail" className="w-full h-full object-cover" src={IMAGES.profileAnnaSecondary}/>
        </button>
      </header>

      <main className="pt-14 pb-12">
        {/* Profile green banner */}
        <section className="bg-gradient-to-b from-[#1f7a63] to-[#175d4b] px-5 pt-8 pb-10 text-white rounded-b-[32px] shadow-lg relative overflow-hidden">
          <div className="absolute right-[-20px] top-[-10px] opacity-10 pointer-events-none">
            <span className="material-symbols-outlined text-[130px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
          </div>

          <div className="relative z-10 flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <img className="w-16 h-16 rounded-full border-2 border-white/40 object-cover shadow-sm bg-primary/20" src={IMAGES.profileWomanCinematicGreen} alt="Anna headshot smile"/>
              <div className="absolute bottom-0 right-0 bg-[#fea619] w-6 h-6 rounded-full border-2 border-[#1f7a63] flex items-center justify-center">
                <span className="material-symbols-outlined text-[14px] text-[#002018] font-bold" style={{ fontVariationSettings: "'FILL' 1" }}>
                  verified_user
                </span>
              </div>
            </div>

            <div className="flex flex-col">
              <h2 className="text-[20px] font-extrabold text-white leading-tight">Anna Kowalska</h2>
              <p className="text-sm text-white/90">Warsaw · Subscriber since Jan 2026</p>
            </div>
          </div>
        </section>

        {/* Content list buttons */}
        <div className="px-5 -mt-5 flex flex-col gap-4 relative z-10">
          {/* Subscription setup */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-[#1f7a63]/10 p-2 rounded-xl text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">assignment</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">My Subscription</h3>
                <p className="text-xs text-on-surface-variant font-medium">Standard Box · Next billing Feb 14</p>
              </div>
            </div>
            <button onClick={onGoToCheckout} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span>Manage</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Diet preferences */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-[#fea619]/10 p-2 rounded-xl text-[#fea619] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Diet &amp; Allergens</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {dietaryPrefs.dietType} · {dietaryPrefs.allergies.length > 0 ? dietaryPrefs.allergies.slice(0, 2).join(", ") + (dietaryPrefs.allergies.length > 2 ? "..." : "") : "No allergies"}
                </p>
              </div>
            </div>
            <button onClick={onGoToOnboarding} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span>Edit</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Invoice preferences mappings */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-[#e4e2e1] p-2 rounded-xl text-[#3e4945] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Invoice Preferences</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {invoicePrefs.receiptType === "simple" ? "Simple receipt Only" : `VAT: ${invoicePrefs.companyName}`}
                </p>
              </div>
            </div>
            <button onClick={onGoToInvoiceSettings} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span>Change</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Payment card list */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-[#1f7a63] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">credit_card</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Payment Methods</h3>
                <p className="text-xs text-on-surface-variant font-medium">Przelewy24 / BLIK</p>
              </div>
            </div>
            <button onClick={() => onShowNotificationToast("🔒 Payment method settings are securely managed by Przelewy24.")} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span>Manage</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Wallet credit list */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100/35 p-2 rounded-xl text-brand-amber flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Wallet balance</h3>
                <p className="text-xs text-on-surface-variant font-medium">PLN {walletCredits.toFixed(2)} active credits</p>
              </div>
            </div>
            <button onClick={() => onShowNotificationToast(`👛 Current subscription credit balance: PLN ${walletCredits.toFixed(2)}`)} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span>View</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Loyalty points card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-red-50 p-2 rounded-xl text-brand-red flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Loyalty points</h3>
                <p className="text-xs text-on-surface-variant font-medium">{points} reward pts accumulation</p>
              </div>
            </div>
            <button onClick={() => onShowNotificationToast(`🎁 Total available rewards points: ${points} points.`)} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span>View</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Referral Card */}
          <div className="bg-primary hover:bg-[#155a49] text-white rounded-2xl p-5 shadow-md flex items-center justify-between overflow-hidden relative transition-all duration-300">
            <div className="flex items-center gap-4 z-10">
              <div className="bg-white/20 p-2.5 rounded-xl">
                <span className="material-symbols-outlined text-white text-[24px]">redeem</span>
              </div>
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-white">🎁 Referral Programme</h3>
                <p className="text-xs text-white/80 font-medium">Invite friends, earn PLN 15 voucher</p>
              </div>
            </div>
            <button onClick={handleShareReferral} className="bg-white hover:bg-slate-50 text-primary px-5 py-2 rounded-full font-bold text-xs z-10 transition-transform active:scale-95 shadow">
              Share
            </button>
            <div className="absolute right-[-20px] top-[-10px] opacity-10 pointer-events-none">
              <span className="material-symbols-outlined text-[120px]">redeem</span>
            </div>
          </div>

          {/* Danger zone actions */}
          <div className="mt-6 mb-4 flex flex-col gap-3">
            <h4 className="text-[11px] font-bold text-[#6e7a74] px-1 uppercase tracking-widest">
              Account Actions
            </h4>
            <div className="bg-white rounded-2xl overflow-hidden border border-[#bec9c3]/20 shadow-sm divide-y divide-[#bec9c3]/20">
              <button onClick={() => setShowDangerDialog("Pause Subscription")} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left">
                <span className="material-symbols-outlined text-[#F59E0B]">pause_circle</span>
                <span className="font-bold text-[13px] text-[#F59E0B]">⏸ Pause Subscription</span>
              </button>
              <button onClick={() => setShowDangerDialog("Cancel Subscription")} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left">
                <span className="material-symbols-outlined text-brand-red">cancel</span>
                <span className="font-bold text-[13px] text-brand-red">❌ Cancel Subscription</span>
              </button>
              <button onClick={() => setShowDangerDialog("Delete My Account")} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left shadow-inner">
                <span className="material-symbols-outlined text-brand-red">delete</span>
                <span className="font-bold text-[13px] text-brand-red">🗑 Delete My Account (GDPR)</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation prompt modals */}
      {showDangerDialog && (<div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="text-[18px] font-extrabold text-on-surface">Confirm Action</h4>
            <p className="text-[13px] text-on-surface-variant font-medium leading-relaxed">
              Are you sure you want to proceed with <strong>"{showDangerDialog}"</strong>? This may affect your automated weekly billing cycle.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDangerDialog(null)} className="flex-1 border border-[#bec9c3] text-[#3e4945] py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform">
                Cancel
              </button>
              <button onClick={() => handleDangerActionConfirm(showDangerDialog)} className="flex-1 bg-brand-red text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-md">
                Confirm
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
