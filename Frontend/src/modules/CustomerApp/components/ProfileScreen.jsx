import { useState, useEffect } from "react";
import { IMAGES } from "../types";
import { userAPI } from "@food/api";
import { useTranslation } from "../../../contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Loader2, Camera, User, ArrowRight, Globe, ClipboardList, Building2, HelpCircle, Utensils, Receipt, CreditCard, Wallet, Star, Gift, LogOut, Trash2, ArrowLeft, Info, Mail, Phone, Calendar, Lock, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react';

export function ProfileScreen({
  onGoBack,
  onGoToDietAndAllergens,
  onGoToInvoiceSettings,
  onGoToCheckout,
  onGoToSubscription,
  onGoToSupport,
  onGoToWallet,
  onShowNotificationToast,
  dietaryPrefs,
  invoicePrefs,
  points,
  currentUser,
  onLogout,
  onUpdateProfile,
  onUpdateProfileState
}) {
  const { lang, changeLanguage, t } = useTranslation();
  const navigate = useNavigate();
  const [walletCredits, setWalletCredits] = useState(0);

  // Fetch wallet balance on mount
  useEffect(() => {
    let active = true;
    if (userAPI.getWallet) {
      userAPI.getWallet()
        .then((res) => {
          if (active) {
            const balance = res?.data?.data?.wallet?.balance ?? res?.data?.wallet?.balance ?? 0;
            setWalletCredits(Number(balance));
          }
        })
        .catch((err) => console.error("Failed to fetch wallet", err));
    }
    return () => { active = false; };
  }, []);

  const [showDangerDialog, setShowDangerDialog] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "",
    dateOfBirth: "",
    profileImage: ""
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Fetch fresh profile details on mount
  useEffect(() => {
    let active = true;
    userAPI.getProfile()
      .then((res) => {
        const u = res?.data?.data?.user || res?.data?.user || res?.data;
        if (u && active && onUpdateProfileState) {
          onUpdateProfileState(u);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch profile on mount", err);
      });
    return () => { active = false; };
  }, []);

  const handleOpenEdit = () => {
    let dobString = "";
    if (currentUser?.dateOfBirth) {
      dobString = new Date(currentUser.dateOfBirth).toISOString().split('T')[0];
    }
    setFormData({
      name: currentUser?.name || "",
      email: currentUser?.email || "",
      gender: currentUser?.gender || "",
      dateOfBirth: dobString,
      profileImage: currentUser?.profileImage || ""
    });
    setFormError("");
    setIsEditing(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    setFormLoading(true);
    setFormError("");
    try {
      const res = await userAPI.uploadProfileImage(file);
      const url = res.data?.data?.profileImage || res.data?.profileImage || res.data?.data?.user?.profileImage;
      if (url) {
        setFormData(prev => ({ ...prev, profileImage: url }));
        onShowNotificationToast("Profile photo uploaded successfully!");
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || "Failed to upload image");
    } finally {
      setImageUploading(false);
      setFormLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    try {
      if (!formData.name.trim()) {
        throw new Error("Name is required");
      }

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim() || "",
        gender: formData.gender || "",
        dateOfBirth: formData.dateOfBirth || null,
        profileImage: formData.profileImage.trim() || ""
      };

      if (onUpdateProfile) {
        await onUpdateProfile(payload);
      }
      onShowNotificationToast("Profile updated successfully!");
      setIsEditing(false);
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || "Failed to update profile");
    } finally {
      setFormLoading(false);
    }
  };

  const handleShareReferral = () => {
    navigator.clipboard.writeText("https://dailymealbox.pl/referral?code=ANNAK");
    onShowNotificationToast("Referral link copied to clipboard! Share with friends to earn PLN 15.");
  };

  const handleDangerActionConfirm = (action) => {
    onShowNotificationToast(`Action '${action}' requested and sent to support division.`);
    setShowDangerDialog(null);
  };

  // Render Detailed Edit View
  if (isEditing) {
    return (
      <div className="bg-[#f6f8f7] text-slate-800 min-h-screen pb-20 font-sans">
        {/* Top Fixed Header */}
        <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <button 
            type="button"
            onClick={() => setIsEditing(false)} 
            className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            title="Go back"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-extrabold text-primary text-center">Customer Details</h1>
          <div className="w-8" />
        </header>

        <main className="pt-20 pb-10 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Unified Profile Card */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
              {/* Decorative Top Banner */}
              <div className="h-32 sm:h-40 bg-gradient-to-r from-[#1f7a63] via-[#175d4b] to-[#0f3d32] relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none text-white">
                  <Sparkles size={140} />
                </div>
              </div>

              {/* Profile Avatar Header */}
              <div className="px-6 sm:px-10 pb-6 -mt-16 sm:-mt-20 relative z-10 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 text-center sm:text-left">
                  {/* Avatar Circle with Upload Trigger */}
                  <div className="relative group">
                    <div className={`relative w-28 h-28 sm:w-34 sm:h-34 rounded-full border-4 border-white shadow-lg bg-gradient-to-br from-[#1f7a63]/20 to-[#175d4b]/30 overflow-hidden flex items-center justify-center transition-opacity ${imageUploading ? "opacity-50" : ""} text-[#1f7a63] font-bold text-4xl`}>
                      <span className="z-0 select-none">{formData.name ? formData.name.charAt(0).toUpperCase() : "U"}</span>
                      {formData.profileImage && formData.profileImage.trim() !== "" && (
                        <img
                          alt="Profile Avatar"
                          className="absolute inset-0 w-full h-full object-cover z-10"
                          src={formData.profileImage}
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      )}
                    </div>
                    {imageUploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full z-20">
                        <Loader2 className="text-white animate-spin" size={28} />
                      </div>
                    )}
                    <label 
                      className="absolute bottom-1 right-1 bg-[#1f7a63] hover:bg-[#155a49] text-white w-10 h-10 rounded-full border-3 border-white flex items-center justify-center cursor-pointer shadow-md transition-all active:scale-90 z-20 group-hover:scale-105"
                      title="Upload Profile Picture"
                    >
                      <Camera size={18} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={formLoading}
                      />
                    </label>
                  </div>

                  <div className="mb-1">
                    <h2 className="text-2xl font-extrabold text-slate-900">{formData.name || "Customer Account"}</h2>
                    <p className="text-xs text-slate-500 font-medium flex items-center justify-center sm:justify-start gap-1.5 mt-1">
                      <Camera size={14} className="text-[#1f7a63]" />
                      Click camera icon to upload a new profile photo
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Body */}
              <div className="p-6 sm:p-10 space-y-8">
                {formError && (
                  <div className="p-4 bg-red-50/80 border border-red-200 text-red-700 rounded-2xl text-xs font-semibold flex items-center gap-2">
                    <Info size={16} className="flex-shrink-0 text-red-500" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Personal Information Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <User size={14} className="text-[#1f7a63]" />
                    Personal Details
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Full Name */}
                    <div className="sm:col-span-2 lg:col-span-1 space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Enter your full name"
                          className="w-full text-sm pl-10 pr-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1f7a63] focus:ring-2 focus:ring-[#1f7a63]/20 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
                          disabled={formLoading}
                        />
                      </div>
                    </div>

                    {/* Gender */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Gender</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                        className="w-full text-sm px-3.5 py-3 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1f7a63] focus:ring-2 focus:ring-[#1f7a63]/20 focus:bg-white transition-all font-medium text-slate-800 cursor-pointer"
                        disabled={formLoading}
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                        <option value="prefer-not-to-say">Prefer not to say</option>
                      </select>
                    </div>

                    {/* Date of Birth */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Date of Birth</label>
                      <div className="relative">
                        <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="date"
                          value={formData.dateOfBirth}
                          onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                          className="w-full text-sm pl-10 pr-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1f7a63] focus:ring-2 focus:ring-[#1f7a63]/20 focus:bg-white transition-all font-medium text-slate-800 cursor-pointer"
                          disabled={formLoading}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                {/* Contact Information Section */}
                <div className="space-y-4">
                  <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Mail size={14} className="text-[#1f7a63]" />
                    Contact Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Email Address */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="name@example.com"
                          className="w-full text-sm pl-10 pr-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl focus:outline-none focus:border-[#1f7a63] focus:ring-2 focus:ring-[#1f7a63]/20 focus:bg-white transition-all font-medium text-slate-800 placeholder:text-slate-400"
                          disabled={formLoading}
                        />
                      </div>
                    </div>

                    {/* Phone Number (Read-Only) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">Phone Number (Read-Only)</label>
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                          <Lock size={10} /> Read-Only
                        </span>
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          value={currentUser?.phone || ""}
                          disabled
                          className="w-full text-sm pl-10 pr-4 py-3 bg-slate-100/80 border border-slate-200 rounded-xl font-semibold text-slate-500 cursor-not-allowed select-none"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-1">
                        <Info size={12} className="text-slate-400 flex-shrink-0" />
                        Phone number is linked to auth and cannot be changed.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="w-full sm:w-auto px-8 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer shadow-xs"
                    disabled={formLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-10 bg-gradient-to-r from-[#1f7a63] to-[#175d4b] hover:from-[#175d4b] hover:to-[#0f3d32] text-white py-3 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
                    disabled={formLoading}
                  >
                    {formLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </main>
      </div>
    );
  }

  // Render Main Profile Screen
  return (
    <div className="bg-[#f6f8f7] text-slate-800 min-h-screen pb-20 font-sans">
      {/* Top Fixed Header */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack} className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">Profile</h1>
        <div className="w-8" />
      </header>

      <main className="pt-20 pb-10 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto">
        {/* Profile green banner (Mobile) */}
        <section className="md:hidden bg-gradient-to-b from-[#1f7a63] to-[#175d4b] px-5 pt-8 pb-10 text-white rounded-3xl shadow-md relative overflow-hidden mb-6">
          <div className="absolute right-[-20px] top-[-10px] opacity-10 pointer-events-none">
            <User className="text-[130px]" style={{ fontVariationSettings: "'FILL' 1" }} />
          </div>

          <div className="relative z-10 flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="relative w-16 h-16 rounded-full border-2 border-white/40 overflow-hidden shadow-sm bg-white/20 flex items-center justify-center font-bold text-white text-[24px]">
                <span className="z-0">{currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}</span>
                {currentUser?.profileImage && currentUser.profileImage.trim() !== "" && (
                  <img
                    alt="Profile"
                    className="absolute inset-0 w-full h-full object-cover z-10"
                    src={currentUser.profileImage}
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col">
              <h2 className="text-[20px] font-extrabold text-white leading-tight">{currentUser?.name || "Anna Kowalska"}</h2>
              <p className="text-sm text-white/90">
                {currentUser?.city || "Warsaw"} · Subscriber since {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : "Jan 2026"}
              </p>
            </div>
          </div>
        </section>

        {/* Content list buttons */}
        <div className="flex flex-col gap-4 relative z-10">
          {/* Customer Details setup */}
          <div onClick={handleOpenEdit} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary flex items-center justify-center">
                <User className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Customer Details</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {currentUser?.name || "Anna Kowalska"} · {currentUser?.email || "No email set"}
                </p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>View & Edit</span> */}
              <ArrowRight className="text-sm" />
            </button>
          </div>

          {/* Wallet credit list */}
          <div onClick={onGoToWallet} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100/35 p-2 rounded-xl text-brand-amber flex items-center justify-center group-active:scale-95 transition-transform">
                <Wallet className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Wallet balance</h3>
                <p className="text-xs text-on-surface-variant font-medium">PLN {walletCredits.toFixed(2)} active credits</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 group-active:translate-x-1 transition-transform">
              {/* <span>View</span> */}
              <ArrowRight className="text-[18px]" />
            </button>
          </div>

          {/* Language Selection Card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3 w-full justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-[#1f7a63]/10 p-2 rounded-xl text-primary flex items-center justify-center">
                  <Globe className="text-[22px]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#1a1c1a]">{t("change_lang", "Language")}</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Select your preferred language</p>
                </div>
              </div>
              <select
                value={lang}
                onChange={(e) => changeLanguage(e.target.value)}
                className="bg-transparent border border-[#bec9c3]/40 rounded-xl px-2 py-1.5 text-xs font-bold focus:outline-none cursor-pointer text-[#1b1c1c] dark:bg-[#1a1a1a] dark:text-white"
              >
                <option value="en">English</option>
                <option value="pl">Polski</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>
          </div>

          {/* Subscription setup */}
          <div onClick={onGoToSubscription} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-[#1f7a63]/10 p-2 rounded-xl text-primary flex items-center justify-center">
                <ClipboardList className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">My Subscription</h3>
                <p className="text-xs text-on-surface-variant font-medium">Standard Box · Next billing Feb 14</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Manage</span> */}
              <ArrowRight className="text-sm" />
            </button>
          </div>

          {/* Office Meal Plan */}
          {currentUser?.officeMealPlan && (
            <div className="bg-[#1f7a63] text-white rounded-2xl p-4 shadow-md flex items-center justify-between hover:bg-[#155a49] transition-all cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl text-white flex items-center justify-center">
                  <Building2 className="text-[22px]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Office Meal Plan</h3>
                  <p className="text-xs text-white/90 font-medium mt-0.5">
                    {currentUser.officeMealPlan.vendor?.restaurantName} · {currentUser.officeMealPlan.mealPlan?.name}
                  </p>
                </div>
              </div>
              <button className="text-white hover:text-white/80 font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
                <ArrowRight className="text-sm" />
              </button>
            </div>
          )}

          {/* Diet preferences */}
          <div onClick={onGoToDietAndAllergens} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-[#fea619]/10 p-2 rounded-xl text-[#fea619] flex items-center justify-center">
                <Utensils className="text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Diet &amp; Allergens</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {dietaryPrefs.dietType} · {dietaryPrefs.allergies.length > 0 ? dietaryPrefs.allergies.slice(0, 2).join(", ") + (dietaryPrefs.allergies.length > 2 ? "..." : "") : "No allergies"}
                </p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Edit</span> */}
              <ArrowRight className="text-sm" />
            </button>
          </div>

          {/* Invoice preferences mappings */}
          <div onClick={onGoToInvoiceSettings} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-[#e4e2e1] p-2 rounded-xl text-[#3e4945] flex items-center justify-center">
                <Receipt className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Invoice Preferences</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {invoicePrefs.receiptType === "simple" ? "Simple receipt Only" : `VAT: ${invoicePrefs.companyName}`}
                </p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Change</span> */}
              <ArrowRight className="text-sm" />
            </button>
          </div>


          <div onClick={onGoToSupport} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary flex items-center justify-center">
                <HelpCircle className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Help &amp; Support</h3>
                <p className="text-xs text-on-surface-variant font-medium">Raise complaints or view tickets</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <ArrowRight className="text-sm" />
            </button>
          </div>

          {/* Refund Requests */}
          <div onClick={() => navigate("/user/service")} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-amber-50 p-2 rounded-xl text-amber-500 flex items-center justify-center">
                <Receipt className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Refunds & Complaints</h3>
                <p className="text-xs text-on-surface-variant font-medium">Request order refunds or report issues</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <ArrowRight className="text-sm" />
            </button>
          </div>

          {/* About Us */}
          <div onClick={() => navigate("/user/about", { state: { backTo: "/user/profile" } })} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-2 rounded-xl text-blue-500 flex items-center justify-center">
                <Info className="text-[22px]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">About Us</h3>
                <p className="text-xs text-on-surface-variant font-medium">Learn more about our mission</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <ArrowRight className="text-sm" />
            </button>
          </div>

          {/* Payment card list */}
          {false && (
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-xl text-[#1f7a63] flex items-center justify-center">
                  <CreditCard className="text-[22px]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#1a1c1a]">Payment Methods</h3>
                  <p className="text-xs text-on-surface-variant font-medium">Przelewy24 / BLIK</p>
                </div>
              </div>
              <button onClick={() => onShowNotificationToast("Payment method settings are securely managed by Przelewy24.")} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
                {/* <span>Manage</span> */}
                <ArrowRight className="text-sm" />
              </button>
            </div>
          )}



          {/* Loyalty points card */}
          {false && (
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="bg-red-50 p-2 rounded-xl text-brand-red flex items-center justify-center">
                  <Star className="text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#1a1c1a]">Loyalty points</h3>
                  <p className="text-xs text-on-surface-variant font-medium">{points} reward pts accumulation</p>
                </div>
              </div>
              <button onClick={() => onShowNotificationToast(`Total available rewards points: ${points} points.`)} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
                {/* <span>View</span> */}
                <ArrowRight className="text-sm" />
              </button>
            </div>
          )}

          {/* Referral Card */}
          <div className="bg-primary hover:bg-[#155a49] text-white rounded-2xl p-5 shadow-md flex items-center justify-between overflow-hidden relative transition-all duration-300">
            <div className="flex items-center gap-4 z-10">
              <div className="bg-white/20 p-2.5 rounded-xl">
                <Gift className="text-white text-[24px]" />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-white">Referral Programme</h3>
                <p className="text-xs text-white/80 font-medium">Invite friends, earn PLN 15 voucher</p>
              </div>
            </div>
            <button onClick={handleShareReferral} className="bg-white hover:bg-slate-50 text-primary px-5 py-2 rounded-full font-bold text-xs z-10 transition-transform active:scale-95 shadow">
              Share
            </button>
            <div className="absolute right-[-20px] top-[-10px] opacity-10 pointer-events-none">
              <Gift className="text-[120px]" />
            </div>
          </div>


          {/* Danger zone actions */}
          <div className="mt-6 mb-4 flex flex-col gap-3">
            <h4 className="text-[11px] font-bold text-[#6e7a74] px-1 uppercase tracking-widest">
              Account Actions
            </h4>
            <div className="bg-white rounded-2xl overflow-hidden border border-[#bec9c3]/20 shadow-sm divide-y divide-[#bec9c3]/20">
              <button onClick={onLogout} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left">
                <LogOut className="text-primary" />
                <span className="font-bold text-[13px] text-primary"> Logout</span>
              </button>
              <button onClick={() => setShowDangerDialog("Delete My Account")} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left shadow-inner">
                <Trash2 className="text-brand-red" />
                <span className="font-bold text-[13px] text-brand-red"> Delete My Account</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation prompt modals */}
      {showDangerDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h4 className="text-[18px] font-extrabold text-on-surface">Confirm Action</h4>
            <p className="text-[13px] text-on-surface-variant font-medium leading-relaxed">
              Are you sure you want to proceed with <strong>"{showDangerDialog}"</strong>? This may affect your automated weekly billing cycle.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDangerDialog(null)} className="flex-1 border border-[#bec9c3] text-[#3e4945] py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform">
                Cancel
              </button>
              <button onClick={() => handleDangerActionConfirm(showDangerDialog)} className="flex-1 bg-brand-red text-white py-2.5 rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-md">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
