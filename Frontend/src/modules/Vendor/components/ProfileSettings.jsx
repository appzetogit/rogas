/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { restaurantAPI } from '../../../services/api/index';
import { useRestaurantNotifications } from '../../Food/hooks/useRestaurantNotifications';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useNavigate } from 'react-router-dom';
import { Camera, Edit2, LogOut, CheckCircle2, AlertCircle, Info, FileText, Download, Check, Save, Upload, MapPin, Search, ArrowLeft, ArrowRight, ShieldCheck, HelpCircle, X, Shield, History, Landmark, Wallet, Receipt, AlertTriangle, Locate, UserCheck, Store, ChevronRight, ClipboardCheck, Truck, Hourglass, Users, Headset, Clock, PlusCircle, Plus, Inbox, Ticket, ImagePlus, Send } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

function LocationZoneSettings({ profile, onBack, onSave, triggerToast }) {
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(profile?.zoneId || '');
  const [address, setAddress] = useState(profile?.location?.formattedAddress || profile?.location?.address || profile?.address || '');
  const [lat, setLat] = useState(profile?.location?.latitude || profile?.location?.coordinates?.[1] || 52.2297);
  const [lng, setLng] = useState(profile?.location?.longitude || profile?.location?.coordinates?.[0] || 21.0122);
  const [showMap, setShowMap] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [addressDetails, setAddressDetails] = useState({
    city: profile?.location?.city || profile?.city || '',
    area: profile?.location?.area || profile?.area || '',
    state: profile?.location?.state || profile?.state || '',
    pincode: profile?.location?.pincode || profile?.pincode || '',
    addressLine1: profile?.location?.addressLine1 || profile?.addressLine1 || ''
  });
  
  const hasSavedLocation = profile?.zoneId || profile?.location?.address || profile?.address;
  const [isEditing, setIsEditing] = useState(!hasSavedLocation);

  useEffect(() => {
    restaurantAPI.getZones().then(res => {
      setZones(res.data?.data?.zones || res.data?.zones || []);
    }).catch(err => {
      triggerToast('Failed to load zones');
    });
  }, []);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places", "drawing", "geometry"]
  });

  const fetchAddressFromCoordinates = (latitude, longitude) => {
    if (window.google && window.google.maps) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const formatted = results[0].formatted_address;
          setAddress(formatted);

          const components = results[0].address_components;
          let cityVal = '';
          let areaVal = '';
          let stateVal = '';
          let pincodeVal = '';
          let streetNumber = '';
          let route = '';

          for (const component of components) {
            const types = component.types;
            if (types.includes('locality')) {
              cityVal = component.long_name;
            } else if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
              areaVal = component.long_name;
            } else if (types.includes('administrative_area_level_1')) {
              stateVal = component.long_name;
            } else if (types.includes('postal_code')) {
              pincodeVal = component.long_name;
            } else if (types.includes('street_number')) {
              streetNumber = component.long_name;
            } else if (types.includes('route')) {
              route = component.long_name;
            }
          }

          setAddressDetails({
            city: cityVal,
            area: areaVal,
            state: stateVal,
            pincode: pincodeVal,
            addressLine1: `${streetNumber} ${route}`.trim()
          });
        }
      });
    }
  };

  const handleLiveLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setLat(latitude);
        setLng(longitude);
        fetchAddressFromCoordinates(latitude, longitude);
        setShowMap(true);
        triggerToast('Live location & address fetched successfully!');
      }, (error) => {
        triggerToast('Failed to get live location. Please allow location permissions.');
      });
    } else {
      triggerToast('Geolocation is not supported by your browser');
    }
  };

  const onMapClick = (e) => {
    const latitude = e.latLng.lat();
    const longitude = e.latLng.lng();
    setLat(latitude);
    setLng(longitude);
    fetchAddressFromCoordinates(latitude, longitude);
  };

  const handleSave = async () => {
    try {
      const zoneName = zones.find(z => z._id === selectedZone)?.name || '';
      const response = await restaurantAPI.updateProfile({
        zoneId: selectedZone,
        zoneName: zoneName,
        location: {
          latitude: lat,
          longitude: lng,
          address: address,
          formattedAddress: address,
          city: addressDetails.city,
          area: addressDetails.area,
          state: addressDetails.state,
          pincode: addressDetails.pincode,
          addressLine1: addressDetails.addressLine1
        }
      });
      if (response?.data?.data?.restaurant) {
        onSave(response.data.data.restaurant);
      } else {
        onSave({ 
          zoneId: selectedZone, 
          zoneName: zoneName,
          location: { 
            latitude: lat, 
            longitude: lng, 
            address, 
            formattedAddress: address,
            city: addressDetails.city,
            area: addressDetails.area,
            state: addressDetails.state,
            pincode: addressDetails.pincode,
            addressLine1: addressDetails.addressLine1
          } 
        });
      }
      triggerToast('Location & Zone update request submitted successfully!');
      onBack();
    } catch (err) {
      triggerToast('Failed to update location');
    }
  };

  const handleSaveClick = () => {
    const activeZone = profile?.zoneId || '';
    const activeAddress = profile?.location?.formattedAddress || profile?.location?.address || profile?.address || '';
    const activeLat = Number(profile?.location?.latitude || profile?.location?.coordinates?.[1] || 52.2297);
    const activeLng = Number(profile?.location?.longitude || profile?.location?.coordinates?.[0] || 21.0122);

    const isZoneChanged = selectedZone !== activeZone;
    const isAddressChanged = address.trim() !== activeAddress.trim();
    const isCoordsChanged = Math.abs(lat - activeLat) > 0.00001 || Math.abs(lng - activeLng) > 0.00001;

    const hasChanges = isZoneChanged || isAddressChanged || isCoordsChanged;

    if (hasChanges) {
      setShowConfirmModal(true);
    } else {
      triggerToast('No changes made to Zone or Location.');
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn text-left">
      <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
        <button onClick={onBack} className="flex items-center active:scale-95 transition-transform">
          <ArrowLeft />
        </button>
        <h2 className="text-[16px] font-semibold">Location & Zone</h2>
        <div className="w-6"></div>
      </div>

      <div className="pt-6 space-y-5">
        {!isEditing ? (
          <section className="space-y-4">
            <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Saved Location & Zone</h2>
            
            {/* Display Rejection Banner if rejected */}
            {profile?.zoneChangeStatus === 'rejected' && (
              <div className="bg-error/10 border border-error/25 rounded-xl p-3 flex items-start gap-2.5 text-error text-[12px] font-medium animate-fadeIn">
                <AlertTriangle className="text-[18px] shrink-0 mt-0.5" />
                <span>
                  Your recent zone change request was rejected. Reason: <strong>{profile.zoneChangeRejectionReason || 'Rejected by admin'}</strong>
                </span>
              </div>
            )}

            {/* Display Pending Banner if pending */}
            {profile?.zoneChangeStatus === 'pending' && (
              <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 flex items-start gap-2.5 text-primary text-[12px] font-medium animate-fadeIn">
                <Info className="text-[18px] shrink-0 mt-0.5" />
                <span>
                  Your request to change zone to <strong>{zones.find(z => z._id === profile.pendingZoneId)?.name || 'New Zone'}</strong> is under review by the admin.
                </span>
              </div>
            )}

            <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
              <div>
                <p className="text-[10px] text-outline uppercase font-bold mb-1">Service Zone</p>
                <p className="text-[14px] font-bold text-on-surface">
                  {zones.find(z => z._id === selectedZone)?.name || 'Not Selected'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-outline uppercase font-bold mb-1">Address</p>
                <p className="text-[13px] font-medium text-on-surface-variant">
                  {profile?.location?.formattedAddress || profile?.location?.address || profile?.address || 'Not Selected'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              disabled={profile?.zoneChangeStatus === 'pending'}
              className={`w-full h-12 border rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all ${
                profile?.zoneChangeStatus === 'pending'
                  ? 'border-outline-variant/30 text-outline/50 bg-surface-container/30 cursor-not-allowed'
                  : 'border-primary text-primary active:scale-95'
              }`}
            >
              <Edit2 className="text-[18px]" />
              Change Location & Zone
            </button>
          </section>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Service Zone</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
                <select 
                  value={selectedZone} 
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[13px] text-on-surface"
                >
                  <option value="">Select a Zone</option>
                  {zones.map(z => (
                    <option key={z._id} value={z._id}>{z.name}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Location Address</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[13px] resize-none"
                  placeholder="Enter full address"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowMap(!showMap)} 
                    className="flex-1 py-2.5 rounded-lg text-[13px] font-bold border border-primary text-primary flex items-center justify-center gap-2"
                  >
                    <MapPin className="text-[18px]" />
                    {showMap ? 'Hide Map' : 'Set Pin on Map'}
                  </button>
                  <button 
                    onClick={handleLiveLocation} 
                    className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-primary text-on-primary flex items-center justify-center gap-2"
                  >
                    <Locate className="text-[18px]" />
                    Live Location
                  </button>
                </div>
                
                {showMap && (
                  <div className="h-[250px] w-full rounded-lg overflow-hidden border border-outline-variant relative z-0 bg-surface-container-lowest">
                    {isLoaded ? (
                      <GoogleMap
                        mapContainerStyle={mapContainerStyle}
                        center={{ lat, lng }}
                        zoom={13}
                        onClick={onMapClick}
                        options={{ disableDefaultUI: true, zoomControl: true }}
                      >
                        <Marker position={{ lat, lng }} />
                      </GoogleMap>
                    ) : (
                      <div className="flex items-center justify-center h-full text-outline text-[12px]">Loading Map...</div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <button
              onClick={handleSaveClick}
              className="w-full h-14 bg-primary text-on-primary rounded-xl font-bold text-[15px] shadow-lg active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              Save Location & Zone
            </button>
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] px-4">
          <div className="bg-white rounded-2xl p-5 max-w-[340px] w-full shadow-2xl space-y-4">
            <h3 className="text-[16px] font-bold text-on-surface">Zone & Location Update Request</h3>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">
              Updating your zone or location will send your profile to the admin for review. Your request may be approved or rejected. Do you want to continue?
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 h-11 border border-outline-variant rounded-xl font-bold text-[13px] text-outline hover:bg-surface-container active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  handleSave();
                }}
                className="flex-1 h-11 bg-primary text-on-primary rounded-xl font-bold text-[13px] shadow-sm hover:brightness-95 active:scale-95 transition-all"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function ProfileSettings({
  profile,
  vacation,
  cutoff,
  onUpdateProfile,
  onUpdateVacation,
  onUpdateCutoff,
  onSignOut
}) {
  const navigate = useNavigate();
  const [subView, setSubView] = useState('profile');

  // ── Help & Support state ──────────────────────────────────────────────────
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  // Create-ticket form
  const [newCategory, setNewCategory] = useState('orders');
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachPreviews, setAttachPreviews] = useState([]);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef(null);
  // Real-time socket for complaint updates
  const { socket } = useRestaurantNotifications();

  const SUPPORT_CATEGORIES = [
    { value: 'orders',     label: '🛒 Orders' },
    { value: 'payments',   label: '💳 Payments' },
    { value: 'menu',       label: '🍽️ Menu' },
    { value: 'restaurant', label: '🏪 Restaurant Profile' },
    { value: 'technical',  label: '⚙️ Technical Issue' },
    { value: 'other',      label: '💬 Other' },
  ];

  const STATUS_CFG = {
    open:       { label: 'Open',       color: '#dc2626', bg: '#fef2f2' },
    in_review:  { label: 'In Review',  color: '#d97706', bg: '#fffbeb' },
    escalated:  { label: 'Escalated',  color: '#9333ea', bg: '#faf5ff' },
    resolved:   { label: 'Resolved',   color: '#16a34a', bg: '#f0fdf4' },
    closed:     { label: 'Closed',     color: '#6b7280', bg: '#f3f4f6' },
  };

  const loadSupportTickets = useCallback(async () => {
    setSupportLoading(true);
    try {
      const res = await restaurantAPI.getSupportTickets();
      const list = res?.data?.data?.tickets || res?.data?.data || [];
      setSupportTickets(Array.isArray(list) ? list : []);
    } catch (e) {
      triggerToast('Failed to load support tickets.');
    } finally {
      setSupportLoading(false);
    }
  }, []);

  const loadTicketDetail = useCallback(async (id) => {
    setTicketLoading(true);
    try {
      const res = await restaurantAPI.getSupportTicketById(id);
      setSelectedTicket(res?.data?.data?.complaint || res?.data?.data || null);
    } catch (e) {
      triggerToast('Failed to load ticket detail.');
    } finally {
      setTicketLoading(false);
    }
  }, []);

  // Real-time ticket updates via socket
  useEffect(() => {
    if (!socket) return;
    const handler = (payload) => {
      // Update selectedTicket if it's the one being updated
      setSelectedTicket(prev => {
        if (prev && (String(prev._id) === String(payload._id || payload.complaintId))) {
          return { ...prev, ...payload };
        }
        return prev;
      });
      // Also refresh list badge
      setSupportTickets(prev => prev.map(t =>
        String(t._id) === String(payload._id || payload.complaintId)
          ? { ...t, ...(payload.status ? { status: payload.status } : {}) }
          : t
      ));
    };
    socket.on('complaint_status_updated', handler);
    return () => socket.off('complaint_status_updated', handler);
  }, [socket]);

  const handleAttachFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newFiles = [...attachments, ...files].slice(0, 5);
    setAttachments(newFiles);
    Promise.all(newFiles.map(f => new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => res(ev.target.result);
      reader.readAsDataURL(f);
    }))).then(setAttachPreviews);
  };

  const removeAttachment = (idx) => {
    const newFiles = attachments.filter((_, i) => i !== idx);
    setAttachments(newFiles);
    Promise.all(newFiles.map(f => new Promise(res => {
      const reader = new FileReader();
      reader.onload = ev => res(ev.target.result);
      reader.readAsDataURL(f);
    }))).then(setAttachPreviews);
  };

  const handleCreateTicket = async () => {
    if (!newSubject.trim()) { triggerToast('Please enter a subject.'); return; }
    if (!newDesc.trim()) { triggerToast('Please enter a description.'); return; }
    setCreating(true);
    try {
      // Upload attachments first if any
      let proofPhotos = [];
      if (attachments.length > 0) {
        for (const file of attachments) {
          const formData = new FormData();
          formData.append('file', file);
          try {
            const upRes = await restaurantAPI.uploadProfileImage(file);
            const url = upRes?.data?.data?.url || upRes?.data?.url;
            if (url) proofPhotos.push(url);
          } catch {}
        }
      }

      const body = new FormData();
      body.append('category', newCategory);
      body.append('subject', newSubject.trim());
      body.append('message', newDesc.trim());
      if (proofPhotos.length > 0) {
        body.append('proofPhotos', JSON.stringify(proofPhotos));
      }

      const res = await restaurantAPI.createSupportTicket({ 
        category: newCategory, 
        subject: newSubject.trim(), 
        message: newDesc.trim(), 
        proofPhotos 
      });

      triggerToast('✅ Ticket submitted successfully!');
      setNewSubject('');
      setNewDesc('');
      setNewCategory('orders');
      setAttachments([]);
      setAttachPreviews([]);
      await loadSupportTickets();
      setSubView('support');
    } catch (e) {
      triggerToast(e?.response?.data?.message || 'Failed to submit ticket.');
    } finally {
      setCreating(false);
    }
  };

  // Vacation form states
  const [vacStart, setVacStart] = useState('2026-06-15');
  const [vacEnd, setVacEnd] = useState('2026-06-22');
  const [vacReason, setVacReason] = useState('Annual maintenance');
  const [vacNotified, setVacNotified] = useState(true);
  const [vacPaused, setVacPaused] = useState(true);
  const [vacAutoResume, setVacAutoResume] = useState(true);
  const [vacAdminAlerted, setVacAdminAlerted] = useState(true);
  const [vacPushBack, setVacPushBack] = useState(true);

  // Cutoff form states
  const [cutoffType, setCutoffType] = useState(cutoff.type);
  const [portionsCap, setPortionsCap] = useState(cutoff.portionsCap);
  const [closedDays, setClosedDays] = useState([...cutoff.closedDays]);

  // Toast notice state
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleToggleVacation = () => {
    const isNowOpen = !vacation.isKitchenOpen;
    onUpdateVacation({
      isKitchenOpen: isNowOpen,
      reason: isNowOpen ? '' : vacReason,
      fromDate: isNowOpen ? '' : vacStart,
      toDate: isNowOpen ? '' : vacEnd
    });
    triggerToast(isNowOpen ? 'Kitchen successfully opened! 🍳' : 'Vacation mode activated. Kitchen is now closed 🌴');
    setSubView('profile');
  };

  const handleSaveCutoff = () => {
    onUpdateCutoff({
      type: cutoffType,
      cutoffTime: cutoffType === 'Same day 10am' ? '10:00 (10am)' : '20:00 (8pm)',
      portionsCap: portionsCap,
      closedDays: closedDays
    });
    triggerToast('Cutoff settings updated successfully ⏱️');
    setSubView('profile');
  };

  const handleRemoveClosedDay = (day) => {
    setClosedDays((prev) => prev.filter((d) => d !== day));
    triggerToast(`Removed manual closure: ${day}`);
  };

  const handleAddClosedDay = () => {
    const defaultDays = ['Wed 20 May', 'Thu 21 May', 'Fri 22 May', 'Sat 23 May'];
    const nextDay = defaultDays.find((d) => !closedDays.includes(d));
    if (nextDay) {
      setClosedDays((prev) => [...prev, nextDay]);
      triggerToast(`Added closed day: ${nextDay}`);
    } else {
      triggerToast('All calendar dates registered');
    }
  };

  return (
    <div className="flex-grow pt-14 pb-[99px] font-sans px-4 select-none max-w-[390px] mx-auto w-full text-left relative">
      
      {/* Profile Details section Screen 16 */}
      {subView === 'profile' &&
      <div className="space-y-5 animate-fadeIn">
          {/* Profile overview card logo stats */}
          <section className="flex flex-col items-center bg-white p-5 rounded-2xl shadow-xs border border-outline-variant/15 mt-4">
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white font-extrabold text-[20px] mb-3 shadow">
              {profile.avatarInitials}
            </div>
            <h2 className="text-[16px] font-bold text-on-surface">{profile.name}</h2>
            <p className="text-on-surface-variant text-[12px]">{profile.type} · Mokotow · ★ {profile.rating}</p>
            <div className="inline-flex items-center px-3.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold mt-3 animate-pulse">
              Approved ✓
            </div>
          </section>

          {/* Kitchen Partner verified banner */}
          <div className="p-4 bg-primary/10 border border-primary/25 rounded-2xl flex items-center gap-3">
            <UserCheck className="text-primary text-[22px]" />
            <div>
              <p className="text-[9px] text-outline font-bold uppercase tracking-wider">Kitchen Partner (v3.0)</p>
              <p className="font-bold text-on-surface text-[13px]">{profile.partner}</p>
            </div>
          </div>

          {/* Kitchen Management Links Lists block */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">Kitchen</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              
              <button
              onClick={() => triggerToast(`Kitchen Info: ${profile.name} | ${profile.bio}`)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <Store className="text-outline" />
                  <span className="font-bold text-[13px]">Kitchen Name &amp; Bio</span>
                </div>
                <ChevronRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>

              <button
              onClick={() => setSubView('location')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <MapPin className="text-outline" />
                  <span className="font-bold text-[13px]">Location &amp; Zone</span>
                </div>
                <ChevronRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>

              {/* EU food license Amber row warned of expiring dates */}
              <button
              onClick={() => {
                const licenceName = profile.foodLicenceUrl ? profile.foodLicenceUrl.split('/').pop() : (profile.licenseFile || 'Not Uploaded');
                triggerToast(`EU License validated: ${licenceName} expires in June 2026`);
              }}
              className="w-full flex items-center justify-between p-4 bg-secondary-container/10 hover:bg-secondary-container/15 transition-colors group text-on-secondary-container">
              
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="text-secondary" />
                  <span className="font-bold text-[13px]">
                    EU Food Licence <span className="text-secondary font-semibold text-[11px]">({profile.foodLicenceUrl ? profile.foodLicenceUrl.split('/').pop() : (profile.licenseFile || 'licence_food_pl_2026.pdf')})</span>
                  </span>
                </div>
                <ChevronRight className="text-secondary group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>

              <button
              onClick={() => setSubView('vacation')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <Truck className="text-primary" />
                  <span className="font-bold text-[13px] text-primary">Vacation Mode Setup</span>
                </div>
                <ChevronRight className="text-primary group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>

              <button
              onClick={() => setSubView('cutoff')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <Hourglass className="text-primary" />
                  <span className="font-bold text-[13px] text-primary">Cutoff &amp; Portions Settings</span>
                </div>
                <ChevronRight className="text-primary group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>
            </div>
          </div>

          {/* Customer & Subscribers section block */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">Customers & Orders</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left mb-5">
              <button
                onClick={() => navigate('/vendor/subscribers')}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface"
              >
                <div className="flex items-center gap-3">
                  <Users className="text-outline" />
                  <span className="font-bold text-[13px]">My Subscribers</span>
                </div>
                <ArrowRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>
            </div>
          </div>

          {/* Financial details section block */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">Financial Settings</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              {[
            { label: 'Bank Account Details', icon: Landmark },
            { label: 'Payout Schedules', icon: Wallet },
            { label: 'Tax & VAT Registrations', icon: Receipt }].
            map((item, idx) =>
            <button
              key={idx}
              onClick={() => triggerToast(`Accessing Secure Vault: ${item.label}. This syncs automatically!`)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = item.icon;
                      return <Icon className="text-outline w-5 h-5" />
                    })()}
                    <span className="font-bold text-[13px]">{item.label}</span>
                  </div>
                  <ArrowRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
                </button>
            )}
            </div>
          </div>

          {/* Help & Support section */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">Help & Support</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              <button
                onClick={() => { loadSupportTickets(); setSubView('support'); }}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface"
              >
                <div className="flex items-center gap-3">
                  <Headset className="text-primary" />
                  <div className="text-left">
                    <span className="font-bold text-[13px] text-primary block">Help & Support</span>
                    <span className="text-[11px] text-outline">Submit tickets & track status</span>
                  </div>
                </div>
                <ChevronRight className="text-primary group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>
            </div>
          </div>

          {/* Account deletion/sign-out actions */}
          <div className="pt-4 flex flex-col gap-2 justify-center items-center">
            <button
            onClick={onSignOut}
            className="text-primary font-bold text-[13px] uppercase tracking-wider hover:underline">
            
              Sign out / Exit Partner Account
            </button>
            <button
            onClick={() => triggerToast('Account deactivation is blocked until active prep queues are cleared.')}
            className="text-error font-bold text-[11px] uppercase tracking-wider mt-1">
            
              Deactivate Account
            </button>
          </div>
        </div>
      }

      {subView === 'location' && (
        <LocationZoneSettings
          profile={profile}
          onBack={() => setSubView('profile')}
          onSave={onUpdateProfile}
          triggerToast={triggerToast}
        />
      )}

      {/* Screen 14: Vacation Mode setup */}
      {subView === 'vacation' &&
      <div className="space-y-5 animate-fadeIn">
          {/* Header back bar banner details */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button
            onClick={() => setSubView('profile')}
            className="flex items-center active:scale-95 transition-transform">
            
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">Vacation Mode</h2>
            <div className="w-6"></div>
          </div>

          <div className="pt-6 space-y-5">
            {/* Blinker open LED dot card */}
            <div className="bg-white border border-outline-variant/25 rounded-2xl p-4 flex items-center gap-3 shadow-xs">
              <div className="relative flex items-center justify-center">
                {vacation.isKitchenOpen ?
              <>
                    <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </> :

              <>
                    <span className="absolute inline-flex h-3.5 w-3.5 rounded-full bg-red-500 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-400"></span>
                  </>
              }
              </div>
              <div className="text-left">
                <span className="font-extrabold text-[14px] text-primary">
                  Kitchen is {vacation.isKitchenOpen ? 'OPEN' : 'CLOSED ON VACATION'}
                </span>
                <p className="text-[12px] text-outline mt-0.5">
                  {vacation.isKitchenOpen ?
                'Accepting subscribers and one-time orders.' :
                'Unfinished orders are deferred and paused.'}
                </p>
              </div>
            </div>

            {/* From/To inputs column configuration */}
            <div className="space-y-4">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">SET UNAVAILABLE PERIOD</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-bold block">From date</label>
                  <input
                  type="date"
                  value={vacStart}
                  onChange={(e) => setVacStart(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[12px]" />
                
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-bold block">To date</label>
                  <input
                  type="date"
                  value={vacEnd}
                  onChange={(e) => setVacEnd(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[12px]" />
                
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-bold block">Reason (optional)</label>
                <textarea
                value={vacReason}
                onChange={(e) => setVacReason(e.target.value)}
                className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[13px] resize-none"
                placeholder="e.g. Annual maintenance or personal vacation leave"
                rows={2} />
              
              </div>
            </div>

            {/* Automated checkmark options list Screen 14 */}
            <section className="bg-white rounded-xl p-4 border border-outline-variant/15 text-left space-y-4 shadow-xs">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-outline mb-1">
                WHAT HAPPENS AUTOMATICALLY
              </h2>
              <div className="space-y-3.5">
                {[
              {
                title: 'Subscribers notified',
                desc: 'Automatic email sent to all active meal plan holders.',
                enabled: vacNotified,
                set: setVacNotified
              },
              {
                title: 'Subscriptions paused',
                desc: 'Billing cycles deferred for the duration of the break.',
                enabled: vacPaused,
                set: setVacPaused
              },
              {
                title: 'Auto-resume',
                desc: 'Listings go live at 12:00 AM on the end date.',
                enabled: vacAutoResume,
                set: setVacAutoResume
              },
              {
                title: 'Admin alerted',
                desc: 'Logistics team notified for delivery routing updates.',
                enabled: vacAdminAlerted,
                set: setVacAdminAlerted
              },
              {
                title: '"Kitchen is back" push',
                desc: 'Send mobile notifications when you return.',
                enabled: vacPushBack,
                set: setVacPushBack
              }].
              map((row, idx) =>
              <label key={idx} className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => row.set(e.target.checked)}
                  className="w-5 h-5 mt-0.5 border-outline-variant text-primary rounded focus:ring-primary accent-primary" />
                
                    <div className="flex flex-col text-left">
                      <span className={`text-[13px] font-bold ${row.enabled ? 'text-primary' : 'text-on-surface'}`}>
                        {row.title}
                      </span>
                      <p className="text-[11px] text-outline font-medium mt-0.5 leading-tight">{row.desc}</p>
                    </div>
                  </label>
              )}
              </div>
            </section>

            {/* Primary Action Button toggles */}
            <button
            type="button"
            onClick={handleToggleVacation}
            className="w-full py-4 rounded-xl text-[14px] font-bold shadow-md active:scale-98 transition-all bg-secondary-container hover:brightness-105 text-white flex items-center justify-center gap-2 cursor-pointer">
            
              <Truck />
              {vacation.isKitchenOpen ? 'Activate Vacation Mode' : 'Deactivate Vacation Mode'}
            </button>
            <p className="text-center text-[12px] text-outline font-medium leading-tight">
              You can manually end vacation mode at any time from your dashboard.
            </p>
          </div>
        </div>
      }

      {/* Screen 15: Cutoff Settings setup */}
      {subView === 'cutoff' &&
      <div className="space-y-5 animate-fadeIn text-left">
          {/* Header back bar banner details */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button
            onClick={() => setSubView('profile')}
            className="flex items-center active:scale-95 transition-transform">
            
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">Cutoff Settings</h2>
            <div className="w-6"></div>
          </div>

          <div className="pt-6 space-y-5">
            {/* LUNCH ORDERS SECTION */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">LUNCH ORDERS</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                    type="radio"
                    name="cutoffType"
                    checked={cutoffType === 'Same day 10am'}
                    onChange={() => setCutoffType('Same day 10am')}
                    className="w-5 h-5 text-primary border-outline-variant focus:ring-primary accent-primary" />
                  
                    <span className={`text-[13px] ${cutoffType === 'Same day 10am' ? 'font-bold text-primary' : 'text-on-surface'}`}>
                      Same day 10am
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                    type="radio"
                    name="cutoffType"
                    checked={cutoffType === 'Previous evening 8pm'}
                    onChange={() => setCutoffType('Previous evening 8pm')}
                    className="w-5 h-5 text-primary border-outline-variant focus:ring-primary accent-primary" />
                  
                    <span className={`text-[13px] ${cutoffType === 'Previous evening 8pm' ? 'font-bold text-primary' : 'text-on-surface'}`}>
                      Previous evening 8pm
                    </span>
                  </label>
                </div>
                
                <div className="pt-2">
                  <label className="text-[10px] text-outline uppercase font-bold block mb-1">Cutoff time:</label>
                  <div className="flex items-center bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 justify-between">
                    <span className="font-extrabold text-[14px] text-primary">
                      {cutoffType === 'Same day 10am' ? '10:00 (10am)' : '20:00 (8pm)'}
                    </span>
                    <Clock className="text-primary text-[18px]" />
                  </div>
                </div>
              </div>
            </section>

            {/* MAX DAILY PORTIONS */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">MAX DAILY PORTIONS</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-bold text-on-surface">Lunch portions cap:</label>
                  <input
                  type="number"
                  value={portionsCap}
                  onChange={(e) => setPortionsCap(parseInt(e.target.value) || 0)}
                  className="w-16 h-10 border border-outline-variant rounded-lg text-center font-extrabold text-[14px] focus:border-primary focus:ring-1 focus:ring-primary" />
                
                </div>
                <p className="text-[10px] text-outline leading-tight italic">
                  Admin will be notified once this limit is reached for any date.
                </p>
              </div>
            </section>

            {/* MANUAL CLOSURE DATES tags chips */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">MANUAL CLOSURE DATES</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
                <div className="flex flex-wrap gap-2">
                  {closedDays.map((day) =>
                <div
                  key={day}
                  className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-full">
                  
                      <span className="text-[13px] font-bold">{day}</span>
                      <button
                    type="button"
                    onClick={() => handleRemoveClosedDay(day)}
                    className="leading-none hover:text-red-500 font-bold">
                    
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                )}
                </div>
                
                <button
                type="button"
                onClick={handleAddClosedDay}
                className="flex items-center gap-1 text-primary font-bold text-[13px] hover:underline">
                
                  <PlusCircle className="text-[18px]" />
                  Add closed day
                </button>
              </div>
            </section>

            {/* Dependencies calendar locks automatically banner info */}
            <div className="bg-primary/5 border-l-[4px] border-primary rounded-r-xl p-4 flex gap-3 items-start shadow-xs">
              <Info className="text-primary text-[20px]" />
              <div>
                <p className="text-[13px] text-primary font-bold">When cutoff passes:</p>
                <p className="text-[12px] text-on-surface-variant font-medium mt-0.5">
                  Customer calendar locks 🔒 automatically
                </p>
              </div>
            </div>

            {/* Save buttons */}
            <button
            onClick={handleSaveCutoff}
            className="w-full h-14 bg-primary text-on-primary rounded-xl font-bold text-[15px] shadow-lg active:scale-95 transition-all cursor-pointer flex items-center justify-center">
            
              Save Cutoff Settings
            </button>
          </div>
        </div>
      }

      {/* ── Help & Support: Ticket List ───────────────────────────────────── */}
      {subView === 'support' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button onClick={() => setSubView('profile')} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">Help & Support</h2>
            <button
              onClick={() => setSubView('support-create')}
              className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full text-[12px] font-bold active:scale-95"
            >
              <Plus className="text-[16px]" />
              New
            </button>
          </div>

          <div className="pt-6 space-y-3">
            {/* Quick-action card */}
            <button
              onClick={() => setSubView('support-create')}
              className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-primary to-primary/80 text-on-primary rounded-2xl shadow-md active:scale-95 transition-all"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <PlusCircle className="text-[22px]" />
              </div>
              <div className="text-left">
                <p className="font-bold text-[14px]">Raise New Ticket</p>
                <p className="text-[12px] opacity-80">Get help from our support team</p>
              </div>
              <ArrowRight className="ml-auto" />
            </button>

            {/* Ticket list */}
            {supportLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : supportTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="text-[48px] text-outline/40 mb-3" />
                <p className="font-bold text-[14px] text-on-surface-variant">No tickets yet</p>
                <p className="text-[12px] text-outline mt-1">Raise a ticket to get support from our team</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-outline uppercase tracking-wider px-1">Your Tickets ({supportTickets.length})</p>
                {supportTickets.map((ticket) => {
                  const scfg = STATUS_CFG[ticket.status] || STATUS_CFG.open;
                  const catLabel = {
                    orders: 'Orders', payments: 'Payments', menu: 'Menu',
                    restaurant: 'Restaurant Profile', technical: 'Technical', other: 'Other'
                  }[ticket.category] || ticket.category;
                  return (
                    <button
                      key={ticket._id}
                      onClick={() => { setSelectedTicket(null); loadTicketDetail(ticket._id); setSubView('support-detail'); }}
                      className="w-full bg-white rounded-xl border border-outline-variant/20 shadow-xs p-4 text-left flex items-start gap-3 active:scale-[0.98] transition-all"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: scfg.bg }}>
                        <Ticket className="text-[18px]" style={{ color: scfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[13px] text-on-surface truncate">{ticket.subject || 'Support Ticket'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0" style={{ background: scfg.bg, color: scfg.color }}>{scfg.label}</span>
                        </div>
                        <p className="text-[11px] text-outline mt-0.5">{catLabel} · {ticket.complaintRef || `#${String(ticket._id).slice(-6).toUpperCase()}`}</p>
                        <p className="text-[11px] text-outline/70 mt-0.5">{new Date(ticket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <ChevronRight className="text-outline text-[18px] shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Help & Support: Create Ticket ─────────────────────────────────── */}
      {subView === 'support-create' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button onClick={() => setSubView('support')} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">Raise New Ticket</h2>
            <div className="w-8" />
          </div>

          <div className="pt-6 space-y-4">
            {/* Category */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Issue Category</h2>
              <div className="grid grid-cols-2 gap-2">
                {SUPPORT_CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setNewCategory(cat.value)}
                    className={`p-3 rounded-xl border text-left text-[12px] font-bold transition-all active:scale-95 ${
                      newCategory === cat.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant/30 bg-white text-on-surface-variant'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Subject */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Subject</h2>
              <div className="bg-white rounded-xl border border-outline-variant/25 overflow-hidden">
                <input
                  type="text"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  placeholder="Brief description of the issue"
                  maxLength={120}
                  className="w-full px-4 py-3 text-[13px] text-on-surface bg-transparent focus:outline-none"
                />
              </div>
            </section>

            {/* Description */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Detailed Description</h2>
              <div className="bg-white rounded-xl border border-outline-variant/25 overflow-hidden">
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Describe the issue in detail so we can help you faster..."
                  rows={5}
                  className="w-full px-4 py-3 text-[13px] text-on-surface bg-transparent focus:outline-none resize-none"
                />
              </div>
            </section>

            {/* Attachments */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">Screenshots / Attachments (optional)</h2>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/40 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer active:bg-surface-container/10 transition-colors bg-white"
              >
                <ImagePlus className="text-[32px] text-outline" />
                <p className="text-[12px] text-outline font-medium">Tap to add screenshots (max 5)</p>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleAttachFiles} />
              </div>
              {attachPreviews.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-1">
                  {attachPreviews.map((src, i) => (
                    <div key={i} className="relative w-16 h-16">
                      <img src={src} className="w-16 h-16 rounded-xl object-cover border border-outline-variant/20" alt="attach" />
                      <button
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-white rounded-full flex items-center justify-center shadow"
                      >
                        <X className="text-[12px]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Submit */}
            <button
              onClick={handleCreateTicket}
              disabled={creating || !newSubject.trim() || !newDesc.trim()}
              className="w-full h-14 bg-primary text-on-primary rounded-xl font-bold text-[15px] shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? (
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</>
              ) : (
                <><Send /> Submit Ticket</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Help & Support: Ticket Detail ─────────────────────────────────── */}
      {subView === 'support-detail' && (
        <div className="space-y-4 animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-outline-variant/25 pb-3 -mx-4 px-4 bg-primary text-on-primary h-14 fixed top-0 left-0 right-0 w-[390px] mx-auto z-50">
            <button onClick={() => { setSelectedTicket(null); loadSupportTickets(); setSubView('support'); }} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">Ticket Detail</h2>
            <div className="w-8" />
          </div>

          <div className="pt-6">
            {ticketLoading && !selectedTicket ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !selectedTicket ? (
              <div className="flex flex-col items-center py-16 text-center">
                <AlertCircle className="text-[40px] text-outline/40 mb-3" />
                <p className="font-bold text-on-surface-variant">Ticket not found</p>
              </div>
            ) : (() => {
              const t = selectedTicket;
              const scfg = STATUS_CFG[t.status] || STATUS_CFG.open;
              const catLabel = {
                orders: 'Orders', payments: 'Payments', menu: 'Menu',
                restaurant: 'Restaurant Profile', technical: 'Technical', other: 'Other'
              }[t.category] || t.category;
              return (
                <div className="space-y-4">
                  {/* Ticket header card */}
                  <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-xs p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: scfg.bg }}>
                        <Ticket className="text-[20px]" style={{ color: scfg.color }} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold" style={{ background: scfg.bg, color: scfg.color }}>{scfg.label}</span>
                          <span className="text-[11px] text-outline font-mono">{t.complaintRef || `#${String(t._id).slice(-6).toUpperCase()}`}</span>
                        </div>
                        <h3 className="font-bold text-[14px] text-on-surface mt-1">{t.subject}</h3>
                        <p className="text-[11px] text-outline mt-0.5">{catLabel} · {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>

                  {/* Your message */}
                  <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-xs p-4 space-y-2">
                    <p className="text-[11px] font-bold text-outline uppercase tracking-wider">Your Message</p>
                    <p className="text-[13px] text-on-surface leading-relaxed">{t.message}</p>
                    {t.proofPhotos?.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-outline mb-2">Attachments ({t.proofPhotos.length})</p>
                        <div className="flex gap-2 flex-wrap">
                          {t.proofPhotos.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer"
                              className="w-16 h-16 rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container shrink-0 hover:opacity-85 transition"
                            >
                              <img src={url} alt={`attach-${i}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Admin response history */}
                  {(t.responses?.length > 0 || t.customerResponseSent || t.customerResponseMessage) ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-outline uppercase tracking-wider px-1">Admin Responses</p>
                      {/* Legacy single response */}
                      {t.customerResponseSent && t.customerResponseMessage && (
                        <div className="bg-primary/8 border border-primary/20 rounded-2xl p-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <Headset className="text-primary text-[16px]" />
                            <span className="text-[11px] font-bold text-primary">Support Team</span>
                            <span className="text-[10px] text-outline ml-auto">{t.customerResponseAt ? new Date(t.customerResponseAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                          </div>
                          <p className="text-[13px] text-on-surface leading-relaxed">{t.customerResponseMessage}</p>
                        </div>
                      )}
                      {/* Array of responses */}
                      {(t.responses || []).map((r, i) => (
                        <div key={i} className="bg-primary/8 border border-primary/20 rounded-2xl p-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <Headset className="text-primary text-[16px]" />
                            <span className="text-[11px] font-bold text-primary">{r.responderName || 'Support Team'}</span>
                            <span className="text-[10px] text-outline ml-auto">{r.at ? new Date(r.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                          </div>
                          <p className="text-[13px] text-on-surface leading-relaxed">{r.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-surface-container/50 rounded-2xl border border-outline-variant/15 p-4 flex items-center gap-3">
                      <Clock className="text-outline text-[22px]" />
                      <div>
                        <p className="font-bold text-[13px] text-on-surface-variant">Awaiting Response</p>
                        <p className="text-[11px] text-outline mt-0.5">Our team will respond within 24 hours</p>
                      </div>
                    </div>
                  )}

                  {/* Status trail */}
                  {t.statusTrail?.length > 0 && (
                    <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-xs p-4 space-y-3">
                      <p className="text-[11px] font-bold text-outline uppercase tracking-wider">Activity Trail</p>
                      {t.statusTrail.map((trail, i) => {
                        const tcfg = STATUS_CFG[trail.status] || STATUS_CFG.open;
                        return (
                          <div key={i} className="flex items-start gap-2.5">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tcfg.bg }}>
                              <div className="w-2 h-2 rounded-full" style={{ background: tcfg.color }} />
                            </div>
                            <div>
                              <span className="text-[11px] font-bold" style={{ color: tcfg.color }}>{tcfg.label}</span>
                              {trail.note && <p className="text-[11px] text-outline mt-0.5">{trail.note}</p>}
                              <p className="text-[10px] text-outline/60">{trail.at ? new Date(trail.at).toLocaleString('en-IN') : ''}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Persistent success message toast overlay */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 transition-all duration-300 z-100 ${
        showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
        }>
        
        <CheckCircle className="text-primary-fixed text-green-400" />
        <span className="font-bold text-[13px]">{toastMessage}</span>
      </div>
    </div>);

}