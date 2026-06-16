/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { restaurantAPI } from '../../../services/api/index';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

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
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
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
          <span className="material-symbols-outlined">arrow_back</span>
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
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">warning</span>
                <span>
                  Your recent zone change request was rejected. Reason: <strong>{profile.zoneChangeRejectionReason || 'Rejected by admin'}</strong>
                </span>
              </div>
            )}

            {/* Display Pending Banner if pending */}
            {profile?.zoneChangeStatus === 'pending' && (
              <div className="bg-primary/10 border border-primary/25 rounded-xl p-3 flex items-start gap-2.5 text-primary text-[12px] font-medium animate-fadeIn">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">info</span>
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
              <span className="material-symbols-outlined text-[18px]">edit</span>
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
                    <span className="material-symbols-outlined text-[18px]">location_on</span>
                    {showMap ? 'Hide Map' : 'Set Pin on Map'}
                  </button>
                  <button 
                    onClick={handleLiveLocation} 
                    className="flex-1 py-2.5 rounded-lg text-[13px] font-bold bg-primary text-on-primary flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">my_location</span>
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
  const [subView, setSubView] = useState('profile');

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
            <span className="material-symbols-outlined text-primary text-[22px]">verified_user</span>
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
                  <span className="material-symbols-outlined text-outline">storefront</span>
                  <span className="font-bold text-[13px]">Kitchen Name &amp; Bio</span>
                </div>
                <span className="material-symbols-outlined text-outline group-active:translate-x-0.5 transition-transform text-[18px]">
                  chevron_right
                </span>
              </button>

              <button
              onClick={() => setSubView('location')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-outline">location_on</span>
                  <span className="font-bold text-[13px]">Location &amp; Zone</span>
                </div>
                <span className="material-symbols-outlined text-outline group-active:translate-x-0.5 transition-transform text-[18px]">
                  chevron_right
                </span>
              </button>

              {/* EU food license Amber row warned of expiring dates */}
              <button
              onClick={() => {
                const licenceName = profile.foodLicenceUrl ? profile.foodLicenceUrl.split('/').pop() : (profile.licenseFile || 'Not Uploaded');
                triggerToast(`EU License validated: ${licenceName} expires in June 2026`);
              }}
              className="w-full flex items-center justify-between p-4 bg-secondary-container/10 hover:bg-secondary-container/15 transition-colors group text-on-secondary-container">
              
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-secondary">assignment_turned_in</span>
                  <span className="font-bold text-[13px]">
                    EU Food Licence <span className="text-secondary font-semibold text-[11px]">({profile.foodLicenceUrl ? profile.foodLicenceUrl.split('/').pop() : (profile.licenseFile || 'licence_food_pl_2026.pdf')})</span>
                  </span>
                </div>
                <span className="material-symbols-outlined text-secondary group-active:translate-x-0.5 transition-transform text-[18px]">
                  chevron_right
                </span>
              </button>

              <button
              onClick={() => setSubView('vacation')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">airport_shuttle</span>
                  <span className="font-bold text-[13px] text-primary">Vacation Mode Setup</span>
                </div>
                <span className="material-symbols-outlined text-primary group-active:translate-x-0.5 transition-transform text-[18px]">
                  chevron_right
                </span>
              </button>

              <button
              onClick={() => setSubView('cutoff')}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">hourglass_empty</span>
                  <span className="font-bold text-[13px] text-primary">Cutoff &amp; Portions Settings</span>
                </div>
                <span className="material-symbols-outlined text-primary group-active:translate-x-0.5 transition-transform text-[18px]">
                  chevron_right
                </span>
              </button>
            </div>
          </div>

          {/* Financial details section block */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-outline px-1 mb-2">Financial Settings</h3>
            <div className="bg-surface-container-lowest rounded-xl shadow-xs border border-outline-variant/15 overflow-hidden divide-y divide-outline-variant/10 text-left">
              {[
            { label: 'Bank Account Details', icon: 'account_balance' },
            { label: 'Payout Schedules', icon: 'payout' },
            { label: 'Tax & VAT Registrations', icon: 'receipt' }].
            map((item, idx) =>
            <button
              key={idx}
              onClick={() => triggerToast(`Accessing Secure Vault: ${item.label}. This syncs automatically!`)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-surface-container/5 transition-colors group text-on-surface">
              
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-outline">{item.icon}</span>
                    <span className="font-bold text-[13px]">{item.label}</span>
                  </div>
                  <span className="material-symbols-outlined text-outline group-active:translate-x-0.5 transition-transform text-[18px]">
                    arrow_forward
                  </span>
                </button>
            )}
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
            
              <span className="material-symbols-outlined">arrow_back</span>
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
            
              <span className="material-symbols-outlined">airport_shuttle</span>
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
            
              <span className="material-symbols-outlined">arrow_back</span>
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
                    <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
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
                    className="material-symbols-outlined text-[16px] leading-none hover:text-red-500 font-bold">
                    
                        close
                      </button>
                    </div>
                )}
                </div>
                
                <button
                type="button"
                onClick={handleAddClosedDay}
                className="flex items-center gap-1 text-primary font-bold text-[13px] hover:underline">
                
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Add closed day
                </button>
              </div>
            </section>

            {/* Dependencies calendar locks automatically banner info */}
            <div className="bg-primary/5 border-l-[4px] border-primary rounded-r-xl p-4 flex gap-3 items-start shadow-xs">
              <span className="material-symbols-outlined text-primary text-[20px]">info</span>
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

      {/* Persistent success message toast overlay */}
      <div
        className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 transition-all duration-300 z-100 ${
        showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95 pointer-events-none'}`
        }>
        
        <span className="material-symbols-outlined text-primary-fixed text-green-400">check_circle</span>
        <span className="font-bold text-[13px]">{toastMessage}</span>
      </div>
    </div>);

}