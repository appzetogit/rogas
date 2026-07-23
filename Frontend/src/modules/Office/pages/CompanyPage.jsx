/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Pencil, Building2, CreditCard, Mail, Phone, Shield, ShieldCheck, Users, Store, X, Check, MapPin, Navigation, Image as ImageIcon, Upload, Loader2, LogOut, Trash2 } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useLoadScript, Marker } from '@react-google-maps/api';
import { uploadDocumentApi, deactivateCompanyAccountApi } from '../services/officeApi';

const mapContainerStyle = {
  width: '100%',
  height: '250px',
  borderRadius: '0.5rem'
};
const defaultCenter = { lat: 52.2297, lng: 21.0122 }; // Warsaw



export default function CompanyDetailsTab({
  details,
  onUpdateDetails,
}) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
  const [locationCoords, setLocationCoords] = useState(details.location || defaultCenter);
  const [profileImage, setProfileImage] = useState(details.profileImage || '');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

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
    setLocationCoords(details.location || defaultCenter);
    setProfileImage(details.profileImage || '');
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
      location: locationCoords,
      profileImage
    });
    setIsEditModalOpen(false);
    alert('Company details have been updated successfully.');
  };

  const fetchAddress = (lat, lng) => {
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === 'OK' && results[0]) {
          setDelAddr(results[0].formatted_address);
        } else {
          console.error("Geocoder failed due to: " + status);
        }
      });
    }
  };

  const onMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setLocationCoords({ lat, lng });
    fetchAddress(lat, lng);
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingImage(true);
      const res = await uploadDocumentApi(file);
      if (res.data?.success && res.data?.data?.url) {
        setProfileImage(res.data.data.url);
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleLiveLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLocationCoords({ lat, lng });
          fetchAddress(lat, lng);
        },
        () => alert('Could not get live location. Please check your browser permissions.')
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleDeactivateAccount = async () => {
    try {
      setIsDeleting(true);
      await deactivateCompanyAccountApi();
      localStorage.removeItem('office_token');
      window.location.href = '/office/login';
    } catch (error) {
      console.error('Failed to deactivate account:', error);
      alert('Failed to deactivate account. Please try again later.');
      setIsDeleting(false);
    }
  };

  // Helper to render budget cap nicely
  const formattedBudgetCap = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(details.monthlyBudgetCap || 0);

  // Format contract start date
  const formattedStartDate = details.contractStartDate 
    ? new Date(details.contractStartDate).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric'
      })
    : 'N/A';

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
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[9px] text-brand-muted font-semibold">
                    {utilPercent}% of budget utilized this month
                  </p>
                  <p className="text-[10px] font-bold text-brand-primary">
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      minimumFractionDigits: 2,
                    }).format(details.budgetUtilized || 0)} Paid
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Contract Start Date</p>
              <p className="text-xs text-brand-muted mt-0.5">{formattedStartDate}</p>
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
              <div className="w-16 h-16 rounded-full bg-brand-primary-light text-brand-primary border border-brand-primary/20 flex items-center justify-center font-bold text-lg shadow-inner overflow-hidden">
                {details.profileImage ? (
                  <img src={details.profileImage} alt={details.contactName} className="w-full h-full object-cover" />
                ) : (
                  details.contactName.split(' ').map((n) => n[0]).join('')
                )}
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

      {/* Account Actions: Logout & Delete Account placed at the very bottom */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 pt-4 border-t border-brand-divider">
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem('office_token');
            window.location.href = '/office/login';
          }}
          className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          <LogOut className="w-4 h-4 text-gray-500" />
          Logout
        </button>

        <button
          type="button"
          onClick={() => setIsDeleteModalOpen(true)}
          className="px-5 py-2.5 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100/80 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
          Delete Account
        </button>
      </div>

      {/* Edit Details Modal */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 md:p-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden relative"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80 sticky top-0 z-10">
                <h3 className="text-lg font-bold text-gray-900">Edit Company Details</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                    
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Company Profile Image
                      </label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-300 relative group">
                          {isUploadingImage ? (
                            <Loader2 className="w-6 h-6 text-brand-primary animate-spin" />
                          ) : profileImage ? (
                            <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-gray-400" />
                          )}
                          <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center pointer-events-none transition-all">
                            <Upload className="w-4 h-4 text-white" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            <Upload className="w-4 h-4" />
                            Upload New Image
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleImageUpload}
                              disabled={isUploadingImage}
                            />
                          </label>
                          <p className="text-xs text-gray-500 mt-1">Recommended size: 256x256px. Max 2MB.</p>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Company Legal Name
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        NIP (Tax ID)
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={nip}
                        onChange={(e) => setNip(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        REGON
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={regon}
                        onChange={(e) => setRegon(e.target.value)}
                      />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Registered Address
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={regAddr}
                        onChange={(e) => setRegAddr(e.target.value)}
                      />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Delivery Address
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={delAddr}
                        onChange={(e) => setDelAddr(e.target.value)}
                      />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                          Set Location (Map Pin)
                        </label>
                        <button
                          type="button"
                          onClick={handleLiveLocation}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 px-2 py-1 rounded transition-colors cursor-pointer"
                        >
                          <Navigation className="w-3 h-3" />
                          Use Live Location
                        </button>
                      </div>
                      <div className="border border-gray-300 rounded-lg overflow-hidden relative">
                        {!isLoaded ? (
                          <div className="w-full h-[250px] bg-gray-100 flex items-center justify-center">
                            <span className="text-sm text-gray-400 font-semibold">Loading Map...</span>
                          </div>
                        ) : (
                          <GoogleMap
                            mapContainerStyle={mapContainerStyle}
                            zoom={13}
                            center={locationCoords}
                            onClick={onMapClick}
                            options={{ disableDefaultUI: true, zoomControl: true }}
                          >
                            <Marker position={locationCoords} />
                          </GoogleMap>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Monthly Budget Cap (€)
                      </label>
                      <input
                        type="number"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={budgetCap}
                        onChange={(e) => setBudgetCap(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Primary Contact Name
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Contact Email
                      </label>
                      <input
                        type="email"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Contact Phone
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none text-sm bg-white"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer fixed at bottom */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 sticky bottom-0 z-10 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-5 py-2.5 text-gray-600 text-sm font-semibold hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-semibold rounded-lg transition-all active:scale-[0.98] shadow-sm cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Account Modal (Clean implementation without framer-motion to prevent layout bugs) */}
      {isDeleteModalOpen && (
        <div 
          className="fixed inset-0 flex items-center justify-center p-4 sm:p-6" 
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999 }}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl flex flex-col relative"
            style={{ width: '100%', maxWidth: '28rem' }}
          >
            <div className="px-6 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4 mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Company Account?</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                This action will immediately deactivate your account, and you will be logged out. Are you sure you want to proceed?
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-center gap-8 rounded-b-xl">
              <button
                type="button"
                onClick={handleDeactivateAccount}
                disabled={isDeleting}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete Account'
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
