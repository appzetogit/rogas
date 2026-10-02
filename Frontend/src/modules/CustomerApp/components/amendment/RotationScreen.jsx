import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle, CheckCircle } from "lucide-react";
import { dmbExtraCustomerAPI } from "@food/api";
import useDeliverySlots from "../../../../shared/hooks/useDeliverySlots";
import usePlatformConfig from "../../../../shared/platform/usePlatformConfig";
import useMoney from "../../../../shared/payments/money";
import { ScreenHeader, Section, Chip, Notice, PrimaryButton, Spinner, WEEK, useDayNames, errorText } from "./ui";
import { useQuote, QuoteSummary } from "./quote";
import { AddressPicker } from "./addresses";

const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const COLORS = ["#1F7A63", "#E07A2E", "#3B6FD8", "#B5418C", "#8A6D1F"];

/**
 * Gap AK — Smart Rotation (ACM-178..181): one subscription, several makers, each on their own weekdays
 * ("Mon: Anna's kitchen, Tue: Green Bowl…"). Admin limits: max makers, allowed vendor types, minimum days per maker.
 * `editSubscriptionId` → edit the rotation of an existing subscription for its next cycle instead of buying.
 */
export function RotationScreen({ onGoBack, onProceedToCheckout, editSubscriptionId, initialRotation, subscriptionZoneId, onSaved }) {
  const { t } = useTranslation("customer");
  const { short, long } = useDayNames();
  const [address, setAddress] = useState(null);
  const zoneId = address?.zoneId ? String(address.zoneId) : subscriptionZoneId ? String(subscriptionZoneId) : "";
  const { get, isOn, loading: cfgLoading } = usePlatformConfig(zoneId || undefined);
  const { offeredSlots } = useDeliverySlots();
  const { money } = useMoney(zoneId ? { zoneId } : {});
  const [vendors, setVendors] = useState([]);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState("");
  const [slot, setSlot] = useState("");
  const [startDate, setStartDate] = useState(tomorrowStr);
  const [entries, setEntries] = useState(() => (initialRotation || []).map((r) => ({ vendorId: String(r.vendorId?._id || r.vendorId), mealPlanId: String(r.mealPlanId?._id || r.mealPlanId), quantity: r.quantity || 1, days: r.days || [] })));
  const [mealsByVendor, setMealsByVendor] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const maxMakers = Math.max(2, Number(get("rotationMaxMakers").value) || 5);
  const minDays = Math.max(1, Number(get("rotationMinDaysPerMaker").value) || 1);
  const weekend = get("weekendDelivery");

  useEffect(() => {
    if (!zoneId && !editSubscriptionId) return;
    let alive = true;
    setLoading(true);
    Promise.all([dmbExtraCustomerAPI.rotationVendors(zoneId ? { zoneId } : {}), editSubscriptionId ? Promise.resolve(null) : dmbExtraCustomerAPI.plans(zoneId)])
      .then(([vRes, pRes]) => {
        if (!alive) return;
        setVendors(vRes.data?.vendors || []);
        if (pRes) {
          const list = (pRes.data?.plans || []).filter((p) => p.duration !== "day");
          setPlans(list);
          setPlanId((prev) => prev || list[0]?._id || "");
        }
        setError("");
      })
      .catch((err) => alive && setError(errorText(err, t("Could not load makers"))))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [zoneId, editSubscriptionId, t]);

  useEffect(() => {
    if (!slot && offeredSlots[0]) setSlot(offeredSlots[0].key);
  }, [offeredSlots, slot]);

  const loadMeals = async (vendorId) => {
    if (mealsByVendor[vendorId]) return mealsByVendor[vendorId];
    const res = await dmbExtraCustomerAPI.vendorMeals(vendorId, zoneId ? { zoneId } : {});
    const list = (res.data?.meals || []).filter((m) => m.status === "active");
    setMealsByVendor((prev) => ({ ...prev, [vendorId]: list }));
    return list;
  };
  useEffect(() => {
    entries.forEach((e) => loadMeals(e.vendorId).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const vendorOf = (id) => vendors.find((v) => String(v._id) === String(id));
  const takenDays = (exceptIdx) => entries.flatMap((e, i) => (i === exceptIdx ? [] : e.days));
  const dayAllowedFor = (vendor, d) => (d !== 6 || weekend.saturday) && (d !== 0 || weekend.sunday) && (!vendor?.deliveryWeekdays?.length || vendor.deliveryWeekdays.includes(d));

  const addMaker = async (vendor) => {
    if (entries.length >= maxMakers || entries.some((e) => e.vendorId === String(vendor._id))) return;
    const meals = await loadMeals(String(vendor._id)).catch(() => []);
    setEntries((list) => [...list, { vendorId: String(vendor._id), mealPlanId: meals[0]?._id || "", quantity: 1, days: [] }]);
  };
  const update = (i, patch) => setEntries((list) => list.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const toggleDay = (i, d) => {
    const e = entries[i];
    update(i, { days: e.days.includes(d) ? e.days.filter((x) => x !== d) : [...e.days, d].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b)) });
  };

  const allDays = [...new Set(entries.flatMap((e) => e.days))].sort((a, b) => WEEK.indexOf(a) - WEEK.indexOf(b));
  const problems = [];
  if (entries.length < 2) problems.push(t("Pick at least 2 makers."));
  entries.forEach((e) => {
    const v = vendorOf(e.vendorId);
    if (!e.mealPlanId) problems.push(t("Choose a meal for {{maker}}.", { maker: v?.name || "" }));
    if (e.days.length < minDays) problems.push(t("{{maker}} needs at least {{n}} day(s).", { maker: v?.name || "", n: minDays }));
  });

  const quoteInput = useMemo(() => {
    if (editSubscriptionId || problems.length || !zoneId || !planId || !slot) return null;
    return {
      subscriptionPlanId: planId,
      zoneId,
      startDate,
      subscriptionType: "rotation",
      deliveryDays: "custom",
      deliveryDaysList: allDays,
      deliverySlots: [slot],
      rotation: entries.map((e) => ({ vendorId: e.vendorId, mealPlanId: e.mealPlanId, quantity: e.quantity, days: e.days })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSubscriptionId, problems.length, zoneId, planId, slot, startDate, JSON.stringify(entries)]);
  const { quote, error: quoteError, loading: quoting } = useQuote(quoteInput);

  const saveEdit = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await dmbExtraCustomerAPI.updateRotation(editSubscriptionId, entries.map((e) => ({ vendorId: e.vendorId, mealPlanId: e.mealPlanId, quantity: e.quantity, days: e.days })));
      onSaved?.(res.data);
    } catch (err) {
      setError(errorText(err, t("Could not save your rotation")));
    } finally {
      setSaving(false);
    }
  };

  const proceed = () => {
    if (!quote) return;
    onProceedToCheckout({
      kind: "new",
      vendorId: entries[0].vendorId,
      vendorName: t("Smart Rotation · {{n}} makers", { n: entries.length }),
      zoneId,
      subscriptionPlanId: planId,
      durationLabel: plans.find((p) => p._id === planId)?.name || "",
      quoteInput,
      addressId: address._id,
      addressText: [address.street, address.city].filter(Boolean).join(", "),
      expectedTotal: quote.totals.total,
      startDate,
    });
  };

  const rotationOn = isOn("smartRotation");
  return (
    <div className="bg-[#F5F5F0] min-h-screen pb-28">
      <ScreenHeader title={editSubscriptionId ? t("Edit my rotation") : t("Smart Rotation")} onBack={onGoBack} />
      <main className="px-5 pt-5 max-w-2xl mx-auto space-y-5">
        <Notice tone="info">
          <span className="inline-flex items-center gap-1.5 font-bold"><Shuffle size={14} /> {t("A different maker on different days, in one subscription.")}</span>
          {editSubscriptionId && <span className="block mt-1">{t("Changes apply from your next billing cycle.")}</span>}
        </Notice>
        {!editSubscriptionId && <AddressPicker value={address} onChange={setAddress} />}
        {cfgLoading || loading ? (
          <Spinner />
        ) : (zoneId || editSubscriptionId) && !rotationOn ? (
          <Notice tone="info">{t("Smart Rotation is not available in your area yet.")}</Notice>
        ) : zoneId || editSubscriptionId ? (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            <Section title={t("Makers ({{n}} of max {{max}})", { n: entries.length, max: maxMakers })}>
              {entries.map((e, i) => {
                const v = vendorOf(e.vendorId);
                const meals = mealsByVendor[e.vendorId] || [];
                const taken = takenDays(i);
                return (
                  <div key={e.vendorId} className="bg-white rounded-2xl p-3 border-l-4 space-y-2" style={{ borderLeftColor: COLORS[i % COLORS.length] }}>
                    <div className="flex items-center justify-between">
                      <p className="font-extrabold text-[14px]">{v?.name || t("Maker")}</p>
                      <button type="button" onClick={() => setEntries((list) => list.filter((_, idx) => idx !== i))} className="text-[12px] font-bold text-red-600">{t("Remove")}</button>
                    </div>
                    <select value={e.mealPlanId} onChange={(ev) => update(i, { mealPlanId: ev.target.value })} className="w-full bg-[#f9f9f7] rounded-lg px-3 py-2 text-[13px]">
                      {meals.length === 0 && <option value="">{t("Loading...")}</option>}
                      {meals.map((m) => <option key={m._id} value={m._id}>{m.name} · {money(m.pricePerDay)}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEK.map((d) => (
                        <Chip key={d} title={long[d]} active={e.days.includes(d)} disabled={taken.includes(d) || !dayAllowedFor(v, d)} onClick={() => toggleDay(i, d)}>
                          {short[d]}
                        </Chip>
                      ))}
                    </div>
                  </div>
                );
              })}
              {entries.length < maxMakers && (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-[#6e7a74]">{t("Add a maker")}</p>
                  {vendors.filter((v) => !entries.some((e) => e.vendorId === String(v._id))).length === 0 && <p className="text-[12px] text-[#6e7a74]">{t("No more makers available for rotation in your area.")}</p>}
                  {vendors
                    .filter((v) => !entries.some((e) => e.vendorId === String(v._id)))
                    .map((v) => (
                      <button key={v._id} type="button" onClick={() => addMaker(v)} className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-[#e4e2e1] text-left">
                        <span className="font-bold text-[13px]">{v.name}</span>
                        <span className="text-[11px] text-[#6e7a74]">{v.fromPrice ? t("from {{price}}", { price: money(v.fromPrice) }) : ""}</span>
                      </button>
                    ))}
                </div>
              )}
            </Section>

            {!editSubscriptionId && (
              <>
                <Section title={t("Plan")}>
                  <div className="flex flex-wrap gap-2">
                    {plans.map((p) => <Chip key={p._id} active={planId === p._id} onClick={() => setPlanId(p._id)}>{p.name}</Chip>)}
                  </div>
                </Section>
                <Section title={t("Delivery slot")}>
                  <div className="flex flex-wrap gap-2">
                    {offeredSlots.map((s) => <Chip key={s.key} active={slot === s.key} onClick={() => setSlot(s.key)}>{s.icon} {s.name}</Chip>)}
                  </div>
                </Section>
                <Section title={t("Subscription Start Date")}>
                  <input type="date" value={startDate} min={tomorrowStr()} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-white border-2 border-[#e4e2e1] rounded-xl px-4 py-2.5 text-[14px] font-extrabold" />
                </Section>
              </>
            )}

            {allDays.length > 0 && (
              <Section title={t("Your week")}>
                <div className="grid grid-cols-7 gap-1">
                  {WEEK.map((d) => {
                    const idx = entries.findIndex((e) => e.days.includes(d));
                    return (
                      <div key={d} className="rounded-lg p-1.5 text-center text-[10px] font-bold text-white min-h-[44px]" style={{ background: idx >= 0 ? COLORS[idx % COLORS.length] : "#d4d4d4" }}>
                        {short[d]}
                        <div className="font-medium truncate">{idx >= 0 ? (vendorOf(entries[idx].vendorId)?.name || "").split(" ")[0] : "—"}</div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {problems.length > 0 && <Notice tone="warn">{problems[0]}</Notice>}
            {editSubscriptionId ? (
              <PrimaryButton busy={saving} disabled={problems.length > 0} onClick={saveEdit}>
                <CheckCircle size={18} /> {t("Save for next cycle")}
              </PrimaryButton>
            ) : (
              <>
                {quoteInput && <QuoteSummary quote={quote} loading={quoting} error={quoteError} />}
                <PrimaryButton disabled={!quote || quoting || Boolean(quoteError)} onClick={proceed}>
                  {quote ? t("Continue · {{total}}", { total: money(quote.totals.total) }) : t("Proceed to Checkout")}
                </PrimaryButton>
              </>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
