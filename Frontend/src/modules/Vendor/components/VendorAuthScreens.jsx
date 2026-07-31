import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { dmbVendorAPI, zoneAPI } from '../../../services/api/index';
import { SUPPORTED_COUNTRIES } from '../../../config/countries';
import CountrySelector from '../../../shared/components/CountrySelector';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { ArrowLeft, ShieldCheck, MoreVertical, Store, Phone, MapPin, Locate, Check, CheckCircle, Upload, Image, IdCard, Clock, ArrowRight, XCircle, FilePenLine, Hourglass, RefreshCcw } from 'lucide-react';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};



export function PhoneScreen({ mode, onBack, onSendOtp }) {
  const location = useLocation();
  const [selectedCountry, setSelectedCountry] = useState(() => {
    return SUPPORTED_COUNTRIES.find(c => c.code === "+48") || SUPPORTED_COUNTRIES[0];
  });
  const [phone, setPhone] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length === selectedCountry.phoneLength) {
      const fullPhone = `${selectedCountry.code}${cleanDigits}`;
      onSendOtp(fullPhone);
    } else {
      alert(`Please enter a valid ${selectedCountry.phoneLength}-digit phone number`);
    }
  };

  return (
    <div className="w-full md:max-w-md min-h-screen md:min-h-0 flex flex-col bg-surface text-on-surface mx-auto relative shadow-xl md:rounded-2xl md:border md:border-outline-variant/15 font-sans">
      <header className="px-5 h-14 flex items-center">
        <button onClick={onBack} className="active:scale-95 transition-transform hover:opacity-90">
          <ArrowLeft className="text-primary" />
        </button>
      </header>

      <main className="px-5 flex-1 flex flex-col pb-6">
        <div className="w-full h-56 rounded-2xl overflow-hidden mb-6 shadow-sm">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDpWQRQIS01PQ5QzZ92J_MbnhfqpTNe-1MsukLb99JWU83WxSJxZA7MXWhmOq0UpzbJ5Qmcr6fMrU0VWlJ4F9tb_Rpb6dZ5BE3ZZwKf-NMV7z99im4yiprq3W6TBAHmzpoLqjBuizemyCgGnCr9TMbONBFJS2gooGXZ-got7BBRnQmNyCz9ICypYQsq5MJ3ywl5TkqddwGkuvDpdL8QXYkSjX7bMM7odMGUc0Nj45WxtfAFBxrdNiXszPnKkGAJ7evVjitlRk5kOQ"
            alt="Vendor Banner"
            className="w-full h-full object-cover" />

        </div>

        <h1 className="text-[24px] font-extrabold text-on-surface tracking-tight">
          {mode === 'login' ? 'Welcome back!' : 'Create an account'}
        </h1>
        <p className="text-[13px] text-outline mt-1 mb-6">
          {mode === 'login' ? 'Log in with your phone number' : 'Sign up with your phone number'}
        </p>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="mb-8">
            <label className="text-[10px] font-bold text-outline uppercase tracking-wider mb-2 block">
              Mobile Number
            </label>
            <div className="flex h-14 bg-white border border-outline-variant rounded-xl overflow-hidden shadow-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
              <CountrySelector
                selectedCountry={selectedCountry}
                onSelect={(country) => {
                  setSelectedCountry(country);
                  setPhone("");
                }}
                className="shrink-0"
                buttonClassName="flex items-center justify-between gap-1 px-4 h-14 border-r border-outline-variant bg-white dark:bg-white text-slate-800 dark:text-slate-800 text-sm font-bold min-w-[95px] cursor-pointer"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, selectedCountry.phoneLength);
                  setPhone(val);
                }}
                placeholder={selectedCountry.placeholder}
                className="flex-1 px-4 text-[14px] font-semibold text-on-surface focus:outline-none bg-white"
                maxLength={selectedCountry.phoneLength}
                autoFocus />

            </div>
          </div>

          <div className="mt-auto flex flex-col gap-5">
            <button
              type="submit"
              disabled={phone.replace(/\D/g, "").length !== selectedCountry.phoneLength}
              className="w-full bg-primary disabled:opacity-50 text-on-primary font-bold h-12 rounded-xl active:scale-[0.98] transition-all shadow-md text-[14px]">

              Send OTP
            </button>
            <p className="text-[10px] text-center text-outline px-4 mt-2">
              By continuing, you agree to our <Link to="/vendor/termsandcondition" state={{ backTo: location.pathname }} className="underline">Terms of Service</Link> and <Link to="/vendor/privacy" state={{ backTo: location.pathname }} className="underline">Privacy Policy</Link>.
            </p>
          </div>
        </form>
      </main>
    </div>);

}







export function OtpScreen({ phone, onVerify, onBack }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = [
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null),
    useRef(null)
  ];

  const handleChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  const handleSubmit = () => {
    onVerify(otp.join(''));
  };

  return (
    <div className="w-full md:max-w-md min-h-screen md:min-h-0 flex flex-col bg-surface text-on-surface mx-auto relative shadow-xl md:rounded-2xl md:border md:border-outline-variant/15 font-sans">
      <header className="px-5 h-14 flex items-center">
        <button onClick={onBack} className="active:scale-95 transition-transform hover:opacity-90">
          <ArrowLeft className="text-primary" />
        </button>
      </header>

      <main className="px-5 flex-1 flex flex-col items-center pt-8">
        <div className="w-20 h-20 rounded-full border border-primary/30 bg-primary/5 flex items-center justify-center mb-6 border-dashed">
          <ShieldCheck className="text-4xl text-primary" />
        </div>

        <h1 className="text-[24px] font-extrabold text-on-surface tracking-tight mb-2">
          Verify OTP
        </h1>
        <p className="text-[13px] text-outline text-center px-4 mb-8 leading-relaxed">
          Enter the 6-digit code sent to <span className="text-primary font-semibold">{phone || '000 000 000'}</span>
        </p>

        <div className="flex gap-2 mb-6">
          {otp.map((digit, i) =>
            <input
              key={i}
              ref={inputRefs[i]}
              type="text"
              inputMode="numeric"
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-14 bg-white border border-outline-variant rounded-xl text-center text-xl font-bold text-primary shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />

          )}
        </div>

        <p className="text-[12px] text-outline mb-10">
          Hint: Try <span className="font-bold text-primary">123456</span>
        </p>

        <div className="w-full mt-auto mb-8 flex flex-col gap-5">
          <button
            onClick={handleSubmit}
            disabled={otp.join('').length < 6}
            className="w-full bg-primary disabled:opacity-50 text-on-primary font-bold h-12 rounded-xl active:scale-[0.98] transition-all shadow-md text-[14px]">

            Verify OTP
          </button>
          <button className="text-primary text-[13px] font-semibold hover:underline text-center">
            Resend code
          </button>
        </div>
      </main>
    </div>);

}






export function RegisterFormScreen({ phone: initialPhone, onContinue, onBack }) {
  const [kitchenName, setKitchenName] = useState('');
  const [phone, setPhone] = useState(initialPhone || '');
  const [type, setType] = useState('Home Cook');
  const [licenceFile, setLicenceFile] = useState(null);
  const [licenceFileName, setLicenceFileName] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerFileName, setBannerFileName] = useState('');
  
  const [vatNumber, setVatNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ownerIdFile, setOwnerIdFile] = useState(null);
  const [ownerIdFileName, setOwnerIdFileName] = useState('');
  const [mealSlots, setMealSlots] = useState(['breakfast', 'lunch', 'dinner']);
  const [vendorTimings, setVendorTimings] = useState(null);

  // Zone & Location additions
  const [zones, setZones] = useState([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedZoneName, setSelectedZoneName] = useState('');
  const [zoneSearch, setZoneSearch] = useState('');
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
  const zoneDropdownRef = useRef(null);

  const [kitchenPartners, setKitchenPartners] = useState([]);
  const [selectedKitchenPartnerId, setSelectedKitchenPartnerId] = useState('');
  const [kitchenPartnerSearch, setKitchenPartnerSearch] = useState('');
  const [isKitchenPartnerDropdownOpen, setIsKitchenPartnerDropdownOpen] = useState(false);
  const kpDropdownRef = useRef(null);

  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(52.2297); // default Warsaw
  const [lng, setLng] = useState(21.0122); // default Warsaw
  const [addressDetails, setAddressDetails] = useState({
    city: '',
    area: '',
    state: '',
    pincode: '',
    addressLine1: ''
  });
  const [showMap, setShowMap] = useState(false);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places", "drawing", "geometry"]
  });

  useEffect(() => {
    zoneAPI.getPublicZones()
      .then(res => {
        const fetchedZones = res.data?.data?.zones || res.data?.zones || [];
        setZones(fetchedZones);
      })
      .catch(err => {
        console.error('Failed to load zones', err);
      });
      
    // Fetch vendor timings
    import('../../../services/api/axios').then(({ restaurantClient }) => {
       restaurantClient.get("/food/restaurant/vendor-timing-settings/public")
        .then(res => setVendorTimings(res?.data?.data))
        .catch(err => console.error("Failed to fetch timings", err));
    });
  }, []);

  const latestStates = useRef({ selectedZoneName, selectedKitchenPartnerId, kitchenPartners });
  useEffect(() => {
    latestStates.current = { selectedZoneName, selectedKitchenPartnerId, kitchenPartners };
  }, [selectedZoneName, selectedKitchenPartnerId, kitchenPartners]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(event.target)) {
        setIsZoneDropdownOpen(false);
        setZoneSearch(latestStates.current.selectedZoneName || '');
      }
      if (kpDropdownRef.current && !kpDropdownRef.current.contains(event.target)) {
        setIsKitchenPartnerDropdownOpen(false);
        const { selectedKitchenPartnerId: kpId, kitchenPartners: kps } = latestStates.current;
        setKitchenPartnerSearch(kpId ? kps.find(kp => kp._id === kpId)?.companyName || '' : '');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedZoneName) {
      zoneAPI.getPublicKitchenPartners({ zoneName: selectedZoneName })
        .then(res => {
          const fetchedKPs = res.data?.data?.kitchenPartners || res.data?.kitchenPartners || [];
          setKitchenPartners(fetchedKPs);
          setSelectedKitchenPartnerId('');
          setKitchenPartnerSearch('');
        })
        .catch(err => {
          console.error('Failed to load kitchen partners', err);
        });
    } else {
      setKitchenPartners([]);
      setSelectedKitchenPartnerId('');
      setKitchenPartnerSearch('');
    }
  }, [selectedZoneName]);

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
      }, (error) => {
        alert('Failed to get live location. Please allow location permissions.');
      });
    } else {
      alert('Geolocation is not supported by your browser');
    }
  };

  const onMapClick = (e) => {
    const latitude = e.latLng.lat();
    const longitude = e.latLng.lng();
    setLat(latitude);
    setLng(longitude);
    fetchAddressFromCoordinates(latitude, longitude);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLicenceFile(file);
      setLicenceFileName(file.name);
    }
  };

  const handleBannerChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBannerFile(file);
      setBannerFileName(file.name);
    }
  };

  const handleSubmit = () => {
    if (!kitchenName.trim()) {
      alert("Please enter your business / kitchen name!");
      return;
    }
    if (!selectedZoneId) {
      alert("Please select a service zone!");
      return;
    }
    if (type === 'Home Cook' && !selectedKitchenPartnerId) {
      alert("Please select a Kitchen Partner!");
      return;
    }
    if (!address) {
      alert("Please specify your business location/address!");
      return;
    }
    if (!licenceFileName) {
      alert("Please upload your EU food licence photo or PDF!");
      return;
    }
    if (!bannerFileName) {
      alert("Please upload your banner/cover photo!");
      return;
    }
    if (!vatNumber.trim()) {
      alert("Please enter VAT Number!");
      return;
    }
    if (!accountNumber.trim()) {
      alert("Please enter Bank Account Number!");
      return;
    }
    if (!ownerIdFileName) {
      alert("Please upload Owner ID (Aadhaar/Passport)!");
      return;
    }
    if (mealSlots.length === 0) {
      alert("Please select at least one meal slot!");
      return;
    }
    onContinue({
      name: kitchenName,
      phone,
      city: addressDetails.city || selectedZoneName,
      type,
      licenceFile,
      licenceFileName,
      coverFile: bannerFile,
      coverFileName: bannerFileName,
      vatNumber,
      accountNumber,
      ownerIdFile,
      ownerIdFileName,
      mealSlots,
      zoneId: selectedZoneId,
      zoneName: selectedZoneName,
      latitude: String(lat),
      longitude: String(lng),
      formattedAddress: address,
      addressLine1: addressDetails.addressLine1,
      area: addressDetails.area,
      state: addressDetails.state,
      pincode: addressDetails.pincode,
      kitchenPartnerId: type === 'Home Cook' ? selectedKitchenPartnerId : undefined
    });
  };

  return (
    <main className="w-full md:max-w-xl min-h-screen md:min-h-0 relative flex flex-col bg-surface overflow-x-hidden pb-20 mx-auto font-sans shadow-xl md:rounded-2xl md:border md:border-outline-variant/15">
      <header className="fixed top-0 left-0 right-0 w-full md:max-w-xl mx-auto z-50 h-[56px] flex items-center px-4 bg-primary-container text-on-primary md:rounded-t-2xl">
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="active:scale-95 transition-transform hover:opacity-90">
              <ArrowLeft />
            </button>
            <div className="flex flex-col">
              <h1 className="text-[16px] font-semibold">Register</h1>
              <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold">Step 2 of 3</p>
            </div>
          </div>
          <button className="active:scale-95 transition-transform hover:opacity-90">
            <MoreVertical />
          </button>
        </div>
      </header>

      <div className="mt-[56px] px-4 py-6">
        <div className="w-full h-32 rounded-xl overflow-hidden mb-6 relative">
          <img
            alt="Professional Kitchen"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAXsX9d8XMpwF5Tw4kddacTToegaCMSYMVoC8ZXLcqCVvjiBBTp6pXW9dSWMkQey2DTX1Nf679p-8IaTY83GqfChcw__RPS8QBKYBfGZifRi2XniFtkEv6TWZH5dXWAYKlexLFH4DVd7rLGKmUxeITtOvItA4_QLQYRh77BQsYRcyQo8OKIVDDIojTzjHgqdDmZVo61yx6mgYUZSrY9psO04CvnWdhw2a5KK8ydCKwzEK4TaaKaer3tr8yoGCSN__Qjli1C_MRAXg" />

          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
        </div>

        <div className="bg-surface-container-lowest rounded-[10px] p-5 shadow-[0_2px_6px_rgba(0,0,0,0.07)]">
          <h2 className="text-[11px] font-semibold text-on-surface-variant mb-4 uppercase tracking-wider">TELL US ABOUT YOUR KITCHEN</h2>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">BUSINESS / KITCHEN NAME</label>
              <div className="relative">
                <input
                  className="w-full h-12 px-4 rounded-lg border border-outline-variant focus:border-primary focus:ring-0 text-[13px] transition-colors bg-white outline-none focus:border-2"
                  type="text"
                  value={kitchenName}
                  onChange={(e) => setKitchenName(e.target.value)} />

                <span className="absolute right-4 top-3 text-primary">
                  <Store className="text-[20px]" />
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">CONTACT PHONE</label>
              <div className="relative">
                <input
                  className="w-full h-12 px-4 rounded-lg border border-outline-variant focus:border-primary focus:ring-0 text-[13px] transition-colors bg-surface-container/30 border-outline-variant/30 text-outline/80 cursor-not-allowed outline-none"
                  type="tel"
                  value={phone}
                  readOnly={true}
                  disabled={true}
                />

                <span className="absolute right-4 top-3 text-outline">
                  <Phone className="text-[20px]" />
                </span>
              </div>
            </div>

            {/* Searchable Zone Dropdown */}
            <div className="space-y-1.5 relative" ref={zoneDropdownRef}>
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">SERVICE ZONE</label>
              <div className="relative">
                <input
                  className="w-full h-12 px-4 pr-10 rounded-lg border border-outline-variant focus:border-primary focus:ring-0 text-[13px] transition-colors bg-white outline-none focus:border-2"
                  type="text"
                  placeholder="Search and select service zone..."
                  value={zoneSearch}
                  onChange={(e) => {
                    setZoneSearch(e.target.value);
                    setIsZoneDropdownOpen(true);
                  }}
                  onFocus={() => setIsZoneDropdownOpen(true)}
                />
                <span 
                  className="absolute right-4 top-3 text-primary cursor-pointer z-10"
                  onClick={() => setIsZoneDropdownOpen(!isZoneDropdownOpen)}
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {isZoneDropdownOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
                  </span>
                </span>
              </div>
              {isZoneDropdownOpen && (
                <div className="absolute z-[60] w-full mt-1 bg-white border border-outline-variant rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {zones.filter(z => zoneSearch === selectedZoneName || z.name?.toLowerCase().includes(zoneSearch.toLowerCase())).length > 0 ? (
                    zones.filter(z => zoneSearch === selectedZoneName || z.name?.toLowerCase().includes(zoneSearch.toLowerCase())).map(z => (
                      <button
                        key={z._id}
                        type="button"
                        className="w-full text-left px-4 py-3 text-[13px] hover:bg-primary-container/10 active:bg-primary-container/20 border-b border-outline-variant/10 last:border-0 transition-colors font-medium text-on-surface"
                        onClick={() => {
                          setSelectedZoneId(z._id);
                          setSelectedZoneName(z.name);
                          setZoneSearch(z.name);
                          setIsZoneDropdownOpen(false);
                        }}
                      >
                        {z.name}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-[12px] text-outline">No active zones found</div>
                  )}
                </div>
              )}
            </div>


            {/* Location Section */}
            <div className="space-y-2 pt-1">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">BUSINESS LOCATION & ADDRESS</label>
              <div className="bg-surface-container-lowest rounded-lg border border-outline-variant/50 p-3.5 space-y-3 shadow-xs">
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg px-3 py-2 text-[13px] resize-none outline-none focus:border-primary focus:border-2 transition-all font-medium text-on-surface"
                  placeholder="Enter or select full business address..."
                  rows={2}
                />
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowMap(!showMap)} 
                    className="flex-1 h-9 rounded-lg text-[11px] font-bold border border-primary text-primary flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <MapPin className="text-[16px]" />
                    {showMap ? 'Hide Map' : 'Set Pin on Map'}
                  </button>
                  <button 
                    type="button"
                    onClick={handleLiveLocation} 
                    className="flex-1 h-9 rounded-lg text-[11px] font-bold bg-primary text-on-primary flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <Locate className="text-[16px]" />
                    Live Location
                  </button>
                </div>
                
                {showMap && (
                  <div className="h-[200px] w-full rounded-lg overflow-hidden border border-outline-variant relative z-0 bg-surface-container-lowest">
                    {isLoaded ? (
                      <GoogleMap
                        mapContainerStyle={mapContainerStyle}
                        center={{ lat, lng }}
                        zoom={13}
                        onClick={onMapClick}
                        options={{ disableDefaultUI: true, zoomControl: true }}
                      >
                        <Marker 
                          position={{ lat, lng }} 
                          draggable={true}
                          onDragEnd={(e) => {
                            const newLat = e.latLng.lat();
                            const newLng = e.latLng.lng();
                            setLat(newLat);
                            setLng(newLng);
                            fetchAddressFromCoordinates(newLat, newLng);
                          }}
                        />
                      </GoogleMap>
                    ) : (
                      <div className="flex items-center justify-center h-full text-outline text-[12px]">Loading Map...</div>
                    )}
                  </div>
                )}
              </div>
            </div>


            <div className="space-y-3 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">VENDOR TYPE</label>
              <div className="grid grid-cols-2 gap-3">
                {['Home Cook', 'Cloud Kitchen', 'Restaurant', 'Catering', 'Pantry Shop'].map((t) =>
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`h-10 rounded-full font-semibold text-[13px] flex items-center justify-center gap-2 transition-transform active:scale-95 ${type === t ? 'bg-primary text-on-primary' : 'border border-primary text-primary bg-white'}`}>

                    {type === t && <Check className="text-[16px]" />}
                    {t}
                  </button>
                )}
              </div>
            </div>

            {/* Kitchen Partner Dropdown (Home Cook Only) */}
            {type === 'Home Cook' && (
              <div className="space-y-1.5 relative pt-2" ref={kpDropdownRef}>
                <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">KITCHEN PARTNER (HOME COOK ONLY)</label>
                <div className="relative">
                  <input
                    className="w-full h-12 px-4 pr-10 rounded-lg border border-outline-variant focus:border-primary focus:ring-0 text-[13px] transition-colors bg-white outline-none focus:border-2"
                    type="text"
                    placeholder="Search and select kitchen partner..."
                    value={kitchenPartnerSearch}
                    onChange={(e) => {
                      setKitchenPartnerSearch(e.target.value);
                      setIsKitchenPartnerDropdownOpen(true);
                    }}
                    onFocus={() => setIsKitchenPartnerDropdownOpen(true)}
                  />
                  <span 
                    className="absolute right-4 top-3 text-primary cursor-pointer z-10"
                    onClick={() => setIsKitchenPartnerDropdownOpen(!isKitchenPartnerDropdownOpen)}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isKitchenPartnerDropdownOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
                    </span>
                  </span>
                </div>
                {isKitchenPartnerDropdownOpen && (
                  <div className="absolute z-[60] w-full mt-1 bg-white border border-outline-variant rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {!selectedZoneName ? (
                       <div className="px-4 py-3 text-[12px] text-outline">Please select a service zone first</div>
                    ) : kitchenPartners.filter(kp => {
                         const currentSelectedName = kitchenPartners.find(k => k._id === selectedKitchenPartnerId)?.companyName || '';
                         return kitchenPartnerSearch === currentSelectedName || kp.companyName?.toLowerCase().includes(kitchenPartnerSearch.toLowerCase());
                       }).length > 0 ? (
                      kitchenPartners.filter(kp => {
                        const currentSelectedName = kitchenPartners.find(k => k._id === selectedKitchenPartnerId)?.companyName || '';
                        return kitchenPartnerSearch === currentSelectedName || kp.companyName?.toLowerCase().includes(kitchenPartnerSearch.toLowerCase());
                      }).map(kp => (
                        <button
                          key={kp._id}
                          type="button"
                          className="w-full text-left px-4 py-3 text-[13px] hover:bg-primary-container/10 active:bg-primary-container/20 border-b border-outline-variant/10 last:border-0 transition-colors font-medium text-on-surface"
                          onClick={() => {
                            setSelectedKitchenPartnerId(kp._id);
                            setKitchenPartnerSearch(kp.companyName);
                            setIsKitchenPartnerDropdownOpen(false);
                          }}
                        >
                          {kp.companyName}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-[12px] text-outline">No Kitchen Partner available for the selected service zone.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">
                EU FOOD LICENCE (REQUIRED PHOTO/PDF)
              </label>
              <input
                type="file"
                id="licence-upload"
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <label
                htmlFor="licence-upload"
                className="flex items-center justify-between p-3 bg-primary-container/5 border border-dashed border-primary/50 rounded-lg cursor-pointer hover:bg-primary-container/10 transition-colors"
              >
                {licenceFileName ? (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="material-symbols-outlined text-primary">
                        {licenceFile?.type === 'application/pdf' || licenceFileName.endsWith('.pdf') ? 'picture_as_pdf' : 'image'}
                      </span>
                      <span className="text-[13px] text-primary font-semibold truncate max-w-[180px]">
                        {licenceFileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-primary">
                      <span className="text-[11px] font-bold">Uploaded</span>
                      <CheckCircle className="text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Upload className="text-outline" />
                      <span className="text-[13px] text-outline font-semibold">
                        Choose photo or PDF
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                      Browse
                    </span>
                  </>
                )}
              </label>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">
                BANNER / COVER PHOTO (REQUIRED IMAGE)
              </label>
              <input
                type="file"
                id="banner-upload"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setBannerFile(file);
                    setBannerFileName(file.name);
                  }
                }}
              />
              <label
                htmlFor="banner-upload"
                className="flex items-center justify-between p-3 bg-primary-container/5 border border-dashed border-primary/50 rounded-lg cursor-pointer hover:bg-primary-container/10 transition-colors"
              >
                {bannerFileName ? (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <Image className="text-primary" />
                      <span className="text-[13px] text-primary font-semibold truncate max-w-[180px]">
                        {bannerFileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-primary">
                      <span className="text-[11px] font-bold">Uploaded</span>
                      <CheckCircle className="text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Upload className="text-outline" />
                      <span className="text-[13px] text-outline font-semibold">
                        Choose banner photo
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                      Browse
                    </span>
                  </>
                )}
              </label>
            </div>

            {/* Financial Details */}
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">VAT NUMBER</label>
              <input
                className="w-full h-12 px-4 rounded-lg border border-outline-variant focus:border-primary focus:ring-0 text-[13px] transition-colors bg-white outline-none focus:border-2"
                type="text"
                placeholder="e.g. PL1234567890"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value.toUpperCase())} />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">BANK ACCOUNT NUMBER</label>
              <input
                className="w-full h-12 px-4 rounded-lg border border-outline-variant focus:border-primary focus:ring-0 text-[13px] transition-colors bg-white outline-none focus:border-2"
                type="text"
                placeholder="Bank Account IBAN/Account Number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)} />
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider">
                OWNER ID UPLOAD (AADHAAR/PASSPORT/DRIVING LICENSE)
              </label>
              <input
                type="file"
                id="ownerId-upload"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setOwnerIdFile(file);
                    setOwnerIdFileName(file.name);
                  }
                }}
              />
              <label
                htmlFor="ownerId-upload"
                className="flex items-center justify-between p-3 bg-primary-container/5 border border-dashed border-primary/50 rounded-lg cursor-pointer hover:bg-primary-container/10 transition-colors"
              >
                {ownerIdFileName ? (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <IdCard className="text-primary" />
                      <span className="text-[13px] text-primary font-semibold truncate max-w-[180px]">
                        {ownerIdFileName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-primary">
                      <span className="text-[11px] font-bold">Uploaded</span>
                      <CheckCircle className="text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Upload className="text-outline" />
                      <span className="text-[13px] text-outline font-semibold">
                        Choose photo
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                      Browse
                    </span>
                  </>
                )}
              </label>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-[10px] text-outline uppercase font-semibold tracking-wider flex items-center gap-1.5">
                <Clock className="text-[14px]" />
                WHICH MEAL SLOTS WILL YOU OFFER?
              </label>
              <p className="text-[11px] text-outline">
                Select one or more meal slots. (Timings are set by admin)
              </p>
              <div className="mt-2 flex flex-col gap-3">
                {['breakfast', 'lunch', 'dinner'].map((slot) => {
                   const active = mealSlots.includes(slot)
                   const t = vendorTimings?.[slot]
                   const labelStr = slot.charAt(0).toUpperCase() + slot.slice(1)
                   
                   const formatTime = (time24) => {
                      if (!time24) return '';
                      const [h, m] = time24.split(':');
                      let hours = parseInt(h, 10);
                      const ampm = hours >= 12 ? 'PM' : 'AM';
                      hours = hours % 12 || 12;
                      return `${hours.toString().padStart(2, '0')}:${m} ${ampm}`;
                   };

                   const timeRange = (t && t.startTime && t.endTime) ? `${formatTime(t.startTime)} - ${formatTime(t.endTime)}` : ''
                   return (
                     <label key={slot} className="flex items-center gap-3 cursor-pointer">
                       <input
                         type="checkbox"
                         checked={active}
                         onChange={() => {
                           if (active) {
                             setMealSlots(mealSlots.filter((s) => s !== slot));
                           } else {
                             setMealSlots([...mealSlots, slot]);
                           }
                         }}
                         className="rounded border-outline-variant text-primary focus:ring-primary w-4 h-4"
                       />
                       <span className="font-semibold text-[13px] text-on-surface">{labelStr}</span>
                       {timeRange && <span className="text-outline text-[11px]">({timeRange})</span>}
                     </label>
                   )
                })}
              </div>
            </div>
          </div>

          <div className="mt-10">
            <button
              onClick={handleSubmit}
              className="w-full h-14 bg-primary text-on-primary rounded-xl text-[16px] font-bold shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all">

              Continue
              <ArrowRight />
            </button>
            <p className="text-center text-[11px] text-outline mt-4 leading-relaxed">
              By continuing, you agree to our <span className="text-primary font-semibold">Vendor Terms of Service</span> and acknowledge your responsibilities as a licensed food provider.
            </p>
          </div>
        </div>
      </div>
    </main>);

}





export function UnderReviewScreen({ onApproved }) {
  const location = useLocation();
  const navigate = useNavigate();

  const phone = location.state?.phone || localStorage.getItem('restaurant_register_phone') || '';

  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState(location.state?.status || 'pending');
  const [rejectionReason, setRejectionReason] = useState(location.state?.rejectionReason || '');
  const [restaurantName, setRestaurantName] = useState(location.state?.restaurantName || '');
  const [errorMsg, setErrorMsg] = useState('');

  const checkStatus = async () => {
    if (!phone) {
      setErrorMsg('No phone number found to check status. Please register/log in.');
      return;
    }

    try {
      setChecking(true);
      setErrorMsg('');
      const res = await dmbVendorAPI.getRegistrationStatus(phone);
      const data = res.data?.data || res.data;

      setStatus(data.status);
      setRejectionReason(data.rejectionReason || '');
      setRestaurantName(data.restaurantName || '');

      if (data.status === 'approved') {
        alert('Your application has been approved! Redirecting you to welcome login.');
        navigate('/vendor/welcome');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to check status. Try again.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (phone) {
      checkStatus();
    }
  }, [phone]);

  const handleReApply = () => {
    navigate('/vendor/auth/register-details');
  };

  return (
    <main className="w-full md:max-w-xl min-h-screen md:min-h-0 relative flex flex-col bg-surface overflow-x-hidden pb-20 mx-auto font-sans shadow-xl md:rounded-2xl md:border md:border-outline-variant/15">
      <header className="fixed top-0 left-0 right-0 w-full md:max-w-xl mx-auto z-50 h-[56px] flex items-center px-4 bg-primary-container text-on-primary md:rounded-t-2xl">
        <div className="flex items-center w-full justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/vendor/welcome')} className="active:scale-95 transition-transform hover:opacity-90">
              <ArrowLeft />
            </button>
            <div className="flex flex-col">
              <h1 className="text-[16px] font-semibold">
                {status === 'rejected' ? 'Application Rejected' : 'Under Review'}
              </h1>
              <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold">Step 3 of 3</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mt-[56px] px-5 py-10 flex flex-col items-center flex-1 justify-center text-center">
        {status === 'rejected' ? (
          <>
            <div className="w-20 h-20 rounded-full bg-red-100 border-2 border-red-500 border-dashed flex items-center justify-center mb-6">
              <XCircle className="text-4xl text-red-600" />
            </div>
            <h2 className="text-[22px] font-bold text-on-surface mb-2">Application Rejected</h2>
            {restaurantName && (
              <p className="text-[14px] font-bold text-on-surface mb-2">{restaurantName}</p>
            )}
            <p className="text-[13px] text-outline leading-relaxed max-w-[280px] mb-6">
              Unfortunately, your partner application was not approved by our compliance team.
            </p>

            <div className="w-full p-4 bg-red-50 border border-red-100 rounded-xl text-left mb-8">
              <h4 className="text-[11px] font-bold text-red-900 mb-1.5 uppercase tracking-wider">Rejection Reason:</h4>
              <p className="text-[13px] text-red-800 italic leading-relaxed">
                "{rejectionReason || 'Documents uploaded are unclear or invalid. Please upload a valid EU Food Licence.'}"
              </p>
            </div>

            <button
              onClick={handleReApply}
              className="w-full py-4 bg-primary text-on-primary font-bold rounded-xl active:scale-95 transition-all text-[14px] shadow-md flex items-center justify-center gap-2"
            >
              <FilePenLine className="text-[18px]" />
              Re-apply & Fill Form Again
            </button>
          </>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-secondary-container/10 border-2 border-secondary border-dashed flex items-center justify-center mb-6">
              <Clock className="text-4xl text-secondary" />
            </div>
            <h2 className="text-[22px] font-bold text-on-surface mb-2">Application Received</h2>
            {restaurantName && (
              <p className="text-[14px] font-bold text-on-surface mb-2">{restaurantName}</p>
            )}
            <p className="text-[13px] text-outline leading-relaxed max-w-[280px] mb-6">
              Our team is currently verifying your EU food licence and details. This usually takes 1-2 business days. We will notify you once approved.
            </p>

            <div className="w-full p-4 bg-surface-container rounded-xl border border-outline-variant/30 text-left space-y-3 mb-8">
              <div className="flex items-center gap-3">
                <CheckCircle className="text-primary" style={{ fontVariationSettings: "'FILL' 1" }} />
                <span className="text-[13px] font-semibold text-on-surface">Details Submitted</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle className="text-primary" style={{ fontVariationSettings: "'FILL' 1" }} />
                <span className="text-[13px] font-semibold text-on-surface">Documents Uploaded</span>
              </div>
              <div className="flex items-center gap-3 opacity-50">
                <Hourglass className="text-outline" />
                <span className="text-[13px] font-semibold text-on-surface">Final Verification</span>
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-500 mb-4 font-semibold">{errorMsg}</p>
            )}

            <button
              onClick={checkStatus}
              disabled={checking}
              className="w-full py-4 bg-secondary-container text-white font-bold rounded-xl active:scale-95 transition-all text-[14px] shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {checking ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Checking Status...
                </>
              ) : (
                <>
                  <RefreshCcw className="text-[18px]" />
                  Check Approval Status
                </>
              )}
            </button>
          </>
        )}
      </div>
    </main>
  );
}