/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Sparkles, ClipboardCheck, UserPlus, Star, Search, X, Sun, Moon, Utensils, Check, ArrowLeft } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';



export default function VendorsTab({
  vendors,
  employees,
  onAssignEmployees,
}) {
  // Search State for Vendors
  const [vendorSearch, setVendorSearch] = useState('');

  // Active Assignment Wizard State
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardSearch, setWizardSearch] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('Lunch');

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

  // List of active employees for assignment
  const activeEmployees = useMemo(() => {
    return employees.filter((emp) => emp.status === 'Active');
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
      .filter((emp) => !emp.assignedVendorId)
      .slice(0, 3) // select first 3 unassigned by default to guide the user
      .map((emp) => emp.id);
    setSelectedEmployeeIds(initiallySelected);
    setSelectedSlot('Lunch');
  };

  const handleToggleEmployee = (id) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id]
    );
  };

  const handleConfirmAssignment = () => {
    if (selectedVendor && selectedEmployeeIds.length > 0) {
      onAssignEmployees(selectedEmployeeIds, selectedVendor.id, selectedSlot);
      setSelectedVendor(null);
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
        <div className="md:col-span-2 bg-white card-shadow rounded-xl p-6 flex items-center justify-between overflow-hidden relative border border-brand-divider">
          <div>
            <h3 className="text-lg font-bold text-brand-primary mb-1">Curation Phase</h3>
            <p className="text-xs text-brand-muted max-w-md leading-relaxed">
              Assign meal subscriptions to your employees for the upcoming weekly cycle. Select verified, highly-rated local partners below to feed your teams organic, healthy daily packages.
            </p>
          </div>
          <div className="hidden lg:block opacity-10 absolute right-4 bottom-2 text-brand-primary">
            <Sparkles className="w-28 h-28" />
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
              <div className="p-6 pt-0">
                <button
                  onClick={() => handleOpenAssignWizard(vendor)}
                  className="w-full py-3 bg-brand-primary hover:bg-brand-primary-dark text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  Assign to employees
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
                    className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all ${
                      wizardStep === 1 ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted'
                    }`}
                  >
                    1. Employees
                  </div>
                  <div
                    className={`flex-1 py-1.5 text-center rounded-full text-xs font-bold transition-all ${
                      wizardStep === 2 ? 'bg-brand-primary text-white' : 'bg-brand-bg text-brand-muted'
                    }`}
                  >
                    2. Time Slot
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-grow overflow-y-auto p-6 bg-brand-bg/20 space-y-4">
                {wizardStep === 1 ? (
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
                ) : (
                  <div className="space-y-4 py-4 text-center">
                    <p className="text-xs text-brand-muted">
                      Select the scheduled daily delivery window for these {selectedEmployeeIds.length} employee(s).
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                      {/* Breakfast card */}
                      <label className="cursor-pointer">
                        <input
                          type="radio"
                          name="delivery-slot-option"
                          className="peer hidden"
                          value="Breakfast"
                          checked={selectedSlot === 'Breakfast'}
                          onChange={() => setSelectedSlot('Breakfast')}
                        />
                        <div className="h-full flex flex-col items-center justify-center p-6 bg-white border-2 border-brand-divider rounded-xl peer-checked:border-brand-primary peer-checked:bg-brand-primary-light/10 hover:bg-white/80 transition-all">
                          <Sun className="w-10 h-10 mb-3 text-orange-400" />
                          <span className="font-bold text-sm text-brand-text">Breakfast</span>
                          <span className="text-[10px] text-brand-muted mt-1">08:00 AM - 10:00 AM</span>
                        </div>
                      </label>

                      {/* Lunch card */}
                      <label className="cursor-pointer">
                        <input
                          type="radio"
                          name="delivery-slot-option"
                          className="peer hidden"
                          value="Lunch"
                          checked={selectedSlot === 'Lunch'}
                          onChange={() => setSelectedSlot('Lunch')}
                        />
                        <div className="h-full flex flex-col items-center justify-center p-6 bg-white border-2 border-brand-divider rounded-xl peer-checked:border-brand-primary peer-checked:bg-brand-primary-light/10 hover:bg-white/80 transition-all">
                          <Utensils className="w-10 h-10 mb-3 text-brand-primary" />
                          <span className="font-bold text-sm text-brand-text">Lunch</span>
                          <span className="text-[10px] text-brand-muted mt-1">12:00 PM - 02:00 PM</span>
                        </div>
                      </label>

                      {/* Dinner card */}
                      <label className="cursor-pointer">
                        <input
                          type="radio"
                          name="delivery-slot-option"
                          className="peer hidden"
                          value="Dinner"
                          checked={selectedSlot === 'Dinner'}
                          onChange={() => setSelectedSlot('Dinner')}
                        />
                        <div className="h-full flex flex-col items-center justify-center p-6 bg-white border-2 border-brand-divider rounded-xl peer-checked:border-brand-primary peer-checked:bg-brand-primary-light/10 hover:bg-white/80 transition-all">
                          <Moon className="w-10 h-10 mb-3 text-indigo-400" />
                          <span className="font-bold text-sm text-brand-text">Dinner</span>
                          <span className="text-[10px] text-brand-muted mt-1">06:00 PM - 08:00 PM</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
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
                  {wizardStep === 2 && (
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-5 py-2 border border-brand-divider text-brand-muted rounded-lg font-bold text-xs hover:bg-brand-bg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back
                    </button>
                  )}
                  {wizardStep === 1 ? (
                    <button
                      onClick={() => setWizardStep(2)}
                      disabled={selectedEmployeeIds.length === 0}
                      className="px-6 py-2 bg-brand-primary hover:bg-brand-primary-dark disabled:opacity-40 text-white rounded-lg font-bold text-xs transition-all cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmAssignment}
                      className="px-6 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white rounded-lg font-bold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Confirm Assignment
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
