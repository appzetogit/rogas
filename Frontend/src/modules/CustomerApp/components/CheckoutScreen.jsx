import { useState } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI } from "@food/api";

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || "rzp_test_Sp9r61lI2A4BxN";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function CheckoutScreen({
  onGoBack,
  onConfirmSubscription,
  onGoToInvoiceSettings,
  onShowNotificationToast,
  invoicePrefs,
  setInvoicePrefs,
  selectedPlanDetails,
}) {
  const [paying, setPaying] = useState(false);
  const plan = selectedPlanDetails || {};
  const pricing = plan.pricing || {};
  const meals = plan.meals || [];
  const durationLabel = plan.durationLabel || "Weekly";

  const basePricePerDay = pricing.basePricePerDay || 0;
  const totalPrice = pricing.totalPrice || 0;
  const deliveryDays = plan.deliveryDays === "full_week" ? "Full Week" : "Mon – Fri";
  const slotLabel = { breakfast: "☀️ Breakfast (7–9 AM)", lunch: "🌤️ Lunch (12–2 PM)", dinner: "🌙 Dinner (7–9 PM)" }[plan.deliverySlot] || "Lunch";

  const handleRazorpayPayment = async () => {
    if (paying) return;
    const token = localStorage.getItem("user_accessToken");
    if (!token) {
      onShowNotificationToast("⚠️ Please log in to subscribe");
      return;
    }

    setPaying(true);
    try {
      // Step 1: Load Razorpay script
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        onShowNotificationToast("❌ Razorpay failed to load. Check network.");
        setPaying(false);
        return;
      }

      // Step 2: Create order on backend
      const orderRes = await dmbCustomerAPI.createSubscriptionOrder({
        vendorId: plan.vendorId,
        meals: plan.meals, // array of { mealPlanId, quantity }
        duration: plan.duration,
        deliveryDays: plan.deliveryDays,
        deliverySlot: plan.deliverySlot,
        deliveryAddress: plan.deliveryAddress,
        pricing: plan.pricing, // containing totalPrice and basePricePerDay
        invoiceType: invoicePrefs?.receiptType || "receipt",
      });

      const { razorpayOrderId, razorpayKeyId, amount, subscription: subData } = orderRes.data;

      // Step 3: Open Razorpay checkout
      const options = {
        key: razorpayKeyId || RAZORPAY_KEY_ID,
        amount,
        currency: "INR",
        name: "DailyMealBox",
        description: `Subscription: ${durationLabel} (${deliveryDays})`,
        image: plan.vendorImage || undefined,
        order_id: razorpayOrderId,
        handler: async (response) => {
          try {
            // Step 4: Verify payment + activate subscription
            await dmbCustomerAPI.verifySubscriptionPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              subscriptionId: subData.subscriptionId || subData._id,
            });
            onConfirmSubscription();
          } catch (err) {
            onShowNotificationToast("❌ Payment verification failed: " + (err?.response?.data?.message || err.message));
          }
        },
        prefill: {
          name: invoicePrefs?.companyName || "",
          email: invoicePrefs?.billingEmail || "",
        },
        theme: { color: "#1F7A63" },
        modal: {
          ondismiss: () => {
            setPaying(false);
            onShowNotificationToast("Payment cancelled");
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        onShowNotificationToast("❌ Payment failed: " + resp.error.description);
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || "Failed to initiate payment";
      onShowNotificationToast("❌ " + msg);
      setPaying(false);
    }
  };

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-screen pb-32">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-5 h-14 bg-white sticky top-0 z-40 border-b border-[#bec9c3]/20 shadow-sm">
        <button onClick={onGoBack} aria-label="Go back" className="flex items-center active:scale-95 transition-all text-primary">
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="text-[17px] font-extrabold text-[#1b1c1c]">Checkout</h1>
        <div className="w-9 h-9 rounded-full overflow-hidden border border-[#bec9c3]/50">
          <img alt="Profile" className="w-full h-full object-cover" src={IMAGES.profileWomanRoundAvatarCheckout} />
        </div>
      </header>

      <main className="px-5 mt-5 space-y-5">
        {/* Vendor & Plan Info */}
        {plan.vendorName && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e4e2e1]/50 flex items-center gap-4">
            {plan.vendorImage && (
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                <img src={plan.vendorImage} alt={plan.vendorName} className="w-full h-full object-cover" />
              </div>
            )}
            <div>
              <p className="font-extrabold text-[15px] text-[#1b1c1c]">{plan.vendorName}</p>
              <p className="text-[13px] text-[#6e7a74] mt-0.5">{durationLabel} Plan</p>
            </div>
          </div>
        )}

        {/* Order Summary */}
        <section>
          <h2 className="text-[17px] font-extrabold mb-3 text-[#1b1c1c]">Order Summary</h2>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e4e2e1]/30 space-y-3">
            
            {/* Selected Meals List */}
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-[#6e7a74] uppercase tracking-wider mb-1">Selected Meals</p>
              {meals.map((item, idx) => (
                <div key={item.mealPlanId || idx} className="flex justify-between text-[14px]">
                  <span className="text-[#1b1c1c] font-medium">{item.name}</span>
                  <span className="font-semibold text-[#6e7a74]">₹{item.pricePerDay}/day</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#f0eded] pt-3 space-y-2">
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">Daily Base Rate</span>
                <span className="font-bold">₹{basePricePerDay}/day</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">Duration</span>
                <span className="font-bold">{durationLabel}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">Schedule</span>
                <span className="font-bold">{deliveryDays}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">Time Slot</span>
                <span className="font-bold">{slotLabel}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">Delivery Address</span>
                <span className="font-bold text-right max-w-[180px] text-[12px] leading-snug">{plan.deliveryAddress || "—"}</span>
              </div>
            </div>

            <div className="border-t border-[#f0eded] pt-3 flex justify-between items-center">
              <span className="text-[15px] font-extrabold text-[#1b1c1c]">Total Amount</span>
              <span className="text-[20px] font-extrabold text-primary">₹{totalPrice}</span>
            </div>
          </div>
        </section>

        {/* Invoice Preference */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold text-[#6e7a74] uppercase tracking-widest">Invoice Preference</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setInvoicePrefs({ ...invoicePrefs, receiptType: "simple" })}
              className={`py-3 px-4 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${
                (invoicePrefs?.receiptType || "simple") === "simple"
                  ? "bg-[#1F7A63] text-white"
                  : "border border-primary text-primary bg-white hover:bg-slate-50"
              }`}
            >
              {(invoicePrefs?.receiptType || "simple") === "simple" && (
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              )}
              <span>Simple Receipt</span>
            </button>
            <button
              onClick={() => {
                setInvoicePrefs({ ...invoicePrefs, receiptType: "vat" });
                onShowNotificationToast("💼 Switched to B2B Full Invoice mode.");
                setTimeout(() => onGoToInvoiceSettings(), 700);
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${
                invoicePrefs?.receiptType === "vat"
                  ? "bg-[#1F7A63] text-white"
                  : "border border-primary text-primary bg-white hover:bg-slate-50"
              }`}
            >
              {invoicePrefs?.receiptType === "vat" && (
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              )}
              <span>GST Invoice (B2B)</span>
            </button>
          </div>
        </section>

        {/* Payment Method */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold text-[#6e7a74] uppercase tracking-widest">Payment</h2>
          <div className="bg-white border border-[#e4e2e1]/30 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-xl">
              <span className="material-symbols-outlined text-primary">payments</span>
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#1b1c1c]">Razorpay</p>
              <p className="text-[12px] text-[#6e7a74]">UPI · Cards · Net Banking · Wallets</p>
            </div>
            <div className="ml-auto">
              <img src="https://razorpay.com/assets/razorpay-glyph.svg" alt="Razorpay" className="h-6" onError={(e) => e.target.style.display = "none"} />
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="pt-2 space-y-4">
          <button
            onClick={handleRazorpayPayment}
            disabled={paying || !plan.vendorId}
            className="w-full bg-[#1F7A63] disabled:opacity-60 hover:bg-[#155a49] text-white py-4 rounded-2xl font-extrabold text-[15px] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {paying ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">lock</span>
                Pay ₹{totalPrice} & Subscribe
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-[#6e7a74] leading-relaxed px-4">
            🔒 Secure payment via Razorpay · By subscribing, you agree to our Terms of Service and auto-renewal policy.
          </p>
        </div>
      </main>
    </div>
  );
}
