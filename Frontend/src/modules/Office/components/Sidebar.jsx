/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Users, Handshake, Utensils, Building2 } from 'lucide-react';



export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'vendors', label: 'Vendors & Assign', icon: Handshake },
    { id: 'meal-plans', label: 'Assigned Meal Plans', icon: Utensils },
    { id: 'company', label: 'Company Details', icon: Building2 },
  ];

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
      <div className="px-6 mt-auto pt-6 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border border-white/20">
            <img
              className="w-full h-full object-cover"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCAucvzn_8bPe6buXTlurnwFKMhBNyleH14tV0F0aSt456-QEB8ybchd_ZospBHAEKlvnM-5rMtKa-Cp3zUA287N8y8LiYWZszyfCpubgw2bDPrrGHup_NKcgu9RDgLtgQwvZBrzE7VHWkQLlo1S9x8icg-QOa7KjbH9qA-nLd3JBTVgLrompQRUxUKvpWJ98zPu-VtiuWDOwJ6lPm6gHebNxOvaIWZqkoKK3sNs9HApQXR3eSrpgP0"
              alt="Marcus Chen"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="overflow-hidden">
            <p className="font-bold text-white text-sm truncate">Marcus Chen</p>
            <p className="text-xs text-white/60 truncate">Admin Portal</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
