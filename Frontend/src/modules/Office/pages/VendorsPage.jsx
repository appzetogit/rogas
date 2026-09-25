/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Sparkles, ClipboardCheck, UserPlus, Star, Search, X, Utensils, Check, ArrowLeft } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { getSubscriptionPlansApi } from '../services/officeApi';
import useDeliverySlots from '../../../shared/hooks/useDeliverySlots';


export default function VendorsTab({
  vendors,
  employees,
  onAssignEmployees,
}) {
  // Search State for Vendors
  const [vendorSearch, setVendorSearch] = useState('');

  // Active Assignment Wizard State
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [viewMealVendor, setViewMealVendor] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSearch, setWizardSearch] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const { enabledSlots: allSlots, window: slotWindow, label: slotLabelOf } = useDeliverySlots();
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedMealPlan, setSelectedMealPlan] = useState(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [feePerOrder, setFeePerOrder] = useState(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await getSubscriptionPlansApi();
        setSubscriptionPlans(res.data.plans || []);
        setFeePerOrder(Number(res.data.feePerOrder || 0));
      } catch (err) {
        console.error('Failed to fetch subscription plans', err);
      }
    };
    fetchPlans();
  }, []);

  // Reactively calculate pending tasks (unassigned active employees)
  const pendingCount = useMemo(() => {
    return employees.filter((emp) => emp.status === 'Active' && !emp.assignedVendorId).length;
  }, [employees]);

  // Filter vendors based on search
  const filteredVendors = useMemo(() => {
    return vendors.filter((v) =>
      v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.tag.toLowerCase().includes(vendorSearch.toLowerCase()) ||
      v.categories.some((cat) => cat.toLowerCase().includes(vendorSearch.toLowerCase()))
    );
  }, [vendors, vendorSearch]);

  // List of active employees for assignment (only unassigned)
  const activeEmployees = useMemo(() => {
    return employees.filter((emp) => emp.status === 'Active' && !emp.assignedVendorId);
  }, [employees]);

  // Filter employees inside the wizard search
  const filteredWizardEmployees = useMemo(() => {
    return activeEmployees.filter((emp) =>
      emp.name.toLowerCase().includes(wizardSearch.toLowerCase()) ||
      emp.department.toLowerCase().includes(wizardSearch.toLowerCase())
    );
  }, [activeEmployees, wizardSearch]);

  // Initialize assignment wizard
  const handleOpenAssignWizard = (vendor) => {
    setSelectedVendor(vendor);
    setWizardStep(1);
    setWizardSearch('');
    // Prefill with unassigned active employees, or empty
    const initiallySelected = activeEmployees
      .slice(0, 3) // select first 3 unassigned by default to guide the user
      .map((emp) => emp.id);
    setSelectedEmployeeIds(initiallySelected);
    setSelectedSlots(allSlots.length ? [allSlots[0].key] : []);
    setSelectedMealPlan(null);
    setIsProcessingPayment(false);
  };

  const handleToggleEmployee = (id) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id]
    );
  };

  const handleConfirmAssignment = async () => {
    if (selectedVendor && selectedEmployeeIds.length > 0 && selectedSlots.length > 0 && selectedMealPlan) {
      try {
        setIsProcessingPayment(true);
        // Compute grand total to pass to backend for Razorpay order
        const planPrice       = Number(selectedMealPlan.price || 0);
        const empCount        = selectedEmployeeIds.length;
        const slotCount       = selectedSlots.length;
        const foodVatPct      = Number(selectedMealPlan.foodVat || 0);
        const deliveryVatPct  = Number(selectedMealPlan.deliveryVat || 0);
        const platformFeeEach = Number(selectedMealPlan.platformFee || 0);
        const foodTotal       = planPrice * empCount;
        const foodVatAmt      = foodTotal * (foodVatPct / 100);
        const deliveryBase    = slotCount * feePerOrder * empCount;
        const deliveryVatAmt  = (deliveryBase / 100) * deliveryVatPct;
        const platformTotal   = platformFeeEach * empCount;
        const grandTotal      = foodTotal + foodVatAmt + deliveryVatAmt + platformTotal;

        // Get the vendor's first real DMBMealPlan _id (for subscription linking)
        const vendorMealPlanId = selectedVendor.mealPlans && selectedVendor.mealPlans.length > 0
          ? selectedVendor.mealPlans[0]._id
          : null;

        onAssignEmployees(
          selectedEmployeeIds,
          selectedVendor.id,
          selectedSlots,
          selectedMealPlan._id,  // VendorSubscriptionPlan._id — for billing/order creation
          grandTotal,
          vendorMealPlanId       // DMBMealPlan._id — for subscription record
        );
        setSelectedVendor(null);
      } finally {
        setIsProcessingPayment(false);
      }
    }
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

  return (
    <div className="space-y-6">
      {/* Search Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-brand-brand-primary tracking-tight">Curated Local Vendors</h3>
          <p className="text-xs text-brand-muted mt-1">Discover, manage, and assign subscriptions from verified organic kitchens.</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-white border border-brand-divider rounded-lg text-sm text-brand-text focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all"
            placeholder="Search vendors..."
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Bento Header section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white card-shadow rounded-xl p-8 relative overflow-hidden border border-brand-divider">
          <div className="relative z-10 w-3/4">
            <h3 className="text-lg font-bold text-brand-primary mb-2">Curation Phase</h3>
            <p className="text-sm text-brand-muted leading-relaxed">
              Assign meal subscriptions to your employees for the upcoming weekly cycle. Select verified, highly-rated local partners below to feed your teams organic, healthy daily packages.
            </p>
          </div>
          <div className="hidden lg:block opacity-10 absolute right-4 -bottom-4 text-brand-primary z-0 pointer-events-none">
            <Sparkles className="w-40 h-40" />
          </div>
        </div>

        <div className="bg-brand-primary text-white rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start">
            <p className="text-xs uppercase tracking-widest font-semibold opacity-80">Pending Tasks</p>
            <ClipboardCheck className="w-5 h-5 text-brand-primary-light" />
          </div>
          <p className="text-4xl font-extrabold my-2">{pendingCount}</p>
          <p className="text-xs opacity-90">Active employees waiting for a meal assignment</p>
        </div>
      </div>

      {/* Vendors Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredVendors.length === 0 ? (
          <div className="col-span-full bg-white p-12 text-center text-brand-muted border border-brand-divider rounded-xl">
            No local vendors match your active filters or search queries.
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
                          {vendor.rating.toFixed(1)} ({vendor.reviewsCount} reviews)
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
                  View Meal
                </button>
                <button
                  onClick={() => handleOpenAssignWizard(vendor)}
                  className="flex-1 py-3 bg-brand-primary hover:bg-brand-primary-dark text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Assign
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
                    Assign <span className="text-brand-primary">{selectedVendor.name}</span>
                  </h2>
                  <button onClick={() => setSelectedVendor(null)} className="text-brand-muted hover:text-brand-text cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Steps tracker indicators */}
                <div className="flex gap-4">
                  <div
                    onClick={() => setWizardStep(1)}
                    className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all cursor-pointer ${
                      wizardStep === 1 ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted hover:bg-brand-primary/10 hover:text-brand-primary'
                    }`}
                  >
                    1. Employees
                  </div>
                  <div
                    onClick={() => {
                      if (selectedEmployeeIds.length > 0) setWizardStep(2);
                    }}
                    className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all ${selectedEmployeeIds.length > 0 ? 'cursor-pointer hover:bg-brand-primary/10 hover:text-brand-primary' : 'cursor-not-allowed opacity-50'} ${
                      wizardStep === 2 ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted'
                    }`}
                  >
                    2. Time Slot
                  </div>
                  <div
                    onClick={() => {
                      if (selectedSlots.length > 0) setWizardStep(3);
                    }}
                    className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all ${selectedSlots.length > 0 ? 'cursor-pointer hover:bg-brand-primary/10 hover:text-brand-primary' : 'cursor-not-allowed opacity-50'} ${
                      wizardStep === 3 ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted'
                    }`}
                  >
                    3. Plan
                  </div>
                  <div
                    onClick={() => {
                      if (selectedMealPlan) setWizardStep(4);
                    }}
                    className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all ${selectedMealPlan ? 'cursor-pointer hover:bg-brand-primary/10 hover:text-brand-primary' : 'cursor-not-allowed opacity-50'} ${
                      wizardStep === 4 ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted'
                    }`}
                  >
                    4. Payment
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-grow overflow-y-auto p-6 bg-brand-bg/20 space-y-4">
                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                      <input
                        type="text"
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-brand-divider rounded-lg text-sm text-brand-text focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
                        placeholder="Search employee names or departments..."
                        value={wizardSearch}
                        onChange={(e) => setWizardSearch(e.target.value)}
                      />
                    </div>

                    <p className="text-[11px] text-brand-muted">
                      Select active employees below. Checked employees will receive a daily subscription box from {selectedVendor.name}.
                    </p>

                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {filteredWizardEmployees.length === 0 ? (
                        <div className="p-8 text-center text-xs text-brand-muted bg-white rounded-lg border border-brand-divider/30">
                          No active employees match search.
                        </div>
                      ) : (
                        filteredWizardEmployees.map((emp) => {
                          const isChecked = selectedEmployeeIds.includes(emp.id);
                          return (
                            <div
                              key={emp.id}
                              onClick={() => handleToggleEmployee(emp.id)}
                              className={`flex items-center justify-between p-3.5 bg-white rounded-lg border transition-colors cursor-pointer ${
                                isChecked ? 'border-brand-primary bg-brand-primary-light/20' : 'border-brand-divider/40 hover:border-brand-primary/50'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary border-brand-divider cursor-pointer"
                                  checked={isChecked}
                                  onChange={() => {}} // Controlled by outer div click
                                />
                                <div className="text-sm">
                                  <span className="font-bold text-brand-text">{emp.name}</span>
                                  <span className="text-xs text-brand-muted ml-2">({emp.id})</span>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 bg-brand-bg rounded text-[10px] text-brand-muted font-semibold">
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
                      Select the scheduled daily delivery window for these {selectedEmployeeIds.length} employee(s).
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      {allSlots
                        .filter((sl) => (selectedVendor.mealSlots || []).includes(sl.key))
                        .map((sl) => (
                          <label key={sl.key} className="cursor-pointer">
                            <input
                              type="checkbox"
                              name="delivery-slot-option"
                              className="peer hidden"
                              value={sl.key}
                              checked={selectedSlots.includes(sl.key)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedSlots([...selectedSlots, sl.key]);
                                else setSelectedSlots(selectedSlots.filter((k) => k !== sl.key));
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
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="font-bold text-base text-brand-text flex items-center gap-2">
                          <ClipboardCheck className="w-4 h-4 text-brand-primary" />
                          Subscription Plans
                        </h3>
                        <p className="text-xs text-brand-muted mt-0.5">{selectedVendor.name}</p>
                      </div>
                    </div>
                    
                    <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mb-2">Select Subscription Plan</h4>
                    
                    <div className="grid grid-cols-1 gap-4 max-h-[350px] overflow-y-auto pr-2">
                      {(!subscriptionPlans || subscriptionPlans.length === 0) ? (
                        <div className="col-span-full text-center text-xs text-brand-muted p-8 bg-white rounded-xl border border-brand-divider">
                          No active subscription plans available.
                        </div>
                      ) : (
                        subscriptionPlans.map((plan) => {
                          const isSelected = selectedMealPlan?._id === plan._id;
                          return (
                            <label key={plan._id} className="cursor-pointer block">
                              <input
                                type="radio"
                                name="subscription-plan-option"
                                className="peer hidden"
                                value={plan._id}
                                checked={isSelected}
                                onChange={() => setSelectedMealPlan(plan)}
                              />
                              <div className={`h-full bg-white border-2 rounded-xl transition-all p-4 ${isSelected ? 'border-brand-primary bg-brand-primary-light/5' : 'border-brand-divider hover:border-brand-primary/30'}`}>
                                <div className="flex justify-between items-start mb-1">
                                  <h4 className="font-extrabold text-sm text-brand-text">{plan.name}</h4>
                                  <span className="font-extrabold text-brand-primary text-sm">₹{plan.price}</span>
                                </div>
                                <p className="text-xs text-brand-muted mt-1">
                                  {plan.duration === 'week' ? 'Weekly plan' : plan.duration === 'month' ? 'Monthly plan' : 'Daily plan'} 
                                  {plan.deliveryDays === 'mon_fri' ? ' - Monday-Friday (5 Delivery Days)' : ' - Full Week (30 Delivery Days)'}
                                </p>
                                {plan.description && (
                                  <p className="text-xs text-brand-text mt-2 leading-relaxed">
                                    {plan.description}
                                  </p>
                                )}
                                <div className="mt-3 flex items-center justify-between">
                                  <div className="flex gap-2">
                                    <span className="px-2 py-1 bg-white border border-brand-divider rounded-full text-[9px] font-medium text-brand-muted flex items-center gap-1">
                                      <Check className="w-3 h-3" />
                                      {plan.duration}
                                    </span>
                                  </div>
                                  {isSelected && (
                                    <span className="text-xs font-bold text-brand-primary flex items-center gap-1">
                                      <div className="w-4 h-4 bg-brand-primary rounded-full flex items-center justify-center">
                                        <Check className="w-2.5 h-2.5 text-white" />
                                      </div>
                                      Selected
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
                
                {wizardStep === 4 && selectedMealPlan && (() => {
                  const planPrice        = Number(selectedMealPlan.price || 0);
                  const empCount         = selectedEmployeeIds.length;
                  const slotCount        = selectedSlots.length;
                  const foodVatPct       = Number(selectedMealPlan.foodVat || 0);
                  const deliveryVatPct   = Number(selectedMealPlan.deliveryVat || 0);
                  const platformFeeEach  = Number(selectedMealPlan.platformFee || 0);

                  // Food
                  const foodTotal    = planPrice * empCount;
                  const foodVatAmt   = foodTotal * (foodVatPct / 100);

                  // Delivery VAT: slots × feePerOrder × employees = deliveryBase → deliveryBase / 100 × deliveryVatPct
                  const deliveryBase  = slotCount * feePerOrder * empCount;
                  const deliveryVatAmt = (deliveryBase / 100) * deliveryVatPct;

                  // Platform
                  const platformTotal  = platformFeeEach * empCount;

                  const grandTotal = foodTotal + foodVatAmt + deliveryVatAmt + platformTotal;

                  const S = {
                    wrap:  { width: '100%', padding: '0 2px' },
                    card:  { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' },
                    hdr:   { background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' },
                    info:  { padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px' },
                    break: { padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fafafa' },
                    row:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
                    lbl:   { fontSize: '13px', color: '#64748b', fontWeight: 500, flexShrink: 0 },
                    val:   { fontSize: '13px', color: '#1e293b', fontWeight: 700, textAlign: 'right' },
                    total: { padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
                    tlbl:  { fontSize: '15px', color: '#0f172a', fontWeight: 800 },
                    tval:  { fontSize: '22px', color: '#16a34a', fontWeight: 900 },
                  };

                  const Row = ({ label, value }) => (
                    <div style={S.row}>
                      <span style={S.lbl}>{label}</span>
                      <span style={S.val}>{value}</span>
                    </div>
                  );

                  return (
                    <div style={S.wrap}>
                      <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginBottom: '14px' }}>
                        Review the price summary before proceeding to payment.
                      </p>
                      <div style={S.card}>
                        <div style={S.hdr}>Price Summary</div>

                        {/* Plan details */}
                        <div style={S.info}>
                          <Row label="Subscription Plan" value={selectedMealPlan.name} />
                          <Row label="Plan Price"        value={`₹${planPrice.toFixed(2)}`} />
                          <Row label="Duration"          value={selectedMealPlan.duration === 'week' ? 'Weekly (Mon–Fri)' : selectedMealPlan.duration === 'month' ? 'Monthly (Full Week)' : 'Daily'} />
                          <Row label="Assigned Employees" value={`× ${empCount}`} />
                          <Row label="Meal Slots"        value={`${selectedSlots.map((k) => slotLabelOf(k)).join(', ')} (× ${slotCount})`} />
                        </div>

                        {/* Cost breakdown — shown only when user clicks ⓘ */}
                        <div style={S.break}>
                          <Row label={`Food Total  (₹${planPrice} × ${empCount})`}  value={`₹${foodTotal.toFixed(2)}`} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500, flexShrink: 0 }}>Tax & Fee Breakdown</span>
                            <button
                              onClick={() => setShowBreakdown(p => !p)}
                              style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '50%', width: '20px', height: '20px', fontSize: '11px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                              title="Show/hide breakdown"
                            >ⓘ</button>
                          </div>
                          {showBreakdown && (
                            <>
                              <Row label={`Food VAT  (${foodVatPct}% of ₹${foodTotal.toFixed(2)})`}                              value={`₹${foodVatAmt.toFixed(2)}`} />
                              <Row label={`Delivery VAT  (${slotCount}×₹${feePerOrder}×${empCount}÷100×${deliveryVatPct}%)`}  value={`₹${deliveryVatAmt.toFixed(2)}`} />
                              <Row label={`Platform Fee  (₹${platformFeeEach} × ${empCount})`}                                  value={`₹${platformTotal.toFixed(2)}`} />
                            </>
                          )}
                        </div>

                        {/* Grand total */}
                        <div style={S.total}>
                          <span style={S.tlbl}>Total Price</span>
                          <span style={S.tval}>₹{grandTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Actions Footer */}
              <div className="p-4 border-t border-brand-divider bg-white flex justify-between items-center">
                <div>
                  <button
                    onClick={() => setSelectedVendor(null)}
                    className="px-5 py-2 text-brand-muted font-bold text-xs hover:text-brand-text transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex gap-2">
                  {wizardStep > 1 && (
                    <button
                      onClick={() => setWizardStep(prev => prev - 1)}
                      disabled={isProcessingPayment}
                      className="px-5 py-2 border border-brand-divider text-brand-muted rounded-lg font-bold text-xs hover:bg-brand-bg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  )}
                  {wizardStep < 4 ? (
                    <button
                      onClick={() => setWizardStep(prev => prev + 1)}
                      disabled={
                        (wizardStep === 1 && selectedEmployeeIds.length === 0) ||
                        (wizardStep === 2 && selectedSlots.length === 0) ||
                        (wizardStep === 3 && !selectedMealPlan)
                      }
                      className="px-6 py-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-40 text-white rounded-lg font-bold text-xs transition-all cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmAssignment}
                      disabled={isProcessingPayment}
                      className="px-6 py-2 bg-[#6b9d8a] hover:bg-[#5a8674] disabled:opacity-40 text-white rounded-lg font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer w-full sm:w-auto justify-center"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      {isProcessingPayment ? 'Processing...' : 'Proceed to Checkout'}
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
                  Meal Plans for <span className="text-brand-primary">{viewMealVendor.name}</span>
                </h2>
                <button onClick={() => setViewMealVendor(null)} className="text-brand-muted hover:text-brand-text cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto bg-gray-50/50">
                {(!viewMealVendor.mealPlans || viewMealVendor.mealPlans.length === 0) ? (
                   <p className="text-brand-muted text-center py-8">No meal plans available for this vendor.</p>
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
                               <h4 className="font-extrabold text-brand-text text-base truncate pr-2">{plan.name || 'Meal Box'}</h4>
                               <p className="text-xs text-brand-muted line-clamp-1">{plan.description || 'Nutritious daily meal box'}</p>
                             </div>
                             {(plan.nutrition?.calories || plan.nutrition?.calories === 0) && (
                               <span className="px-2.5 py-1 bg-white border border-gray-200 text-gray-500 rounded-full font-medium text-[10px] whitespace-nowrap">
                                 {plan.nutrition.calories} kcal
                               </span>
                             )}
                           </div>
                           
                           <div className="mt-2 flex items-center">
                             <span className="font-extrabold text-brand-primary text-sm">
                               {plan.currency === 'INR' ? '₹' : '$'}{plan.pricePerDay || plan.price}
                               <span className="text-brand-muted font-medium text-xs">/day</span>
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
