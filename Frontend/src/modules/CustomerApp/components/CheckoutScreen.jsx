import { useEffect, useMemo, useState } from "react";
import { IMAGES } from "../types";
import { dmbCustomerAPI } from "@food/api";
import useDeliverySlots from "../../../shared/hooks/useDeliverySlots";
import { ArrowLeft, CheckCircle, Lock } from 'lucide-react';
import { useTranslation } from "react-i18next";
import useMoney from "../../../shared/payments/money";
import usePaymentMethods from "../../../shared/payments/usePaymentMethods";
import PaymentMethodPicker from "../../../shared/payments/PaymentMethodPicker";
import { continueHostedPayment, paymentRequestExtras } from "../../../shared/payments/api";
import { getCurrentLanguage } from "@/shared/i18n";
import { useQuote, QuoteSummary } from "./amendment/quote";
import { trackEvent } from "../../../shared/analytics/ga4";

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
  const { t } = useTranslation("customer");
  const [paying, setPaying] = useState(false);
  const { getSlot, window: slotWindow, label: slotName, icon: slotIcon } = useDeliverySlots();
  const plan = selectedPlanDetails || {};
  const methods = usePaymentMethods({ zoneId: plan.zoneId });
  const { money } = useMoney({ zoneId: plan.zoneId });
  const meals = plan.meals || [];
  const durationLabel = plan.durationLabel || "Weekly";

  // The server quote is the only price shown and charged (Amendment v2 Extra). Older drafts without a quoteInput are
  // converted so a checkout restored from sessionStorage still works.
  const quoteInput = useMemo(() => {
    if (!plan.vendorId) return null;
    if (plan.quoteInput) return plan.quoteInput;
    return {
      subscriptionPlanId: plan.subscriptionPlanId,
      vendorId: plan.vendorId,
      zoneId: plan.zoneId,
      meals: (plan.meals || []).map((m) => ({ mealPlanId: m.mealPlanId, quantity: m.quantity || 1 })),
      deliverySlots: plan.deliverySlots?.length ? plan.deliverySlots : plan.deliverySlot ? [plan.deliverySlot] : [],
      deliveryDays: plan.deliveryDays,
      startDate: plan.startDate || undefined,
    };
  }, [plan]);
  const { quote, loading: quoting, error: quoteError, refresh: refreshQuote } = useQuote(quoteInput);
  useEffect(() => {
    if (plan.vendorId) trackEvent("checkout_began", { vendor_id: plan.vendorId, value: plan.expectedTotal || undefined });
  }, [plan.vendorId]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPrice = quote?.totals?.total ?? 0;
  const deliveryDays = plan.quoteInput?.deliveryDays === "custom" ? t("Custom days") : plan.deliveryDays === "full_week" || plan.quoteInput?.deliveryDays === "full_week" ? t("Full Week") : t("Mon – Fri");
  const describeSlot = (key) => {
    if (!key) return "";
    const win = slotWindow(key);
    return `${slotIcon(key)} ${slotName(key)}${win ? ` (${win})` : ""}`;
  };
  const slotKeys = plan.quoteInput?.deliverySlots || plan.deliverySlots || (plan.deliverySlot ? [plan.deliverySlot] : []);
  const slotLabel = slotKeys.map(describeSlot).join(" + ");

  const handlePayment = async () => {
    if (paying) return;
    const token = localStorage.getItem("user_accessToken");
    if (!token) {
      onShowNotificationToast(t("⚠️ Please log in to subscribe"));
      return;
    }

    setPaying(true);
    try {
      // Step 1: Create the order on the backend. The server picks the payment provider for the customer's country
      // (or uses the one they chose) and returns what to do next.
      if (!quote) {
        setPaying(false);
        return;
      }
      const orderRes = await dmbCustomerAPI.createSubscriptionOrder({
        ...quoteInput,
        ...(plan.addressId ? { addressId: plan.addressId } : { deliveryAddress: plan.deliveryAddress }),
        expectedTotal: quote.totals.total, // the server refuses a different price (409 PRICE_CHANGED)
        invoiceType: invoicePrefs?.receiptType === "vat" ? "b2b_vat" : "receipt",
        companyNip: invoicePrefs?.nipVat || undefined,
        companyName: invoicePrefs?.companyName || undefined,
        billingEmail: invoicePrefs?.billingEmail || undefined,
        ...paymentRequestExtras({ provider: methods.selected, zoneId: plan.zoneId, returnPath: "/user/home", cancelPath: "/user/checkout" }),
      });

      // Step 2a: Przelewy24 / Stripe: leave for the provider's page. The webhook activates the subscription and the
      // return page brings the customer back.
      const { redirected } = await continueHostedPayment(orderRes.data.payment, { panel: "user" });
      if (redirected) return;

      // Step 2b: Razorpay: pay inside the pop-up.
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        onShowNotificationToast(" " + t("Razorpay failed to load. Check network."));
        setPaying(false);
        return;
      }

      const { razorpayOrderId, razorpayKeyId, amount, currency, subscription: subData, payment } = orderRes.data;

      const options = {
        key: razorpayKeyId || RAZORPAY_KEY_ID,
        amount,
        currency: currency || "INR",
        name: "DailyMealBox",
        description: t("Subscription: {{durationLabel}} ({{deliveryDays}})", { durationLabel, deliveryDays }),
        image: plan.vendorImage || undefined,
        order_id: razorpayOrderId,
        handler: async (response) => {
          try {
            // Step 3: Verify payment + activate subscription
            await dmbCustomerAPI.verifySubscriptionPayment({
              transactionId: payment?.transactionId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              subscriptionId: subData.subscriptionId || subData._id,
            });
            onConfirmSubscription();
          } catch (err) {
            onShowNotificationToast("Payment verification failed: " + (err?.response?.data?.message || err.message));
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
            onShowNotificationToast(t("Payment cancelled"));
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        onShowNotificationToast(" Payment failed: " + resp.error.description);
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      if (err?.response?.data?.code === "PRICE_CHANGED") {
        await refreshQuote();
        onShowNotificationToast(t("The price has changed. Please review the new total and pay again."));
      } else {
        const msg = err?.response?.data?.message || err.message || t("Failed to initiate payment");
        onShowNotificationToast(" " + msg);
      }
      setPaying(false);
    }
  };

  // No plan to check out (draft expired, private browsing, or this page was opened directly — e.g. the browser's
  // Back button after a hosted payment page can reload the app fresh and lose the in-memory selection). Never show
  // a checkout with a payable PLN 0.00 button; send the customer back to pick a plan instead.
  if (!plan.vendorId) {
    return (
      <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-3xl">🛒</div>
        <h1 className="text-lg font-extrabold">{t("Nothing to check out")}</h1>
        <p className="text-sm text-[#6e7a74] max-w-xs">{t("Your plan selection has expired or wasn't found. Please pick a plan again.")}</p>
        <button onClick={onGoBack} className="mt-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white">
          {t("Browse Plans")}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-screen pb-32">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-5 h-14 bg-white sticky top-0 z-40 border-b border-[#bec9c3]/20 shadow-sm">
        <button onClick={onGoBack} aria-label={t("Go back")} className="flex items-center active:scale-95 transition-all text-primary">
          <ArrowLeft className="text-[24px]" />
        </button>
        <h1 className="text-[17px] font-extrabold text-[#1b1c1c]">{t("Checkout")}</h1>
        <div className="w-9 h-9 rounded-full overflow-hidden border border-[#bec9c3]/50 bg-primary/10 flex items-center justify-center text-primary font-bold text-[14px]">
          U
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
              <p className="text-[13px] text-[#6e7a74] mt-0.5">{t("{{durationLabel}} Plan", { durationLabel })}</p>
            </div>
          </div>
        )}

        {/* Order Summary */}
        <section>
          <h2 className="text-[17px] font-extrabold mb-3 text-[#1b1c1c]">{t("Order Summary")}</h2>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#e4e2e1]/30 space-y-3">

            {/* Selected Meals List */}
            {meals.length > 0 && <div className="space-y-2">
              <p className="text-[12px] font-bold text-[#6e7a74] uppercase tracking-wider mb-1">{t("Selected Meals")}</p>
              {meals.map((item, idx) => (
                <div key={item.mealPlanId || idx} className="flex justify-between text-[14px]">
                  <span className="text-[#1b1c1c] font-medium">{item.name}</span>
                  <span className="font-semibold text-[#6e7a74]">{t("{{price}}/day", { price: money(item.pricePerDay, { compact: true }) })}</span>
                </div>
              ))}
            </div>}
            {quote?.familyBox?.members?.length > 0 && (
              <p className="text-[13px] text-[#1b1c1c] font-medium">{t("Family Box · {{n}} people", { n: quote.familyBox.members.length })}</p>
            )}
            {quote?.rotation?.length > 0 && (
              <div className="space-y-1">
                {quote.rotation.map((r) => (
                  <p key={r.vendorId} className="text-[13px] flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />{r.vendorName}</p>
                ))}
              </div>
            )}

            <div className="border-t border-[#f0eded] pt-3 space-y-2">
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">{t("Duration")}</span>
                <span className="font-bold">{durationLabel}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">{t("Schedule")}</span>
                <span className="font-bold">{deliveryDays}</span>
              </div>
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">{t("Time Slot")}</span>
                <span className="font-bold">{slotLabel}</span>
              </div>
              {plan.startDate && (
                <div className="flex justify-between text-[14px]">
                  <span className="text-[#6e7a74] font-medium">{t("🗓️ Start Date")}</span>
                  <span className="font-bold text-primary">
                    {new Date(plan.startDate).toLocaleDateString(getCurrentLanguage(), { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[14px]">
                <span className="text-[#6e7a74] font-medium">{t("Delivery Address")}</span>
                <span className="font-bold text-right max-w-[180px] text-[12px] leading-snug">
                  {plan.addressText || (typeof plan.deliveryAddress === 'object' ? (plan.deliveryAddress?.street || plan.deliveryAddress?.address) : (plan.deliveryAddress || "—"))}
                </span>
              </div>

            </div>

            <QuoteSummary quote={quote} loading={quoting} error={quoteError} />
          </div>
        </section>

        {/* Invoice Preference */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold text-[#6e7a74] uppercase tracking-widest">{t("Invoice Preference")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setInvoicePrefs({ ...invoicePrefs, receiptType: "simple" })}
              className={`py-3 px-4 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${(invoicePrefs?.receiptType || "simple") === "simple"
                  ? "bg-[#1F7A63] text-white"
                  : "border border-primary text-primary bg-white hover:bg-slate-50"
                }`}
            >
              {(invoicePrefs?.receiptType || "simple") === "simple" && (
                <CheckCircle className="text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
              )}
              <span>{t("Simple Receipt")}</span>
            </button>
            <button
              onClick={() => {
                setInvoicePrefs({ ...invoicePrefs, receiptType: "vat" });
                onShowNotificationToast(t("💼 Switched to B2B Full Invoice mode."));
                setTimeout(() => onGoToInvoiceSettings(), 700);
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm ${invoicePrefs?.receiptType === "vat"
                  ? "bg-[#1F7A63] text-white"
                  : "border border-primary text-primary bg-white hover:bg-slate-50"
                }`}
            >
              {invoicePrefs?.receiptType === "vat" && (
                <CheckCircle className="text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
              )}
              <span>{t("VAT Invoice (B2B)")}</span>
            </button>
          </div>
        </section>

        {/* Payment Method */}
        <section className="space-y-3">
          <h2 className="text-[13px] font-bold text-[#6e7a74] uppercase tracking-widest">{t("Payment")}</h2>
          <PaymentMethodPicker
            providers={methods.providers}
            selected={methods.selected}
            onSelect={methods.setSelected}
            loading={methods.loading}
            error={methods.error}
          />
        </section>

        {/* CTA */}
        <div className="pt-2 space-y-4">
          <button
            onClick={handlePayment}
            disabled={paying || !plan.vendorId || methods.loading || !methods.providers.length || !quote || quoting || Boolean(quoteError)}
            className="w-full bg-[#1F7A63] disabled:opacity-60 hover:bg-[#155a49] text-white py-4 rounded-2xl font-extrabold text-[15px] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {paying ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("Processing...")}
              </>
            ) : (
              <>
                <Lock className="text-[20px]" />
                {t("Pay {{totalPrice}} & Subscribe", { totalPrice: money(totalPrice) })}
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-[#6e7a74] leading-relaxed px-4">
            {t("🔒 Secure payment · By subscribing, you agree to our Terms of Service and auto-renewal policy.")}
          </p>
        </div>
      </main>
    </div>
  );
}
