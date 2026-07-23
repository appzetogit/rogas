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
import CompanyDetailsTab from '../pages/CompanyPage';
import { 
  getEmployeesApi, addEmployeeApi, updateEmployeeApi, deleteEmployeeApi, 
  getVendorsApi, assignMealsApi, getCompanyDetailsApi, updateCompanyDetailsApi, createAssignmentOrderApi 
} from '../services/officeApi';
import { useNavigate, useLocation } from 'react-router-dom';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname.split('/').pop();
  let activeTab = 'employees';
  if (path === 'VendorsAssign') activeTab = 'vendors';
  else if (path === 'AssignedMealPlans') activeTab = 'meal-plans';
  else if (path === 'PaymentHistory') activeTab = 'payment-history';
  else if (path === 'CompanyDetails') activeTab = 'company';
  else activeTab = 'employees';

  const setActiveTab = (tab) => {
    if (tab === 'employees') navigate('/office/dashboard');
    else if (tab === 'vendors') navigate('/office/VendorsAssign');
    else if (tab === 'meal-plans') navigate('/office/AssignedMealPlans');
    else if (tab === 'payment-history') navigate('/office/PaymentHistory');
    else if (tab === 'company') navigate('/office/CompanyDetails');
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Core state managers loaded from API
  const [employees, setEmployees] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [empRes, venRes, compRes] = await Promise.all([
        getEmployeesApi({ limit: 1000 }), // fetch all for now
        getVendorsApi(),
        getCompanyDetailsApi()
      ]);
      const employeesData = (empRes.data.data.employees || []).map(emp => ({ ...emp, id: emp._id }));
      const vendorsData = (venRes.data.data || []).map(v => ({ 
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
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      if (error.response?.status === 401) {
         navigate('/office/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 1. Employee Mutators
  const handleAddEmployee = async (empData) => {
    try {
      await addEmployeeApi(empData);
      fetchDashboardData(); // Refresh data
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to add employee');
    }
  };

  const handleUpdateEmployee = async (id, updatedFields) => {
    try {
      await updateEmployeeApi(id, updatedFields);
      fetchDashboardData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update employee');
    }
  };

  const handleDeleteEmployee = async (id) => {
    try {
      await deleteEmployeeApi(id);
      fetchDashboardData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete employee');
    }
  };

  // 2. Meal Subscription Actions (Assignment / Unassignment)
  const handleAssignEmployees = async (employeeIds, vendorId, deliverySlot, subscriptionPlanId, totalAmount, vendorMealPlanId) => {
    try {
      // Step 1: Create order — pass subscriptionPlanId + totalAmount (for billing)
      const orderRes = await createAssignmentOrderApi({
        employeeIds,
        subscriptionPlanId,
        vendorId,
        slots: deliverySlot,
        totalAmount
      });
      const orderData = orderRes.data.data;

      // Dev/mock bypass — backend returns isMock:true when Razorpay is not configured
      if (orderData.isMock || orderData.orderId.startsWith('mock_')) {
          await assignMealsApi({
             employeeIds,
             vendorId,
             mealPlanId: vendorMealPlanId || subscriptionPlanId, // prefer actual DMBMealPlan _id
             subscriptionPlanId,                                  // keep for reference
             slots: deliverySlot,
             razorpayOrderId: orderData.orderId,
             razorpayPaymentId: 'mock_payment_' + Date.now(),
             razorpaySignature: 'mock_signature'
          });
          fetchDashboardData();
          alert(`Subscriptions assigned for ${employeeIds.length} employee(s). Deliveries scheduled for ${deliverySlot.join(', ')}.`);
          return;
      }

      // Step 2: Load Razorpay Script dynamically if not already present
      if (!window.Razorpay) {
         await new Promise((resolve, reject) => {
             const script = document.createElement('script');
             script.src = 'https://checkout.razorpay.com/v1/checkout.js';
             script.onload = resolve;
             script.onerror = reject;
             document.body.appendChild(script);
         });
      }

      // Step 3: Open Razorpay Checkout using key returned from backend
      const rzpKey = orderData.razorpayKeyId || import.meta.env.VITE_RAZORPAY_KEY_ID || '';
      if (!rzpKey) {
        throw new Error('Razorpay key not configured. Please contact support.');
      }

      const options = {
          key: rzpKey,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: "Rogas Meal Box",
          description: "Office Meal Subscription",
          order_id: orderData.orderId,
          handler: async function (response) {
              try {
                  await assignMealsApi({
                     employeeIds,
                     vendorId,
                     mealPlanId: vendorMealPlanId || subscriptionPlanId,
                     subscriptionPlanId,
                     slots: deliverySlot,
                     razorpayOrderId: response.razorpay_order_id,
                     razorpayPaymentId: response.razorpay_payment_id,
                     razorpaySignature: response.razorpay_signature
                  });
                  fetchDashboardData();
                  alert(`Payment successful! Subscriptions assigned for ${employeeIds.length} employee(s).`);
              } catch (error) {
                  alert(error.response?.data?.message || 'Payment verified but assignment failed. Please contact support.');
              }
          },
          prefill: {
              name: companyDetails?.legalName || "Office Admin",
              email: companyDetails?.email || "admin@office.com",
          },
          theme: { color: "#088d5e" }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response){
          alert("Payment failed: " + response.error.description);
      });
      rzp.open();
    } catch (error) {
      alert(error.response?.data?.message || error.message || 'Failed to initiate checkout');
    }
  };


  const handleUnassignEmployee = async (id) => {
    try {
      // Find the assignment first, wait, employee ID isn't enough, we need assignment ID,
      // Or we can delete by calling a special endpoint, but for now let's just make the backend delete it
      // if we send an unassign request. Alternatively, I can call an API to find the assignment.
      const res = await officeClient.get('/assignments');
      const assignments = res.data.data;
      const assignment = assignments.find(a => a.employeeId._id === id);
      if (assignment) {
         await officeClient.delete(`/assignments/${assignment._id}`);
         fetchDashboardData();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to unassign employee');
    }
  };

  // 3. Company details profile modifier
  const handleUpdateCompanyDetails = async (updatedFields) => {
    try {
      await updateCompanyDetailsApi(updatedFields);
      fetchDashboardData();
    } catch (error) {
      alert('Failed to update company details');
    }
  };

  // Map tab IDs to literal UI titles
  const getTabTitle = () => {
    switch (activeTab) {
      case 'employees':
        return 'Employees';
      case 'vendors':
        return 'Vendors & Assign';
      case 'meal-plans':
        return 'Assigned Meal Plans';
      case 'payment-history':
        return 'Payment History';
      case 'company':
        return 'Company Details';
      default:
        return 'DailyMealBox';
    }
  };

  // Simple Notification banner alert simulation
  const handleTriggerNotificationAlert = () => {
    alert('System Notification: Curation Period ends soon. Please finalize subscriptions before Friday.');
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
            <button
              onClick={handleTriggerNotificationAlert}
              className="p-2 text-brand-muted hover:bg-brand-bg rounded-full transition-colors cursor-pointer relative"
              title="System Alerts"
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
                  onAssignEmployees={handleAssignEmployees}
                />
              )}

              {activeTab === 'meal-plans' && (
                <MealPlansTab
                  employees={employees}
                  vendors={vendors}
                  onUnassignEmployee={handleUnassignEmployee}
                  onSetTab={setActiveTab}
                />
              )}

              {activeTab === 'payment-history' && (
                <PaymentHistoryTab />
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
          <p>© 2026 DailyMealBox Logistics Sp. z o.o. All rights reserved.</p>
          <div className="flex gap-4">
            <button onClick={() => alert('Legal Agreement: Privacy Policy v2.4 (Effective 2026)')} className="hover:text-brand-primary underline cursor-pointer">
              Privacy Policy
            </button>
            <button onClick={() => alert('Support Portal: Reach us at operations@dailymealbox.com')} className="hover:text-brand-primary underline cursor-pointer">
              Support Center
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
