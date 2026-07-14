/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Pencil, Building2, CreditCard, Mail, Phone, Shield, ShieldCheck, Users, Store, X, Check } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';



export default function CompanyDetailsTab({
  details,
  onUpdateDetails,
}) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Form Field State
  const [legalName, setLegalName] = useState(details.legalName);
  const [nip, setNip] = useState(details.nip);
  const [regon, setRegon] = useState(details.regon);
  const [regAddr, setRegAddr] = useState(details.registeredAddress);
  const [delAddr, setDelAddr] = useState(details.deliveryAddress);
  const [budgetCap, setBudgetCap] = useState(details.monthlyBudgetCap.toString());
  const [contactName, setContactName] = useState(details.contactName);
  const [contactRole, setContactRole] = useState(details.contactRole);
  const [contactEmail, setContactEmail] = useState(details.contactEmail);
  const [contactPhone, setContactPhone] = useState(details.contactPhone);

  const handleOpenEdit = () => {
    setLegalName(details.legalName);
    setNip(details.nip);
    setRegon(details.regon);
    setRegAddr(details.registeredAddress);
    setDelAddr(details.deliveryAddress);
    setBudgetCap(details.monthlyBudgetCap.toString());
    setContactName(details.contactName);
    setContactRole(details.contactRole);
    setContactEmail(details.contactEmail);
    setContactPhone(details.contactPhone);
    setIsEditModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    onUpdateDetails({
      legalName,
      nip,
      regon,
      registeredAddress: regAddr,
      deliveryAddress: delAddr,
      monthlyBudgetCap: parseFloat(budgetCap) || details.monthlyBudgetCap,
      contactName,
      contactRole,
      contactEmail,
      contactPhone,
    });
    setIsEditModalOpen(false);
    alert('Company details have been updated successfully.');
  };

  // Helper to render budget cap nicely
  const formattedBudgetCap = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(details.monthlyBudgetCap);

  // Utilization calculation
  const utilPercent = Math.min(100, Math.round((details.budgetUtilized / details.monthlyBudgetCap) * 100));

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-brand-brand-primary tracking-tight">Company Logistics Profile</h3>
          <p className="text-xs text-brand-muted mt-1">Review verified legal registrations, active billing cap, and billing tier contract.</p>
        </div>
        <button
          onClick={handleOpenEdit}
          className="bg-white border border-brand-primary text-brand-primary hover:bg-brand-primary/5 px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold transition-all duration-150 active:scale-[0.98] cursor-pointer text-xs shadow-sm"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit details
        </button>
      </div>

      {/* Grid containing 4 visual cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Company Profile */}
        <div className="bg-white rounded-xl card-shadow p-6 border border-brand-divider space-y-4">
          <div className="flex items-center gap-3 border-b border-brand-divider pb-3">
            <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-brand-text">Company Profile</h4>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Legal Name</p>
              <p className="text-sm font-semibold text-brand-text mt-0.5">{details.legalName}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">NIP (Tax ID)</p>
                <p className="text-xs font-semibold text-brand-text mt-0.5">{details.nip}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">REGON</p>
                <p className="text-xs font-semibold text-brand-text mt-0.5">{details.regon}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Registered Office Address</p>
              <p className="text-xs text-brand-muted leading-relaxed mt-0.5">{details.registeredAddress}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Central Delivery Address</p>
              <p className="text-xs text-brand-muted leading-relaxed mt-0.5">{details.deliveryAddress}</p>
            </div>
          </div>
        </div>

        {/* Card 2: Billing & Contract */}
        <div className="bg-white rounded-xl card-shadow p-6 border border-brand-divider space-y-4">
          <div className="flex items-center justify-between border-b border-brand-divider pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg">
                <CreditCard className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-brand-text">Billing & Contract</h4>
            </div>
            <span className="px-2.5 py-0.5 bg-brand-primary-light text-brand-primary rounded-full text-[10px] font-extrabold uppercase">
              Annual Tier
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Plan Type</p>
              <p className="text-sm font-semibold text-brand-primary mt-0.5">{details.planType}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Billing Cycle</p>
                <p className="text-xs font-semibold text-brand-text mt-0.5">{details.billingCycle}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Payment Method</p>
                <p className="text-xs font-semibold text-brand-text mt-0.5">{details.paymentMethod}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Monthly Budget Cap</p>
              <p className="text-base font-bold text-brand-text mt-0.5">{formattedBudgetCap}</p>
              
              {/* Utilization progress bar */}
              <div className="mt-2 space-y-1">
                <div className="w-full bg-brand-bg rounded-full h-2 overflow-hidden border border-brand-divider">
                  <div
                    className="bg-brand-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${utilPercent}%` }}
                  ></div>
                </div>
                <p className="text-[9px] text-brand-muted font-semibold">
                  {utilPercent}% of budget utilized this month
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Contract Start Date</p>
              <p className="text-xs text-brand-muted mt-0.5">{details.contractStartDate}</p>
            </div>
          </div>
        </div>

        {/* Card 3: Primary Contact */}
        <div className="bg-white rounded-xl card-shadow p-6 border border-brand-divider space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 border-b border-brand-divider pb-3 mb-4">
              <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg">
                <Shield className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-brand-text">Primary Contact</h4>
            </div>

            {/* Profile circular visual block */}
            <div className="flex flex-col items-center py-2 text-center">
              <div className="w-16 h-16 rounded-full bg-brand-primary-light text-brand-primary border border-brand-primary/20 flex items-center justify-center font-bold text-lg shadow-inner">
                {details.contactName.split(' ').map((n) => n[0]).join('')}
              </div>
              <h5 className="font-bold text-sm text-brand-text mt-3">{details.contactName}</h5>
              <p className="text-[11px] text-brand-primary font-semibold mt-0.5">{details.contactRole}</p>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-3 p-2.5 bg-brand-bg/50 border border-brand-divider rounded-lg">
              <Mail className="w-4 h-4 text-brand-muted flex-shrink-0" />
              <div className="overflow-hidden">
                <p className="text-[9px] font-bold text-brand-muted uppercase leading-none">Email Address</p>
                <p className="text-xs font-semibold text-brand-text truncate mt-0.5">{details.contactEmail}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2.5 bg-brand-bg/50 border border-brand-divider rounded-lg">
              <Phone className="w-4 h-4 text-brand-muted flex-shrink-0" />
              <div>
                <p className="text-[9px] font-bold text-brand-muted uppercase leading-none">Phone Number</p>
                <p className="text-xs font-semibold text-brand-text mt-0.5">{details.contactPhone}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-2.5 bg-brand-bg/50 border border-brand-divider rounded-lg">
              <Shield className="w-4 h-4 text-brand-muted flex-shrink-0" />
              <div>
                <p className="text-[9px] font-bold text-brand-muted uppercase leading-none">Role in System</p>
                <p className="text-xs font-semibold text-brand-text mt-0.5">Primary Account Administrator</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Account Status */}
        <div className="bg-white rounded-xl card-shadow p-6 border border-brand-divider space-y-4">
          <div className="flex items-center gap-3 border-b border-brand-divider pb-3">
            <div className="p-2 bg-brand-primary/10 text-brand-primary rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-brand-text">Account Status</h4>
          </div>

          <div className="space-y-4">
            {/* Active and verified banner */}
            <div className="p-4 bg-brand-primary-light/40 border border-brand-primary/10 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse"></span>
                <span className="text-xs font-extrabold text-brand-primary uppercase tracking-wide">
                  Active & Verified
                </span>
              </div>
              <ShieldCheck className="w-6 h-6 text-brand-primary" />
            </div>

            {/* Quick stats grid */}
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 border border-brand-divider rounded-xl bg-brand-bg/20 text-center">
                <Users className="w-5 h-5 text-brand-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-brand-text">{details.totalEmployees}</p>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-1">Employees</p>
              </div>
              <div className="p-4 border border-brand-divider rounded-xl bg-brand-bg/20 text-center">
                <Store className="w-5 h-5 text-brand-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-brand-text">{details.activeVendorsCount}</p>
                <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider mt-1">Vendors</p>
              </div>
            </div>

            <p className="text-[11px] text-brand-muted leading-relaxed text-center pt-2">
              All compliance documentation is up to date. Next verification scheduled for November 2026.
            </p>
          </div>
        </div>
      </div>

      {/* Edit Details Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-brand-text/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-xl modal-shadow overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-brand-divider flex items-center justify-between bg-brand-bg/30">
                <h3 className="text-lg font-bold text-brand-primary">Edit Company Details</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-brand-muted hover:text-brand-text cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Company Legal Name
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      NIP (Tax ID)
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={nip}
                      onChange={(e) => setNip(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      REGON
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={regon}
                      onChange={(e) => setRegon(e.target.value)}
                    />
                  </div>

                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Registered Address
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={regAddr}
                      onChange={(e) => setRegAddr(e.target.value)}
                    />
                  </div>

                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Delivery Address
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={delAddr}
                      onChange={(e) => setDelAddr(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Monthly Budget Cap (€)
                    </label>
                    <input
                      type="number"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={budgetCap}
                      onChange={(e) => setBudgetCap(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Primary Contact Name
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Contact Phone
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none text-sm"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="px-6 py-4 -mx-6 -mb-6 mt-6 bg-brand-bg/30 border-t border-brand-divider flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2.5 text-brand-muted text-sm font-semibold hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-semibold rounded-lg transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
