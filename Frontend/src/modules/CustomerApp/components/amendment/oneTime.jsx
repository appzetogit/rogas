import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Minus, Plus, Clock, ShoppingBag } from "lucide-react";
import { dmbExtraCustomerAPI } from "@food/api";
import useMoney from "../../../../shared/payments/money";
import usePlatformConfig from "../../../../shared/platform/usePlatformConfig";
import usePaymentMethods from "../../../../shared/payments/usePaymentMethods";
import PaymentMethodPicker from "../../../../shared/payments/PaymentMethodPicker";
import { completePayment, paymentRequestExtras } from "../../../../shared/payments/api";
import { getCurrentLanguage, tKey } from "@/shared/i18n";
import { ScreenHeader, Section, Chip, Notice, PrimaryButton, Spinner, TemperatureBadge, errorText, errorCode } from "./ui";
import { AddressPicker } from "./addresses";

const localDateStr = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDay = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString(getCurrentLanguage(), { weekday: "short", day: "numeric", month: "short" }) : "");

/**
 * Gap AG — Select mode: buy a single meal for today or tomorrow without subscribing (ACM-173). Uses live stock
 * (Gap E): sold-out meals are shown but cannot be bought. After delivery the customer is invited to subscribe.
 */
export function SelectModeScreen({ onGoBack, onGoToPlans }) {
  const { t } = useTranslation("customer");
  const [address, setAddress] = useState(null);
  const zoneId = address?.zoneId ? String(address.zoneId) : "";
  const { get, loading: cfgLoading } = usePlatformConfig(zoneId || undefined);
  const { money } = useMoney(zoneId ? { zoneId } : {});
  const methods = usePaymentMethods({ zoneId, enabled: Boolean(zoneId) });
  const [date, setDate] = useState(localDateStr(0));
  const [slot, setSlot] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);
  const [qty, setQty] = useState(1);
  const [paying, setPaying] = useState(false);
  const [temp, setTemp] = useState("");

  const load = useCallback(async () => {
    if (!zoneId) return;
    setLoading(true);
    setError("");
    try {
      const res = await dmbExtraCustomerAPI.selectMeals({ zoneId, date, slot: slot || undefined, temperature: temp || undefined });
      setData(res.data);
      if (!slot && res.data?.slot) setSlot(res.data.slot);
    } catch (err) {
      setData(null);
      setError(errorText(err, t("Could not load today's meals")));
    } finally {
      setLoading(false);
    }
  }, [zoneId, date, slot, temp, t]);

  useEffect(() => {
    load();
  }, [load]);

  const enabled = get("selectMode").enabled;
  const tempDisplay = get("temperatureLabels").display || "both";

  const buy = async () => {
    if (!picked || !address) return;
    setPaying(true);
    setError("");
    try {
      const res = await dmbExtraCustomerAPI.createSelectOrder({
        mealPlanId: picked.mealPlanId,
        quantity: qty,
        date,
        slot,
        addressId: address._id,
        ...paymentRequestExtras({ provider: methods.selected, zoneId, returnPath: "/user/one-time-orders", cancelPath: "/user/select" }),
      });
      await completePayment(res.data.payment, { panel: "user" });
    } catch (err) {
      if (err?.message === "cancelled") setError(t("Payment cancelled"));
      else if (errorCode(err) === "PRICE_CHANGED") setError(t("The price has changed. Please review and confirm again."));
      else setError(errorText(err, t("Could not place the order")));
      load();
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-28">
      <ScreenHeader title={t("Order a single meal")} onBack={onGoBack} />
      <main className="px-5 pt-5 max-w-2xl mx-auto space-y-5">
        <AddressPicker value={address} onChange={(a) => { setAddress(a); setPicked(null); }} />
        {cfgLoading && zoneId ? (
          <Spinner />
        ) : zoneId && !enabled ? (
          <Notice tone="info">{t("Single-meal ordering is not available in your area. Subscribe to get daily meals.")}</Notice>
        ) : zoneId ? (
          <>
            <Section title={t("When")}>
              <div className="flex gap-2 flex-wrap">
                <Chip active={date === localDateStr(0)} onClick={() => { setDate(localDateStr(0)); setPicked(null); }}>{t("Today")}</Chip>
                <Chip active={date === localDateStr(1)} onClick={() => { setDate(localDateStr(1)); setPicked(null); }}>{t("Tomorrow")}</Chip>
              </div>
              {data?.slots?.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {data.slots.map((s) => (
                    <Chip key={s.key} active={slot === s.key} onClick={() => { setSlot(s.key); setPicked(null); }}>
                      {s.icon} {s.name} · {s.startTime}–{s.endTime}
                    </Chip>
                  ))}
                </div>
              )}
              {tempDisplay === "both" && (
                <div className="flex gap-2">
                  <Chip active={!temp} onClick={() => setTemp("")}>{t("All")}</Chip>
                  <Chip active={temp === "hot"} onClick={() => setTemp("hot")}>{t("🔥 Hot")}</Chip>
                  <Chip active={temp === "cold"} onClick={() => setTemp("cold")}>{t("❄️ Cold")}</Chip>
                </div>
              )}
            </Section>

            {error && <Notice tone="error">{error}</Notice>}
            {loading ? (
              <Spinner label={t("Loading meals...")} />
            ) : data?.holiday ? (
              <Notice tone="info">{t("We are closed for a holiday on this day.")}</Notice>
            ) : data?.orderingClosed ? (
              <Notice tone="warn">{t("Ordering for this slot has closed. Try the next slot or tomorrow.")}</Notice>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(data?.meals || []).length === 0 && <Notice tone="info">{t("No meals available for this slot.")}</Notice>}
                {(data?.meals || []).map((m) => (
                  <button
                    key={`${m.mealPlanId}`}
                    type="button"
                    disabled={m.soldOut}
                    onClick={() => { setPicked(m); setQty(1); }}
                    className={`text-left bg-white rounded-2xl border-2 p-3 flex gap-3 ${picked?.mealPlanId === m.mealPlanId ? "border-primary" : "border-transparent"} ${m.soldOut ? "opacity-50" : ""}`}
                  >
                    {m.photo ? <img src={typeof m.photo === "string" ? m.photo : m.photo?.url} alt={m.name} className="w-16 h-16 rounded-xl object-cover" /> : <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">🍲</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-[14px] truncate">{m.name}</p>
                      <p className="text-[11px] text-[#6e7a74] truncate">{m.vendorName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[13px] font-extrabold text-primary">{money(m.price)}</span>
                        <TemperatureBadge type={m.temperatureType} />
                      </div>
                      {m.soldOut ? (
                        <p className="text-[11px] font-bold text-red-600 mt-1">{t("Sold out")}</p>
                      ) : m.remaining !== null && m.remaining !== undefined && m.remaining <= 5 ? (
                        <p className="text-[11px] font-bold text-amber-700 mt-1">{t("Only {{n}} left", { n: m.remaining })}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {picked && (
              <Section title={t("Your order")} className="bg-white rounded-2xl p-4 border border-[#e4e2e1]">
                <div className="flex items-center justify-between">
                  <p className="font-extrabold text-[14px]">{picked.name}</p>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label={t("Less")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center"><Minus size={14} /></button>
                    <span className="font-extrabold w-5 text-center">{qty}</span>
                    <button type="button" aria-label={t("More")} onClick={() => setQty((q) => Math.min(picked.remaining ?? 10, 10, q + 1))} className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center"><Plus size={14} /></button>
                  </div>
                </div>
                <div className="text-[13px] text-[#6e7a74] space-y-1">
                  <div className="flex justify-between"><span>{t("Meals")}</span><span className="font-bold">{money(picked.price * qty)}</span></div>
                  <div className="flex justify-between"><span>{t("Delivery (single order)")}</span><span className="font-bold">{money(data?.deliveryFee || 0)}</span></div>
                  <p className="text-[11px]">{t("Final price incl. VAT is confirmed on the payment page.")}</p>
                </div>
                <PaymentMethodPicker providers={methods.providers} selected={methods.selected} onSelect={methods.setSelected} loading={methods.loading} error={methods.error} />
                <PrimaryButton busy={paying} disabled={!methods.providers.length} onClick={buy}>
                  <ShoppingBag size={18} /> {t("Pay and order")}
                </PrimaryButton>
              </Section>
            )}
            <button type="button" onClick={onGoToPlans} className="w-full text-center text-[13px] font-bold text-primary underline">
              {t("Eat with us every day? See subscription plans")}
            </button>
          </>
        ) : null}
      </main>
    </div>
  );
}

/** Gap M — reserve a meal before it launches. The wallet is charged on launch day; otherwise the customer pays then. */
export function PreOrderDialog({ meal, vendorName, onClose }) {
  const { t } = useTranslation("customer");
  const [address, setAddress] = useState(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const { money } = useMoney(address?.zoneId ? { zoneId: String(address.zoneId) } : {});

  const reserve = async () => {
    if (!address) return;
    setSaving(true);
    setError("");
    try {
      const res = await dmbExtraCustomerAPI.reservePreOrder({ mealPlanId: meal._id, quantity: qty, addressId: address._id });
      setDone(res.data?.reservation);
    } catch (err) {
      setError(errorText(err, t("Could not reserve this meal")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">{t("Pre-order")}</p>
            <h3 className="text-[17px] font-extrabold">{meal.name}</h3>
            <p className="text-[12px] text-[#6e7a74]">{vendorName} · {t("Launches {{date}}", { date: fmtDay(meal.launchDate) })}</p>
          </div>
          <button type="button" aria-label={t("Close")} onClick={onClose} className="w-9 h-9 rounded-full bg-[#f5f5f0] flex items-center justify-center"><X size={18} /></button>
        </div>
        {done ? (
          <>
            <Notice tone="success">
              {t("Reserved! On {{date}} we charge {{amount}} to your wallet. If your wallet balance is too low, we'll ask you to pay in the app that morning.", { date: fmtDay(done.deliveryDate), amount: money(done.pricing?.totalPrice || 0) })}
            </Notice>
            <PrimaryButton onClick={onClose}>{t("Done")}</PrimaryButton>
          </>
        ) : (
          <>
            <AddressPicker value={address} onChange={setAddress} />
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">{t("Portions")}</span>
              <div className="flex items-center gap-2">
                <button type="button" aria-label={t("Less")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center"><Minus size={14} /></button>
                <span className="font-extrabold w-5 text-center">{qty}</span>
                <button type="button" aria-label={t("More")} onClick={() => setQty((q) => Math.min(10, q + 1))} className="w-8 h-8 rounded-full bg-[#f5f5f0] flex items-center justify-center"><Plus size={14} /></button>
              </div>
            </div>
            <p className="text-[12px] text-[#6e7a74]">{t("{{price}} per portion plus delivery. Nothing is charged now — you can cancel until the day before launch.", { price: money(meal.pricePerDay) })}</p>
            {error && <Notice tone="error">{error}</Notice>}
            <PrimaryButton busy={saving} disabled={!address} onClick={reserve}>
              <Clock size={16} /> {t("Reserve")}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL = {
  reserved: tKey("Reserved"),
  payment_pending: tKey("Waiting for payment"),
  pending_payment: tKey("Waiting for payment"),
  paid: tKey("Confirmed"),
  cancelled: tKey("Cancelled"),
  failed: tKey("Failed"),
};

/** Single meals and pre-orders (Gap AG / M). */
export function OneTimeOrdersScreen({ onGoBack }) {
  const { t } = useTranslation("customer");
  const { money } = useMoney({});
  const methods = usePaymentMethods({});
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dmbExtraCustomerAPI.myOneTimeOrders();
      setOrders(res.data?.orders || []);
      setError("");
    } catch (err) {
      setError(errorText(err, t("Could not load your orders")));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (o) => {
    if (!window.confirm(t("Cancel this reservation?"))) return;
    setBusy(o._id);
    try {
      await dmbExtraCustomerAPI.cancelPreOrder(o._id);
      await load();
    } catch (err) {
      setError(errorText(err, t("Could not cancel")));
    } finally {
      setBusy("");
    }
  };
  const pay = async (o) => {
    setBusy(o._id);
    try {
      const res = await dmbExtraCustomerAPI.payPreOrder(o._id, paymentRequestExtras({ provider: methods.selected, zoneId: o.zoneId, returnPath: "/user/one-time-orders", cancelPath: "/user/one-time-orders" }));
      await completePayment(res.data.payment, { panel: "user" });
    } catch (err) {
      setError(err?.message === "cancelled" ? t("Payment cancelled") : errorText(err, t("Could not start the payment")));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-28">
      <ScreenHeader title={t("Single meals & pre-orders")} onBack={onGoBack} />
      <main className="px-5 pt-5 max-w-2xl mx-auto space-y-3">
        {error && <Notice tone="error">{error}</Notice>}
        {loading ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <Notice tone="info">{t("You have no single-meal orders or pre-orders yet.")}</Notice>
        ) : (
          orders.map((o) => (
            <div key={o._id} className="bg-white rounded-2xl p-4 border border-[#e4e2e1] space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#6e7a74]">{o.type === "pre_order" ? t("Pre-order") : t("Single meal")} · {o.ref}</p>
                  <p className="font-extrabold text-[14px] truncate">{o.mealPlanId?.name || ""} × {o.quantity}</p>
                  <p className="text-[12px] text-[#6e7a74]">{o.vendorId?.restaurantName || ""} · {fmtDay(o.deliveryDate)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-extrabold text-primary">{money(o.pricing?.totalPrice || 0)}</p>
                  <p className="text-[11px] font-bold text-[#6e7a74]">{STATUS_LABEL[o.status] ? t(STATUS_LABEL[o.status]) : t("Pending")}</p>
                </div>
              </div>
              {o.type === "pre_order" && o.status === "payment_pending" && (
                <>
                  <PaymentMethodPicker providers={methods.providers} selected={methods.selected} onSelect={methods.setSelected} loading={methods.loading} error={methods.error} />
                  <PrimaryButton busy={busy === o._id} onClick={() => pay(o)}>{t("Pay now")}</PrimaryButton>
                </>
              )}
              {o.type === "pre_order" && ["reserved", "payment_pending"].includes(o.status) && (
                <button type="button" disabled={busy === o._id} onClick={() => cancel(o)} className="text-[12px] font-bold text-red-600 underline">
                  {t("Cancel reservation")}
                </button>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}
