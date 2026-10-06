/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Sparkles, ClipboardCheck, UserPlus, Star, Search, X, Utensils, Check, ArrowLeft, MapPin, AlertTriangle, CalendarDays } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { getSubscriptionPlansApi, quoteAssignmentApi } from '../services/officeApi';
import useDeliverySlots from '../../../shared/hooks/useDeliverySlots';
import { Trans, useTranslation } from "react-i18next";
import usePaymentMethods from '../../../shared/payments/usePaymentMethods';
import useMoney from '../../../shared/payments/money';
import PaymentMethodPicker from '../../../shared/payments/PaymentMethodPicker';
import { getCurrentLanguage, tKey } from '../../../shared/i18n';

/** Labels for the server quote's price lines (the server sends English labels; these are translated). */
const LINE_LABELS = {
  food: tKey("Meals"),
  plan_discount: tKey("Plan discount"),
  annual_discount: tKey("Annual plan discount"),
  food_vat: tKey("Food VAT"),
  delivery: tKey("Delivery"),
  delivery_vat: tKey("Delivery VAT"),
  platform_fee: tKey("Platform fee"),
};

const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(getCurrentLanguage(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function VendorsTab({
  vendors,
  employees,
  delivery,
  onCheckout,
  onGoToCompany,
}) {
  const { t } = useTranslation("office");
  // Search State for Vendors
  const [vendorSearch, setVendorSearch] = useState('');

  // Active Assignment Wizard State
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [viewMealVendor, setViewMealVendor] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSearch, setWizardSearch] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const { offeredSlots, window: slotWindow, label: slotLabelOf } = useDeliverySlots();
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const quoteSeq = useRef(0);
  const zoneId = delivery?.zoneId || undefined;
  const methods = usePaymentMethods({ zoneId, vendorId: zoneId ? undefined : selectedVendor?.id, enabled: Boolean(selectedVendor) });
  const { money } = useMoney({ zoneId, vendorId: zoneId ? undefined : selectedVendor?.id });

  useEffect(() => {
    if (!selectedVendor?.id) return undefined;
    let cancelled = false;
    // The subscription plans (duration and delivery days) the selected vendor offers.
    getSubscriptionPlansApi(selectedVendor.id)
      .then((res) => {
        if (!cancelled) setSubscriptionPlans(res.data.plans || []);
      })
      .catch((err) => console.error('Failed to fetch subscription plans', err));
    return () => {
      cancelled = true;
    };
  }, [selectedVendor?.id]);

  // Active employees without any current meal plan.
  const pendingCount = useMemo(() => {
    return employees.filter((emp) => emp.status === 'Active' && !(emp.plans || []).length).length;
  }, [employees]);

  // Filter vendors based on search
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.toLowerCase();
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.tag.toLowerCase().includes(q) ||
      v.categories.some((cat) => cat.toLowerCase().includes(q))
    );
  }, [vendors, vendorSearch]);

  // Every active employee can get a plan — also those who already have one (another slot, vendor or the next period).
  const activeEmployees = useMemo(() => employees.filter((emp) => emp.status === 'Active'), [employees]);

  const filteredWizardEmployees = useMemo(() => {
    const q = wizardSearch.toLowerCase();
    return activeEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q)
    );
  }, [activeEmployees, wizardSearch]);

  // Slots this vendor cooks for (all offered slots when the vendor has not listed any).
  const vendorSlots = useMemo(() => {
    const own = selectedVendor?.mealSlots || [];
    return offeredSlots.filter((sl) => !own.length || own.includes(sl.key));
  }, [offeredSlots, selectedVendor]);

  // Meals that can be delivered in every chosen slot (a meal without a slot list fits any slot).
  const vendorMeals = useMemo(() => {
    return (selectedVendor?.mealPlans || []).filter((m) => !(m.availableSlots || []).length || selectedSlots.every((s) => m.availableSlots.includes(s)));
  }, [selectedVendor, selectedSlots]);

  const resetQuote = () => {
    quoteSeq.current += 1;
    setQuote(null);
    setQuoteError('');
    setQuoteLoading(false);
  };

  // Initialize assignment wizard
  const handleOpenAssignWizard = (vendor) => {
    setSelectedVendor(vendor);
    setWizardStep(1);
    setWizardSearch('');
    setSelectedEmployeeIds([]);
    setSelectedSlots([]);
    setStartDate('');
    setSelectedMeal(null);
    setSelectedPlan(null);
    setSubscriptionPlans([]);
    resetQuote();
    setIsProcessingPayment(false);
  };

  const closeWizard = () => {
    if (isProcessingPayment) return;
    setSelectedVendor(null);
    resetQuote();
  };

  const handleToggleEmployee = (emp) => {
    if (!emp.hasAccount) return;
    setSelectedEmployeeIds((prev) => (prev.includes(emp.id) ? prev.filter((eid) => eid !== emp.id) : [...prev, emp.id]));
    resetQuote();
  };

  const selectableIds = filteredWizardEmployees.filter((e) => e.hasAccount).map((e) => e.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedEmployeeIds.includes(id));
  const toggleAll = () => {
    setSelectedEmployeeIds((prev) => (allSelected ? prev.filter((id) => !selectableIds.includes(id)) : [...new Set([...prev, ...selectableIds])]));
    resetQuote();
  };

  const order = () => ({
    employeeIds: selectedEmployeeIds,
    vendorId: selectedVendor.id,
    mealPlanId: selectedMeal?._id,
    subscriptionPlanId: selectedPlan?._id,
    slots: selectedSlots,
    startDate: startDate || undefined,
  });

  // The review step shows the server's price (the same one that is charged).
  const loadQuote = async () => {
    const my = ++quoteSeq.current;
    setQuoteLoading(true);
    setQuoteError('');
    try {
      const res = await quoteAssignmentApi(order());
      if (my === quoteSeq.current) setQuote(res.data.data);
    } catch (err) {
      if (my === quoteSeq.current) {
        setQuote(null);
        setQuoteError(err.response?.data?.message || t("Could not calculate the price. Please try again."));
      }
    } finally {
      if (my === quoteSeq.current) setQuoteLoading(false);
    }
  };

  const goToStep = (step) => {
    setWizardStep(step);
    if (step === 4) loadQuote();
  };

  const dropConflicting = () => {
    const ids = new Set((quote?.conflicts || []).map((c) => c.employeeId));
    setSelectedEmployeeIds((prev) => prev.filter((id) => !ids.has(id)));
    setQuote(null);
    setWizardStep(1);
  };

  const handleConfirmAssignment = async () => {
    if (!quote || quote.conflicts?.length || isProcessingPayment) return;
    setIsProcessingPayment(true);
    try {
      const done = await onCheckout({ ...order(), expectedTotal: quote.total, provider: methods.selected || undefined });
      if (done) setSelectedVendor(null);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const slotNames = (keys) => (keys || []).map((k) => slotLabelOf(k) || k).join(', ');
  const planLabel = (plan) => {
    const kind = plan.duration === 'week' ? t("Weekly plan") : plan.duration === 'month' ? t("Monthly plan") : plan.duration === 'day' ? t("Daily plan") : plan.duration;
    const days = plan.deliveryDays === 'mon_fri' ? t("Monday to Friday") : t("Every day");
    return `${kind} · ${days}`;
  };

  // Helper to render rating stars
  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 !== 0;

    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<Star key={i} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />);
      } else if (i === fullStars + 1 && hasHalf) {
        stars.push(
          <span key={i} className="relative inline-block text-gray-300">
            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 absolute overflow-hidden w-[50%]" />
            <Star className="w-3.5 h-3.5 text-gray-300" />
          </span>
        );
      } else {
        stars.push(<Star key={i} className="w-3.5 h-3.5 text-gray-300" />);
      }
    }
    return stars;
  };

  const canNext =
    (wizardStep === 1 && selectedEmployeeIds.length > 0) ||
    (wizardStep === 2 && selectedSlots.length > 0) ||
    (wizardStep === 3 && Boolean(selectedMeal && selectedPlan));

  return (
    <div className="space-y-6">
      {/* Search Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-brand-brand-primary tracking-tight">{t("Curated Local Vendors")}</h3>
          <p className="text-xs text-brand-muted mt-1">{t("Discover, manage, and assign subscriptions from verified organic kitchens.")}</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-white border border-brand-divider rounded-lg text-sm text-brand-text focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all"
            placeholder={t("Search vendors...")}
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Meals are delivered to the office's map pin: without it there is no zone, price or driver route. */}
      {delivery?.status && delivery.status !== 'ok' && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <p className="text-sm">
              {delivery.status === 'outside'
                ? t("Your office delivery location is outside our delivery area. Check the map pin on the Company Details page.")
                : t("Set your office delivery location (map pin) on the Company Details page before assigning meals, so we know where to deliver.")}
            </p>
          </div>
          <button onClick={onGoToCompany} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer">
            {t("Open Company Details")}
          </button>
        </div>
      )}

      {/* Bento Header section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white card-shadow rounded-xl p-8 relative overflow-hidden border border-brand-divider">
          <div className="relative z-10 w-3/4">
            <h3 className="text-lg font-bold text-brand-primary mb-2">{t("Curation Phase")}</h3>
            <p className="text-sm text-brand-muted leading-relaxed">
              {t("Assign meal subscriptions to your employees for the upcoming weekly cycle. Select verified, highly-rated local partners below to feed your teams organic, healthy daily packages.")}
            </p>
          </div>
          <div className="hidden lg:block opacity-10 absolute right-4 -bottom-4 text-brand-primary z-0 pointer-events-none">
            <Sparkles className="w-40 h-40" />
          </div>
        </div>

        <div className="bg-brand-primary text-white rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs uppercase tracking-widest font-semibold opacity-80">{t("Pending Tasks")}</p>
            <ClipboardCheck className="w-5 h-5 text-brand-primary-light" />
          </div>
          <p className="text-4xl font-extrabold my-2">{pendingCount}</p>
          <p className="text-xs opacity-90">{t("Active employees waiting for a meal assignment")}</p>
        </div>
      </div>

      {/* Vendors Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredVendors.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center text-brand-muted border border-brand-divider rounded-xl">
            {t("No local vendors match your active filters or search queries.")}
          </div>
        ) : (
          filteredVendors.map((vendor) => (
            <div key={vendor.id} className="bg-white rounded-xl card-shadow overflow-hidden group border border-brand-divider flex flex-col justify-between">
              <div>
                {/* Header Banner Image */}
                <div className="h-44 relative overflow-hidden">
                  <img
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    src={vendor.imageUrl}
                    alt={vendor.name}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

                  {/* Vendor Details overlay */}
                  <div className="absolute bottom-4 left-6 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center font-extrabold text-lg text-brand-primary shadow-lg border border-brand-divider flex-shrink-0">
                      {vendor.shortName}
                    </div>
                    <div>
                      <h4 className="text-white font-bold text-base">{vendor.name}</h4>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="flex items-center gap-0.5">
                          {renderStars(vendor.rating)}
                        </div>
                        <span className="text-white text-[11px] ml-1 opacity-90 font-medium">
                          {t("{{rating}} ({{reviewsCount}} reviews)", { rating: vendor.rating.toFixed(1), reviewsCount: vendor.reviewsCount })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vendor specs and info */}
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-brand-muted font-bold text-xs uppercase tracking-wider">
                      {vendor.tag}
                    </span>
                    <div className="flex gap-1.5">
                      {vendor.categories.map((cat) => (
                        <span key={cat} className="px-2 py-0.5 bg-brand-primary-light/40 text-brand-primary rounded-full text-[9px] font-extrabold uppercase">
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-brand-muted leading-relaxed">
                    {vendor.description}
                  </p>
                </div>
              </div>

              {/* Action */}
              <div className="p-6 pt-0 flex gap-3">
                <button
                  onClick={() => setViewMealVendor(vendor)}
                  className="flex-1 py-3 bg-white border border-brand-primary text-brand-primary hover:bg-brand-primary/5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Utensils className="w-4 h-4" />
                  {t("View Meal")}
                </button>
                <button
                  onClick={() => handleOpenAssignWizard(vendor)}
                  disabled={delivery?.status !== 'ok' || !(vendor.mealPlans || []).length}
                  title={!(vendor.mealPlans || []).length ? t("This vendor hasn't published a meal yet.") : undefined}
                  className="flex-1 py-3 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  {t("Assign")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Assignment Wizard Modal */}
      <AnimatePresence>
        {selectedVendor && (
          <div className="fixed inset-0 bg-brand-text/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-brand-divider bg-brand-bg/10">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-brand-text">
                    <Trans t={t} i18nKey={"Assign <0>{{name}}</0>"} defaults={"Assign <0>{{name}}</0>"} values={{ name: selectedVendor.name }} components={[<span className="text-brand-primary" />]} />
                  </h2>
                  <button onClick={closeWizard} className="text-brand-muted hover:text-brand-text cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Steps tracker indicators */}
                <div className="flex gap-4">
                  {[
                    { step: 1, label: t("1. Employees"), enabled: true },
                    { step: 2, label: t("2. Time Slot"), enabled: selectedEmployeeIds.length > 0 },
                    { step: 3, label: t("3. Plan"), enabled: selectedEmployeeIds.length > 0 && selectedSlots.length > 0 },
                    { step: 4, label: t("4. Payment"), enabled: selectedEmployeeIds.length > 0 && selectedSlots.length > 0 && Boolean(selectedMeal && selectedPlan) },
                  ].map(({ step, label, enabled }) => (
                    <div
                      key={step}
                      onClick={() => {
                        if (enabled && !isProcessingPayment) goToStep(step);
                      }}
                      className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all ${enabled ? 'cursor-pointer hover:bg-brand-primary/10 hover:text-brand-primary' : 'cursor-not-allowed opacity-50'} ${
                        wizardStep === step ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted'
                      }`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="flex-grow overflow-y-auto p-6 bg-brand-bg/20 space-y-4">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                        <input
                          type="text"
                          className="w-full pl-10 pr-4 py-2.5 bg-white border border-brand-divider rounded-lg text-sm text-brand-text focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
                          placeholder={t("Search employee names or departments...")}
                          value={wizardSearch}
                          onChange={(e) => setWizardSearch(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={toggleAll}
                        disabled={!selectableIds.length}
                        className="px-3 py-2.5 border border-brand-divider bg-white rounded-lg text-xs font-bold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        {allSelected ? t("Clear selection") : t("Select all")}
                      </button>
                    </div>

                    <p className="text-[11px] text-brand-muted">
                      {t("Select active employees below. Checked employees will receive a daily subscription box from {{name}}.", { name: selectedVendor.name })}
                    </p>

                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {filteredWizardEmployees.length === 0 ? (
                        <div className="p-8 text-center text-xs text-brand-muted bg-white rounded-lg border border-brand-divider/30">
                          {t("No active employees match search.")}
                        </div>
                      ) : (
                        filteredWizardEmployees.map((emp) => {
                          const isChecked = selectedEmployeeIds.includes(emp.id);
                          return (
                            <div
                              key={emp.id}
                              onClick={() => handleToggleEmployee(emp)}
                              className={`flex items-center justify-between gap-3 p-3.5 bg-white rounded-lg border transition-colors ${
                                !emp.hasAccount ? 'opacity-60 cursor-not-allowed border-brand-divider/40' : isChecked ? 'cursor-pointer border-brand-primary bg-brand-primary-light/20' : 'cursor-pointer border-brand-divider/40 hover:border-brand-primary/50'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary border-brand-divider cursor-pointer"
                                  checked={isChecked}
                                  disabled={!emp.hasAccount}
                                  onChange={() => {}} // Controlled by outer div click
                                />
                                <div className="text-sm min-w-0">
                                  <span className="font-bold text-brand-text">{emp.name}</span>
                                  {!emp.hasAccount ? (
                                    <p className="text-[10px] text-amber-700 mt-0.5">{t("Add a mobile number first: it is how they sign in to see their meals.")}</p>
                                  ) : (emp.plans || []).length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {emp.plans.map((p) => (
                                        <span key={p.assignmentId} className="px-1.5 py-0.5 bg-brand-bg rounded text-[10px] text-brand-muted">
                                          {t("{{slots}} · {{vendor}} · until {{date}}", { slots: slotNames(p.slots), vendor: p.vendorName, date: fmtDate(p.until) })}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <span className="px-2 py-0.5 bg-brand-bg rounded text-[10px] text-brand-muted font-semibold flex-shrink-0">
                                {emp.department}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4 py-4 text-center">
                    <p className="text-xs text-brand-muted">
                      {t("Select the scheduled daily delivery window for {{count}} employee.", { count: selectedEmployeeIds.length })}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      {vendorSlots.map((sl) => (
                        <label key={sl.key} className="cursor-pointer">
                          <input
                            type="checkbox"
                            name="delivery-slot-option"
                            className="peer hidden"
                            value={sl.key}
                            checked={selectedSlots.includes(sl.key)}
                            onChange={(e) => {
                              setSelectedSlots((prev) => (e.target.checked ? [...prev, sl.key] : prev.filter((k) => k !== sl.key)));
                              setSelectedMeal(null);
                              resetQuote();
                            }}
                          />
                          <div className="h-full flex flex-col items-center justify-center p-6 bg-white border-2 border-brand-divider rounded-xl peer-checked:border-brand-primary peer-checked:bg-brand-primary-light/10 hover:bg-white/80 transition-all">
                            <span className="text-4xl mb-3">{sl.icon}</span>
                            <span className="font-bold text-sm text-brand-text">{sl.name}</span>
                            <span className="text-[10px] text-brand-muted mt-1">{slotWindow(sl.key)}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    {vendorSlots.length === 0 && (
                      <p className="text-xs text-brand-muted">{t("This vendor does not deliver in any slot right now.")}</p>
                    )}

                    <div className="max-w-xs mx-auto text-left pt-2">
                      <label className="block text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                        <CalendarDays className="inline w-3.5 h-3.5 mr-1" />
                        {t("Start date")}
                      </label>
                      <input
                        type="date"
                        min={todayStr()}
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          resetQuote();
                        }}
                        className="w-full px-3 py-2 bg-white border border-brand-divider rounded-lg text-sm text-brand-text focus:border-brand-primary outline-none"
                      />
                      <p className="text-[10px] text-brand-muted mt-1">{t("Leave empty to start as soon as possible.")}</p>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-5">
                    <div>
                      <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">{t("Select Meal")}</h4>
                      {vendorMeals.length === 0 ? (
                        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          {t("This vendor has no meal for the chosen time slot. Go back and pick another slot.")}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {vendorMeals.map((meal) => {
                            const isSelected = selectedMeal?._id === meal._id;
                            return (
                              <button
                                key={meal._id}
                                type="button"
                                onClick={() => {
                                  setSelectedMeal(meal);
                                  resetQuote();
                                }}
                                className={`flex items-center gap-3 p-3 text-left bg-white border-2 rounded-xl transition-all cursor-pointer ${isSelected ? 'border-brand-primary bg-brand-primary-light/5' : 'border-brand-divider hover:border-brand-primary/30'}`}
                              >
                                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                  {meal.photos?.[0] ? <img src={meal.photos[0]} alt={meal.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Utensils className="w-6 h-6 m-4 text-brand-muted" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-extrabold text-sm text-brand-text truncate">{meal.name}</p>
                                  <p className="text-xs font-bold text-brand-primary">{money(meal.pricePerDay, { compact: true })}<span className="text-brand-muted font-medium">{t("/day")}</span></p>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-brand-primary ml-auto flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">{t("Select Subscription Plan")}</h4>
                      <div className="grid grid-cols-1 gap-3 max-h-[260px] overflow-y-auto pr-2">
                        {subscriptionPlans.length === 0 ? (
                          <div className="text-center text-xs text-brand-muted p-8 bg-white rounded-xl border border-brand-divider">
                            {t("No active subscription plans available.")}
                          </div>
                        ) : (
                          subscriptionPlans.map((plan) => {
                            const isSelected = selectedPlan?._id === plan._id;
                            return (
                              <label key={plan._id} className="block cursor-pointer">
                                <input
                                  type="radio"
                                  name="subscription-plan-option"
                                  className="peer hidden"
                                  value={plan._id}
                                  checked={isSelected}
                                  onChange={() => {
                                    setSelectedPlan(plan);
                                    resetQuote();
                                  }}
                                />
                                <div className={`h-full bg-white border-2 rounded-xl transition-all p-4 ${isSelected ? 'border-brand-primary bg-brand-primary-light/5' : 'border-brand-divider hover:border-brand-primary/30'}`}>
                                  <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-extrabold text-sm text-brand-text">{plan.name}</h4>
                                    {Number(plan.discountPercent) > 0 && (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">{t("{{pct}}% off", { pct: plan.discountPercent })}</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-brand-muted mt-1">{planLabel(plan)}</p>
                                  {plan.description && (
                                    <p className="text-xs text-brand-text mt-2 leading-relaxed">{plan.description}</p>
                                  )}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {wizardStep === 4 && (
                  <div className="space-y-4">
                    <p className="text-xs text-brand-muted text-center">{t("Review the price summary before proceeding to payment.")}</p>
                    {quoteLoading && <div className="bg-white rounded-xl border border-brand-divider h-48 animate-pulse" />}
                    {quoteError && !quoteLoading && (
                      <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{quoteError}</span>
                      </div>
                    )}
                    {quote && !quoteLoading && (
                      <>
                        {quote.conflicts?.length > 0 && (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
                            <p className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{t("Some employees already get a meal in this slot during this period:")}</p>
                            <ul className="list-disc pl-5 text-xs space-y-0.5">
                              {quote.conflicts.map((c) => (
                                <li key={`${c.employeeId}-${c.slots.join()}`}>
                                  {c.until
                                    ? t("{{name}}: {{slots}} from {{vendor}} until {{date}}", { name: c.name, slots: slotNames(c.slots), vendor: c.vendorName, date: fmtDate(c.until) })
                                    : t("{{name}}: {{slots}} from {{vendor}}", { name: c.name, slots: slotNames(c.slots), vendor: c.vendorName })}
                                </li>
                              ))}
                            </ul>
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button onClick={dropConflicting} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer">{t("Remove them from this order")}</button>
                              <button onClick={() => setWizardStep(2)} className="px-3 py-1.5 rounded-lg border border-amber-400 text-amber-900 text-xs font-bold cursor-pointer">{t("Pick a later start date")}</button>
                            </div>
                          </div>
                        )}

                        <div className="bg-white border border-brand-divider rounded-xl overflow-hidden shadow-sm">
                          <div className="bg-brand-bg/40 px-4 py-3 border-b border-brand-divider text-[11px] font-bold uppercase tracking-wider text-brand-muted">{t("Price Summary")}</div>
                          <div className="px-4 py-3 border-b border-brand-divider/60 space-y-2 text-[13px]">
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Subscription Plan")}</span><span className="font-bold text-brand-text text-right">{quote.planName}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Meal")}</span><span className="font-bold text-brand-text text-right">{selectedMeal?.name}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Period")}</span><span className="font-bold text-brand-text text-right">{fmtDate(quote.startDate)} – {fmtDate(quote.lastDate)}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Meal Slots")}</span><span className="font-bold text-brand-text text-right">{slotNames(quote.deliverySlots)}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Deliveries per employee")}</span><span className="font-bold text-brand-text text-right">{quote.perEmployee?.deliveries}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Assigned Employees")}</span><span className="font-bold text-brand-text text-right">× {quote.employeeCount}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-brand-muted">{t("Price per employee")}</span><span className="font-bold text-brand-text text-right">{money(quote.perEmployee?.total)}</span></div>
                          </div>
                          <div className="px-4 py-3 border-b border-brand-divider/60 space-y-1.5 text-[13px] bg-brand-bg/10">
                            {quote.lines.map((line) => {
                              const key = LINE_LABELS[line.key];
                              const label = line.key === 'food_vat' || line.key === 'delivery_vat'
                                ? t("{{label}} ({{rate}}%)", { label: t(key), rate: line.rate })
                                : key ? t(key) : line.label;
                              return (
                                <div key={line.key} className={`flex justify-between ${line.amount < 0 ? 'text-emerald-700' : 'text-brand-muted'}`}>
                                  <span>{label}</span>
                                  <span className="font-bold">{line.amount < 0 ? `−${money(-line.amount)}` : money(line.amount)}</span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="px-4 py-4 flex justify-between items-center">
                            <span className="text-[15px] font-extrabold text-brand-text">{t("Total Price")}</span>
                            <span className="text-[22px] font-black text-green-600">{money(quote.total)}</span>
                          </div>
                        </div>
                        <PaymentMethodPicker
                          className="mt-4"
                          providers={methods.providers}
                          selected={methods.selected}
                          onSelect={methods.setSelected}
                          loading={methods.loading}
                          error={methods.error}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="p-4 border-t border-brand-divider bg-white flex justify-between items-center">
                <div>
                  <button
                    onClick={closeWizard}
                    disabled={isProcessingPayment}
                    className="px-5 py-2 text-brand-muted font-bold text-xs hover:text-brand-text transition-colors cursor-pointer"
                  >
                    {t("Cancel")}
                  </button>
                </div>
                <div className="flex gap-2">
                  {wizardStep > 1 && (
                    <button
                      onClick={() => goToStep(wizardStep - 1)}
                      disabled={isProcessingPayment}
                      className="px-5 py-2 border border-brand-divider text-brand-muted rounded-lg font-bold text-xs hover:bg-brand-bg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      {t("Back")}
                    </button>
                  )}
                  {wizardStep < 4 ? (
                    <button
                      onClick={() => goToStep(wizardStep + 1)}
                      disabled={!canNext}
                      className="px-6 py-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-40 text-white rounded-lg font-bold text-xs transition-all cursor-pointer"
                    >
                      {t("Next")}
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmAssignment}
                      disabled={isProcessingPayment || quoteLoading || !quote || quote.conflicts?.length > 0 || methods.loading || !methods.providers.length}
                      className="px-6 py-2 bg-[#6b9d8a] hover:bg-[#5a8674] disabled:opacity-40 text-white rounded-lg font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer w-full sm:w-auto justify-center"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      {isProcessingPayment ? t("Processing...") : t("Proceed to Checkout")}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* View Meal Modal */}
      <AnimatePresence>
        {viewMealVendor && (
          <div className="fixed inset-0 bg-brand-text/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-brand-divider bg-brand-bg/10 flex justify-between items-center">
                <h2 className="text-lg font-bold text-brand-text">
                  <Trans t={t} i18nKey={"Meal Plans for <0>{{name}}</0>"} defaults={"Meal Plans for <0>{{name}}</0>"} values={{ name: viewMealVendor.name }} components={[<span className="text-brand-primary" />]} />
                </h2>
                <button onClick={() => setViewMealVendor(null)} className="text-brand-muted hover:text-brand-text cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto bg-gray-50/50">
                {(!viewMealVendor.mealPlans || viewMealVendor.mealPlans.length === 0) ? (
                   <p className="text-brand-muted text-center py-8">{t("No meal plans available for this vendor.")}</p>
                ) : (
                   <div className="space-y-4">
                     {viewMealVendor.mealPlans.map(plan => (
                       <div key={plan._id || plan.id} className="bg-white border border-brand-divider p-4 rounded-xl flex items-start gap-4">
                         {/* Meal Image */}
                         <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200">
                           <img
                             src={(plan.photos && plan.photos[0]) || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=256&h=256'}
                             alt={plan.name}
                             className="w-full h-full object-cover"
                             referrerPolicy="no-referrer"
                           />
                         </div>

                         {/* Meal Details */}
                         <div className="flex-1 min-w-0">
                           <div className="flex justify-between items-start mb-1">
                             <div>
                               <h4 className="font-extrabold text-brand-text text-base truncate pr-2">{plan.name || t("Meal Box")}</h4>
                               <p className="text-xs text-brand-muted line-clamp-1">{plan.description || t("Nutritious daily meal box")}</p>
                             </div>
                             {(plan.nutrition?.calories || plan.nutrition?.calories === 0) && (
                               <span className="px-2.5 py-1 bg-white border border-gray-200 text-gray-500 rounded-full font-medium text-[10px] whitespace-nowrap">
                                 {t("{{calories}} kcal", { calories: plan.nutrition.calories })}
                               </span>
                             )}
                           </div>

                           <div className="mt-2 flex items-center">
                             <span className="font-extrabold text-brand-primary text-sm">
                               {money(plan.pricePerDay || plan.price, { compact: true })}
                               <span className="text-brand-muted font-medium text-xs">{t("/day")}</span>
                             </span>
                           </div>

                           {/* Tags */}
                           <div className="flex flex-wrap gap-1.5 mt-2.5">
                             {(plan.allergens || []).map(allergen => (
                               <span key={allergen} className="px-2 py-0.5 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-full text-[10px] font-bold capitalize">
                                 {allergen}
                               </span>
                             ))}
                             {(plan.dietTags || []).map(tag => (
                               <span key={tag} className="px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 rounded-full text-[10px] font-bold capitalize">
                                 {tag.replace('_', ' ')}
                               </span>
                             ))}
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
