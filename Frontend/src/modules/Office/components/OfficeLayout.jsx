/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Menu, Bell, Search, Settings, X, ShieldAlert, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import EmployeesTab from '../pages/EmployeesPage';
import VendorsTab from '../pages/VendorsPage';
import MealPlansTab from '../pages/AssignmentsPage';
import PaymentHistoryTab from '../pages/PaymentHistoryPage';
import PrivacyPolicyPage from '../pages/PrivacyPolicyPage';
import TermsAndConditionsPage from '../pages/TermsAndConditionsPage';
import CompanyDetailsTab from '../pages/CompanyPage';
import {
  getEmployeesApi, addEmployeeApi, updateEmployeeApi, deleteEmployeeApi,
  getVendorsApi, getCompanyDetailsApi, updateCompanyDetailsApi, createAssignmentOrderApi, deleteAssignmentApi
} from '../services/officeApi';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../../../shared/i18n/LanguageSwitcher";
import { completePayment, paymentRequestExtras } from "../../../shared/payments/api";
import usePaymentResult from "../../../shared/payments/usePaymentResult";

export default function App() {
  const { t } = useTranslation("office");
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname.split('/').pop();
  let activeTab = 'employees';
  if (path === 'VendorsAssign') activeTab = 'vendors';
  else if (path === 'AssignedMealPlans') activeTab = 'meal-plans';
  else if (path === 'PaymentHistory') activeTab = 'payment-history';
  else if (path === 'PrivacyPolicy') activeTab = 'privacy-policy';
  else if (path === 'TermsAndConditions') activeTab = 'terms-and-conditions';
  else if (path === 'CompanyDetails') activeTab = 'company';
  else activeTab = 'employees';

  const setActiveTab = (tab) => {
    if (tab === 'employees') navigate('/office/dashboard');
    else if (tab === 'vendors') navigate('/office/VendorsAssign');
    else if (tab === 'meal-plans') navigate('/office/AssignedMealPlans');
    else if (tab === 'payment-history') navigate('/office/PaymentHistory');
    else if (tab === 'privacy-policy') navigate('/office/PrivacyPolicy');
    else if (tab === 'terms-and-conditions') navigate('/office/TermsAndConditions');
    else if (tab === 'company') navigate('/office/CompanyDetails');
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Core state managers loaded from API
  const [employees, setEmployees] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [delivery, setDelivery] = useState(null);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);

  const fetchDashboardData = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [empRes, venRes, compRes] = await Promise.all([
        getEmployeesApi({ limit: 1000 }), // fetch all for now
        getVendorsApi(),
        getCompanyDetailsApi()
      ]);
      const employeesData = (empRes.data.data.employees || []).map(emp => ({ ...emp, id: emp._id }));
      setDelivery(venRes.data.data?.delivery || null);
      const vendorsData = (venRes.data.data?.vendors || []).map(v => ({
        ...v,
        id: v._id,
        name: v.restaurantName || v.name,
        tag: v.vendorType || '',
        categories: v.cuisines || [],
        rating: v.rating || 0,
        imageUrl: (v.coverImages && v.coverImages.length > 0) ? v.coverImages[0] : (v.profileImage || 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80'),
        shortName: (v.restaurantName || v.name || 'V').substring(0, 2).toUpperCase(),
        reviewsCount: v.totalRatings || 0,
        description: v.description || 'Verified local organic kitchen partner offering healthy daily meals.',
      }));
      setEmployees(employeesData);
      setVendors(vendorsData);
      setCompanyDetails(compRes.data.data || null);
      setDataVersion((v) => v + 1);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (error.response?.status === 401) {
        navigate('/office/login');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 1. Employee Mutators (resolve true when saved, so the form can stay open on an error)
  const handleAddEmployee = async (empData) => {
    try {
      await addEmployeeApi(empData);
      fetchDashboardData({ silent: true }); // Refresh data
      return true;
    } catch (error) {
      alert(error.response?.data?.message || t("Failed to add employee"));
      return false;
    }
  };

  const handleUpdateEmployee = async (id, updatedFields) => {
    try {
      await updateEmployeeApi(id, updatedFields);
      fetchDashboardData({ silent: true });
      return true;
    } catch (error) {
      alert(error.response?.data?.message || t("Failed to update employee"));
      return false;
    }
  };

  const handleDeleteEmployee = async (id) => {
    try {
      await deleteEmployeeApi(id);
      fetchDashboardData();
    } catch (error) {
      alert(error.response?.data?.message || t("Failed to delete employee"));
    }
  };

  // 2. Meal Subscription Actions (Assignment / Unassignment)
  /**
   * Starts the payment for an order the office reviewed. The server prices it again and refuses a total the office did
   * not see; the meals are assigned when the payment is confirmed (hosted page, test payment or Razorpay pop-up — all
   * end on the shared return page, which brings the office back to Assigned Meal Plans). Resolves true when the
   * payment page took over.
   */
  const handleCheckout = async (order) => {
    try {
      const orderRes = await createAssignmentOrderApi({
        ...order,
        ...paymentRequestExtras({ provider: order.provider, returnPath: '/office/AssignedMealPlans', cancelPath: '/office/VendorsAssign' }),
      });
      await completePayment(orderRes.data.data.payment, { panel: 'office' });
      return true;
    } catch (error) {
      if (error?.message === 'cancelled') return false; // the office closed the payment pop-up
      alert(error.response?.data?.message || error.message || t("Failed to initiate checkout"));
      return false;
    }
  };

  // Back from the payment return page: the meals were assigned by the payment confirmation.
  usePaymentResult(({ status, purpose }) => {
    if (status === 'success' && purpose === 'office') {
      fetchDashboardData();
      alert(t("Payment successful! Subscriptions have been assigned."));
    }
  });

  /** Stops one company-paid meal plan (from tomorrow; paid days are not refunded). Resolves true when it was cancelled. */
  const handleCancelAssignment = async (assignmentId) => {
    try {
      await deleteAssignmentApi(assignmentId);
      fetchDashboardData({ silent: true });
      return true;
    } catch (error) {
      alert(error.response?.data?.message || t("Failed to unassign employee"));
      return false;
    }
  };

  // 3. Company details profile modifier
  const handleUpdateCompanyDetails = async (updatedFields) => {
    try {
      await updateCompanyDetailsApi(updatedFields);
      fetchDashboardData();
    } catch (error) {
      alert(t("Failed to update company details"));
    }
  };

  // Map tab IDs to literal UI titles
  const getTabTitle = () => {
    switch (activeTab) {
      case 'employees':
        return t("Employees");
      case 'vendors':
        return t("Vendors & Assign");
      case 'meal-plans':
        return t("Assigned Meal Plans");
      case 'payment-history':
        return t("Payment History");
      case 'privacy-policy':
        return t("Privacy Policy");
      case 'terms-and-conditions':
        return t("Terms and Conditions");
      case 'company':
        return t("Company Details");
      default:
        return t("DailyMealBox");
    }
  };

  // Simple Notification banner alert simulation
  const handleTriggerNotificationAlert = () => {
    alert(t("System Notification: Curation Period ends soon. Please finalize subscriptions before Friday."));
  };

  return (
    <div className="bg-brand-bg text-brand-text font-sans min-h-screen antialiased">
      {/* PERSISTENT SIDEBAR - Hidden on mobile, persistently fixed on desktop */}
      <div className="hidden md:block">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} companyDetails={companyDetails} />
      </div>

      {/* MOBILE HEADER & SIDEBAR SYSTEM */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            {/* Dark tint backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />
            {/* Sidebar box container */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-[260px] bg-brand-primary h-full flex flex-col z-50 shadow-2xl"
            >
              <button
                onClick={() => setIsMobileSidebarOpen(false)}
                className="absolute top-4 right-4 text-white hover:text-white/80 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
              <Sidebar
                activeTab={activeTab}
                setActiveTab={(tab) => {
                  setActiveTab(tab);
                  setIsMobileSidebarOpen(false);
                }}
                companyDetails={companyDetails}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MAIN CONTAINER WRAPPER */}
      <div className="md:pl-[260px] flex flex-col min-h-screen">

        {/* TOP SYSTEM HEADER */}
        <header className="h-16 w-full bg-brand-surface border-b border-brand-divider flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-1 text-brand-primary hover:bg-brand-primary/5 rounded-lg md:hidden cursor-pointer"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-base font-bold text-brand-primary">{getTabTitle()}</h2>
          </div>

          {/* Quick global widgets */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher selectClassName="rounded-lg border border-brand-divider bg-transparent px-2 py-1 text-xs font-semibold text-brand-muted focus:outline-none cursor-pointer" />
            <button
              onClick={handleTriggerNotificationAlert}
              className="p-2 text-brand-muted hover:bg-brand-bg rounded-full transition-colors cursor-pointer relative"
              title={t("System Alerts")}
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-error-text rounded-full animate-pulse"></span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <RefreshCw className="animate-spin text-4xl text-brand-primary" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'employees' && (
                  <EmployeesTab
                    employees={employees}
                    onAddEmployee={handleAddEmployee}
                    onUpdateEmployee={handleUpdateEmployee}
                    onDeleteEmployee={handleDeleteEmployee}
                  />
                )}

                {activeTab === 'vendors' && (
                  <VendorsTab
                    vendors={vendors}
                    employees={employees}
                    delivery={delivery}
                    onCheckout={handleCheckout}
                    onGoToCompany={() => setActiveTab('company')}
                  />
                )}

                {activeTab === 'meal-plans' && (
                  <MealPlansTab
                    employees={employees}
                    refreshKey={dataVersion}
                    onCancelAssignment={handleCancelAssignment}
                    onSetTab={setActiveTab}
                  />
                )}

                {activeTab === 'payment-history' && (
                  <PaymentHistoryTab />
                )}

                {activeTab === 'privacy-policy' && (
                  <PrivacyPolicyPage />
                )}

                {activeTab === 'terms-and-conditions' && (
                  <TermsAndConditionsPage />
                )}

                {activeTab === 'company' && companyDetails && (
                  <CompanyDetailsTab
                    details={companyDetails}
                    onUpdateDetails={handleUpdateCompanyDetails}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>

        {/* LOGISTICS FOOTER */}
        <footer className="mt-auto px-8 py-5 border-t border-brand-divider text-brand-muted flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p>{t("© 2026 DailyMealBox Logistics Sp. z o.o. All rights reserved.")}</p>
          <div className="flex gap-4">
            <button onClick={() => setActiveTab('privacy-policy')} className="hover:text-brand-primary underline cursor-pointer">
              {t("Privacy Policy")}
            </button>
            <button onClick={() => setActiveTab('terms-and-conditions')} className="hover:text-brand-primary underline cursor-pointer">
              {t("Terms & Conditions")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
