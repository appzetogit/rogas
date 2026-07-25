import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Briefcase, FileText, Globe, BellRing, HelpCircle, LogOut, ChevronRight, CheckCircle2, ShieldAlert, Edit2, Camera, X, Save, MapPin, Mail, Phone, Car, Star, Loader2, Calendar, Repeat } from "lucide-react";
import { deliveryAPI } from "@food/api";
import { useTranslation } from "../../../contexts/LanguageContext";

const ProfileView = ({
  stats,
  onViewShifts,
  onLogout
}) => {
  const navigate = useNavigate();
  const { lang, changeLanguage, t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileInputRef = useRef(null);
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await deliveryAPI.getProfile();
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };
    fetchProfile();
  }, []);

  const [ratingsData, setRatingsData] = useState({
    averageRating: 0,
    totalRatings: 0,
    history: []
  });
  const [ratingsLoading, setRatingsLoading] = useState(true);

  useEffect(() => {
    const fetchRatings = async () => {
      try {
        const res = await deliveryAPI.getRatings();
        if (res.data?.success) {
          setRatingsData(res.data.data);
        }
      } catch (error) {
        console.error("Error fetching ratings:", error);
      } finally {
        setRatingsLoading(false);
      }
    };
    fetchRatings();
  }, []);

  const handleEditClick = () => {
    setFormData({
      name: profile?.name || "",
      email: profile?.email || "",
      phone: profile?.phone || "",
      address: profile?.address || profile?.location?.city || "",
      vehicleName: profile?.vehicleName || profile?.vehicle?.brand || "",
      vehicleType: profile?.vehicleType || profile?.vehicle?.type || "bike",
      vehicleNumber: profile?.vehicleNumber || ""
    });
    setPhotoPreview(null);
    setSelectedPhoto(null);
    setIsEditing(true);
  };

  const handlePhotoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const data = new FormData();
      if (formData.name) data.append("name", formData.name);
      if (formData.email) data.append("email", formData.email);
      if (formData.address) data.append("address", formData.address);
      if (formData.vehicleName) data.append("vehicleName", formData.vehicleName);
      if (formData.vehicleType) data.append("vehicleType", formData.vehicleType);
      if (formData.vehicleNumber) data.append("vehicleNumber", formData.vehicleNumber);
      if (selectedPhoto) data.append("profilePhoto", selectedPhoto);

      // Call API
      await deliveryAPI.updateProfileMultipart(data);
      
      // Refresh
      const response = await deliveryAPI.getProfile();
      if (response?.data?.success && response?.data?.data?.profile) {
        setProfile(response.data.data.profile);
      }
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save profile:", err);
      alert("Failed to save profile updates.");
    } finally {
      setIsSaving(false);
    }
  };

  const name = profile?.name || "Jan Wisniewski";
  const city = profile?.location?.city || "Warsaw, Poland";
  const vehicleName = profile?.vehicle?.brand || "E-bike";
  const vehicleType = profile?.vehicle?.type || "bike";
  const rating = profile?.metrics?.rating || 4.90;
  const ratingCount = profile?.metrics?.ratingCount || 1240;
  const profileImage = profile?.profileImage?.url || profile?.documents?.photo || "https://lh3.googleusercontent.com/aida-public/AB6AXuDEjl512Xg8gioOiKCrNkzoFsPJOBpZ_FWH1I9NLqdANkO68ioiYVbGJP0lCuEzhuJUEOH6hHaQOjc6fe9vJQ7lK3v7iR_GQv857dAWMuxS2tvAnVJK-naM5eaoWYwQcIZevQpLdYOxa0llm9zUIwUztXYbbVNoYaAJTfyk4qT0ZqGXdcFJ7JJP2-YMHekgSppjlvckmf_yIcx_Ut04Rqcuhy38-DLDk3fY2C_8AdsnIKo1wOFHFhmGrrgs8RSyMn1OhVRSMMoac1Mm";
  const bankAcc = profile?.documents?.bankDetails?.accountNumber?.slice(-4) || "4291";

  return <div className="space-y-4 pb-12 animate-fadeIn text-gray-800">
      {
    /* Driver Identity Card */
  }
      <section className="bg-white rounded-2xl p-4 border border-[#e0e3e0] shadow-xs relative">
        {!isEditing && (
          <button 
            onClick={handleEditClick}
            className="absolute top-4 right-4 p-2 bg-[#f1f4f1] rounded-full text-[#00604c] hover:bg-[#e0e3e0] transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}

        <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
          <div className="relative">
            <div className="w-24 h-24 md:w-20 md:h-20 rounded-2xl overflow-hidden border border-[#bec9c3] relative group">
              <img
                alt={`${name} Profile`}
                className="w-full h-full object-cover"
                src={photoPreview || profileImage}
                referrerPolicy="no-referrer"
              />
              {isEditing && (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer hover:bg-black/50 transition-colors"
                >
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
            {!isEditing && (
              <div className="absolute -bottom-2 -right-2 bg-[#00604c] text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full border-2 border-white shadow-sm">
                Active
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handlePhotoChange}
            />
          </div>
          
          <div className="flex-1 space-y-1 text-center md:text-left w-full">
            {isEditing ? (
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-[10px] font-bold text-[#5d5f5b] uppercase">Full Name</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full mt-1 p-2 bg-[#f1f4f1] border border-[#bec9c3] rounded-lg text-sm font-bold text-gray-900 focus:outline-none focus:border-[#00604c]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#5d5f5b] uppercase">Email Address</label>
                  <input 
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full mt-1 p-2 bg-[#f1f4f1] border border-[#bec9c3] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#00604c]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#5d5f5b] uppercase flex items-center justify-between">
                    Mobile Number <span className="text-red-500 text-[9px] font-normal lowercase">(Read-only)</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.phone}
                    disabled
                    className="w-full mt-1 p-2 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#5d5f5b] uppercase">Address</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full mt-1 p-2 bg-[#f1f4f1] border border-[#bec9c3] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#00604c]"
                  />
                </div>
                
                <div className="pt-2 border-t border-[#e0e3e0]">
                  <label className="text-[10px] font-bold text-[#5d5f5b] uppercase">Vehicle Details</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <select 
                      value={formData.vehicleType}
                      onChange={(e) => setFormData({...formData, vehicleType: e.target.value})}
                      className="p-2 bg-[#f1f4f1] border border-[#bec9c3] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#00604c]"
                    >
                      <option value="bike">Bicycle 🚲</option>
                      <option value="scooter">Scooter 🛵</option>
                      <option value="car">Car 🚗</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Brand/Model"
                      value={formData.vehicleName}
                      onChange={(e) => setFormData({...formData, vehicleName: e.target.value})}
                      className="p-2 bg-[#f1f4f1] border border-[#bec9c3] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#00604c]"
                    />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Plate/Reg Number (Optional)"
                    value={formData.vehicleNumber}
                    onChange={(e) => setFormData({...formData, vehicleNumber: e.target.value})}
                    className="w-full mt-2 p-2 bg-[#f1f4f1] border border-[#bec9c3] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-[#00604c]"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button 
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 py-2.5 bg-[#00604c] text-white rounded-xl font-bold text-sm hover:bg-[#014d3d] flex justify-center items-center gap-2 disabled:opacity-70"
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                    {!isSaving && <Save className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-lg font-extrabold text-gray-900">{name}</h2>
                <p className="text-xs text-[#5d5f5b] flex items-center justify-center md:justify-start gap-1">
                  <span className="capitalize">{vehicleType === "bike" ? "🚲" : vehicleType === "car" ? "🚗" : "🛵"} {vehicleName}</span>
                  {profile?.vehicleNumber && <span className="font-semibold px-1">({profile.vehicleNumber})</span>}
                  <span className="text-gray-300">•</span>
                  <span>{city}</span>
                </p>
                <div className="text-xs text-[#3e4945] flex items-center justify-center md:justify-start gap-2 pt-1">
                  <Phone className="w-3.5 h-3.5" />
                  {profile?.phone || "No phone added"}
                </div>
                <div className="text-xs text-[#3e4945] flex items-center justify-center md:justify-start gap-2 pt-1 truncate max-w-full">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{profile?.email || "No email added"}</span>
                </div>
                <div className="text-xs text-[#3e4945] flex items-center justify-center md:justify-start gap-2 pt-1 truncate max-w-full">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{profile?.address || city}</span>
                </div>
                
                <div className="flex items-center justify-center md:justify-start gap-1.5 pt-3">
                  <Award className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="text-xs font-bold text-gray-900">{Number(rating).toFixed(2)} Rating</span>
                  <span className="text-[10px] text-gray-400 font-medium">({ratingCount} deliveries)</span>
                </div>
                
                {profile?.zoneIds?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1 justify-center md:justify-start">
                    {profile.zoneIds.map((zone, idx) => (
                      <span key={idx} className="bg-[#9ef3d7]/30 text-[#00604c] px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-[#9ef3d7]">
                        Zone Assigned
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {
    /* Shifts Quick Entry Card */
  }
      <div
    onClick={onViewShifts}
    className="bg-[#00604c]/5 border border-[#00604c]/20 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[#00604c]/10 active:scale-[0.99] transition-all shadow-xs"
  >
        <div className="flex items-center gap-3">
          <span className="text-xl">📅</span>
          <div>
            <h4 className="font-bold text-sm text-[#00604c]">Quick Shifts Tracker</h4>
            <p className="text-[11px] text-[#3e4945] font-medium">Log hours, adjust timetables or cancel sprints.</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-[#00604c]" />
      </div>

      {
    /* Vehicle & Docs Status */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">VEHICLE &amp; DOCUMENTS</h3>
        <div className="bg-white rounded-2xl border border-[#bec9c3] overflow-hidden divide-y divide-[#bec9c3]/30 shadow-xs">
          
          {
            /* License */
          }
          <div 
            onClick={() => navigate("/food/delivery/profile/documents")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">Driving License</p>
                <p className="text-[11px] text-[#5d5f5b]">Expires in 12 days</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-orange-100 text-orange-800 px-2.5 py-0.5 rounded-lg">
                Expiring
              </span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {
            /* National ID */
          }
          <div 
            onClick={() => navigate("/food/delivery/profile/documents")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-[#00604c]">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">National ID</p>
                <p className="text-[11px] text-[#5d5f5b]">Verified on 12.01.2024</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-[#9ef3d7] text-[#005140] px-2.5 py-0.5 rounded-lg-sm">
                Valid
              </span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

          {
            /* Registration */
          }
          <div 
            onClick={() => navigate("/food/delivery/profile/documents")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">Vehicle Registration</p>
                <p className="text-[11px] text-red-600 font-semibold">Expired 2 days ago</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                Action Required
              </span>
              <ChevronRight className="w-4 h-4 text-[#bec9c3] group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>

        </div>
      </section>

      {
    /* Fleet Partner Card */
  }
      <section className="bg-[#00604c] text-white rounded-2xl p-4 relative overflow-hidden border border-[#016b55] shadow-md-sm">
        <div className="absolute -top-4 -right-4 p-4 opacity-10">
          <Briefcase className="w-24 h-24 stroke-[1.5]" />
        </div>
        <div className="relative z-10 space-y-3">
          <div>
            <h3 className="text-[10px] uppercase font-bold tracking-widest opacity-80">FLEET PARTNER</h3>
            <p className="font-extrabold text-[#9ef3d7] text-base leading-snug">Velo Courier Services Sp. z o.o.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <a
    href="tel:+48500200300"
    className="bg-white text-[#00604c] text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform"
  >
              📞 Contact Manager
            </a>
            <button className="bg-[#1f7a63] text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 hover:bg-[#005140] active:scale-95 transition-transform">
              📄 Agreement
            </button>
          </div>
        </div>
      </section>

      {/* Ratings & Feedback Section */}
      <section className="space-y-2 animate-fadeIn">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">RATINGS &amp; FEEDBACK</h3>
        <div className="bg-white rounded-2xl p-4 border border-[#bec9c3] shadow-xs space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 min-w-[90px]">
              <span className="text-2xl font-extrabold text-[#00604c] flex items-center gap-1 font-sans">
                {ratingsData.averageRating > 0 ? ratingsData.averageRating.toFixed(1) : Number(rating).toFixed(1)}
              </span>
              <div className="flex items-center gap-0.5 mt-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const avg = ratingsData.averageRating > 0 ? ratingsData.averageRating : rating;
                  const isFilled = star <= Math.round(avg);
                  return (
                    <Star
                      key={star}
                      className={`w-3 h-3 ${isFilled ? "text-amber-500 fill-amber-500" : "text-gray-300"}`}
                    />
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Performance Rating</p>
              <p className="text-xs text-gray-500 leading-normal">
                Based on {ratingsData.totalRatings > 0 ? ratingsData.totalRatings : ratingCount} total customer reviews.
              </p>
            </div>
          </div>

          <hr className="border-[#bec9c3]/30" />

          <div>
            <h4 className="text-[10px] font-bold text-[#5d5f5b] uppercase tracking-widest mb-3">Recent Reviews</h4>
            {ratingsLoading ? (
              <div className="py-4 text-center text-xs text-gray-400">Loading feedback...</div>
            ) : ratingsData.history.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-400 font-medium">No reviews received yet.</div>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {ratingsData.history.map((item, idx) => (
                  <div key={idx} className="bg-slate-50/50 border border-slate-100 p-3 rounded-xl space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-gray-700">Order #{item.orderId}</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-2.5 h-2.5 ${s <= item.rating ? "text-amber-500 fill-amber-500" : "text-gray-200"}`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed font-medium">"{item.comment}"</p>
                    {item.date && (
                      <span className="text-[9px] text-gray-400 block font-sans">
                        {new Date(item.date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {
    /* Earnings Settings Settings */
  }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">BANKING DETAILS</h3>
        <div className="bg-white rounded-2xl border border-[#bec9c3] overflow-hidden divide-y divide-[#bec9c3]/30 shadow-xs">
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group">
            <div className="flex items-center gap-3">
              <span className="text-sm">🗓️</span>
              <div>
                <p className="text-xs font-bold text-gray-900">Payout Schedule</p>
                <p className="text-[11px] text-[#5d5f5b]">Weekly (Tuesday morning)</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

          <div 
            onClick={() => navigate("/food/delivery/profile/bank")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm">🏦</span>
              <div>
                <p className="text-xs font-bold text-gray-900">Bank Account</p>
                <p className="text-[11px] text-[#5d5f5b]">Bank •••• {bankAcc}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>
        </div>
      </section>

      {
        /* General Settings */
      }
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-[#5d5f5b] uppercase tracking-wider px-1">SETTINGS</h3>
        <div className="bg-white rounded-2xl border border-[#bec9c3] overflow-hidden divide-y divide-[#bec9c3]/30 shadow-xs">
          
          <div className="flex items-center justify-between p-3.5 hover:bg-gray-50 group">
            <div className="flex items-center gap-3">
              <Globe className="w-4.5 h-4.5 text-[#5d5f5b]" />
              <p className="text-xs font-bold text-gray-900">{t("change_lang", "Language")}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={lang}
                onChange={(e) => changeLanguage(e.target.value)}
                className="bg-transparent border border-gray-300 dark:border-gray-700 text-xs font-bold rounded-lg px-2 py-1 focus:outline-none cursor-pointer text-[#5d5f5b]"
              >
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>
          </div>

          <div 
            onClick={() => navigate("/food/delivery/notifications")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <BellRing className="w-4.5 h-4.5 text-[#5d5f5b]" />
              <p className="text-xs font-bold text-gray-900">Notifications</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

          <div 
            onClick={() => navigate("/food/delivery/help/tickets")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <HelpCircle className="w-4.5 h-4.5 text-[#5d5f5b]" />
              <p className="text-xs font-bold text-gray-900">Help &amp; Support</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

          <div 
            onClick={() => navigate("/food/delivery/service")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <Calendar className="w-4.5 h-4.5 text-amber-500" />
              <p className="text-xs font-bold text-amber-600">Report Unavailability</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

          <div 
            onClick={() => navigate("/food/delivery/rides")}
            className="flex items-center justify-between p-3.5 hover:bg-gray-50 cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <Repeat className="w-4.5 h-4.5 text-blue-500" />
              <p className="text-xs font-bold text-blue-600">Ride Transfers</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#bec9c3]" />
          </div>

        </div>
      </section>

      {
    /* Log out submit */
  }
      <button
    onClick={onLogout}
    className="w-full py-3.5 text-[#ba1a1a] font-bold border border-red-200 bg-red-50/50 rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm shadow-xs"
  >
        <LogOut className="w-4 h-4" />
        Log Out
      </button>
    </div>;
};
export {
  ProfileView
};
