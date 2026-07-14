/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Menu, Bell, Search, Settings, X, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import EmployeesTab from '../pages/EmployeesPage';
import VendorsTab from '../pages/VendorsPage';
import MealPlansTab from '../pages/AssignmentsPage';
import CompanyDetailsTab from '../pages/CompanyPage';

import { INITIAL_EMPLOYEES, INITIAL_VENDORS, INITIAL_COMPANY_DETAILS } from '../mockData';

export default function App() {
  const [activeTab, setActiveTab] = useState('employees');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Core state managers loaded from localStorage or fallback defaults
  const [employees, setEmployees] = useState([]);
  const [vendors] = useState(INITIAL_VENDORS);
  const [companyDetails, setCompanyDetails] = useState(null);

  // Initialize state once on mount from localStorage
  useEffect(() => {
    const savedEmployees = localStorage.getItem('dailymealbox_employees');
    if (savedEmployees) {
      try {
        setEmployees(JSON.parse(savedEmployees));
      } catch (e) {
        setEmployees(INITIAL_EMPLOYEES);
      }
    } else {
      setEmployees(INITIAL_EMPLOYEES);
    }

    const savedCompany = localStorage.getItem('dailymealbox_company');
    if (savedCompany) {
      try {
        setCompanyDetails(JSON.parse(savedCompany));
      } catch (e) {
        setCompanyDetails(INITIAL_COMPANY_DETAILS);
      }
    } else {
      setCompanyDetails(INITIAL_COMPANY_DETAILS);
    }
  }, []);

  // Helper to persist state securely
  const saveEmployeesToStorage = (updatedList) => {
    setEmployees(updatedList);
    localStorage.setItem('dailymealbox_employees', JSON.stringify(updatedList));
  };

  const saveCompanyToStorage = (updatedCompany) => {
    setCompanyDetails(updatedCompany);
    localStorage.setItem('dailymealbox_company', JSON.stringify(updatedCompany));
  };

  // 1. Employee Mutators
  const handleAddEmployee = (empData) => {
    // Generate unique random ID
    const randomId = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Choose a professional headshot from our preloaded high-quality pool
    const headshots = [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAZPjIhDc13lFWHTNyDlA8dDg0O_YNJI537TVVlVSrmADmFBrkn-CYbUaCB4oULTaGFciEmjZDBVRl9br48T87qEhpOvEpwP1Bol-b8QK8xdRdskT49VjPf1bpevkCItAhenI9dNVKniNBWm39j7nnGgNyfwn4VzucBEuD8UqGbs9xvdaoKCT_-W_HzXKPpK_QgyFCYJHjrtBd2rZ6xu8yxcHeei8QmM2FYEjl2mmpasC-xmZL-EIaq',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAEcPS3Yz8_0_bbTcwpjdjv0yPJ9b6GsdeHz6M-qjHdxLNliLP7-sKyfcD3aPXKTm3G6S1e1zCSnhmJTEIraEpGLsou592U8M5u1-ufQh9bdjYwgoK-Yd-SPWa1EN7XfvwT3m3o60-PFegOqYw61sQ0BGf_aGSCLOVTJJ3yMr5Q29JX39084N_1EK5DTW7F2r1aZ8FF75u6-0DCQMt2HBQvcQtNQzSXCvw7scaTn_2yv5YXBH-2kDOM',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAlEMTw9zOnAoLWCbuwiGv4tsGSOrXX5hx0C2zKXt-ZlZ4oPoSbT5DEjzZXUZdGYuGRQMDcNpBDWt4fOvSsSXvX-lCapiDCiuI9IThPB48EO43MTXWSCdDYRnrfeS24L8toUcCPAa91gPZWvD95RafoNeapsAjgq2MxbO8ZNpPDoBpoWjrgmNwfX7YaYvRBo-fpRQat_-tLAyqlbd7c3TYvOjVeZjKZE-WDKlVDhSVGXWREr8EeWndR',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCloVLgxdy6z75f6VS31KyQTFX-UFooXFJkX9fAt_W0c1I57BuyxkTFHoKEx1ou77cpGUUKmo6MKqPPTJVaLD4yRFkIPF6rLvsut-oON4j4CD4gyNWbr_uGS3L6Cdxm4vsJCHXlOlMjG7EWpblhUVL_Pm_ZZwcpoMIGcQWDRxd2rLVnDdiXsnBxivgv8yszSCN9hf_O2x-B3ngXIC5yw_54oIZBEqwNQQLFwpJzDgDjOdlOptGxg3kk'
    ];
    const chosenAvatar = headshots[Math.floor(Math.random() * headshots.length)];

    const newEmp = {
      ...empData,
      id: randomId,
      avatarUrl: chosenAvatar,
    };

    const newList = [newEmp, ...employees];
    saveEmployeesToStorage(newList);

    // Sync total employees count in Company stats
    if (companyDetails) {
      saveCompanyToStorage({
        ...companyDetails,
        totalEmployees: companyDetails.totalEmployees + 1,
      });
    }
  };

  const handleUpdateEmployee = (id, updatedFields) => {
    const newList = employees.map((emp) => (emp.id === id ? { ...emp, ...updatedFields } : emp));
    saveEmployeesToStorage(newList);
  };

  const handleDeleteEmployee = (id) => {
    const newList = employees.filter((emp) => emp.id !== id);
    saveEmployeesToStorage(newList);

    // Sync total employees count in Company stats
    if (companyDetails) {
      saveCompanyToStorage({
        ...companyDetails,
        totalEmployees: Math.max(0, companyDetails.totalEmployees - 1),
      });
    }
  };

  // 2. Meal Subscription Actions (Assignment / Unassignment)
  const handleAssignEmployees = (employeeIds, vendorId, deliverySlot) => {
    const newList = employees.map((emp) => {
      if (employeeIds.includes(emp.id)) {
        return {
          ...emp,
          assignedVendorId: vendorId,
          deliverySlot,
        };
      }
      return emp;
    });
    saveEmployeesToStorage(newList);

    // Dynamic calculations of budget utilization increase
    if (companyDetails) {
      const assignedCount = employeeIds.length;
      const additionalBudget = assignedCount * 220; // estimate $220 average budget per assignment
      const updatedUtil = Math.min(companyDetails.monthlyBudgetCap, companyDetails.budgetUtilized + additionalBudget);
      saveCompanyToStorage({
        ...companyDetails,
        budgetUtilized: updatedUtil,
      });
    }

    alert(`Successfully mapped subscriptions for ${employeeIds.length} employee(s). All deliveries scheduled for ${deliverySlot}.`);
  };

  const handleUnassignEmployee = (id) => {
    const newList = employees.map((emp) => {
      if (emp.id === id) {
        return {
          ...emp,
          assignedVendorId: undefined,
          deliverySlot: undefined,
        };
      }
      return emp;
    });
    saveEmployeesToStorage(newList);

    // Dynamic calculations of budget utilization decrease
    if (companyDetails) {
      const updatedUtil = Math.max(2000, companyDetails.budgetUtilized - 220);
      saveCompanyToStorage({
        ...companyDetails,
        budgetUtilized: updatedUtil,
      });
    }
  };

  // 3. Company details profile modifier
  const handleUpdateCompanyDetails = (updatedFields) => {
    if (companyDetails) {
      saveCompanyToStorage({
        ...companyDetails,
        ...updatedFields,
      });
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
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
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
              onClick={() => alert('Search functionality initialized. Use inline search bars for deeper record filtering.')}
              className="p-2 text-brand-muted hover:bg-brand-bg rounded-full transition-colors cursor-pointer"
              title="Global Search"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={handleTriggerNotificationAlert}
              className="p-2 text-brand-muted hover:bg-brand-bg rounded-full transition-colors cursor-pointer relative"
              title="System Alerts"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-error-text rounded-full animate-pulse"></span>
            </button>
            <button
              onClick={() => alert('DailyMealBox Settings is currently restricted to Admin Portal permissions.')}
              className="p-2 text-brand-muted hover:bg-brand-bg rounded-full transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* CONTENT CANVAS AREA */}
        <main className="flex-1 p-6 md:p-8 space-y-6">
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

              {activeTab === 'company' && companyDetails && (
                <CompanyDetailsTab
                  details={companyDetails}
                  onUpdateDetails={handleUpdateCompanyDetails}
                />
              )}
            </motion.div>
          </AnimatePresence>
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
