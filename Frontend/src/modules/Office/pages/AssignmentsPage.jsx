/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Download, Plus, Users, CheckCircle2, Clock, Store, Search, X, ChevronLeft, ChevronRight, Ban, RefreshCw } from 'lucide-react';
import { Trans, useTranslation } from "react-i18next";
import { getAssignmentsApi } from '../services/officeApi';
import useDeliverySlots from '../../../shared/hooks/useDeliverySlots';
import { getCurrentLanguage } from '../../../shared/i18n';

const CURRENT = ['upcoming', 'active', 'paused'];
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(getCurrentLanguage(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/**
 * Every meal subscription the company bought: one row per employee per purchase (an employee can have several at once,
 * e.g. breakfast and lunch, or next month's plan bought early).
 */
export default function MealPlansTab({
  employees,
  refreshKey,
  onCancelAssignment,
  onSetTab,
}) {
  const { t } = useTranslation("office");
  const { label: slotLabel } = useDeliverySlots();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getAssignmentsApi();
      setAssignments(res.data.data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const stateLabel = (state) => ({
    upcoming: t("Upcoming"),
    active: t("Active"),
    paused: t("Paused"),
    ended: t("Ended"),
    cancelled: t("Cancelled"),
  }[state] || state);
  const stateClass = (state) => ({
    upcoming: 'bg-blue-50 text-blue-700',
    active: 'bg-brand-primary-light text-brand-primary',
    paused: 'bg-amber-50 text-amber-700',
    ended: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-brand-error-bg text-brand-error-text',
  }[state] || 'bg-gray-100 text-gray-600');
  const slotsText = (keys) => (keys || []).map((k) => slotLabel(k) || k).join(', ');

  const visible = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return assignments.filter((a) => {
      if (!showPast && !CURRENT.includes(a.state)) return false;
      if (!q) return true;
      return [a.employeeId?.name, a.employeeId?.department, a.vendorId?.restaurantName, a.mealPlanId?.name, slotsText(a.slots)]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [assignments, searchQuery, showPast, slotLabel]);

  // Reactive Stats Overview
  const stats = useMemo(() => {
    const totalCount = employees.length;
    const assignedCount = employees.filter((emp) => (emp.plans || []).length > 0).length;
    const vendorsActive = new Set(assignments.filter((a) => CURRENT.includes(a.state)).map((a) => String(a.vendorId?._id || a.vendorId))).size;
    return {
      total: totalCount,
      assigned: assignedCount,
      unassigned: totalCount - assignedCount,
      percent: totalCount > 0 ? Math.round((assignedCount / totalCount) * 100) : 0,
      vendorsActive,
    };
  }, [employees, assignments]);

  // Paginated data
  const totalPages = Math.max(1, Math.ceil(visible.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const paginated = visible.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleCancel = async (a) => {
    const confirmed = window.confirm(t("Stop {{meal}} for {{name}}? Deliveries stop from tomorrow and paid days are not refunded.", { meal: `${a.mealPlanId?.name || ''} (${slotsText(a.slots)})`, name: a.employeeId?.name }));
    if (!confirmed) return;
    setCancellingId(a._id);
    const ok = await onCancelAssignment(a._id);
    setCancellingId(null);
    if (ok) {
      await load();
      alert(t("Successfully unassigned meal plans for {{name}}.", { name: a.employeeId?.name }));
    }
  };

  // Export List feature
  const handleExport = () => {
    setExportSuccess(true);
    try {
      const headers = ['Employee ID', 'Employee Name', 'Department', 'Vendor', 'Meal', 'Delivery Window', 'From', 'Until', 'Status'];
      const rows = visible.map((a) => [
        a.employeeId?.employeeId || a.employeeId?._id || '',
        a.employeeId?.name || '',
        a.employeeId?.department || '',
        a.vendorId?.restaurantName || '',
        a.mealPlanId?.name || '',
        slotsText(a.slots),
        a.from || '',
        a.until || '',
        a.state
      ]);
      const escapeCSVField = (field) => {
        const stringVal = String(field);
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n') || stringVal.includes('\r')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return stringVal;
      };
      const csvContent = [headers.join(','), ...rows.map((row) => row.map(escapeCSVField).join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `meal_assignments_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => setExportSuccess(false), 800);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      setExportSuccess(false);
      alert(t("Failed to export CSV file."));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions Section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-brand-brand-primary tracking-tight">{t("Meal Plan Assignments")}</h3>
          <p className="text-xs text-brand-muted mt-1">{t("Manage and track individual meal assignments for the current cycle.")}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 border border-brand-primary text-brand-primary font-bold rounded-lg hover:bg-brand-primary/5 text-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {exportSuccess ? t("Exporting...") : t("Export List")}
          </button>
          <button
            onClick={() => onSetTab('vendors')}
            className="px-4 py-2 bg-brand-primary text-white font-bold rounded-lg hover:bg-brand-primary-dark text-xs transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t("New Assignment")}
          </button>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl card-shadow flex flex-col justify-between border border-brand-divider">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-wider">{t("Total Employees")}</span>
            <div className="p-2 bg-brand-bg rounded-lg">
              <Users className="w-4 h-4 text-brand-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-brand-text">{stats.total.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-xl card-shadow flex flex-col justify-between border border-brand-divider">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-wider">{t("Assigned")}</span>
            <div className="p-2 bg-brand-primary-light/40 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-brand-primary" />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-brand-text">{stats.assigned.toLocaleString()}</p>
            <span className="text-brand-primary font-extrabold text-xs pb-0.5">{stats.percent}%</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl card-shadow border-l-4 border-brand-error-text flex flex-col justify-between">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-error-text font-bold text-[10px] uppercase tracking-wider">{t("Unassigned")}</span>
            <div className="p-2 bg-brand-error-bg/60 rounded-lg">
              <Clock className="w-4 h-4 text-brand-error-text" />
            </div>
          </div>
          <p className="text-2xl font-bold text-brand-error-text">{stats.unassigned.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-xl card-shadow flex flex-col justify-between border border-brand-divider">
          <div className="flex justify-between items-start mb-3">
            <span className="text-brand-muted font-bold text-[10px] uppercase tracking-wider">{t("Active Vendors")}</span>
            <div className="p-2 bg-brand-bg rounded-lg">
              <Store className="w-4 h-4 text-brand-primary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-brand-text">{stats.vendorsActive}</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden border border-brand-divider">
        <div className="px-6 py-4 border-b border-brand-divider flex flex-wrap gap-3 items-center justify-between bg-brand-bg/10">
          <h4 className="font-bold text-sm text-brand-text">{t("Active Schedule Mapping")}</h4>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-brand-muted cursor-pointer">
              <input type="checkbox" checked={showPast} onChange={(e) => { setShowPast(e.target.checked); setCurrentPage(1); }} className="w-3.5 h-3.5" />
              {t("Show ended and cancelled")}
            </label>
            <div className="relative w-52 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-muted" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-brand-divider rounded-lg text-xs text-brand-text focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
                placeholder={t("Search record details...")}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <button onClick={load} title={t("Refresh")} className="p-1.5 hover:bg-brand-bg rounded-lg text-brand-muted transition-colors cursor-pointer">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-transparent border-b border-brand-divider">
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">{t("Employee Name")}</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">{t("Assigned Partner")}</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">{t("Delivery Window")}</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">{t("Period")}</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider">{t("Status")}</th>
                <th className="px-6 py-4 font-bold text-brand-muted text-xs uppercase tracking-wider text-right">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-divider">
              {loading && assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-primary/40" />
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted">
                    {assignments.length === 0 ? t("No meal plans assigned yet. Choose a vendor to assign the first one.") : t("No employee assignments match your search filter.")}
                  </td>
                </tr>
              ) : (
                paginated.map((a) => {
                  const emp = a.employeeId || {};
                  const canCancel = CURRENT.includes(a.state);
                  return (
                    <tr key={a._id} className="hover:bg-brand-bg/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-brand-primary/10 text-brand-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                            {(emp.name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-bold text-brand-text text-sm">{emp.name}</p>
                            <p className="text-xs text-brand-muted">{emp.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-brand-text font-medium">{a.vendorId?.restaurantName || t("Unknown Vendor")}</p>
                        <p className="text-[11px] text-brand-muted">{a.mealPlanId?.name}</p>
                      </td>
                      <td className="px-6 py-4 text-xs text-brand-muted font-medium">{slotsText(a.slots) || '—'}</td>
                      <td className="px-6 py-4 text-xs text-brand-muted whitespace-nowrap">{fmtDate(a.from)} – {fmtDate(a.until)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${stateClass(a.state)}`}>
                          {stateLabel(a.state)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canCancel ? (
                          <button
                            onClick={() => handleCancel(a)}
                            disabled={cancellingId === a._id}
                            className="p-1.5 text-brand-muted hover:text-brand-error-text hover:bg-brand-error-bg/40 rounded-lg transition-all active:scale-95 cursor-pointer disabled:opacity-40"
                            title={t("Unassign Meal Plan")}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <button disabled className="p-1.5 text-brand-muted/30 cursor-not-allowed" title={t("Cannot Unassign")}>
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
            <Trans t={t} i18nKey={"Showing <0>{{length}}</0> of <1>{{length2}}</1> schedules"} defaults={"Showing <0>{{length}}</0> of <1>{{length2}}</1> schedules"} values={{ length: paginated.length, length2: visible.length }} components={[<span className="font-bold" />, <span className="font-bold" />]} />
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-1 rounded border border-brand-divider hover:bg-brand-bg text-brand-muted disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`text-xs font-bold px-2.5 py-1 rounded cursor-pointer ${page === i + 1 ? 'bg-brand-primary text-white' : 'text-brand-muted hover:bg-brand-bg'}`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
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
