import { useState, useEffect } from "react";
import { IMAGES } from "../types";
import { userAPI } from "@food/api";
import { useTranslation } from "../../../contexts/LanguageContext";

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
  const [walletCredits] = useState(35.0);
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
      <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
        <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsEditing(false)} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
              arrow_back
            </button>
          </div>
          <h1 className="text-lg font-extrabold text-primary text-center">Customer Details</h1>
          <div className="w-8" /> {/* Spacer */}
        </header>

        <main className="pt-20 px-5 max-w-md mx-auto">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Profile Picture Upload Section */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#bec9c3]/20 flex flex-col items-center gap-4">
              <div className="relative">
                <div className={`relative w-24 h-24 rounded-full border-2 border-primary/20 overflow-hidden shadow-sm bg-primary/10 flex items-center justify-center transition-opacity ${imageUploading ? "opacity-45" : ""} text-primary font-bold text-[36px]`}>
                  <span className="z-0">{formData.name ? formData.name.charAt(0).toUpperCase() : "U"}</span>
                  {formData.profileImage && formData.profileImage.trim() !== "" && (
                    <img
                      alt="Avatar preview"
                      className="absolute inset-0 w-full h-full object-cover z-10"
                      src={formData.profileImage}
                      onError={(e) => e.target.style.display = 'none'}
                    />
                  )}
                </div>
                {imageUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25 rounded-full">
                    <span className="material-symbols-outlined text-white text-[24px] animate-spin">progress_activity</span>
                  </div>
                )}
                <label className="absolute bottom-0 right-0 bg-primary text-white w-8 h-8 rounded-full border-2 border-white flex items-center justify-center cursor-pointer hover:bg-[#155a49] transition-colors z-20 shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={formLoading}
                  />
                </label>
              </div>

            </div>

            {/* Basic Info Fields */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#bec9c3]/20 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 text-brand-red rounded-xl text-xs font-semibold border border-red-100">
                  {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
                  disabled={formLoading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
                  disabled={formLoading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">Phone Number (Read-Only)</label>
                <input
                  type="text"
                  value={currentUser?.phone || ""}
                  disabled
                  className="w-full text-sm p-3 bg-[#e4e2e1]/45 border border-[#bec9c3]/30 rounded-xl font-medium text-gray-500 cursor-not-allowed"
                />
                <span className="text-[10px] text-on-surface-variant font-medium">Phone number is linked to auth and cannot be changed.</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
                  disabled={formLoading}
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">Date of Birth</label>
                <input
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => setFormData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
                  disabled={formLoading}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-white border border-[#bec9c3] text-[#3e4945] py-3 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors active:scale-95"
                disabled={formLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-sm hover:bg-[#155a49] transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-md"
                disabled={formLoading}
              >
                {formLoading ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Saving...</span>
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>
        </main>
      </div>
    );
  }

  // Render Main Profile Screen
  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-[880px] pb-32">
      {/* Top action context header */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack} className="material-symbols-outlined text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-container-low">
          arrow_back
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">DailyMealBox</h1>
        <div className="w-8" />
      </header>

      <main className="pt-14 pb-12">
        {/* Profile green banner */}
        <section className="bg-gradient-to-b from-[#1f7a63] to-[#175d4b] px-5 pt-8 pb-10 text-white rounded-b-[32px] shadow-lg relative overflow-hidden">
          <div className="absolute right-[-20px] top-[-10px] opacity-10 pointer-events-none">
            <span className="material-symbols-outlined text-[130px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
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
        <div className="px-5 -mt-5 flex flex-col gap-4 relative z-10">
          {/* Customer Details setup */}
          <div onClick={handleOpenEdit} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">person</span>
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
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Language Selection Card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3 w-full justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-[#1f7a63]/10 p-2 rounded-xl text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">language</span>
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
                <span className="material-symbols-outlined text-[22px]">assignment</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">My Subscription</h3>
                <p className="text-xs text-on-surface-variant font-medium">Standard Box · Next billing Feb 14</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Manage</span> */}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Help & Support / Complaints */}
          <div onClick={onGoToSupport} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">help_center</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Help &amp; Support</h3>
                <p className="text-xs text-on-surface-variant font-medium">Raise complaints or view tickets</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Diet preferences */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-[#fea619]/10 p-2 rounded-xl text-[#fea619] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Diet &amp; Allergens</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {dietaryPrefs.dietType} · {dietaryPrefs.allergies.length > 0 ? dietaryPrefs.allergies.slice(0, 2).join(", ") + (dietaryPrefs.allergies.length > 2 ? "..." : "") : "No allergies"}
                </p>
              </div>
            </div>
            <button onClick={onGoToDietAndAllergens} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Edit</span> */}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Invoice preferences mappings */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-[#e4e2e1] p-2 rounded-xl text-[#3e4945] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Invoice Preferences</h3>
                <p className="text-xs text-on-surface-variant font-medium">
                  {invoicePrefs.receiptType === "simple" ? "Simple receipt Only" : `VAT: ${invoicePrefs.companyName}`}
                </p>
              </div>
            </div>
            <button onClick={onGoToInvoiceSettings} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Change</span> */}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Payment card list */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl text-[#1f7a63] flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">credit_card</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Payment Methods</h3>
                <p className="text-xs text-on-surface-variant font-medium">Przelewy24 / BLIK</p>
              </div>
            </div>
            <button onClick={() => onShowNotificationToast("Payment method settings are securely managed by Przelewy24.")} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>Manage</span> */}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Wallet credit list */}
          <div onClick={onGoToWallet} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100/35 p-2 rounded-xl text-brand-amber flex items-center justify-center group-active:scale-95 transition-transform">
                <span className="material-symbols-outlined text-[22px]">account_balance_wallet</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Wallet balance</h3>
                <p className="text-xs text-on-surface-variant font-medium">PLN {walletCredits.toFixed(2)} active credits</p>
              </div>
            </div>
            <button className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 group-active:translate-x-1 transition-transform">
              {/* <span>View</span> */}
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>

          {/* Loyalty points card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between border border-[#bec9c3]/20 hover:border-primary/30 transition-all">
            <div className="flex items-center gap-3">
              <div className="bg-red-50 p-2 rounded-xl text-brand-red flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#1a1c1a]">Loyalty points</h3>
                <p className="text-xs text-on-surface-variant font-medium">{points} reward pts accumulation</p>
              </div>
            </div>
            <button onClick={() => onShowNotificationToast(`Total available rewards points: ${points} points.`)} className="text-primary hover:text-primary-container font-extrabold text-xs flex items-center gap-1 active:scale-95 transition-transform">
              {/* <span>View</span> */}
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>

          {/* Referral Card */}
          <div className="bg-primary hover:bg-[#155a49] text-white rounded-2xl p-5 shadow-md flex items-center justify-between overflow-hidden relative transition-all duration-300">
            <div className="flex items-center gap-4 z-10">
              <div className="bg-white/20 p-2.5 rounded-xl">
                <span className="material-symbols-outlined text-white text-[24px]">redeem</span>
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
              <span className="material-symbols-outlined text-[120px]">redeem</span>
            </div>
          </div>


          {/* Danger zone actions */}
          <div className="mt-6 mb-4 flex flex-col gap-3">
            <h4 className="text-[11px] font-bold text-[#6e7a74] px-1 uppercase tracking-widest">
              Account Actions
            </h4>
            <div className="bg-white rounded-2xl overflow-hidden border border-[#bec9c3]/20 shadow-sm divide-y divide-[#bec9c3]/20">
              <button onClick={onLogout} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left">
                <span className="material-symbols-outlined text-primary">logout</span>
                <span className="font-bold text-[13px] text-primary"> Logout</span>
              </button>
              <button onClick={() => setShowDangerDialog("Delete My Account")} className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors active:bg-slate-100 text-left shadow-inner">
                <span className="material-symbols-outlined text-brand-red">delete</span>
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
