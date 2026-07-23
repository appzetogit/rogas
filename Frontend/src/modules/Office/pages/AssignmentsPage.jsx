/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Plus, Users, CheckCircle2, Clock, Store, Search, Filter, MoreVertical, X, ChevronLeft, ChevronRight, Ban } from 'lucide-react';




export default function MealPlansTab({
  employees,
  vendors,
  onUnassignEmployee,
  onSetTab,
}) {
  // Local states
  const [searchQuery, setSearchQuery] = useState('');
  const [exportSuccess, setExportSuccess] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Resolve vendor name
  const getVendorName = (vendorId) => {
    if (!vendorId) return 'Not assigned';
    const found = vendors.find((v) => v.id === vendorId);
    return found ? found.name : 'Unknown Vendor';
  };

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    return employees.filter((emp) => {
      const vendorName = getVendorName(emp.assignedVendorId);
      const matchesSearch =
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vendorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.deliverySlot && emp.deliverySlot.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesSearch;
    });
  }, [employees, searchQuery, vendors]);

  // Reactive Stats Overview
  const stats = useMemo(() => {
    const totalCount = employees.length;
    const assignedCount = employees.filter((emp) => emp.assignedVendorId).length;
    const unassignedCount = totalCount - assignedCount;
    const percentage = totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0;

    return {
      total: totalCount,
      assigned: assignedCount,
      unassigned: unassignedCount,
      percent: percentage,
      vendorsActive: vendors.length,
    };
  }, [employees, vendors]);

  // Paginated data
  const totalPages = Math.max(1, Math.ceil(filteredAssignments.length / itemsPerPage));
  const paginatedAssignments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAssignments.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAssignments, currentPage]);

  // Unassign action with immediate confirmation
  const handleUnassign = (emp) => {
    const confirmed = window.confirm(`Are you sure you want to unassign the current meal subscription for ${emp.name}?`);
    if (confirmed) {
      onUnassignEmployee(emp.id);
      alert(`Successfully unassigned meal plans for ${emp.name}.`);
    }
  };

  // Export List feature
  const handleExport = () => {
    setExportSuccess(true);
    try {
      // 1. Define CSV headers
      const headers = [
        'Employee ID',
        'Employee Name',
        'Department',
        'Phone',
        'Email',
        'Assigned Partner',
        'Delivery Window',
        'Status'
      ];
      
      // 2. Format rows
      const rows = employees.map((emp) => {
        const vendorName = getVendorName(emp.assignedVendorId);
        const isAssigned = !!emp.assignedVendorId;
        const status = isAssigned ? 'Assigned' : 'Unassigned';
        
        return [
          emp.id || emp._id || '',
          emp.name || '',
          emp.department || '',
          emp.phone || '',
          emp.email || '',
          isAssigned ? vendorName : '—',
          isAssigned ? (emp.deliverySlot || '—') : '—',
          status
        ];
      });
      
      // 3. Construct CSV Content
      const escapeCSVField = (field) => {
        const stringVal = String(field);
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      };
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(escapeCSVField).join(','))
      ].join('\r\n');
      
      // 4. Create Blob and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `meal_assignments_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => {
        setExportSuccess(false);
      }, 800);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      setExportSuccess(false);
      alert('Failed to export CSV file.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-brand-primary tracking-tight">Meal Plan Assignments</h3>
          <p className="text-xs text-brand-muted mt-1">Manage and track individual meal assignments for the current cycle.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-brand-primary text-brand-primary font-bold rounded-lg hover:bg-brand-primary/5 text-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {exportSuccess ? 'Exporting...' : 'Export List'}
          </button>
          <button
            onClick={() => onSetTab('vendors')}
            className="px-4 py-2 bg-brand-primary text-white font-bold rounded-lg hover:bg-brand-primary-dark text-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Assignment
          </button>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div className="bg-white p-6 rounded-xl card-shadow flex flex-col justify-between border border-brand-divider">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-wider">Total Employees</span>
            <div className="p-2 bg-brand-bg rounded-lg">
              <Users className="w-4 h-4 text-brand-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-brand-text">{stats.total.toLocaleString()}</p>
        </div>

        {/* Assigned */}
        <div className="bg-white p-6 rounded-xl card-shadow flex flex-col justify-between border border-brand-divider">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-wider">Assigned</span>
            <div className="p-2 bg-brand-primary-light/40 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-brand-primary" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-brand-text">{stats.assigned.toLocaleString()}</p>
            <span className="text-brand-primary font-extrabold text-xs pb-0.5">{stats.percent}%</span>
          </div>
        </div>

        {/* Unassigned Warning */}
        <div className="bg-white p-6 rounded-xl card-shadow border-l-4 border-brand-error-text flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-error-text font-bold text-[10px] uppercase tracking-wider">Unassigned</span>
            <div className="p-2 bg-brand-error-bg/60 rounded-lg">
              <Clock className="w-4 h-4 text-brand-error-text" />
            </div>
          </div>
          <p className="text-2xl font-bold text-brand-error-text">{stats.unassigned.toLocaleString()}</p>
        </div>

        {/* Active Vendors */}
        <div className="bg-white p-6 rounded-xl card-shadow flex flex-col justify-between border border-brand-divider">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-wider">Active Vendors</span>
            <div className="p-2 bg-brand-bg rounded-lg">
              <Store className="w-4 h-4 text-brand-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-brand-text">{stats.vendorsActive}</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden border border-brand-divider">
        {/* Table Header Controls */}
        <div className="px-6 py-4 border-b border-brand-divider flex items-center justify-between bg-brand-bg/10">
          <h4 className="font-bold text-sm text-brand-text">Active Schedule Mapping</h4>
          <div className="flex items-center gap-3">
            {/* Table Search */}
            <div className="relative w-52 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-muted" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-brand-divider rounded-lg text-xs text-brand-text focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
                placeholder="Search record details..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <button className="p-1.5 hover:bg-brand-bg rounded-lg text-brand-muted transition-colors cursor-pointer">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-brand-bg rounded-lg text-brand-muted transition-colors cursor-pointer">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Assignments Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-transparent border-b border-brand-divider">
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">Employee Name</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">Department</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">Assigned Partner</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">Delivery Window</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-divider">
              {paginatedAssignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted">
                    No employee assignments match your search filter.
                  </td>
                </tr>
              ) : (
                paginatedAssignments.map((emp) => {
                  const isAssigned = !!emp.assignedVendorId;
                  const vendorName = getVendorName(emp.assignedVendorId);

                  // Delivery window details
                  const slotLabel = emp.deliverySlot || '—';
                  let slotColor = 'bg-gray-400';
                  if (emp.deliverySlot === 'Breakfast') slotColor = 'bg-orange-400';
                  if (emp.deliverySlot === 'Lunch') slotColor = 'bg-brand-primary';
                  if (emp.deliverySlot === 'Dinner') slotColor = 'bg-indigo-400';

                  return (
                    <tr key={emp.id} className="hover:bg-brand-bg/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-bg border border-brand-divider flex-shrink-0">
                            {emp.avatarUrl ? (
                              <img
                                className="w-full h-full object-cover"
                                src={emp.avatarUrl}
                                alt={emp.name}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-brand-primary/10 text-brand-primary text-xs font-bold">
                                {emp.name.split(' ').map((n) => n[0]).join('')}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-brand-text text-sm">{emp.name}</p>
                            <p className="text-xs text-brand-muted">ID: {emp.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-brand-muted">{emp.department}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs ${isAssigned ? 'text-brand-text font-medium' : 'italic text-brand-muted/70'}`}>
                          {vendorName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isAssigned ? (
                          <div className="flex items-center gap-2 text-xs text-brand-muted font-medium">
                            <span className={`w-2 h-2 rounded-full ${slotColor}`}></span>
                            {slotLabel}
                          </div>
                        ) : (
                          <span className="italic text-brand-muted/70 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            isAssigned
                              ? 'bg-brand-primary-light text-brand-primary'
                              : 'bg-brand-error-bg text-brand-error-text'
                          }`}
                        >
                          {isAssigned ? 'Assigned' : 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isAssigned ? (
                          <button
                            onClick={() => handleUnassign(emp)}
                            className="p-1.5 text-brand-muted hover:text-brand-error-text hover:bg-brand-error-bg/40 rounded-lg transition-all active:scale-95 cursor-pointer"
                            title="Unassign Meal Plan"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            disabled
                            className="p-1.5 text-brand-muted/30 cursor-not-allowed"
                            title="Cannot Unassign"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-brand-divider flex items-center justify-between">
          <p className="text-xs text-brand-muted">
            Showing <span className="font-bold">{paginatedAssignments.length}</span> of{' '}
            <span className="font-bold">{filteredAssignments.length}</span> schedules
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border border-brand-divider hover:bg-brand-bg text-brand-muted disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`text-xs font-bold px-2.5 py-1 rounded cursor-pointer ${
                  currentPage === i + 1
                    ? 'bg-brand-primary text-white'
                    : 'text-brand-muted hover:bg-brand-bg'
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-brand-divider hover:bg-brand-bg text-brand-muted disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
