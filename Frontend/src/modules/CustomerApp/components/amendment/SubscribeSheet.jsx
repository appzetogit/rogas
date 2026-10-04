import { useEffect, useMemo, useState } from "react";
import useScrollLock from "../../../../shared/hooks/useScrollLock";
import { useTranslation } from "react-i18next";
import { X, CheckCircle, ShoppingCart, Users, Plus, Trash2, Clock } from "lucide-react";
import { dmbExtraCustomerAPI } from "@food/api";
import useDeliverySlots from "../../../../shared/hooks/useDeliverySlots";
import usePlatformConfig from "../../../../shared/platform/usePlatformConfig";
import useMoney from "../../../../shared/payments/money";
import { trackEvent } from "../../../../shared/analytics/ga4";
import { Section, Chip, Toggle, DayPicker, Notice, PrimaryButton, Spinner, TemperatureBadge, WEEK, useDayNames, errorText } from "./ui";
import { useQuote, QuoteSummary } from "./quote";
import { AddressPicker } from "./addresses";
import { PreOrderDialog } from "./oneTime";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const PRESET_DAYS = { mon_fri: [1, 2, 3, 4, 5], full_week: [1, 2, 3, 4, 5, 6, 0] };
const CYCLE_OF = { day: "one_day", week: "weekly", fortnight: "fortnightly", month: "monthly", year: "annual" };

/**
 * Subscribe to one maker (CA-06 / CA-09). Everything the Amendment adds is offered only where the admin switched it on
 * (read live from the server controls): custom days (ACM-146), a different slot per day (ACM-147), slots per day limit
 * (ACM-148), annual (ACM-149) and fortnightly (ACM-151) plans, the trial (ACM-150, shown in the price), Family Box
 * (ACM-172) and weekend days (ACM-177). The price is always the server's quote.
 */
export function SubscribeSheet({ vendor, onClose, onProceedToCheckout, dietaryPrefs, matchDietary }) {
  useScrollLock(); // the page behind the sheet must not scroll
  const { t } = useTranslation("customer");
  const { long: dayLong, short: dayShort } = useDayNames();
  const [address, setAddress] = useState(null);
  const zoneId = address?.zoneId ? String(address.zoneId) : localStorage.getItem("userZoneId") || "";
  const { get, isOn, loading: cfgLoading } = usePlatformConfig(zoneId || undefined);
  const { offeredSlots, label: slotName, icon: slotIcon, window: slotWindow } = useDeliverySlots();
  const { money } = useMoney(zoneId ? { zoneId } : { vendorId: vendor.id });

  const [meals, setMeals] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mealId, setMealId] = useState("");
  const [planId, setPlanId] = useState("");
  const [customDays, setCustomDays] = useState(false);
  const [days, setDays] = useState([]);
  const [slots, setSlots] = useState([]);
  const [perDay, setPerDay] = useState(false);
  const [daySlots, setDaySlots] = useState({});
  const [family, setFamily] = useState(false);
  const [members, setMembers] = useState([]);
  // Starts today when the slot's order cut-off allows it; the server answers with the earliest allowed date otherwise.
  const [startDate, setStartDate] = useState(todayStr);
  const [minStart, setMinStart] = useState(todayStr);
  const [preOrderMeal, setPreOrderMeal] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([dmbExtraCustomerAPI.vendorMeals(vendor.id, zoneId ? { zoneId } : {}), dmbExtraCustomerAPI.plans(zoneId)])
      .then(([mealsRes, plansRes]) => {
        if (!alive) return;
        setMeals(mealsRes.data?.meals || []);
        const list = plansRes.data?.plans || [];
        setPlans(list);
        setPlanId((prev) => (list.some((p) => p._id === prev) ? prev : list[0]?._id || ""));
        setLoadError("");
      })
      .catch((err) => alive && setLoadError(errorText(err, t("Could not load this maker's plans"))))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [vendor.id, zoneId, t]);

  // Diet filter ("Match my diet & allergens") applied to what the maker sells.
  const activeMeals = useMemo(() => {
    const list = meals.filter((m) => m.status === "active");
    if (!matchDietary || !dietaryPrefs) return list;
    const diet = dietaryPrefs.dietType && dietaryPrefs.dietType !== "No preference" ? dietaryPrefs.dietType.toLowerCase() : "";
    const avoid = (dietaryPrefs.allergies || []).map((a) => String(a).toLowerCase());
    return list.filter((m) => (!diet || (m.dietTags || []).includes(diet)) && !(m.allergens || []).some((a) => avoid.includes(String(a).toLowerCase())));
  }, [meals, matchDietary, dietaryPrefs]);
  const preOrderMeals = meals.filter((m) => m.status === "pre_order");

  useEffect(() => {
    if (!activeMeals.some((m) => m._id === mealId)) setMealId(activeMeals[0]?._id || "");
  }, [activeMeals, mealId]);

  const plan = plans.find((p) => p._id === planId);
  const cycle = CYCLE_OF[plan?.duration] || "weekly";
  const weekend = get("weekendDelivery");
  const vendorDays = vendor.deliveryWeekdays?.length ? vendor.deliveryWeekdays : [1, 2, 3, 4, 5, 6, 0];
  const allowedDays = WEEK.filter((d) => vendorDays.includes(d) && (d !== 6 || weekend.saturday) && (d !== 0 || weekend.sunday));
  const customOn = isOn("customDaySelection");
  const perDayOn = isOn("perDaySlots");
  const familyCfg = get("familyBox");
  const maxSlots = Math.max(1, Number(get("maxSlotsPerDay").value) || 1);
  // The plan's usual days, limited to the days this maker really delivers (and weekend days that are switched on).
  const planPreset = PRESET_DAYS[plan?.deliveryDays || "mon_fri"] || PRESET_DAYS.mon_fri;
  const presetDays = planPreset.filter((d) => allowedDays.includes(d));
  const presetIsLimited = presetDays.length !== planPreset.length;
  const effectiveDays = customDays && customOn ? days : presetDays;

  // Keep the selection valid when the admin's switches or the plan change.
  useEffect(() => {
    if (!customOn && customDays) setCustomDays(false);
    if (!perDayOn && perDay) setPerDay(false);
    if (!familyCfg.enabled && family) setFamily(false);
  }, [customOn, perDayOn, familyCfg.enabled, customDays, perDay, family]);
  useEffect(() => {
    if (!offeredSlots.length) return;
    setSlots((prev) => {
      const valid = prev.filter((k) => offeredSlots.some((s) => s.key === k)).slice(0, maxSlots);
      return valid.length ? valid : [offeredSlots[0].key];
    });
  }, [offeredSlots, maxSlots]);
  useEffect(() => {
    if (family && members.length < 2 && activeMeals.length) {
      const base = { meals: [{ mealPlanId: activeMeals[0]._id, quantity: 1 }], slots: offeredSlots[0] ? [offeredSlots[0].key] : [] };
      setMembers([{ label: t("Person {{n}}", { n: 1 }), ...base }, { label: t("Person {{n}}", { n: 2 }), ...base }]);
    }
  }, [family, members.length, activeMeals, offeredSlots, t]);

  const toggleSlot = (key) => {
    trackEvent("slot_selected", { slot: key, vendor_id: vendor.id });
    setSlots((prev) => {
      if (prev.includes(key)) return prev.length === 1 ? prev : prev.filter((k) => k !== key);
      if (prev.length >= maxSlots) return maxSlots === 1 ? [key] : prev;
      return [...prev, key];
    });
  };
  const setDaySlot = (day, key) => {
    trackEvent("slot_selected", { slot: key, vendor_id: vendor.id, weekday: day });
    setDaySlots((prev) => {
      const cur = prev[day] || [];
      let next;
      if (cur.includes(key)) next = cur.filter((k) => k !== key);
      else next = maxSlots === 1 ? [key] : cur.length >= maxSlots ? cur : [...cur, key];
      return { ...prev, [day]: next };
    });
  };

  const quoteInput = useMemo(() => {
    if (!plan || !address?._id || !address.zoneId) return null;
    const base = {
      subscriptionPlanId: plan._id,
      vendorId: vendor.id,
      zoneId: String(address.zoneId),
      startDate,
      subscriptionType: "dedicated",
      // A maker that skips some of the plan's days is sent as a custom list so the price matches what is really delivered.
      deliveryDays: customOn && (customDays || presetIsLimited) ? "custom" : plan.deliveryDays || "mon_fri",
      deliveryDaysList: customOn && (customDays || presetIsLimited) ? (customDays ? days : presetDays) : undefined,
    };
    if (!effectiveDays.length) return null;
    if (family) {
      if (members.length < 2) return null;
      return { ...base, meals: members[0].meals, familyBox: { enabled: true, members }, deliverySlots: [...new Set(members.flatMap((m) => m.slots))] };
    }
    if (!mealId) return null;
    const meals = [{ mealPlanId: mealId, quantity: 1 }];
    if (perDay && perDayOn) {
      const ds = {};
      for (const d of effectiveDays) ds[String(d)] = daySlots[d] || [];
      return { ...base, meals, daySlots: ds, deliverySlots: [...new Set(Object.values(ds).flat())] };
    }
    return { ...base, meals, deliverySlots: slots };
  }, [plan, address, vendor.id, startDate, customDays, customOn, days, family, members, mealId, perDay, perDayOn, effectiveDays, daySlots, slots]);

  const { quote, error: quoteError, code: quoteCode, details: quoteDetails, loading: quoting } = useQuote(quoteInput);

  // Today's cut-off passed -> move to the earliest date the server allows (usually tomorrow) and re-quote.
  useEffect(() => {
    const earliest = quoteCode === "START_TOO_EARLY" ? quoteDetails?.earliestStartDate : null;
    if (earliest) {
      setMinStart(earliest);
      if (startDate < earliest) setStartDate(earliest);
    } else if (quote?.earliestStartDate) {
      setMinStart(quote.earliestStartDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteCode, quoteDetails, quote?.earliestStartDate]);

  const proceed = () => {
    if (!quote || !quoteInput) return;
    const meal = meals.find((m) => m._id === mealId);
    onProceedToCheckout({
      kind: "new",
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorImage: vendor.image,
      zoneId: quoteInput.zoneId,
      subscriptionPlanId: quoteInput.subscriptionPlanId,
      durationLabel: plan?.name || "",
      quoteInput,
      addressId: address._id,
      addressText: [address.street, address.city].filter(Boolean).join(", "),
      meals: family ? [] : [{ mealPlanId: mealId, quantity: 1, name: meal?.name, pricePerDay: meal?.pricePerDay }],
      expectedTotal: quote.totals.total,
      startDate,
    });
  };

  const cycleLabel = (p) => {
    const c = CYCLE_OF[p.duration];
    if (c === "annual") return t("Annual · paid upfront");
    if (c === "fortnightly") return t("Fortnightly · every other week");
    if (c === "monthly") return t("Monthly");
    if (c === "one_day") return t("One day");
    return t("Weekly");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md md:max-w-xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3 flex items-center justify-between border-b border-[#f0eded]">
          <div className="min-w-0">
            <h2 className="text-[17px] font-extrabold text-[#1b1c1c]">{t("📋 Subscription Plans")}</h2>
            <p className="text-[12px] text-[#6e7a74] truncate">{vendor.name}</p>
          </div>
          <button onClick={onClose} aria-label={t("Close")} className="w-9 h-9 rounded-full bg-[#f5f5f0] flex items-center justify-center active:scale-90">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          {loading || cfgLoading ? (
            <Spinner label={t("Loading plans...")} />
          ) : loadError ? (
            <Notice tone="error">{loadError}</Notice>
          ) : (
            <>
              <AddressPicker value={address} onChange={setAddress} />

              {familyCfg.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <Chip active={!family} onClick={() => setFamily(false)}>{t("Just me")}</Chip>
                  <Chip active={family} onClick={() => setFamily(true)}>
                    <span className="inline-flex items-center gap-1"><Users size={14} /> {t("Family Box")}</span>
                  </Chip>
                </div>
              )}

              {!family ? (
                <Section title={t("Select Meal Box / Plan")}>
                  {activeMeals.length === 0 && <Notice tone="warn">{t("⚠️ No active meal plans found for this vendor.")}</Notice>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {activeMeals.map((m) => (
                      <MealCard key={m._id} meal={m} selected={mealId === m._id} onSelect={() => setMealId(m._id)} money={money} />
                    ))}
                  </div>
                </Section>
              ) : (
                <FamilyEditor members={members} setMembers={setMembers} meals={activeMeals} slots={offeredSlots} max={Number(familyCfg.maxMembers) || 4} discountPct={Number(familyCfg.discountPct) || 0} slotName={slotName} slotIcon={slotIcon} />
              )}

              {preOrderMeals.length > 0 && (
                <Section title={t("Coming soon — pre-order")}>
                  {preOrderMeals.map((m) => (
                    <div key={m._id} className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-primary/40 bg-primary/5">
                      <Clock size={18} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-[13px] truncate">{m.name}</p>
                        <p className="text-[11px] text-[#6e7a74]">{t("Launches {{date}}", { date: m.launchDate ? new Date(m.launchDate).toLocaleDateString() : "" })}</p>
                      </div>
                      <button type="button" onClick={() => setPreOrderMeal(m)} className="px-3 py-1.5 rounded-full bg-[#1F7A63] text-white text-[12px] font-bold">
                        {t("Pre-order")}
                      </button>
                    </div>
                  ))}
                </Section>
              )}

              <Section title={t("Select Subscription Plan")}>
                {plans.length === 0 && <Notice tone="info">{t("No active plans configured by admin")}</Notice>}
                <div className="space-y-2.5">
                  {plans.map((p) => (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => setPlanId(p._id)}
                      className={`w-full text-left p-3.5 rounded-2xl border-2 flex justify-between gap-3 ${planId === p._id ? "border-primary bg-primary/5" : "border-[#e4e2e1] bg-[#f9f9f7]"}`}
                    >
                      <div className="min-w-0">
                        <p className="font-extrabold text-[14px] text-[#1b1c1c]">{p.name}</p>
                        <p className="text-[12px] text-[#6e7a74] mt-0.5">
                          {cycleLabel(p)} · {p.deliveryDays === "full_week" ? t("Full Week") : t("Monday–Friday")}
                        </p>
                        {CYCLE_OF[p.duration] === "annual" && Number(get("annualPlan").discountPct) > 0 && (
                          <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {t("Save {{pct}}%", { pct: Number(get("annualPlan").discountPct) })}
                          </span>
                        )}
                      </div>
                      {planId === p._id && <CheckCircle className="text-primary shrink-0" size={20} />}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title={t("Delivery days")}>
                {customOn ? (
                  <>
                    <div className="flex gap-2">
                      <Chip active={!customDays} onClick={() => setCustomDays(false)}>
                        {presetDays.length === 7 ? t("Every day") : !presetIsLimited && plan?.deliveryDays !== "full_week" ? t("Mon – Fri") : presetDays.map((d) => dayShort[d]).join(", ") || t("No delivery days")}
                      </Chip>
                      <Chip active={customDays} onClick={() => { setCustomDays(true); if (!days.length) setDays(presetDays); }}>{t("Choose my days")}</Chip>
                    </div>
                    {customDays && <DayPicker value={days} onChange={setDays} allowed={allowedDays} />}
                  </>
                ) : (
                  <p className="text-[13px] font-bold text-[#1b1c1c]">{effectiveDays.map((d) => dayShort[d]).join(", ")}</p>
                )}
                {(!weekend.saturday || !weekend.sunday) && <p className="text-[11px] text-[#6e7a74]">{t("Weekend delivery is not available in your area yet.")}</p>}
              </Section>

              {!family && (
                <Section title={t("Delivery Time Slots")} hint={maxSlots > 1 ? t("Up to {{n}} slots per day", { n: maxSlots }) : null}>
                  {perDayOn && (
                    <Toggle checked={perDay} onChange={setPerDay} label={t("Different slot on different days")} hint={t("e.g. lunch on Mon/Wed, dinner on Tue/Thu")} />
                  )}
                  {offeredSlots.length === 0 && <Notice tone="warn">{t("No delivery slots are available right now.")}</Notice>}
                  {perDay && perDayOn ? (
                    <div className="space-y-2">
                      {effectiveDays.map((d) => (
                        <div key={d} className="flex items-center gap-2 flex-wrap">
                          <span className="w-24 text-[12px] font-bold text-[#1b1c1c]">{dayLong[d]}</span>
                          {offeredSlots.map((s) => (
                            <Chip key={s.key} active={(daySlots[d] || []).includes(s.key)} onClick={() => setDaySlot(d, s.key)}>
                              {s.icon} {s.name}
                            </Chip>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {offeredSlots.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => toggleSlot(s.key)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 ${slots.includes(s.key) ? "border-primary bg-primary/5" : "border-[#e4e2e1] bg-[#f9f9f7]"}`}
                        >
                          <span className="text-xl">{s.icon}</span>
                          <div className="text-left flex-1">
                            <p className="font-extrabold text-[13px]">{s.name}</p>
                            <p className="text-[11px] text-[#6e7a74]">{slotWindow(s.key)}</p>
                          </div>
                          {slots.includes(s.key) && <CheckCircle size={18} className="text-primary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              <Section title={t("Subscription Start Date")}>
                <input
                  type="date"
                  value={startDate}
                  min={minStart}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white border-2 border-[#e4e2e1] rounded-xl px-4 py-2.5 text-[14px] font-extrabold focus:outline-none focus:border-primary"
                />
              </Section>

              {quoteInput ? (
                <QuoteSummary quote={quote} loading={quoting} error={quoteError} />
              ) : (
                <Notice tone="info">{address ? t("Finish your selection to see the price.") : t("Choose a delivery address to see the price.")}</Notice>
              )}

              <PrimaryButton disabled={!quote || quoting || Boolean(quoteError)} onClick={proceed}>
                <ShoppingCart size={18} /> {quote ? t("Continue · {{total}}", { total: money(quote.totals.total) }) : t("Proceed to Checkout")}
              </PrimaryButton>
              <div className="h-2" />
            </>
          )}
        </div>
      </div>
      {preOrderMeal && <PreOrderDialog meal={preOrderMeal} vendorName={vendor.name} onClose={() => setPreOrderMeal(null)} />}
    </div>
  );
}

function MealCard({ meal, selected, onSelect, money }) {
  const { t } = useTranslation("customer");
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`p-3 rounded-2xl border-2 text-left flex items-center gap-3 ${selected ? "border-primary bg-primary/5" : "border-[#e4e2e1] bg-[#f9f9f7]"}`}
    >
      {meal.photos?.[0] ? (
        <img src={typeof meal.photos[0] === "string" ? meal.photos[0] : meal.photos[0]?.url} alt={meal.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">🍲</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-extrabold text-[14px] truncate">{meal.name}</p>
        <p className="text-[11px] text-[#6e7a74]">{t("{{price}}/day", { price: money(meal.pricePerDay, { compact: true }) })}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          <TemperatureBadge type={meal.temperatureType} />
        </div>
        {meal.temperatureType === "cold" && meal.reheatInstructions && <p className="text-[10px] text-sky-800 mt-1 line-clamp-2">{meal.reheatInstructions}</p>}
      </div>
      {selected && <CheckCircle className="text-primary shrink-0" size={20} />}
    </button>
  );
}

/** Gap AF — one box, 2–N people, each with their own meal and slots. Delivered together, one set per person. */
function FamilyEditor({ members, setMembers, meals, slots, max, discountPct, slotName, slotIcon }) {
  const { t } = useTranslation("customer");
  const update = (i, patch) => setMembers((list) => list.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const toggleSlot = (i, key) => {
    const cur = members[i].slots;
    update(i, { slots: cur.includes(key) ? (cur.length > 1 ? cur.filter((k) => k !== key) : cur) : [...cur, key] });
  };
  return (
    <Section title={t("Family Box")} hint={discountPct ? t("Everyone gets their own meal in one delivery — {{pct}}% off the meals.", { pct: discountPct }) : t("Everyone gets their own meal in one delivery.")}>
      {members.map((m, i) => (
        <div key={i} className="p-3 rounded-2xl border border-[#e4e2e1] bg-white space-y-2">
          <div className="flex items-center gap-2">
            <input value={m.label} maxLength={40} onChange={(e) => update(i, { label: e.target.value })} className="flex-1 bg-[#f9f9f7] rounded-lg px-3 py-2 text-[13px] font-bold focus:outline-none" aria-label={t("Name")} />
            {members.length > 2 && (
              <button type="button" aria-label={t("Remove")} onClick={() => setMembers((list) => list.filter((_, idx) => idx !== i))} className="p-2 text-red-600">
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <select
            value={m.meals[0]?.mealPlanId || ""}
            onChange={(e) => update(i, { meals: [{ mealPlanId: e.target.value, quantity: 1 }] })}
            className="w-full bg-[#f9f9f7] rounded-lg px-3 py-2 text-[13px] focus:outline-none"
          >
            {meals.map((meal) => (
              <option key={meal._id} value={meal._id}>{meal.name}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((s) => (
              <Chip key={s.key} active={m.slots.includes(s.key)} onClick={() => toggleSlot(i, s.key)}>
                {slotIcon(s.key)} {slotName(s.key)}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {members.length < max && (
        <button
          type="button"
          onClick={() => setMembers((list) => [...list, { label: t("Person {{n}}", { n: list.length + 1 }), meals: [{ mealPlanId: meals[0]?._id, quantity: 1 }], slots: slots[0] ? [slots[0].key] : [] }])}
          className="w-full py-2.5 rounded-xl border border-dashed border-primary text-primary font-bold text-[12px] flex items-center justify-center gap-1.5"
        >
          <Plus size={16} /> {t("Add a person")}
        </button>
      )}
    </Section>
  );
}
