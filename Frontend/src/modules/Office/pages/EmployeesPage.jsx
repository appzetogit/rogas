/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, Filter, Edit, Trash2, Plus, X, TriangleAlert, ChevronLeft, ChevronRight } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';



export default function EmployeesTab({
  employees,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
}) {
  // Filters and Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);

  // Form Fields State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDept, setFormDept] = useState('Engineering');
  const [formBudget, setFormBudget] = useState('200');
  const [formSlot, setFormSlot] = useState('12:30 PM - 1:30 PM');
  const [formStatus, setFormStatus] = useState('Active');

  // Available unique departments from current dataset
  const departments = useMemo(() => {
    const depts = new Set();
    employees.forEach(emp => {
      if (emp.department) depts.add(emp.department);
    });
    return ['All Departments', ...Array.from(depts)];
  }, [employees]);

  // Filter & Search Logic
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDept =
        selectedDept === 'All Departments' || emp.department === selectedDept;

      const matchesStatus =
        selectedStatus === 'All Statuses' || emp.status === selectedStatus;

      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [employees, searchTerm, selectedDept, selectedStatus]);

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / itemsPerPage));
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEmployees, currentPage]);

  // Handle opening form modal for creation
  const handleOpenCreate = () => {
    setEditingEmployee(null);
    setFormName('');
    setFormEmail('');
    setFormDept('Engineering');
    setFormBudget('200');
    setFormSlot('12:30 PM - 1:30 PM');
    setFormStatus('Active');
    setIsFormModalOpen(true);
  };

  // Handle opening form modal for editing
  const handleOpenEdit = (emp) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormEmail(emp.email);
    setFormDept(emp.department);
    setFormBudget(emp.monthlyBudget.toString());
    setFormSlot(emp.preferredSlot);
    setFormStatus(emp.status);
    setIsFormModalOpen(true);
  };

  // Handle saving employee (Create / Edit)
  const handleSaveEmployee = (e) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      return;
    }

    const budgetNum = parseFloat(formBudget) || 200;

    if (editingEmployee) {
      onUpdateEmployee(editingEmployee.id, {
        name: formName,
        email: formEmail,
        department: formDept,
        monthlyBudget: budgetNum,
        preferredSlot: formSlot,
        status: formStatus,
      });
    } else {
      onAddEmployee({
        name: formName,
        email: formEmail,
        department: formDept,
        monthlyBudget: budgetNum,
        preferredSlot: formSlot,
        status: formStatus,
      });
    }
    setIsFormModalOpen(false);
  };

  // Handle opening delete confirmation modal
  const handleOpenDelete = (emp) => {
    setEmployeeToDelete(emp);
    setIsDeleteModalOpen(true);
  };

  // Handle actual deletion
  const handleConfirmDelete = () => {
    if (employeeToDelete) {
      onDeleteEmployee(employeeToDelete.id);
      setIsDeleteModalOpen(false);
      setEmployeeToDelete(null);
      // Reset page if needed
      if (paginatedEmployees.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-brand-brand-primary tracking-tight">Employees Directory</h3>
          <p className="text-xs text-brand-muted mt-1">Manage personnel records, budgets, and meal delivery configurations.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-brand-primary hover:bg-brand-primary-dark text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] cursor-pointer text-sm shadow-sm"
          id="btn-add-employee"
        >
          <Plus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl card-shadow">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 border border-brand-divider rounded-lg bg-brand-bg text-sm text-brand-text placeholder-brand-muted/70 focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all"
            placeholder="Search by name, email or ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset page on search
            }}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              className="appearance-none bg-brand-bg border border-brand-divider pl-4 pr-10 py-2.5 rounded-lg text-sm text-brand-muted cursor-pointer focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setCurrentPage(1);
              }}
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
          </div>

          <div className="relative">
            <select
              className="appearance-none bg-brand-bg border border-brand-divider pl-4 pr-10 py-2.5 rounded-lg text-sm text-brand-muted cursor-pointer focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="All Statuses">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
          </div>

          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedDept('All Departments');
              setSelectedStatus('All Statuses');
              setCurrentPage(1);
            }}
            title="Clear Filters"
            className="p-2.5 border border-brand-divider rounded-lg text-brand-muted hover:bg-brand-bg hover:text-brand-text transition-colors cursor-pointer"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Employee List Table Container */}
      <div className="bg-white rounded-xl card-shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-transparent border-b border-brand-divider">
                <th className="px-6 py-4 font-semibold text-brand-muted text-xs uppercase tracking-wider">Employee</th>
                <th className="px-6 py-4 font-semibold text-brand-muted text-xs uppercase tracking-wider">Department</th>
                <th className="px-6 py-4 font-semibold text-brand-muted text-xs uppercase tracking-wider">Preferred Slot</th>
                <th className="px-6 py-4 font-semibold text-brand-muted text-xs uppercase tracking-wider">Monthly Budget</th>
                <th className="px-6 py-4 font-semibold text-brand-muted text-xs uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-semibold text-brand-muted text-xs uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-divider">
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted">
                    No employees match your active filters or search terms.
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-brand-bg/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-bg flex items-center justify-center overflow-hidden border border-brand-divider flex-shrink-0">
                          {emp.avatarUrl ? (
                            <img
                              className="w-full h-full object-cover"
                              src={emp.avatarUrl}
                              alt={emp.name}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-brand-primary/10 text-brand-primary text-xs font-bold">
                              {emp.name.split(' ').map(n => n[0]).join('')}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-brand-text text-sm">{emp.name}</p>
                          <p className="text-xs text-brand-muted">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-brand-muted">{emp.department}</td>
                    <td className="px-6 py-4 text-sm text-brand-muted">{emp.preferredSlot}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-brand-text">
                      ${emp.monthlyBudget.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          emp.status === 'Active'
                            ? 'bg-brand-primary-light text-brand-primary'
                            : 'bg-brand-error-bg text-brand-error-text'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {/* Action buttons reveal on hover in desktop, visible on mobile */}
                      <div className="flex items-center justify-end gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="p-1.5 text-brand-muted hover:text-brand-primary hover:bg-brand-primary/5 rounded-md transition-colors cursor-pointer"
                          title="Edit Employee"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDelete(emp)}
                          className="p-1.5 text-brand-muted hover:text-brand-error-text hover:bg-brand-error-bg/30 rounded-md transition-colors cursor-pointer"
                          title="Delete Employee"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="px-6 py-4 flex items-center justify-between border-t border-brand-divider bg-brand-bg/20">
          <p className="text-xs text-brand-muted">
            Showing <span className="font-bold">{paginatedEmployees.length}</span> of{' '}
            <span className="font-bold">{filteredEmployees.length}</span> employees
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded border border-brand-divider bg-white text-brand-muted hover:bg-brand-bg disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
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
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded border border-brand-divider bg-white text-brand-muted hover:bg-brand-bg disabled:opacity-30 disabled:hover:bg-white cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal 1: Add/Edit Employee */}
      <AnimatePresence>
        {isFormModalOpen && (
          <div className="fixed inset-0 bg-brand-text/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-xl modal-shadow overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-brand-divider flex items-center justify-between bg-brand-bg/30">
                <h3 className="text-lg font-bold text-brand-primary">
                  {editingEmployee ? 'Edit Employee' : 'Add Employee'}
                </h3>
                <button
                  onClick={() => setIsFormModalOpen(false)}
                  className="text-brand-muted hover:text-brand-text transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEmployee} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all text-sm"
                      placeholder="e.g. Sarah Jenkins"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                    />
                  </div>

                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Work Email
                    </label>
                    <input
                      type="email"
                      required
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all text-sm"
                      placeholder="sarah.j@company.com"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Department
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all text-sm"
                      value={formDept}
                      onChange={(e) => setFormDept(e.target.value)}
                    >
                      <option value="Engineering">Engineering</option>
                      <option value="Marketing">Marketing</option>
                      <option value="Operations">Operations</option>
                      <option value="Human Resources">Human Resources</option>
                      <option value="Finance">Finance</option>
                      <option value="Design">Design</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Monthly Budget ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        className="w-full pl-8 pr-4 py-2.5 border border-brand-divider rounded-lg focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all text-sm"
                        placeholder="240"
                        value={formBudget}
                        onChange={(e) => setFormBudget(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Preferred Slot
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all text-sm"
                      value={formSlot}
                      onChange={(e) => setFormSlot(e.target.value)}
                    >
                      <option value="12:00 PM - 1:00 PM">12:00 PM - 1:00 PM</option>
                      <option value="12:30 PM - 1:30 PM">12:30 PM - 1:30 PM</option>
                      <option value="1:00 PM - 2:00 PM">1:00 PM - 2:00 PM</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">
                      Status
                    </label>
                    <select
                      className="w-full px-4 py-2.5 border border-brand-divider rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/10 focus:border-brand-primary outline-none transition-all text-sm"
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value)}
                    >
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                    </select>
                  </div>
                </div>

                <div className="px-6 py-4 -mx-6 -mb-6 mt-6 bg-brand-bg/30 border-t border-brand-divider flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    className="px-5 py-2.5 text-brand-muted text-sm font-semibold hover:bg-brand-bg rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-semibold rounded-lg transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {editingEmployee ? 'Save Changes' : 'Save Employee'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 2: Delete Confirmation */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 bg-brand-text/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-sm rounded-xl modal-shadow overflow-hidden text-center"
            >
              <div className="p-6">
                <div className="w-14 h-14 bg-brand-error-bg text-brand-error-text rounded-full flex items-center justify-center mx-auto mb-4">
                  <TriangleAlert className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-brand-text mb-2">Delete Employee?</h3>
                <p className="text-xs text-brand-muted leading-relaxed mb-6">
                  Are you sure you want to remove <span className="font-bold text-brand-text">{employeeToDelete?.name}</span> from the system? This action cannot be undone and will cancel all active meal plans.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleConfirmDelete}
                    className="w-full py-3 bg-brand-error-text hover:bg-brand-error-text/90 text-white text-sm font-bold rounded-lg transition-all active:scale-[0.98] cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="w-full py-3 text-brand-muted hover:bg-brand-bg text-sm font-semibold rounded-lg transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
