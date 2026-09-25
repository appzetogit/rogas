/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { restaurantAPI, uploadAPI, dmbVendorAPI } from '../../../services/api/index';
import { useRestaurantNotifications } from '../../Food/hooks/useRestaurantNotifications';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useNavigate } from 'react-router-dom';
import { Camera, Edit2, LogOut, CheckCircle2, AlertCircle, Info, FileText, Download, Check, Save, Upload, MapPin, Search, ArrowLeft, ArrowRight, ShieldCheck, HelpCircle, X, Shield, History, Landmark, Wallet, Receipt, AlertTriangle, Locate, UserCheck, Store, ChevronRight, ClipboardCheck, Truck, Hourglass, Users, Headset, Clock, PlusCircle, Plus, Inbox, Ticket, ImagePlus, Send, CheckCircle, Loader2 } from 'lucide-react';
import { Trans, useTranslation } from "react-i18next";

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

function LocationZoneSettings({ profile, onBack, onSave, triggerToast }) {
  const { t: tr } = useTranslation("vendor");
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
      triggerToast(tr("Failed to load zones"));
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
        triggerToast(tr("Live location & address fetched successfully!"));
      }, (error) => {
        triggerToast(tr("Failed to get live location. Please allow location permissions."));
      });
    } else {
      triggerToast(tr("Geolocation is not supported by your browser"));
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
      triggerToast(tr("Location & Zone update request submitted successfully!"));
      onBack();
    } catch (err) {
      triggerToast(tr("Failed to update location"));
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
      triggerToast(tr("No changes made to Zone or Location."));
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn text-left pt-2">
      <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
        <button onClick={onBack} className="flex items-center active:scale-95 transition-transform">
          <ArrowLeft />
        </button>
        <h2 className="text-[16px] font-semibold">{tr("Location & Zone")}</h2>
        <div className="w-6"></div>
      </div>

      <div className="pt-6 space-y-5">
        {!isEditing ? (
          <section className="space-y-4">
            <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Saved Location & Zone")}</h2>
            
            {/* Display Rejection Banner if rejected */}
            {profile?.zoneChangeStatus === 'rejected' && (
              <div className="bg-error/10 border border-error/25 rounded-xl p-3 flex items-start gap-2.5 text-error text-[12px] font-medium animate-fadeIn">
                <AlertTriangle className="text-[18px] shrink-0 mt-0.5" />
                <span>
                  {tr("Your recent zone change request was rejected. Reason:")} <strong>{profile.zoneChangeRejectionReason || tr("Rejected by admin")}</strong>
                </span>
              </div>
            )}

            {/* Display Pending Banner if pending */}
            {profile?.zoneChangeStatus === 'pending' && (
              <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 flex items-start gap-2.5 text-primary text-[12px] font-medium animate-fadeIn">
                <Info className="text-[18px] shrink-0 mt-0.5" />
                <span>
                  <Trans t={tr} i18nKey={"Your request to change zone to <0>{{zone}}</0> is under review by the admin."} defaults={"Your request to change zone to <0>{{zone}}</0> is under review by the admin."} values={{ zone: zones.find(z => z._id === profile.pendingZoneId)?.name || tr("New Zone") }} components={[<strong />]} />
                </span>
              </div>
            )}

            <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
              <div>
                <p className="text-[10px] text-outline uppercase font-bold mb-1">{tr("Service Zone")}</p>
                <p className="text-[14px] font-bold text-on-surface">
                  {zones.find(z => z._id === selectedZone)?.name || tr("Not Selected")}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-outline uppercase font-bold mb-1">{tr("Address")}</p>
                <p className="text-[13px] font-medium text-on-surface-variant">
                  {profile?.location?.formattedAddress || profile?.location?.address || profile?.address || tr("Not Selected")}
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
              {tr("Change Location & Zone")}
            </button>
          </section>
        ) : (
          <>
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Service Zone")}</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
                <select 
                  value={selectedZone} 
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[13px] text-on-surface"
                >
                  <option value="">{tr("Select a Zone")}</option>
                  {zones.map(z => (
                    <option key={z._id} value={z._id}>{z.name}</option>
                  ))}
                </select>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Location Address")}</h2>
              <div className="bg-white rounded-xl p-4 border border-outline-variant/20 shadow-xs space-y-4">
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[13px] resize-none"
                  placeholder={tr("Enter full address")}
                  rows={3}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowMap(!showMap)} 
                    className="flex-1 py-2.5 rounded-lg text-[13px] font-bold border border-primary text-primary flex items-center justify-center gap-2"
                  >
                    <MapPin className="text-[18px]" />
                    {showMap ? tr("Hide Map") : tr("Set Pin on Map")}
                  </button>
                  <button 
                    onClick={handleLiveLocation} 
                    className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-primary text-on-primary flex items-center justify-center gap-2"
                  >
                    <Locate className="text-[18px]" />
                    {tr("Live Location")}
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
                      <div className="flex items-center justify-center h-full text-outline text-[12px]">{tr("Loading Map...")}</div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <button
              onClick={handleSaveClick}
              className="w-full h-14 bg-primary text-on-primary rounded-xl font-bold text-[15px] shadow-lg active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              {tr("Save Location & Zone")}
            </button>
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] px-4">
          <div className="bg-white rounded-2xl p-5 max-w-[340px] w-full shadow-2xl space-y-4">
            <h3 className="text-[16px] font-bold text-on-surface">{tr("Zone & Location Update Request")}</h3>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">
              {tr("Updating your zone or location will send your profile to the admin for review. Your request may be approved or rejected. Do you want to continue?")}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 h-11 border border-outline-variant rounded-xl font-bold text-[13px] text-outline hover:bg-surface-container active:scale-95 transition-all"
              >
                {tr("Cancel")}
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  handleSave();
                }}
                className="flex-1 h-11 bg-primary text-on-primary rounded-xl font-bold text-[13px] shadow-sm hover:brightness-95 active:scale-95 transition-all"
              >
                {tr("Submit Request")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function KitchenNameContactSettings({ profile, onBack, onSave, triggerToast }) {
  const { t: tr } = useTranslation("vendor");
  const [name, setName] = useState(profile?.name || profile?.restaurantName || '');
  const [phone, setPhone] = useState(profile?.primaryContactNumber || profile?.ownerPhone || '');
  
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(profile?.profileImage?.url || profile?.profileImage || '');

  const [coverImageFile, setCoverImageFile] = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState(profile?.coverImages?.[0]?.url || profile?.coverImages?.[0] || '');

  const [loading, setLoading] = useState(false);

  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (type === 'profile') {
        setProfileImageFile(file);
        setProfileImagePreview(URL.createObjectURL(file));
      } else {
        setCoverImageFile(file);
        setCoverImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      triggerToast(tr("Kitchen Name is required"));
      return;
    }
    if (!phone.trim()) {
      triggerToast(tr("Contact Number is required"));
      return;
    }
    try {
      setLoading(true);
      
      let newProfileImageUrl = undefined;
      let newCoverImageUrl = undefined;

      if (profileImageFile) {
        const pRes = await uploadAPI.uploadMedia(profileImageFile, { folder: 'food/restaurants/profile' });
        newProfileImageUrl = pRes?.data?.data?.url || pRes?.data?.url || pRes?.url;
      }
      
      if (coverImageFile) {
        const cRes = await uploadAPI.uploadMedia(coverImageFile, { folder: 'food/restaurants/cover' });
        newCoverImageUrl = cRes?.data?.data?.url || cRes?.data?.url || cRes?.url;
      }

      const updateData = { restaurantName: name, primaryContactNumber: phone };
      if (newProfileImageUrl) updateData.profileImage = newProfileImageUrl;
      if (newCoverImageUrl) updateData.coverImages = [newCoverImageUrl];

      const response = await restaurantAPI.updateProfile(updateData);
      
      if (response?.data?.data?.restaurant) {
        onSave(response.data.data.restaurant);
      } else {
        onSave(updateData);
      }
      
      triggerToast(tr("Kitchen Details updated successfully!"));
      onBack();
    } catch (err) {
      triggerToast(tr("Failed to update kitchen info"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn text-left pt-2">
      <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
        <button onClick={onBack} className="flex items-center active:scale-95 transition-transform">
          <ArrowLeft />
        </button>
        <h2 className="text-[16px] font-semibold">{tr("Kitchen Name & Contact")}</h2>
        <div className="w-6"></div>
      </div>

      <div className="pt-6 space-y-5">
        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Kitchen Name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("Enter kitchen name")}
              className="w-full h-12 bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 text-[14px] text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Contact Number")}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={tr("Enter contact number")}
              className="w-full h-12 bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 text-[14px] text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-outline-variant/20">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Profile Image")}</label>
              <div className="flex items-center gap-4">
                {profileImagePreview ? (
                  <img src={profileImagePreview} alt={tr("Profile")} className="w-16 h-16 rounded-full object-cover border border-outline-variant/30" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-outline">
                    <ImagePlus size={24} />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, 'profile')}
                  className="text-[12px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Banner / Cover Image")}</label>
              <div className="flex flex-col gap-3">
                {coverImagePreview ? (
                  <img src={coverImagePreview} alt={tr("Cover")} className="w-full h-48 rounded-xl object-cover border border-outline-variant/30" />
                ) : (
                  <div className="w-full h-48 rounded-xl bg-surface-container-highest flex items-center justify-center text-outline">
                    <ImagePlus size={32} />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageChange(e, 'cover')}
                  className="text-[12px] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              </div>
            </div>
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full h-12 bg-primary text-on-primary rounded-xl font-bold text-[14px] active:scale-95 transition-transform flex items-center justify-center shadow-md disabled:opacity-70"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {tr("Saving...")}
            </span>
          ) : (
            tr("Save Changes")
          )}
        </button>
      </div>
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
  const { t: tr } = useTranslation("vendor");
  const navigate = useNavigate();
  const [subView, setSubView] = useState('profile');

  // ── Bank Account Details state & logic ──────────────────────────────────────
  const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;

  const [bankForm, setBankForm] = useState({
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    accountType: 'Savings',
    upiId: '',
    upiQrImage: ''
  });
  const [bankErrors, setBankErrors] = useState({});
  const [savingBank, setSavingBank] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef(null);

  const initBankForm = async () => {
    try {
      // Set initial values from profile prop first
      setBankForm({
        accountHolderName: profile.accountHolderName || '',
        accountNumber: profile.accountNumber || '',
        confirmAccountNumber: profile.accountNumber || '',
        ifscCode: profile.ifscCode || '',
        accountType: profile.accountType || 'Savings',
        upiId: profile.upiId || '',
        upiQrImage: profile.upiQrImage || ''
      });

      // Then fetch latest from backend
      const res = await restaurantAPI.getCurrentRestaurant();
      const doc = res?.data?.data?.restaurant || res?.data?.restaurant || null;
      if (doc) {
        setBankForm({
          accountHolderName: doc.accountHolderName || '',
          accountNumber: doc.accountNumber || '',
          confirmAccountNumber: doc.accountNumber || '',
          ifscCode: doc.ifscCode || '',
          accountType: doc.accountType || 'Savings',
          upiId: doc.upiId || '',
          upiQrImage: doc.upiQrImage || ''
        });
      }
    } catch (_) {}
  };

  const handleQrUpload = async (file) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        triggerToast(tr("Image size too large. Max 5MB allowed."));
        return;
      }
      setUploadingQr(true);
      const response = await uploadAPI.uploadMedia(file, { folder: "food/restaurants/upi-qr" });
      const url = response?.data?.data?.url || response?.data?.url || "";
      if (!url) throw new Error("Upload failed");
      setBankForm((prev) => ({ ...prev, upiQrImage: url }));
      triggerToast(tr("QR updated successfully"));
    } catch (error) {
      triggerToast(error?.response?.data?.message || error?.message || tr("Failed to upload QR image"));
    } finally {
      setUploadingQr(false);
    }
  };

  const handleSaveBankDetails = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    const accountHolderName = String(bankForm.accountHolderName || "").trim();
    const accountNumber = String(bankForm.accountNumber || "").replace(/\s|-/g, "");
    const confirmAccountNumber = String(bankForm.confirmAccountNumber || "").replace(/\s|-/g, "");
    const ifscCode = String(bankForm.ifscCode || "").trim().toUpperCase();
    const upiId = String(bankForm.upiId || "").trim();

    const anyBankField = Boolean(accountHolderName || accountNumber || ifscCode);

    if (anyBankField) {
      if (!accountHolderName) nextErrors.accountHolderName = "Account holder name is required";
      if (!accountNumber) {
        nextErrors.accountNumber = "Account number is required";
      } else if (!/^\d{9,18}$/.test(accountNumber)) {
        nextErrors.accountNumber = "Account number must be 9 to 18 digits";
      }
      if (!confirmAccountNumber) {
        nextErrors.confirmAccountNumber = "Please confirm account number";
      } else if (confirmAccountNumber !== accountNumber) {
        nextErrors.confirmAccountNumber = "Account numbers do not match";
      }
      if (!ifscCode) {
        nextErrors.ifscCode = "IFSC code is required";
      } else if (!IFSC_REGEX.test(ifscCode)) {
        nextErrors.ifscCode = "Invalid IFSC format (e.g. SBIN0018764)";
      }
    }

    if (upiId && !UPI_REGEX.test(upiId)) {
      nextErrors.upiId = "Invalid UPI ID format (e.g. name@bank)";
    }

    if (Object.keys(nextErrors).length > 0) {
      setBankErrors(nextErrors);
      return;
    }

    const payload = {
      accountHolderName,
      accountNumber,
      ifscCode,
      accountType: bankForm.accountType,
      upiId,
      upiQrImage: bankForm.upiQrImage
    };

    try {
      setSavingBank(true);
      await restaurantAPI.updateProfile(payload);
      onUpdateProfile(payload);
      setBankErrors({});
      triggerToast(tr("Bank details updated successfully"));
      setSubView('profile');
    } catch (error) {
      triggerToast(error?.response?.data?.message || tr("Failed to update bank details"));
    } finally {
      setSavingBank(false);
    }
  };

  // ── Withdraw Request state & logic ──────────────────────────────────────────
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawHistoryLoading, setWithdrawHistoryLoading] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const loadWithdrawHistoryAndBalance = async () => {
    setWithdrawHistoryLoading(true);
    try {
      // Load balance
      const earningsRes = await dmbVendorAPI.getVendorEarningsSummary();
      const bal = earningsRes?.data?.data?.summary?.availableBalance ?? 0;
      setAvailableBalance(Number(bal));

      // Load history
      const historyRes = await restaurantAPI.getWithdrawalHistory();
      const list = historyRes?.data?.data || historyRes?.data || [];
      setWithdrawals(Array.isArray(list) ? list : []);
    } catch (e) {
      triggerToast(tr("Failed to load withdrawals"));
    } finally {
      setWithdrawHistoryLoading(false);
    }
  };

  const handleCreateWithdrawRequest = async (e) => {
    e.preventDefault();
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) {
      triggerToast(tr("Please enter a valid withdrawal amount"));
      return;
    }
    if (amt > availableBalance) {
      triggerToast(tr("Insufficient balance. Maximum available is ₹{{availableBalance}}", { availableBalance }));
      return;
    }

    const bankPayload = {
      accountNumber: profile.accountNumber || bankForm.accountNumber,
      ifscCode: profile.ifscCode || bankForm.ifscCode,
      bankName: profile.bankName || 'Bank',
      accountHolderName: profile.accountHolderName || bankForm.accountHolderName,
      upiId: profile.upiId || bankForm.upiId,
      upiQrImage: profile.upiQrImage || bankForm.upiQrImage
    };

    setSubmittingWithdrawal(true);
    try {
      await restaurantAPI.createWithdrawalRequest(amt, bankPayload);
      triggerToast(tr("Withdrawal request submitted successfully"));
      setWithdrawAmount('');
      await loadWithdrawHistoryAndBalance();
    } catch (e) {
      triggerToast(e?.response?.data?.message || tr("Failed to submit withdrawal request"));
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

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
    { value: 'orders',     label: tr("🛒 Orders") },
    { value: 'payments',   label: tr("💳 Payments") },
    { value: 'menu',       label: tr("🍽️ Menu") },
    { value: 'restaurant', label: tr("🏪 Restaurant Profile") },
    { value: 'technical',  label: tr("⚙️ Technical Issue") },
    { value: 'other',      label: tr("💬 Other") },
  ];

  const STATUS_CFG = {
    open:       { label: tr("Open"),       color: '#dc2626', bg: '#fef2f2' },
    in_review:  { label: tr("In Review"),  color: '#d97706', bg: '#fffbeb' },
    escalated:  { label: tr("Escalated"),  color: '#9333ea', bg: '#faf5ff' },
    resolved:   { label: tr("Resolved"),   color: '#16a34a', bg: '#f0fdf4' },
    closed:     { label: tr("Closed"),     color: '#6b7280', bg: '#f3f4f6' },
  };

  const loadSupportTickets = useCallback(async () => {
    setSupportLoading(true);
    try {
      const res = await restaurantAPI.getSupportTickets();
      const list = res?.data?.data?.tickets || res?.data?.data || [];
      setSupportTickets(Array.isArray(list) ? list : []);
    } catch (e) {
      triggerToast(tr("Failed to load support tickets."));
    } finally {
      setSupportLoading(false);
    }
  }, [tr]);

  const loadTicketDetail = useCallback(async (id) => {
    setTicketLoading(true);
    try {
      const res = await restaurantAPI.getSupportTicketById(id);
      setSelectedTicket(res?.data?.data?.complaint || res?.data?.data || null);
    } catch (e) {
      triggerToast(tr("Failed to load ticket detail."));
    } finally {
      setTicketLoading(false);
    }
  }, [tr]);

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
    if (!newSubject.trim()) { triggerToast(tr("Please enter a subject.")); return; }
    if (!newDesc.trim()) { triggerToast(tr("Please enter a description.")); return; }
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

      triggerToast(tr("✅ Ticket submitted successfully!"));
      setNewSubject('');
      setNewDesc('');
      setNewCategory('orders');
      setAttachments([]);
      setAttachPreviews([]);
      await loadSupportTickets();
      setSubView('support');
    } catch (e) {
      triggerToast(e?.response?.data?.message || tr("Failed to submit ticket."));
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
    triggerToast(isNowOpen ? tr("Kitchen successfully opened! 🍳") : tr("Vacation mode activated. Kitchen is now closed 🌴"));
    setSubView('profile');
  };

  const handleSaveCutoff = () => {
    onUpdateCutoff({
      type: cutoffType,
      cutoffTime: cutoffType === 'Same day 10am' ? '10:00 (10am)' : '20:00 (8pm)',
      portionsCap: portionsCap,
      closedDays: closedDays
    });
    triggerToast(tr("Cutoff settings updated successfully ⏱️"));
    setSubView('profile');
  };

  const handleRemoveClosedDay = (day) => {
    setClosedDays((prev) => prev.filter((d) => d !== day));
    triggerToast(tr("Removed manual closure: {{day}}", { day }));
  };

  const handleAddClosedDay = () => {
    const defaultDays = ['Wed 20 May', 'Thu 21 May', 'Fri 22 May', 'Sat 23 May'];
    const nextDay = defaultDays.find((d) => !closedDays.includes(d));
    if (nextDay) {
      setClosedDays((prev) => [...prev, nextDay]);
      triggerToast(tr("Added closed day: {{nextDay}}", { nextDay }));
    } else {
      triggerToast(tr("All calendar dates registered"));
    }
  };

  return (
    <div className="flex-grow pt-4 pb-[99px] md:pb-6 font-sans px-4 select-none max-w-7xl mx-auto w-full text-left relative">
      
      {/* Profile Details section Screen 16 */}
      {subView === 'profile' &&
      <div className="space-y-5 animate-fadeIn mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Profile overview card logo stats */}
            <section className="flex flex-col items-center justify-center bg-white p-5 rounded-2xl shadow-xs border border-outline-variant/15 text-center min-h-[160px]">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white font-extrabold text-[20px] mb-3 shadow overflow-hidden">
                {profile?.profileImage?.url || typeof profile?.profileImage === 'string' ? (
                  <img src={profile?.profileImage?.url || profile?.profileImage} alt={tr("Profile")} className="w-full h-full object-cover" />
                ) : (
                  profile.avatarInitials
                )}
              </div>
              <h2 className="text-[16px] font-bold text-on-surface">{profile.name}</h2>
              <p className="text-on-surface-variant text-[12px]">{profile.type} · {profile.primaryContactNumber || profile.ownerPhone || tr("No Number")} · ★ {profile.rating}</p>
              <div className="inline-flex items-center px-3.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold mt-3 animate-pulse">
                {tr("Approved ✓")}
              </div>
            </section>

            {/* Kitchen Partner verified banner */}
            <div className="p-4 bg-primary/10 border border-primary/25 rounded-2xl flex items-center gap-3 justify-center text-left">
              <UserCheck className="text-primary text-[28px] shrink-0" />
              <div>
                <p className="text-[9px] text-outline font-bold uppercase tracking-wider">{tr("Kitchen Partner (v3.0)")}</p>
                <p className="font-bold text-on-surface text-[13px] leading-snug">{profile.partner}</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {/* Kitchen Management Links Lists block */}
            <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">{tr("Kitchen")}</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              
              <button
              onClick={() => setSubView('kitchen-details')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <Store className="text-outline" />
                  <span className="font-bold text-[13px]">{tr("Kitchen Name & Contact")}</span>
                </div>
                <ChevronRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>

              <button
              onClick={() => setSubView('location')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <MapPin className="text-outline" />
                  <span className="font-bold text-[13px]">{tr("Location & Zone")}</span>
                </div>
                <ChevronRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>

              {/* EU food license Amber row warned of expiring dates */}
              <button
              onClick={() => {
                const licenceName = profile.foodLicenceUrl ? profile.foodLicenceUrl.split('/').pop() : (profile.licenseFile || 'Not Uploaded');
                triggerToast(tr("EU License validated: {{licenceName}} expires in June 2026", { licenceName }));
              }}
              className="w-full flex items-center justify-between p-4 bg-secondary-container/10 hover:bg-secondary-container/15 transition-colors group text-on-secondary-container">
              
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="text-secondary" />
                  <span className="font-bold text-[13px]">
                    {tr("EU Food Licence")} <span className="text-secondary font-semibold text-[11px]">({profile.foodLicenceUrl ? profile.foodLicenceUrl.split('/').pop() : (profile.licenseFile || 'licence_food_pl_2026.pdf')})</span>
                  </span>
                </div>
                <ChevronRight className="text-secondary group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>





              <button
              onClick={() => navigate('/vendor/service')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <AlertTriangle className="text-amber-500" />
                  <span className="font-bold text-[13px] text-amber-600">{tr("Report Meal Unavailability")}</span>
                </div>
                <ChevronRight className="text-amber-500 group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>
            </div>
          </div>

          {/* Customer & Subscribers section block */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">{tr("Customers & Orders")}</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left mb-5">
              <button
                onClick={() => navigate('/vendor/subscribers')}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface"
              >
                <div className="flex items-center gap-3">
                  <Users className="text-outline" />
                  <span className="font-bold text-[13px]">{tr("My Subscribers")}</span>
                </div>
                <ArrowRight className="text-outline group-active:translate-x-0.5 transition-transform text-[18px]" />
              </button>
            </div>
          </div>

          {/* Financial details section block */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">{tr("Financial Settings")}</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              {[
                { label: 'Bank Account Details', icon: Landmark },
                { label: 'Withdraw Request', icon: Wallet },
                { label: 'Tax & VAT Registrations', icon: Receipt }
              ].map((item, idx) =>
                <button
                  key={idx}
                  onClick={() => {
                    if (item.label === 'Bank Account Details') {
                      initBankForm();
                      setSubView('bank');
                    } else if (item.label === 'Withdraw Request') {
                      loadWithdrawHistoryAndBalance();
                      setSubView('withdraw');
                    } else {
                      triggerToast(tr("Accessing Secure Vault: {{label}}. This syncs automatically!", { label: item.label }));
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface"
                >
              
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
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">{tr("Help & Support")}</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              <button
                onClick={() => { loadSupportTickets(); setSubView('support'); }}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface"
              >
                <div className="flex items-center gap-3">
                  <Headset className="text-primary" />
                  <div className="text-left">
                    <span className="font-bold text-[13px] text-primary block">{tr("Help & Support")}</span>
                    <span className="text-[11px] text-outline">{tr("Submit tickets & track status")}</span>
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
            
              {tr("Sign out / Exit Partner Account")}
            </button>
            <button
            onClick={() => triggerToast(tr("Account deactivation is blocked until active prep queues are cleared."))}
            className="text-error font-bold text-[11px] uppercase tracking-wider mt-1">
            
              {tr("Deactivate Account")}
            </button>
          </div>
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

      {subView === 'kitchen-details' && (
        <KitchenNameContactSettings
          profile={profile}
          onBack={() => setSubView('profile')}
          onSave={onUpdateProfile}
          triggerToast={triggerToast}
        />
      )}





      {/* ── Help & Support: Ticket List ───────────────────────────────────── */}
      {subView === 'support' && (
        <div className="space-y-4 animate-fadeIn pt-2">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
            <button onClick={() => setSubView('profile')} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">{tr("Help & Support")}</h2>
            <button
              onClick={() => setSubView('support-create')}
              className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full text-[12px] font-bold active:scale-95"
            >
              <Plus className="text-[16px]" />
              {tr("New")}
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
                <p className="font-bold text-[14px]">{tr("Raise New Ticket")}</p>
                <p className="text-[12px] opacity-80">{tr("Get help from our support team")}</p>
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
                <p className="font-bold text-[14px] text-on-surface-variant">{tr("No tickets yet")}</p>
                <p className="text-[12px] text-outline mt-1">{tr("Raise a ticket to get support from our team")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-outline uppercase tracking-wider px-1">{tr("Your Tickets ({{length}})", { length: supportTickets.length })}</p>
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
                          <span className="font-bold text-[13px] text-on-surface truncate">{ticket.subject || tr("Support Ticket")}</span>
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
        <div className="space-y-4 animate-fadeIn pt-2">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
            <button onClick={() => setSubView('support')} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">{tr("Raise New Ticket")}</h2>
            <div className="w-8" />
          </div>

          <div className="pt-6 space-y-4">
            {/* Category */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Issue Category")}</h2>
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
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Subject")}</h2>
              <div className="bg-white rounded-xl border border-outline-variant/25 overflow-hidden">
                <input
                  type="text"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  placeholder={tr("Brief description of the issue")}
                  maxLength={120}
                  className="w-full px-4 py-3 text-[13px] text-on-surface bg-transparent focus:outline-none"
                />
              </div>
            </section>

            {/* Description */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Detailed Description")}</h2>
              <div className="bg-white rounded-xl border border-outline-variant/25 overflow-hidden">
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder={tr("Describe the issue in detail so we can help you faster...")}
                  rows={5}
                  className="w-full px-4 py-3 text-[13px] text-on-surface bg-transparent focus:outline-none resize-none"
                />
              </div>
            </section>

            {/* Attachments */}
            <section className="space-y-2">
              <h2 className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Screenshots / Attachments (optional)")}</h2>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-outline-variant/40 rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer active:bg-surface-container/10 transition-colors bg-white"
              >
                <ImagePlus className="text-[32px] text-outline" />
                <p className="text-[12px] text-outline font-medium">{tr("Tap to add screenshots (max 5)")}</p>
                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleAttachFiles} />
              </div>
              {attachPreviews.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-1">
                  {attachPreviews.map((src, i) => (
                    <div key={i} className="relative w-16 h-16">
                      <img src={src} className="w-16 h-16 rounded-xl object-cover border border-outline-variant/20" alt={tr("attach")} />
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
                <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> {tr("Submitting...")}</>
              ) : (
                <><Send /> {tr("Submit Ticket")}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Help & Support: Ticket Detail ─────────────────────────────────── */}
      {subView === 'support-detail' && (
        <div className="space-y-4 animate-fadeIn pt-2">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
            <button onClick={() => { setSelectedTicket(null); loadSupportTickets(); setSubView('support'); }} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">{tr("Ticket Detail")}</h2>
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
                <p className="font-bold text-on-surface-variant">{tr("Ticket not found")}</p>
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
                    <p className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Your Message")}</p>
                    <p className="text-[13px] text-on-surface leading-relaxed">{t.message}</p>
                    {t.proofPhotos?.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[10px] font-bold text-outline mb-2">{tr("Attachments ({{length}})", { length: t.proofPhotos.length })}</p>
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
                      <p className="text-[11px] font-bold text-outline uppercase tracking-wider px-1">{tr("Admin Responses")}</p>
                      {/* Legacy single response */}
                      {t.customerResponseSent && t.customerResponseMessage && (
                        <div className="bg-primary/8 border border-primary/20 rounded-2xl p-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <Headset className="text-primary text-[16px]" />
                            <span className="text-[11px] font-bold text-primary">{tr("Support Team")}</span>
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
                            <span className="text-[11px] font-bold text-primary">{r.responderName || tr("Support Team")}</span>
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
                        <p className="font-bold text-[13px] text-on-surface-variant">{tr("Awaiting Response")}</p>
                        <p className="text-[11px] text-outline mt-0.5">{tr("Our team will respond within 24 hours")}</p>
                      </div>
                    </div>
                  )}

                  {/* Status trail */}
                  {t.statusTrail?.length > 0 && (
                    <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-xs p-4 space-y-3">
                      <p className="text-[11px] font-bold text-outline uppercase tracking-wider">{tr("Activity Trail")}</p>
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

      {/* ── Bank Account Details subview ────────────────────────────────────── */}
      {subView === 'bank' && (
        <div className="space-y-5 animate-fadeIn text-left pt-2 pb-10">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
            <button onClick={() => setSubView('profile')} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">{tr("Bank Details")}</h2>
            <div className="w-6"></div>
          </div>

          <div className="space-y-4 mt-4">
            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-1">{tr("Account Holder Name")}</label>
              <input
                type="text"
                value={bankForm.accountHolderName}
                onChange={(e) => setBankForm(p => ({ ...p, accountHolderName: e.target.value }))}
                className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-bold"
                placeholder={tr("Enter account holder name")}
              />
              {bankErrors.accountHolderName && <p className="text-red-500 text-[11px] mt-0.5">{bankErrors.accountHolderName}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-1">{tr("Account Number")}</label>
              <input
                type="text"
                value={bankForm.accountNumber}
                onChange={(e) => setBankForm(p => ({ ...p, accountNumber: e.target.value.replace(/[^\d]/g, '') }))}
                className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-bold"
                placeholder={tr("Enter bank account number")}
              />
              {bankErrors.accountNumber && <p className="text-red-500 text-[11px] mt-0.5">{bankErrors.accountNumber}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-1">{tr("Confirm Account Number")}</label>
              <input
                type="text"
                value={bankForm.confirmAccountNumber}
                onChange={(e) => setBankForm(p => ({ ...p, confirmAccountNumber: e.target.value.replace(/[^\d]/g, '') }))}
                className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-bold"
                placeholder={tr("Confirm bank account number")}
              />
              {bankErrors.confirmAccountNumber && <p className="text-red-500 text-[11px] mt-0.5">{bankErrors.confirmAccountNumber}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-1">{tr("IFSC Code")}</label>
              <input
                type="text"
                value={bankForm.ifscCode}
                onChange={(e) => setBankForm(p => ({ ...p, ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-bold"
                placeholder={tr("e.g. SBIN0018764")}
                maxLength={11}
              />
              {bankErrors.ifscCode && <p className="text-red-500 text-[11px] mt-0.5">{bankErrors.ifscCode}</p>}
            </div>

            <div>
              <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-1">{tr("Account Type")}</label>
              <select
                value={bankForm.accountType}
                onChange={(e) => setBankForm(p => ({ ...p, accountType: e.target.value }))}
                className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-bold"
              >
                <option value="Savings">{tr("Savings")}</option>
                <option value="Current">{tr("Current")}</option>
              </select>
            </div>

            <div className="pt-2 border-t border-outline-variant/20">
              <h4 className="text-[12px] font-extrabold text-primary uppercase tracking-widest mb-3">{tr("UPI Details")}</h4>

              <div>
                <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-1">{tr("UPI ID")}</label>
                <input
                  type="text"
                  value={bankForm.upiId}
                  onChange={(e) => setBankForm(p => ({ ...p, upiId: e.target.value.trim() }))}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2.5 text-[13px] font-bold"
                  placeholder={tr("e.g. merchant@okaxis")}
                />
                {bankErrors.upiId && <p className="text-red-500 text-[11px] mt-0.5">{bankErrors.upiId}</p>}
              </div>

              <div className="mt-4">
                <label className="text-[11px] font-bold text-outline uppercase tracking-wider block mb-2">{tr("UPI QR Image")}</label>
                {bankForm.upiQrImage ? (
                  <div className="relative w-40 h-40 border border-outline-variant/30 rounded-xl overflow-hidden bg-white shadow-sm flex items-center justify-center">
                    <img src={bankForm.upiQrImage} alt={tr("UPI QR")} className="max-w-full max-h-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setBankForm(p => ({ ...p, upiQrImage: '' }))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-40 h-40 border border-dashed border-outline-variant/40 rounded-xl flex items-center justify-center text-xs text-outline bg-white">
                    {tr("No QR uploaded")}
                  </div>
                )}

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => qrInputRef.current?.click()}
                    disabled={uploadingQr}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-surface-container/5 text-primary border border-primary/20 rounded-xl text-[12px] font-bold active:scale-95 transition-all shadow-xs"
                  >
                    {uploadingQr ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        {tr("Uploading...")}
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        {tr("Upload QR Image")}
                      </>
                    )}
                  </button>
                  <input
                    ref={qrInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleQrUpload(e.target.files?.[0])}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveBankDetails}
              disabled={savingBank || uploadingQr}
              className="w-full h-14 bg-primary text-on-primary rounded-xl font-bold text-[15px] shadow-lg active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mt-6 disabled:opacity-60"
            >
              {savingBank ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {tr("Save Bank Details")}
            </button>
          </div>
        </div>
      )}

      {/* ── Withdraw Requests subview ──────────────────────────────────────── */}
      {subView === 'withdraw' && (
        <div className="space-y-5 animate-fadeIn text-left pt-2 pb-10">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 mb-4 text-on-surface">
            <button onClick={() => setSubView('profile')} className="flex items-center active:scale-95 transition-transform">
              <ArrowLeft />
            </button>
            <h2 className="text-[16px] font-semibold">{tr("Withdrawal Requests")}</h2>
            <div className="w-6"></div>
          </div>

          {/* Wallet Available Balance Card */}
          <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-5 text-on-primary shadow-md relative overflow-hidden mt-4">
            <p className="text-[11px] uppercase tracking-wider opacity-85 font-bold">{tr("Available Balance")}</p>
            <h3 className="text-3xl font-extrabold mt-1">
              ₹{availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </h3>
          </div>

          {/* Create Withdraw Request Form */}
          <div className="bg-white rounded-2xl p-4 border border-outline-variant/15 shadow-xs space-y-4">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-outline">{tr("Request Payout")}</h4>
            <form onSubmit={handleCreateWithdrawRequest} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold block mb-1">{tr("Amount to Withdraw (₹)")}</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-outline-variant rounded-xl px-3 py-2.5 text-[13px] font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={tr("e.g. 500")}
                  min="1"
                  max={availableBalance}
                  disabled={submittingWithdrawal}
                />
              </div>

              <button
                type="submit"
                disabled={submittingWithdrawal || !withdrawAmount || Number(withdrawAmount) <= 0 || Number(withdrawAmount) > availableBalance}
                className="w-full h-11 bg-primary text-on-primary rounded-xl font-bold text-[13px] shadow active:scale-95 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {submittingWithdrawal ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {tr("Submitting...")}
                  </>
                ) : (
                  tr("Request Withdrawal")
                )}
              </button>
            </form>
          </div>

          {/* Withdraw Requests List */}
          <div className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1">{tr("Request History")}</h4>
            {withdrawHistoryLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-outline-variant/15 shadow-xs flex flex-col items-center justify-center space-y-2">
                <Inbox className="w-10 h-10 text-outline/40" />
                <p className="text-[12px] text-outline font-semibold">{tr("No withdrawals requested yet.")}</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {withdrawals.map((w) => {
                  const date = new Date(w.createdAt);
                  const formattedDate = date.toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div key={w._id} className="bg-white rounded-2xl p-4 shadow-xs border border-outline-variant/15 flex justify-between items-center text-left">
                      <div>
                        <p className="text-[14px] font-extrabold text-on-surface">₹{w.amount.toFixed(2)}</p>
                        <p className="text-[11px] text-outline font-medium mt-0.5">{formattedDate}</p>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border uppercase tracking-wider ${
                        w.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200/50" :
                        w.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" :
                        "bg-red-50 text-red-700 border-red-200/50"
                      }`}>
                        {w.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
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