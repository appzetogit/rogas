import { useState } from "react";
import { IMAGES } from "../types";
export function CheckoutScreen({ onGoBack, onConfirmSubscription, onGoToInvoiceSettings, onShowNotificationToast, invoicePrefs, setInvoicePrefs }) {
    const [prefType, setPrefType] = useState(invoicePrefs.receiptType);
    const handlePrefToggle = (type) => {
        setPrefType(type);
        setInvoicePrefs({ ...invoicePrefs, receiptType: type });
        if (type === "vat") {
            onShowNotificationToast("💼 Switched to B2B Full VAT Invoice mode. Fill company parameters to complete.");
            // Go to invoice settings directly
            setTimeout(() => {
                onGoToInvoiceSettings();
            }, 800);
        }
        else {
            onShowNotificationToast("🧾 Switched to standard Simple Receipt (B2C).");
        }
    };
    return (<div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-5 h-14 bg-white sticky top-0 z-40 border-b border-[#bec9c3]/20 shadow-sm animate-in fade-in duration-300">
        <button onClick={onGoBack} aria-label="Go back" className="flex items-center active:scale-95 transition-all text-primary">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-[18px] font-extrabold text-primary-container">Checkout</h1>
        <div className="w-10 h-10 rounded-full overflow-hidden border border-[#bec9c3]/50">
          <img alt="Anna circular portrait thumbnail avatar" className="w-full h-full object-cover" src={IMAGES.profileWomanRoundAvatarCheckout}/>
        </div>
      </header>

      <main className="px-5 mt-6 space-y-6">
        {/* Order summary table */}
        <section>
          <h2 className="text-[18px] font-extrabold mb-4 text-[#1b1c1c]">Order Summary</h2>
          
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e4e2e1]/30">
            <p className="text-[11px] font-bold text-on-surface-variant mb-4 uppercase tracking-widest font-sans">
              PRICE BREAKDOWN (VAT included)
            </p>

            <div className="w-full">
              <table className="w-full text-left text-[13px] font-sans border-collapse">
                <thead>
                  <tr className="text-on-surface-variant text-[11px] font-bold border-b border-[#bec9c3]/30 pb-2">
                    <th className="pb-2">ITEM</th>
                    <th className="pb-2 text-right">NET</th>
                    <th className="pb-2 text-right">RATE</th>
                    <th className="pb-2 text-right">GROSS</th>
                  </tr>
                </thead>
                <tbody className="text-[#1b1c1c] font-medium leading-loose divide-y divide-[#f0eded]/40">
                  <tr>
                    <td className="py-3">Meal subs (5 meals)</td>
                    <td className="py-3 text-right">75.93</td>
                    <td className="py-3 text-right">8%</td>
                    <td className="py-3 text-right text-primary-container font-bold">82.00</td>
                  </tr>
                  <tr>
                    <td className="py-3">Delivery (5 del.)</td>
                    <td className="py-3 text-right">5.69</td>
                    <td className="py-3 text-right">23%</td>
                    <td className="py-3 text-right text-primary-container font-bold">7.00</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-4 border-t border-[#bec9c3]/30 space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold">
                <span>Subtotal (incl.):</span>
                <span>81.62 PLN</span>
              </div>
              <div className="flex justify-between items-center text-[12px] text-on-surface-variant font-medium">
                <span>Total VAT:</span>
                <span>7.38 PLN</span>
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#f0eded]">
                <span className="text-base font-extrabold text-primary-container tracking-tight">TOTAL / WEEK:</span>
                <span className="text-xl font-extrabold text-[#1f7a63]">89.00 PLN</span>
              </div>
            </div>
          </div>
        </section>

        {/* Info banner details */}
        <div className="bg-primary/5 text-primary-container rounded-xl p-4 flex items-start gap-3 border border-primary-container/10">
          <span className="material-symbols-outlined mt-0.5 text-primary-container">info</span>
          <p className="text-xs font-semibold leading-relaxed">
            Food VAT 8% → Vendor | Delivery VAT 23% → Fleet Partner
          </p>
        </div>

        {/* Invoice Preference selector */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
            INVOICE PREFERENCE
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handlePrefToggle("simple")} className={`py-3.5 px-4 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${prefType === "simple"
            ? "bg-primary-container text-white"
            : "border border-primary text-primary bg-white hover:bg-slate-50"}`}>
              {prefType === "simple" && (<span className="material-symbols-outlined text-[18px] font-fill-1">check_circle</span>)}
              <span>Simple receipt</span>
            </button>
            <button onClick={() => handlePrefToggle("vat")} className={`py-3.5 px-4 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${prefType === "vat"
            ? "bg-primary-container text-white"
            : "border border-primary text-primary bg-white hover:bg-slate-50"}`}>
              {prefType === "vat" && (<span className="material-symbols-outlined text-[18px] font-fill-1">check_circle</span>)}
              <span>Full VAT Invoice (B2B)</span>
            </button>
          </div>
        </section>

        {/* Payment Methods selector */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">
            PAYMENT METHOD
          </h2>
          <div className="bg-white border border-[#e4e2e1]/30 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/5 flex items-center justify-center rounded-xl text-primary">
                <span className="material-symbols-outlined">account_balance_wallet</span>
              </div>
              <div>
                <p className="text-[14px] font-bold text-[#1b1c1c]">Przelewy24 / BLIK</p>
                <p className="text-xs text-on-surface-variant font-medium">Instant payment enabled</p>
              </div>
            </div>
            <button onClick={() => onShowNotificationToast("🔒 Toggling multi payment providers requires setup from support portal.")} className="text-primary font-bold text-xs hover:opacity-85 active:scale-95 transition-all">
              Change &gt;
            </button>
          </div>
        </section>

        {/* CTAs */}
        <div className="pt-4 space-y-4">
          <button onClick={onConfirmSubscription} className="w-full bg-primary-container hover:bg-[#155a49] text-white py-4 rounded-2xl font-bold text-[15px] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <span>Confirm Subscription</span>
          </button>
          <p className="text-center text-[12px] text-on-surface-variant leading-relaxed px-5">
            By clicking "Confirm Subscription", you agree to the Terms of Service and recurring payment schedule.
          </p>
        </div>
      </main>
    </div>);
}
