import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarDays, MapPin, Repeat, PlusCircle, RefreshCw, ArrowUpDown, Lock, Snowflake, Shuffle } from "lucide-react";
import { dmbCustomerAPI, dmbExtraCustomerAPI } from "@food/api";
import { getCurrentLanguage, tKey } from "@/shared/i18n";
import useDeliverySlots from "../../../../shared/hooks/useDeliverySlots";
import usePaymentMethods from "../../../../shared/payments/usePaymentMethods";
import PaymentMethodPicker from "../../../../shared/payments/PaymentMethodPicker";
import { completePayment, paymentRequestExtras } from "../../../../shared/payments/api";
import useMoney from "../../../../shared/payments/money";
import { ScreenHeader, Section, Chip, Notice, PrimaryButton, Spinner, TemperatureBadge, DayPicker, useDayNames, errorText } from "./ui";
import { useQuote, QuoteSummary } from "./quote";
import { useAddresses, addressTitle, addressLine } from "./addresses";

const CHANGE_NOTICE = {
  upgrade: tKey("Changes take effect at the next billing cycle."),
  change_plan: tKey("Changes take effect at the next billing cycle."),
  downgrade: tKey("You will lose the remaining prepaid days of your current plan; their value is added to your wallet."),
  switch_vendor: tKey("Your current maker delivers until the switch date; unused prepaid days are added to your wallet."),
  renew: tKey("Your next period starts when the current one ends."),
  add_slot: tKey("The new slot is a separate subscription, billed on its own."),
};

const fmtDay = (s, opts = { weekday: "short", day: "numeric", month: "short" }) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString(getCurrentLanguage(), opts) : "");

/** Gap A — a delivery slot the customer uses is being discontinued: pick a replacement before the grace period ends. */
export function SlotChangeBanner({ onShowToast }) {
  const { t } = useTranslation("customer");
  const [data, setData] = useState(null);
  const [choice, setChoice] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    dmbExtraCustomerAPI
      .slotChanges()
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!data?.subscriptions?.length) return null;
  const replace = async (sub, from) => {
    const to = choice[`${sub._id}|${from.key}`] || from.fallbackSlotKey;
    if (!to) return setError(t("Choose a new delivery time"));
    setBusy(`${sub._id}|${from.key}`);
    setError("");
    try {
      await dmbExtraCustomerAPI.replaceSlot(sub._id, from.key, to);
      onShowToast?.(t("Delivery time updated"));
      load();
    } catch (err) {
      setError(errorText(err, t("Could not change the delivery time")));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <p className="font-extrabold text-[14px] text-amber-900 flex items-center gap-2">
        <AlertTriangle size={18} /> {t("Please choose a new delivery time")}
      </p>
      {data.subscriptions.map((sub) =>
        sub.discontinued.map((from) => (
          <div key={`${sub._id}|${from.key}`} className="space-y-2">
            <p className="text-[12.5px] text-amber-900">
              {t("The {{slot}} slot of your {{vendor}} subscription ends on {{date}}.", { slot: from.name, vendor: sub.vendorName, date: fmtDay(from.graceEndsAt) })}
              {from.fallbackSlotKey ? ` ${t("If you don't choose, we move you to {{slot}}.", { slot: data.options.find((o) => o.key === from.fallbackSlotKey)?.name || from.fallbackSlotKey })}` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.options.map((o) => (
                <Chip key={o.key} active={(choice[`${sub._id}|${from.key}`] || from.fallbackSlotKey) === o.key} onClick={() => setChoice((c) => ({ ...c, [`${sub._id}|${from.key}`]: o.key }))}>
                  {o.icon} {o.name} · {o.startTime}–{o.endTime}
                </Chip>
              ))}
            </div>
            <PrimaryButton busy={busy === `${sub._id}|${from.key}`} onClick={() => replace(sub, from)}>{t("Confirm new time")}</PrimaryButton>
          </div>
        )),
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/**
 * Gap AE — upcoming deliveries for the next N days (ACM-171, default 10): one tab per subscription, holidays shown,
 * menu status (confirmed / pending), rotation colours, per-delivery actions: skip, swap meal, deliver elsewhere.
 */
export function UpcomingDeliveries({ subscriptionId, onShowToast, compact = false }) {
  const { t } = useTranslation("customer");
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [addressFor, setAddressFor] = useState(null);
  const [swapFor, setSwapFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = subscriptionId ? await dmbExtraCustomerAPI.upcoming(subscriptionId) : await dmbExtraCustomerAPI.calendar();
      setData(res.data);
      setError("");
    } catch (err) {
      setError(errorText(err, t("Could not load your upcoming deliveries")));
    }
  }, [subscriptionId, t]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (key, fn, okMsg) => {
    setBusy(key);
    setError("");
    try {
      await fn();
      onShowToast?.(okMsg);
      await load();
    } catch (err) {
      setError(errorText(err, t("Something went wrong")));
    } finally {
      setBusy("");
    }
  };

  if (!data) return error ? <Notice tone="error">{error}</Notice> : <Spinner />;
  const subs = data.subscriptions || [];
  if (!subs.length) return compact ? null : <Notice tone="info">{t("No upcoming deliveries.")}</Notice>;
  const sub = subs[Math.min(tab, subs.length - 1)];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-extrabold text-[#1b1c1c] flex items-center gap-2">
          <CalendarDays size={16} className="text-primary" /> {t("Next {{n}} days", { n: data.previewDays })}
        </h3>
      </div>
      {subs.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {subs.map((s, i) => (
            <Chip key={s._id} active={i === tab} onClick={() => setTab(i)}>
              {s.subscriptionType === "rotation" ? t("Rotation") : `#${s.subscriptionId}`}
            </Chip>
          ))}
        </div>
      )}
      {sub.deliveryPattern === "alternate_weeks" && <p className="text-[11px] text-[#6e7a74]">{t("Fortnightly plan: deliveries every other week.")}</p>}
      {sub.status === "paused" && <Notice tone="warn">{t("This subscription is paused — no deliveries until you resume it.")}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="space-y-2">
        {sub.days.length === 0 && <p className="text-[12px] text-[#6e7a74]">{t("No deliveries in this period.")}</p>}
        {sub.days.map((day) => (
          <div key={day.date} className={`rounded-2xl p-3 border ${day.holiday ? "bg-rose-50 border-rose-200" : "bg-white border-[#e4e2e1]"}`}>
            <p className="text-[12px] font-extrabold text-[#1b1c1c]">
              {day.isToday ? t("Today") : fmtDay(day.date)}
              {day.holiday && <span className="ml-2 text-rose-700">{day.holiday.icon || "🎉"} {day.holiday.name} · {t("no delivery")}</span>}
            </p>
            {day.slots.map((s) => {
              const key = `${day.date}|${s.slot}`;
              return (
                <div key={key} className="mt-2 pl-3 border-l-4 space-y-1" style={{ borderLeftColor: s.vendorColor || "#1F7A63" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-[#1b1c1c]">
                      {s.slotIcon} {s.slotName} · <span className="text-[#6e7a74] font-medium">{s.vendorName}</span>
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === "skipped" ? "bg-slate-100 text-slate-600" : s.menuStatus === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {s.status === "skipped" ? t("Skipped") : s.menuStatus === "confirmed" ? t("Menu confirmed") : t("Menu coming soon")}
                    </span>
                  </div>
                  {s.meals.map((m, i) => (
                    <p key={i} className="text-[12px] text-[#1b1c1c] flex items-center gap-1.5 flex-wrap">
                      {m.memberLabel && <span className="font-bold">{m.memberLabel}:</span>}
                      {m.name || t("Chef's choice")}
                      <TemperatureBadge type={m.temperatureType} />
                    </p>
                  ))}
                  {s.addressOverridden && <p className="text-[11px] text-sky-800 flex items-center gap-1"><MapPin size={12} /> {t("Delivering to: {{address}}", { address: s.address?.street || "" })}</p>}
                  {s.locked ? (
                    <p className="text-[10.5px] text-[#6e7a74] flex items-center gap-1"><Lock size={11} /> {t("Changes closed for this delivery")}</p>
                  ) : s.orderId ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {s.status === "skipped" ? (
                        <Chip disabled={busy === key} onClick={() => act(key, () => dmbCustomerAPI.undoSkipDailyOrder(s.orderId), t("Delivery restored"))}>{t("Undo skip")}</Chip>
                      ) : (
                        <>
                          <Chip disabled={busy === key} onClick={() => act(key, () => dmbCustomerAPI.skipDailyOrder(s.orderId), t("Delivery skipped — credited to your wallet"))}>{t("Skip")}</Chip>
                          <Chip disabled={busy === key} onClick={() => setSwapFor({ ...s, date: day.date })}>{t("Swap meal")}</Chip>
                          <Chip disabled={busy === key} onClick={() => setAddressFor({ ...s, date: day.date })}>{t("Deliver elsewhere")}</Chip>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {addressFor && (
        <AddressChoiceDialog
          title={t("Deliver on {{date}} to", { date: fmtDay(addressFor.date) })}
          onClose={() => setAddressFor(null)}
          onPick={(a) => {
            const target = addressFor;
            setAddressFor(null);
            act(`${target.date}|${target.slot}`, () => dmbExtraCustomerAPI.overrideOrderAddress(target.orderId, a._id), t("Address changed for this delivery"));
          }}
        />
      )}
      {swapFor && (
        <SwapMealDialog
          slot={swapFor}
          onClose={() => setSwapFor(null)}
          onPick={(mealPlanId) => {
            const target = swapFor;
            setSwapFor(null);
            act(`${target.date}|${target.slot}`, () => dmbCustomerAPI.changeDailyOrderMeal(target.orderId, [mealPlanId]), t("Meal changed"));
          }}
        />
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[260] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <h3 className="text-[16px] font-extrabold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function AddressChoiceDialog({ title, onClose, onPick }) {
  const { t } = useTranslation("customer");
  const { addresses, loading } = useAddresses();
  return (
    <Dialog title={title} onClose={onClose}>
      {loading ? (
        <Spinner />
      ) : addresses.length === 0 ? (
        <Notice tone="info">{t("Add an address in Profile → My addresses first.")}</Notice>
      ) : (
        addresses.map((a) => (
          <button key={a._id} type="button" onClick={() => onPick(a)} className="w-full text-left p-3 rounded-xl border border-[#e4e2e1] hover:border-primary">
            <p className="font-extrabold text-[13px]">{addressTitle(a, t)}</p>
            <p className="text-[12px] text-[#6e7a74]">{addressLine(a)}</p>
          </button>
        ))
      )}
      <button type="button" onClick={onClose} className="w-full py-2.5 text-[13px] font-bold text-[#6e7a74]">{t("Cancel")}</button>
    </Dialog>
  );
}

function SwapMealDialog({ slot, onClose, onPick }) {
  const { t } = useTranslation("customer");
  const [meals, setMeals] = useState(null);
  useEffect(() => {
    dmbCustomerAPI
      .getVendorMealPlansForSub(slot.vendorId)
      .then((res) => setMeals(res.data?.menu || []))
      .catch(() => setMeals([]));
  }, [slot.vendorId]);
  return (
    <Dialog title={t("Swap meal · {{date}}", { date: fmtDay(slot.date) })} onClose={onClose}>
      <p className="text-[12px] text-[#6e7a74]">{t("Choose another meal from {{vendor}} for this delivery.", { vendor: slot.vendorName })}</p>
      {!meals ? (
        <Spinner />
      ) : (
        meals.map((m) => (
          <button key={m._id} type="button" onClick={() => onPick(m._id)} className="w-full text-left p-3 rounded-xl border border-[#e4e2e1] hover:border-primary flex items-center justify-between gap-2">
            <span className="font-bold text-[13px]">{m.name}</span>
            <TemperatureBadge type={m.temperatureType} />
          </button>
        ))
      )}
      <button type="button" onClick={onClose} className="w-full py-2.5 text-[13px] font-bold text-[#6e7a74]">{t("Cancel")}</button>
    </Dialog>
  );
}

/** Actions on one subscription (SubscriptionDetailsScreen): change plan / maker / slot / renew, address, rotation. */
export function SubscriptionActions({ subscription, onNavigate, onShowToast, onChanged }) {
  const { t } = useTranslation("customer");
  const [detail, setDetail] = useState(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressDays, setAddressDays] = useState([]);
  const [error, setError] = useState("");
  const id = subscription?._id;

  useEffect(() => {
    if (!id) return;
    dmbExtraCustomerAPI
      .subscriptionDetail(id)
      .then((res) => setDetail(res.data.subscription))
      .catch(() => setDetail(null));
  }, [id]);

  if (!subscription || !["active", "paused"].includes(subscription.status)) return null;
  const pending = detail?.planChangePending?.newSubscriptionId;
  const isRotation = detail?.subscriptionType === "rotation";

  const changeAddress = async (a) => {
    setAddressOpen(false);
    setError("");
    try {
      await dmbExtraCustomerAPI.changeSubscriptionAddress(id, a._id, addressDays.length ? addressDays : undefined);
      onShowToast?.(t("Delivery address updated"));
      onChanged?.();
    } catch (err) {
      setError(errorText(err, t("Could not change the address")));
    }
  };

  return (
    <div className="space-y-3">
      {detail?.isTrial && detail?.trialEndsAt && (
        <Notice tone="success">{t("Trial price until {{date}}, regular price after that.", { date: fmtDay(detail.trialEndsAt, { day: "numeric", month: "long" }) })}</Notice>
      )}
      {detail?.cancelAt && <Notice tone="warn">{t("This subscription ends on {{date}}.", { date: fmtDay(detail.cancelAt, { day: "numeric", month: "long" }) })}</Notice>}
      {pending && <Notice tone="info">{t("A change is scheduled from {{date}}.", { date: fmtDay(detail.planChangePending.effectiveDate, { day: "numeric", month: "long" }) })}</Notice>}
      {detail?.zoneMismatch?.detected && <Notice tone="warn">{t("Your maker doesn't deliver to your new address. Switch maker to keep your deliveries.")}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <ActionButton icon={ArrowUpDown} label={t("Change plan")} disabled={Boolean(pending)} onClick={() => onNavigate(`/user/subscription/${id}/change?type=change_plan`)} />
        <ActionButton icon={Repeat} label={t("Switch maker")} disabled={Boolean(pending)} onClick={() => onNavigate(`/user/subscription/${id}/change?type=switch_vendor`)} />
        <ActionButton icon={PlusCircle} label={t("Add a slot")} onClick={() => onNavigate(`/user/subscription/${id}/change?type=add_slot`)} />
        <ActionButton icon={RefreshCw} label={t("Renew")} disabled={Boolean(detail?.renewedBySubscriptionId)} onClick={() => onNavigate(`/user/subscription/${id}/change?type=renew`)} />
        <ActionButton icon={MapPin} label={t("Change address")} onClick={() => setAddressOpen(true)} />
        {isRotation && <ActionButton icon={Shuffle} label={t("Edit rotation")} onClick={() => onNavigate(`/user/subscription/${id}/rotation`)} />}
      </div>
      {detail?.familyBox?.enabled && (
        <Notice tone="info">{t("Family Box · {{n}} people", { n: detail.familyBox.members?.length || 0 })}</Notice>
      )}
      {addressOpen && (
        <AddressChoiceDialog title={t("New delivery address")} onClose={() => setAddressOpen(false)} onPick={changeAddress} />
      )}
      {detail && (
        <details className="bg-white rounded-xl border border-[#e4e2e1] p-3">
          <summary className="text-[12px] font-bold cursor-pointer">{t("Use the new address only on some days")}</summary>
          <div className="pt-2 space-y-2">
            <DayPicker value={addressDays} onChange={setAddressDays} allowed={detail.deliveryDaysList?.length ? detail.deliveryDaysList : [1, 2, 3, 4, 5, 6, 0]} />
            <p className="text-[11px] text-[#6e7a74]">{t("Pick the days, then tap Change address. No days = every day.")}</p>
          </div>
        </details>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex items-center gap-2 p-3 rounded-xl bg-white border border-[#e4e2e1] text-[12.5px] font-bold text-[#1b1c1c] disabled:opacity-40 hover:border-primary/50">
      <Icon size={16} className="text-primary" /> {label}
    </button>
  );
}

/**
 * Gap S — change plan (upgrade at next cycle / downgrade next Monday with wallet credit), switch maker, add a slot
 * (separate subscription) and renew. Shows the server's preview, then pays for the new subscription.
 */
export function ChangeSubscriptionScreen({ subscriptionId, initialType, onGoBack }) {
  const { t } = useTranslation("customer");
  const [type, setType] = useState(initialType || "change_plan");
  const [detail, setDetail] = useState(null);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState("");
  const [meals, setMeals] = useState([]);
  const [mealId, setMealId] = useState("");
  const [slot, setSlot] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const { offeredSlots } = useDeliverySlots();
  const zoneId = detail?.zoneId ? String(detail.zoneId) : "";
  const methods = usePaymentMethods({ zoneId, enabled: Boolean(zoneId) });
  const { money } = useMoney(zoneId ? { zoneId } : {});

  useEffect(() => {
    dmbExtraCustomerAPI
      .subscriptionDetail(subscriptionId)
      .then((res) => setDetail(res.data.subscription))
      .catch((err) => setError(errorText(err, t("Could not load the subscription"))));
  }, [subscriptionId, t]);
  const subVendorId = detail?.vendorId?._id || detail?.vendorId || null;
  useEffect(() => {
    if (!zoneId) return;
    dmbExtraCustomerAPI.browseVendors({ zoneId }).then((res) => setVendors(res.data?.vendors || [])).catch(() => {});
  }, [zoneId]);
  // "Change plan" offers the plans of the maker this subscription is with.
  useEffect(() => {
    if (!zoneId || !subVendorId) return;
    dmbExtraCustomerAPI.plans(zoneId, subVendorId).then((res) => setPlans(res.data?.plans || [])).catch(() => {});
  }, [zoneId, subVendorId]);
  useEffect(() => {
    if (!vendorId) return;
    dmbExtraCustomerAPI
      .vendorMeals(vendorId, { zoneId })
      .then((res) => {
        const list = (res.data?.meals || []).filter((m) => m.status === "active");
        setMeals(list);
        setMealId(list[0]?._id || "");
      })
      .catch(() => setMeals([]));
  }, [vendorId, zoneId]);

  const currentSlots = detail?.deliverySlots?.length ? detail.deliverySlots : [];
  const input =
    type === "change_plan" ? (planId ? { subscriptionPlanId: planId } : null)
      : type === "switch_vendor" ? (vendorId && mealId ? { vendorId, meals: [{ mealPlanId: mealId, quantity: 1 }] } : null)
        : type === "add_slot" ? (slot ? { deliverySlots: [slot] } : null)
          : type === "renew" ? {}
            : null;
  const change = input ? { subscriptionId, type, input } : null;
  const { quote, preview, error: quoteError, loading } = useQuote(change ? { ...change } : null, { change });

  const pay = async () => {
    if (!quote) return;
    setPaying(true);
    setError("");
    try {
      const res = await dmbExtraCustomerAPI.applyChange({
        subscriptionId,
        type,
        input,
        expectedTotal: quote.totals.total,
        ...paymentRequestExtras({ provider: methods.selected, zoneId, returnPath: "/user/subscription", cancelPath: `/user/subscription/${subscriptionId}/change?type=${type}` }),
      });
      await completePayment(res.data.payment, { panel: "user" });
    } catch (err) {
      setError(err?.message === "cancelled" ? t("Payment cancelled") : errorText(err, t("Could not start the payment")));
    } finally {
      setPaying(false);
    }
  };

  const TYPES = [
    { key: "change_plan", label: t("Change plan") },
    { key: "switch_vendor", label: t("Switch maker") },
    { key: "add_slot", label: t("Add a slot") },
    { key: "renew", label: t("Renew") },
  ];

  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-28">
      <ScreenHeader title={t("Change subscription")} onBack={onGoBack} />
      <main className="px-5 pt-5 max-w-xl mx-auto space-y-5">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((x) => <Chip key={x.key} active={type === x.key} onClick={() => setType(x.key)}>{x.label}</Chip>)}
        </div>
        {!detail ? (
          error ? <Notice tone="error">{error}</Notice> : <Spinner />
        ) : (
          <>
            {type === "change_plan" && (
              <Section title={t("New plan")}>
                {plans.filter((p) => String(p._id) !== String(detail.subscriptionPlanId)).map((p) => (
                  <button key={p._id} type="button" onClick={() => setPlanId(p._id)} className={`w-full text-left p-3 rounded-xl border-2 ${planId === p._id ? "border-primary bg-primary/5" : "border-[#e4e2e1] bg-white"}`}>
                    <p className="font-extrabold text-[13px]">{p.name}</p>
                    <p className="text-[11px] text-[#6e7a74]">{p.description}</p>
                  </button>
                ))}
              </Section>
            )}
            {type === "switch_vendor" && (
              <Section title={t("New maker")}>
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="w-full bg-white border border-[#e4e2e1] rounded-xl px-3 py-2.5 text-[13px]">
                  <option value="">{t("Choose a maker")}</option>
                  {vendors.filter((v) => String(v._id) !== String(detail.vendorId?._id || detail.vendorId)).map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
                </select>
                {meals.length > 0 && (
                  <select value={mealId} onChange={(e) => setMealId(e.target.value)} className="w-full bg-white border border-[#e4e2e1] rounded-xl px-3 py-2.5 text-[13px]">
                    {meals.map((m) => <option key={m._id} value={m._id}>{m.name} · {money(m.pricePerDay)}</option>)}
                  </select>
                )}
              </Section>
            )}
            {type === "add_slot" && (
              <Section title={t("Extra delivery slot")} hint={t("The extra slot is a separate subscription with the same meal, billed on its own.")}>
                <div className="flex flex-wrap gap-1.5">
                  {offeredSlots.filter((s) => !currentSlots.includes(s.key)).map((s) => <Chip key={s.key} active={slot === s.key} onClick={() => setSlot(s.key)}>{s.icon} {s.name}</Chip>)}
                </div>
              </Section>
            )}
            {preview && (
              <Notice tone={preview.credit?.amount > 0 ? "warn" : "info"}>
                {CHANGE_NOTICE[preview.changeType] ? t(CHANGE_NOTICE[preview.changeType]) : preview.notice}{" "}
                {t("Starts {{date}}.", { date: fmtDay(preview.effectiveDate, { day: "numeric", month: "long" }) })}
                {preview.credit?.amount > 0 && ` ${t("{{amount}} for {{n}} unused deliveries goes to your wallet.", { amount: money(preview.credit.amount), n: preview.credit.deliveries })}`}
              </Notice>
            )}
            {change && <QuoteSummary quote={quote} loading={loading} error={quoteError} />}
            {quote && (
              <>
                <PaymentMethodPicker providers={methods.providers} selected={methods.selected} onSelect={methods.setSelected} loading={methods.loading} error={methods.error} />
                {error && <Notice tone="error">{error}</Notice>}
                <PrimaryButton busy={paying} disabled={!methods.providers.length || loading} onClick={pay}>
                  {t("Pay {{total}}", { total: money(quote.totals.total) })}
                </PrimaryButton>
              </>
            )}
            {type === "renew" && detail.billingCycle === "annual" && <p className="text-[11px] text-[#6e7a74] flex items-center gap-1"><Snowflake size={12} /> {t("Annual plans renew automatically unless cancelled 30 days before the end.")}</p>}
          </>
        )}
      </main>
    </div>
  );
}
