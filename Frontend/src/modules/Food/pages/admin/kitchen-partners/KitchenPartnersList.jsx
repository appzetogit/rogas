import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { 
  Users, CheckCircle, Wallet, Search, MoreVertical, 
  ChevronLeft, ChevronRight, Plus, X 
} from "lucide-react";
import { kitchenPartnerApi } from "../../../../../services/api/kitchenPartnerApi";
import { uploadAPI } from "@food/api";

const KitchenPartnersList = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add"); // "add", "edit", "view"
  const [selectedPartnerId, setSelectedPartnerId] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [partners, setPartners] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const initialFormState = {
    companyName: "",
    email: "",
    vatNumber: "",
    managementFee: "",
    status: "Active",
    bankDetails: "",
    documents: "",
    address: { street: "", city: "", state: "", pincode: "" }
  };
  const [formData, setFormData] = useState(initialFormState);
  const dropdownRef = useRef(null);

  const fetchPartners = async () => {
    setIsLoading(true);
    try {
      const res = await kitchenPartnerApi.getPartners({
        search: searchTerm,
        status: statusFilter !== "All Status" ? statusFilter : undefined
      });
      if (res.success) {
        setPartners(res.data);
      }
    } catch (error) {
      console.error("Error fetching partners", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search could be implemented, but simple effect for now
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchPartners();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setFormData(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modalMode === 'view') return;
    
    setIsSubmitting(true);
    try {
      let finalData = { ...formData };
      if (documentFile) {
        const uploadRes = await uploadAPI.uploadMedia(documentFile, { folder: "appzeto/kitchen-partners" });
        if (uploadRes?.success || uploadRes?.data?.url) {
          finalData.documents = uploadRes.data.url || uploadRes.data;
        }
      }

      if (modalMode === 'edit') {
        await kitchenPartnerApi.updatePartner(selectedPartnerId, finalData);
      } else {
        await kitchenPartnerApi.addPartner(finalData);
      }
      setIsModalOpen(false);
      setFormData(initialFormState);
      setDocumentFile(null);
      fetchPartners();
    } catch (error) {
      console.error("Error saving partner", error);
      alert(error?.response?.data?.message || "Failed to save partner");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModal = (mode, partner = null) => {
    setModalMode(mode);
    if (partner) {
      setSelectedPartnerId(partner._id);
      setFormData({
        companyName: partner.companyName || "",
        email: partner.email || "",
        vatNumber: partner.vatNumber || "",
        managementFee: partner.managementFee || "",
        status: partner.status || "Active",
        bankDetails: partner.bankDetails || "",
        documents: partner.documents || "",
        address: { 
            street: partner.address?.street || "", 
            city: partner.address?.city || "", 
            state: partner.address?.state || "", 
            pincode: partner.address?.pincode || "" 
        }
      });
      setDocumentFile(null);
    } else {
      setSelectedPartnerId(null);
      setFormData(initialFormState);
      setDocumentFile(null);
    }
    setIsModalOpen(true);
    setOpenDropdownId(null);
  };

  const handleStatusChange = async (id, currentStatus) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    try {
      await kitchenPartnerApi.updatePartnerStatus(id, newStatus);
      fetchPartners();
      setOpenDropdownId(null);
    } catch (error) {
      console.error("Error changing status", error);
      alert("Failed to change status");
    }
  };

  const stats = [
    {
      id: 1,
      title: "TOTAL PARTNERS",
      value: partners.length,
      icon: <Users className="w-5 h-5 text-[#1F7A63]" />,
      chartColor: "text-[#1F7A63]",
    },
    {
      id: 2,
      title: "ACTIVE",
      value: partners.filter(p => p.status === 'Active').length,
      icon: <CheckCircle className="w-5 h-5 text-[#1F7A63]" />,
      chartColor: "text-[#1F7A63]",
    },
    {
      id: 3,
      title: "TOTAL EARNINGS",
      value: `₹${partners.reduce((sum, p) => sum + (p.earnings || 0), 0).toLocaleString()}`,
      icon: <Wallet className="w-5 h-5 text-[#1F7A63]" />,
      chartColor: "text-[#1F7A63]",
    },
  ];

  return (
    <div className="p-6 bg-[#F5F5F0] min-h-screen font-sans text-[#2B2B2B]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1F7A63]">Kitchen Partner Network</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and monitor your kitchen ecosystem</p>
        </div>
        <button
          onClick={() => openModal('add')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F7A63]/10 hover:bg-[#1F7A63]/20 text-[#1F7A63] rounded-lg font-medium transition-colors border border-[#1F7A63]/30"
        >
          <Plus className="w-4 h-4" />
          Add Partner
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.id} className="bg-[#ffffff] p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between relative overflow-hidden" style={{ backgroundColor: 'var(--ad-card-bg, #ffffff)' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-[#1F7A63]/10 flex items-center justify-center">
                {stat.icon}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1 tracking-wider">{stat.title}</p>
              <h3 className="text-2xl font-bold text-[#2B2B2B]">{stat.value}</h3>
            </div>
            <div className="absolute bottom-0 right-0 w-32 h-16 opacity-30">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={`w-full h-full ${stat.chartColor}`}>
                <path d="M0,30 Q10,10 20,20 T40,10 T60,25 T80,5 T100,20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search partners..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63] w-full md:w-64 bg-[#ffffff]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63] bg-[#ffffff]"
          >
            <option>All Status</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>Suspended</option>
          </select>
        </div>
        <div className="text-sm text-slate-500">
          Showing <span className="font-medium text-slate-700">{partners.length}</span> results
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-[#ffffff] rounded-2xl shadow-sm border border-slate-100 overflow-visible relative" style={{ backgroundColor: 'var(--ad-card-bg, #ffffff)' }}>
        <div className="overflow-x-auto min-h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-slate-500">Loading partners...</div>
          ) : partners.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-slate-500">No Kitchen Partners found.</div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#F5F5F0]/50 text-slate-500 text-xs font-semibold tracking-wider">
                <tr>
                  <th className="px-6 py-4 rounded-tl-2xl">PARTNER NAME</th>
                  <th className="px-6 py-4">CITY</th>
                  <th className="px-6 py-4">HOME COOKS</th>
                  <th className="px-6 py-4">ORDERS</th>
                  <th className="px-6 py-4">EARNINGS</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4 rounded-tr-2xl text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map((partner) => (
                  <tr key={partner._id} className="hover:bg-[#F5F5F0]/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={`https://ui-avatars.com/api/?name=${partner.companyName.charAt(0)}&background=f0fdf4&color=166534`} 
                          alt={partner.companyName} 
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100" 
                        />
                        <div>
                          <div className="font-medium text-[#2B2B2B]">{partner.companyName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">ID: {partner.partnerId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{partner.address?.city || "-"}</td>
                    <td className="px-6 py-4 text-slate-600">{partner.homeCooks}</td>
                    <td className="px-6 py-4 text-slate-600">{partner.orders}</td>
                    <td className="px-6 py-4 text-slate-600">₹{partner.earnings?.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          partner.status === "Active"
                            ? "bg-[#1F7A63]/10 text-[#1F7A63]"
                            : partner.status === "Suspended" || partner.status === "Inactive"
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {partner.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center relative">
                      <button 
                        onClick={() => setOpenDropdownId(openDropdownId === partner._id ? null : partner._id)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      
                      {/* Action Dropdown */}
                      {openDropdownId === partner._id && (
                        <div 
                          ref={dropdownRef}
                          className="absolute right-8 top-10 w-40 bg-[#ffffff] rounded-lg shadow-lg border border-slate-100 py-1 z-50 text-left flex flex-col"
                        >
                          <button 
                            className="w-full px-4 py-2 text-sm text-slate-700 hover:bg-[#F5F5F0] text-left"
                            onClick={() => openModal('view', partner)}
                          >
                            View
                          </button>
                          <button 
                            className="w-full px-4 py-2 text-sm text-slate-700 hover:bg-[#F5F5F0] text-left"
                            onClick={() => openModal('edit', partner)}
                          >
                            Edit
                          </button>
                          <button 
                            className="w-full px-4 py-2 text-sm text-slate-700 hover:bg-[#F5F5F0] text-left"
                            onClick={() => handleStatusChange(partner._id, partner.status)}
                          >
                            {partner.status === "Active" ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit/View Partner Modal */}
      {isModalOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative bg-[#ffffff] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl" style={{ backgroundColor: '#ffffff' }}>
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-[#ffffff] z-10" style={{ backgroundColor: '#ffffff' }}>
              <h2 className="text-xl font-bold text-[#2B2B2B]">
                {modalMode === 'add' ? 'Add New Kitchen Partner' : modalMode === 'edit' ? 'Edit Kitchen Partner' : 'View Kitchen Partner'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {modalMode === 'view' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Company Name</p>
                      <p className="font-semibold text-[#2B2B2B] mt-1">{formData.companyName}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">Email</p>
                      <p className="font-medium text-[#2B2B2B] mt-1">{formData.email}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">VAT Number</p>
                      <p className="font-medium text-[#2B2B2B] mt-1">{formData.vatNumber || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">Management Fee (%)</p>
                      <p className="font-medium text-[#2B2B2B] mt-1">{formData.managementFee ? `${formData.managementFee}%` : "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">Status</p>
                      <p className={`inline-flex items-center mt-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          formData.status === "Active"
                            ? "bg-[#1F7A63]/10 text-[#1F7A63]"
                            : formData.status === "Suspended" || formData.status === "Inactive"
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-700"
                        }`}>{formData.status}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">Bank Details</p>
                      <p className="font-medium text-[#2B2B2B] mt-1">{formData.bankDetails || "-"}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-md font-semibold text-[#2B2B2B] mt-4 pt-4 border-t border-slate-100">Address Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-slate-500">Street Address</p>
                        <p className="font-medium text-[#2B2B2B] mt-1">{formData.address?.street || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">City</p>
                        <p className="font-medium text-[#2B2B2B] mt-1">{formData.address?.city || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">State</p>
                        <p className="font-medium text-[#2B2B2B] mt-1">{formData.address?.state || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-500">Pincode</p>
                        <p className="font-medium text-[#2B2B2B] mt-1">{formData.address?.pincode || "-"}</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-md font-semibold text-[#2B2B2B] mt-4 pt-4 border-t border-slate-100">Documents / Compliance</h3>
                    {formData.documents ? (
                      <div className="mt-4">
                        <img src={formData.documents} alt="Compliance Document" className="w-full max-w-sm h-auto rounded-lg border border-slate-200 shadow-sm" />
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 mt-2">No documents uploaded.</p>
                    )}
                  </div>
                  <div className="flex justify-end pt-6 border-t border-slate-100">
                    <button 
                      type="button" 
                      onClick={() => setIsModalOpen(false)}
                      className="px-6 py-2.5 bg-slate-100 rounded-lg text-slate-700 font-medium hover:bg-slate-200 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Info */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Company Name *</label>
                    <input 
                      type="text" 
                      name="companyName"
                      required
                      value={formData.companyName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="Enter company name" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Email *</label>
                    <input 
                      type="email" 
                      name="email"
                      required
                      disabled={modalMode === 'edit'}
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63] disabled:bg-[#F5F5F0] disabled:text-slate-500" 
                      placeholder="Enter email address" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">VAT Number</label>
                    <input 
                      type="text" 
                      name="vatNumber"
                      value={formData.vatNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="Enter VAT number" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Management Fee (%)</label>
                    <input 
                      type="number" 
                      name="managementFee"
                      min="0" max="100"
                      value={formData.managementFee}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="e.g. 15" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <select 
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Documents / Compliance</label>
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => setDocumentFile(e.target.files[0])}
                      className="w-full px-4 py-1.5 border border-slate-200 rounded-lg text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#1F7A63]/10 file:text-[#1F7A63] hover:file:bg-[#1F7A63]/20" 
                    />
                    {formData.documents && !documentFile && (
                      <p className="text-xs text-[#1F7A63] mt-1">Current document uploaded. Choose new to replace.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Bank Details / Settlement</label>
                  <textarea 
                    name="bankDetails"
                    value={formData.bankDetails}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                    rows="2" 
                    placeholder="Enter bank account details for settlement"
                  ></textarea>
                </div>

                {/* Address Section */}
                <h3 className="text-md font-semibold text-[#2B2B2B] mt-6 pt-6 border-t border-slate-100">Address Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Street Address</label>
                    <input 
                      type="text" 
                      name="address.street"
                      value={formData.address.street}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="Enter full address" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">City</label>
                    <input 
                      type="text" 
                      name="address.city"
                      value={formData.address.city}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="Enter city" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">State</label>
                    <input 
                      type="text" 
                      name="address.state"
                      value={formData.address.state}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="Enter state" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Pincode</label>
                    <input 
                      type="text" 
                      name="address.pincode"
                      value={formData.address.pincode}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F7A63]/20 focus:border-[#1F7A63]" 
                      placeholder="Enter pincode" 
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 border border-slate-200 rounded-lg text-slate-700 font-medium hover:bg-[#F5F5F0] transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="px-6 py-2.5 bg-[#1F7A63] text-white rounded-lg font-medium hover:bg-emerald-800 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? "Saving..." : modalMode === 'edit' ? "Save Changes" : "Save Partner"}
                  </button>
                </div>
              </form>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default KitchenPartnersList;
