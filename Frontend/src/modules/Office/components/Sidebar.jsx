/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Users, Handshake, Utensils, Building2, Receipt, LogOut } from 'lucide-react';



export default function Sidebar({ activeTab, setActiveTab, companyDetails }) {
  const menuItems = [
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'vendors', label: 'Vendors & Assign', icon: Handshake },
    { id: 'meal-plans', label: 'Assigned Meal Plans', icon: Utensils },
    { id: 'payment-history', label: 'Payment History', icon: Receipt },
    { id: 'company', label: 'Company Details', icon: Building2 },
  ];

  const adminName = companyDetails?.contactName || 'Admin Portal';
  const profileImage = companyDetails?.profileImage;

  const getInitials = (name) => {
    return name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-[260px] bg-brand-primary text-white flex flex-col py-6 z-40">
      {/* Brand logo */}
      <div className="px-6 mb-10">
        <h1 className="text-xl font-bold tracking-tight">DailyMealBox</h1>
      </div>

      {/* Navigation list */}
      <nav className="flex-1 sidebar-scroll overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full text-left flex items-center px-6 py-4 transition-all duration-200 ease-in-out cursor-pointer ${
                    isActive
                      ? 'bg-white/10 border-l-4 border-brand-primary-light text-white font-bold'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Admin details footer */}
      <div className="px-6 mt-auto pt-6 border-t border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border border-white/20 shrink-0">
            {profileImage ? (
              <img
                className="w-full h-full object-cover"
                src={profileImage}
                alt={adminName}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-sm font-bold text-white tracking-widest">
                {getInitials(adminName)}
              </span>
            )}
          </div>
          <div className="overflow-hidden pr-2">
            <p className="font-bold text-white text-sm truncate">{adminName}</p>
            <p className="text-xs text-white/60 truncate">{companyDetails?.legalName || 'Admin Portal'}</p>
          </div>
        </div>
        
        <button
          onClick={() => {
            localStorage.removeItem('office_token');
            window.location.href = '/office/login';
          }}
          className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/70 hover:text-white shrink-0"
          title="Logout"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
}
