import { useTranslation } from "react-i18next";

/**
 * "How do you want to pay?" One provider is shown as information (nothing to choose); several become a radio list.
 * `providers` is the list from usePaymentMethods().
 */
export default function PaymentMethodPicker({ providers, selected, onSelect, loading, error, className = "" }) {
  const { t } = useTranslation("common");

  const describe = (id) => {
    if (id === "przelewy24") return { title: t("Przelewy24 / BLIK"), hint: t("BLIK, bank transfer and cards") };
    if (id === "stripe") return { title: t("Card, Apple Pay, Google Pay"), hint: t("Secure card payment by Stripe") };
    if (id === "razorpay") return { title: t("Razorpay"), hint: t("UPI · Cards · Net Banking · Wallets") };
    if (id === "mock") return { title: t("Test payment"), hint: t("Instant payment for development only") };
    return { title: id, hint: "" };
  };

  if (loading) {
    return <div className={`rounded-2xl border border-[#e4e2e1]/30 bg-white p-4 text-[13px] text-[#6e7a74] ${className}`}>{t("Loading payment methods...")}</div>;
  }
  if (error || !providers?.length) {
    return (
      <div className={`rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800 ${className}`} role="alert">
        {t("No payment method is available for your region right now. Please contact support.")}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`} role={providers.length > 1 ? "radiogroup" : undefined} aria-label={t("Payment method")}>
      {providers.map((p) => {
        const { title, hint } = describe(p.id);
        const active = providers.length === 1 || selected === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role={providers.length > 1 ? "radio" : undefined}
            aria-checked={providers.length > 1 ? active : undefined}
            disabled={providers.length === 1}
            onClick={() => onSelect?.(p.id)}
            className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
              active ? "border-primary ring-1 ring-primary/40" : "border-[#e4e2e1]/60"
            } ${providers.length === 1 ? "cursor-default" : "cursor-pointer"}`}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border ${active ? "border-primary" : "border-gray-300"}`}
            >
              {active && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold text-[#1b1c1c]">{title}</span>
              {hint && <span className="block text-[12px] text-[#6e7a74]">{hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
