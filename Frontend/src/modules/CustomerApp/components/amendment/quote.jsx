import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dmbExtraCustomerAPI } from "@food/api";
import useMoney from "../../../../shared/payments/money";
import { getCurrentLanguage, tKey } from "@/shared/i18n";
import { errorText, errorCode, Notice } from "./ui";

/**
 * The server's price for a subscription (POST /dmb/payments/quote). It is the only price shown and charged:
 * checkout sends quote.totals.total back as expectedTotal and the server refuses a mismatch (409 PRICE_CHANGED).
 * `input` null → nothing requested yet. Re-quotes 350 ms after the selection stops changing.
 */
export function useQuote(input, { change } = {}) {
  const [state, setState] = useState({ quote: null, preview: null, error: "", code: "", loading: false });
  const key = input ? JSON.stringify({ input, change }) : "";
  const seq = useRef(0);

  useEffect(() => {
    if (!key) {
      setState({ quote: null, preview: null, error: "", code: "", loading: false });
      return undefined;
    }
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = change
          ? await dmbExtraCustomerAPI.previewChange(change.subscriptionId, change.type, change.input)
          : await dmbExtraCustomerAPI.quote(input);
        if (my !== seq.current) return;
        const preview = res.data?.preview || null;
        setState({ quote: preview ? preview.quote : res.data?.quote, preview, error: "", code: "", loading: false });
      } catch (err) {
        if (my !== seq.current) return;
        setState({ quote: err?.response?.data?.quote || null, preview: null, error: errorText(err, "Could not calculate the price"), code: errorCode(err), loading: false });
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = () => {
    seq.current += 1;
    setState((s) => ({ ...s, loading: true }));
    const my = seq.current;
    const p = change ? dmbExtraCustomerAPI.previewChange(change.subscriptionId, change.type, change.input) : dmbExtraCustomerAPI.quote(input);
    return p
      .then((res) => {
        if (my !== seq.current) return null;
        const preview = res.data?.preview || null;
        const quote = preview ? preview.quote : res.data?.quote;
        setState({ quote, preview, error: "", code: "", loading: false });
        return quote;
      })
      .catch((err) => {
        if (my === seq.current) setState({ quote: null, preview: null, error: errorText(err, "Could not calculate the price"), code: errorCode(err), loading: false });
        return null;
      });
  };

  return { ...state, refresh };
}

const LINE_LABELS = {
  food: tKey("Meals"),
  family_discount: tKey("Family Box discount"),
  annual_discount: tKey("Annual plan discount"),
  trial_discount: tKey("First-week trial discount"),
  food_vat: tKey("Food VAT"),
  delivery: tKey("Delivery"),
  delivery_vat: tKey("Delivery VAT"),
  platform_fee: tKey("Platform fee (one-time)"),
};

/** Price breakdown from a server quote, with the EU-required trial disclosure (Gap D) and annual terms (Gap C). */
export function QuoteSummary({ quote, loading, error, compact = false }) {
  const { t } = useTranslation("customer");
  const { money } = useMoney({ zoneId: quote?.zoneId });
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!quote) {
    return loading ? (
      <div className="bg-white rounded-2xl p-4 border border-[#e4e2e1] animate-pulse h-28" />
    ) : null;
  }
  const label = (line) => {
    const key = LINE_LABELS[line.key];
    if (line.key === "food_vat" || line.key === "delivery_vat") return t("{{label}} ({{rate}}%)", { label: t(key), rate: line.rate });
    return key ? t(key) : line.label;
  };
  const trial = quote.discounts?.trial;
  const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(getCurrentLanguage(), { day: "numeric", month: "short", year: "numeric" }) : "");
  const cycleLabel = { one_day: t("One day"), weekly: t("Weekly"), fortnightly: t("Fortnightly"), monthly: t("Monthly"), annual: t("Annual") }[quote.cycle] || quote.cycle;

  return (
    <div className={`bg-[#1F7A63]/5 rounded-2xl p-4 border border-primary/20 space-y-2 text-[13px] ${loading ? "opacity-60" : ""}`}>
      {!compact && (
        <div className="flex justify-between text-[#6e7a74]">
          <span>{t("{{cycle}} plan · {{count}} delivery days", { cycle: cycleLabel, count: quote.deliveryDates })}</span>
          <span className="font-semibold">{fmtDate(quote.startDate)} – {fmtDate(quote.endDate)}</span>
        </div>
      )}
      {quote.lines.map((line) => (
        <div key={line.key} className={`flex justify-between ${line.amount < 0 ? "text-emerald-700" : "text-[#6e7a74]"}`}>
          <span>{label(line)}</span>
          <span className="font-bold">{line.amount < 0 ? `−${money(-line.amount)}` : money(line.amount)}</span>
        </div>
      ))}
      <div className="border-t border-primary/20 pt-2 flex justify-between items-center">
        <span className="font-extrabold text-[#1b1c1c]">{t("Total")}</span>
        <span className="font-extrabold text-[18px] text-primary">{money(quote.totals.total)}</span>
      </div>
      {trial?.applied && (
        <Notice tone="success">
          {t("Trial offer: {{pct}}% off your deliveries until {{date}}. From then on the regular price applies — you can cancel any time before.", { pct: trial.pct, date: fmtDate(trial.endsAt) })}
        </Notice>
      )}
      {trial?.eligible && !trial.applied && trial.minOrderAmount > 0 && (
        <Notice tone="info">{t("Spend at least {{amount}} in your first week to get the trial discount.", { amount: money(trial.minOrderAmount) })}</Notice>
      )}
      {quote.cycle === "annual" && (
        <Notice tone="info">
          {t("Annual plan: paid upfront for 12 months{{discount}}. It renews automatically unless you cancel at least 30 days before it ends.", {
            discount: quote.discounts?.annualPct ? t(" with {{pct}}% off", { pct: quote.discounts.annualPct }) : "",
          })}
        </Notice>
      )}
      {quote.cycle === "fortnightly" && <Notice tone="info">{t("Fortnightly plan: deliveries every other week, billed every 2 weeks.")}</Notice>}
    </div>
  );
}
