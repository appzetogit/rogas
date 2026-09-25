import React, { useState, useEffect } from 'react';
import { ArrowLeft, Edit2, Loader2, Save } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import { useTranslation } from "react-i18next";
import { tKey } from "../../../../shared/i18n";

/**
 * ProfileBankV2 - Restored Old UI for Bank Details.
 */

// Field-wise config: maxLength, allowed-characters filter (applied while typing),
// and a stricter format regex (checked on save / blur).
const FIELD_CONFIG = {
   accountHolderName: {
      maxLength: 50,
      typingPattern: /[^a-zA-Z\s.'-]/g, // strips disallowed chars as user types
      formatRegex: /^[a-zA-Z\s.'-]{3,100}$/,
      errorMsg: "Enter a valid name (letters only, min 3 characters)"
   },
   accountNumber: {
      maxLength: 18,
      typingPattern: /[^0-9]/g,
      formatRegex: /^[0-9]{9,18}$/,
      errorMsg: "Account number must be 9-18 digits"
   },
   ifscCode: {
      maxLength: 11,
      typingPattern: /[^a-zA-Z0-9]/g,
      formatRegex: /^[A-Z]{4}0[A-Z0-9]{6}$/,
      errorMsg: "Enter a valid IFSC code (e.g. SBIN0001234)",
      transform: (v) => v.toUpperCase()
   },
   bankName: {
      maxLength: 50,
      typingPattern: /[^a-zA-Z\s.&-]/g,
      formatRegex: /^[a-zA-Z\s.&-]{2,100}$/,
      errorMsg: "Enter a valid bank name"
   },
   panNumber: {
      maxLength: 10,
      typingPattern: /[^a-zA-Z0-9]/g,
      formatRegex: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
      errorMsg: "Enter a valid PAN (e.g. ABCDE1234F)",
      transform: (v) => v.toUpperCase(),
      optional: true
   },
   upiId: {
      maxLength: 50,
      typingPattern: /[^a-zA-Z0-9.\-_@]/g,
      formatRegex: /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/,
      errorMsg: "Enter a valid UPI ID (e.g. name@bank)",
      optional: true
   }
};

const FIELDS = [
   { label: tKey("Account Holder"), key: "accountHolderName" },
   { label: tKey("Account Number"), key: "accountNumber" },
   { label: tKey("IFSC Code"), key: "ifscCode" },
   { label: tKey("Bank Name"), key: "bankName" },
   { label: tKey("PAN Number"), key: "panNumber" },
   { label: tKey("UPI ID"), key: "upiId" }
];

export const ProfileBankV2 = () => {
   const { t } = useTranslation("driver");
   const goBack = useDeliveryBackNavigation();
   const [loading, setLoading] = useState(true);
   const [isEditing, setIsEditing] = useState(false);
   const [form, setForm] = useState({
      accountHolderName: "",
      accountNumber: "",
      ifscCode: "",
      bankName: "",
      panNumber: "",
      upiId: ""
   });
   const [errors, setErrors] = useState({});
   const [qrFile, setQrFile] = useState(null);
   const [qrPreview, setQrPreview] = useState("");
   const [qrError, setQrError] = useState("");
   const [isSaving, setIsSaving] = useState(false);

   const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
      const maxSizeMB = 5;

      if (!allowedTypes.includes(file.type)) {
         setQrError(t("Only PNG, JPG or WEBP images are allowed"));
         return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
         setQrError(t("Image size must be under {{maxSizeMB}}MB", { maxSizeMB }));
         return;
      }

      setQrError("");
      setQrFile(file);
      setQrPreview(URL.createObjectURL(file));
   };

   // Validate a single field against its format regex. Empty value on an
   // optional field is treated as valid (nothing to check).
   const validateField = (key, value) => {
      const config = FIELD_CONFIG[key];
      if (!config) return "";
      if (!value) {
         return config.optional ? "" : "This field is required";
      }
      if (!config.formatRegex.test(value)) {
         return config.errorMsg;
      }
      return "";
   };

   const handleFieldChange = (key, rawValue) => {
      const config = FIELD_CONFIG[key];
      let value = rawValue;

      if (config?.typingPattern) {
         value = value.replace(config.typingPattern, "");
      }
      if (config?.maxLength) {
         value = value.slice(0, config.maxLength);
      }
      if (config?.transform) {
         value = config.transform(value);
      }

      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: validateField(key, value) }));
   };

   const handleFieldBlur = (key) => {
      setErrors((prev) => ({ ...prev, [key]: validateField(key, form[key]) }));
   };

   useEffect(() => {
      const fetchProfile = async () => {
         try {
            const response = await deliveryAPI.getProfile();
            if (response?.data?.success) {
               const profile = response.data.data.profile;
               setForm({
                  accountHolderName: profile?.documents?.bankDetails?.accountHolderName || profile?.bankAccountHolderName || "",
                  accountNumber: profile?.documents?.bankDetails?.accountNumber || profile?.bankAccountNumber || "",
                  ifscCode: profile?.documents?.bankDetails?.ifscCode || profile?.bankIfscCode || "",
                  bankName: profile?.documents?.bankDetails?.bankName || profile?.bankName || "",
                  panNumber: profile?.documents?.pan?.number || profile?.panNumber || "",
                  upiId: profile?.documents?.bankDetails?.upiId || profile?.upiId || ""
               });
               setQrPreview(profile?.documents?.bankDetails?.upiQrCode || profile?.upiQrCode || "");
            }
         } catch (e) { toast.error(t("Failed to load details")); }
         finally { setLoading(false); }
      };
      fetchProfile();
   }, []);

   const validateAll = () => {
      const newErrors = {};
      let firstErrorKey = null;

      FIELDS.forEach(({ key }) => {
         const msg = validateField(key, form[key]);
         if (msg) {
            newErrors[key] = msg;
            if (!firstErrorKey) firstErrorKey = key;
         }
      });

      setErrors(newErrors);
      return { isValid: !firstErrorKey, firstErrorKey };
   };

   const handleSave = async () => {
      const { isValid, firstErrorKey } = validateAll();
      if (!isValid) {
         toast.error(FIELD_CONFIG[firstErrorKey]?.errorMsg || t("Please fix the errors before saving"));
         return;
      }
      if (qrError) {
         toast.error(qrError);
         return;
      }

      setIsSaving(true);
      try {
         const formData = new FormData();
         formData.append("documents[bankDetails][accountHolderName]", form.accountHolderName);
         formData.append("documents[bankDetails][accountNumber]", form.accountNumber);
         formData.append("documents[bankDetails][ifscCode]", form.ifscCode);
         formData.append("documents[bankDetails][bankName]", form.bankName);
         formData.append("documents[bankDetails][upiId]", form.upiId || "");
         formData.append("documents[pan][number]", form.panNumber || "");

         if (qrFile) {
            formData.append("upiQrCode", qrFile);
         }

         const response = await deliveryAPI.updateBankDetailsMultipart(formData);
         if (response?.data?.success) {
            toast.success(t("Bank details updated successfully"));
            setIsEditing(false);
         }
      } catch (e) {
         console.error("Update failed:", e);
         toast.error(t("Update failed"));
      }
      finally { setIsSaving(false); }
   };

   if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-[#1F7A63]" /></div>;

   return (
      <div className="min-h-full bg-transparent font-poppins">
         <div className="bg-white px-4 py-5 flex items-center gap-4 sticky top-0 w-full z-50 shadow-sm">
            <button onClick={goBack}><ArrowLeft className="w-6 h-6" /></button>
            <h1 className="text-xl font-black">{t("Bank Details")}</h1>
            {!isEditing && (
               <button onClick={() => setIsEditing(true)} className="ml-auto p-2 bg-[#ebefeb] text-[#1F7A63] rounded-xl"><Edit2 className="w-4 h-4" /></button>
            )}
         </div>

         <div className="pt-24 px-4 pb-10 space-y-6">
            <div className="space-y-4">
               {FIELDS.map(({ label, key }) => {
                  const config = FIELD_CONFIG[key];
                  const errorMsg = errors[key];
                  return (
                     <div key={key} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                           <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              {t(label)}{!config?.optional && <span className="text-red-500"> *</span>}
                           </label>
                           {isEditing && config?.maxLength && (
                              <span className="text-[10px] font-semibold text-gray-300">
                                 {(form[key] || "").length}/{config.maxLength}
                              </span>
                           )}
                        </div>
                        {isEditing ? (
                           <>
                              <input
                                 type="text"
                                 value={form[key]}
                                 maxLength={config?.maxLength}
                                 onChange={(e) => handleFieldChange(key, e.target.value)}
                                 onBlur={() => handleFieldBlur(key)}
                                 className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm font-bold text-[#2B2B2B] focus:ring-2 ${errorMsg
                                    ? "border-red-400 focus:ring-red-500/20"
                                    : "border-gray-100 focus:ring-orange-500/20"
                                    }`}
                              />
                              {errorMsg && (
                                 <p className="text-xs font-semibold text-red-500 mt-1.5">{errorMsg}</p>
                              )}
                           </>
                        ) : (
                           <p className="text-sm font-bold text-[#2B2B2B]">{form[key] || t("Not provided")}</p>
                        )}
                     </div>
                  );
               })}

               {/* QR Code */}
               <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">{t("UPI QR Code")}</label>
                  {isEditing ? (
                     <div className="space-y-3">
                        <input
                           type="file"
                           accept="image/png, image/jpeg, image/webp"
                           onChange={handleFileChange}
                           className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#ebefeb] file:text-[#1F7A63] hover:file:bg-slate-100"
                        />
                        <p className="text-[10px] font-semibold text-gray-400">{t("PNG, JPG or WEBP, max 5MB")}</p>
                        {qrError && <p className="text-xs font-semibold text-red-500">{qrError}</p>}
                        {qrPreview && (
                           <div className="relative w-32 h-32 border border-gray-100 rounded-xl overflow-hidden bg-slate-50">
                              <img src={qrPreview} alt={t("QR Code Preview")} className="w-full h-full object-cover" />
                           </div>
                        )}
                     </div>
                  ) : (
                     <div>
                        {qrPreview ? (
                           <div className="w-32 h-32 border border-gray-100 rounded-xl overflow-hidden bg-slate-50">
                              <img src={qrPreview} alt={t("QR Code")} className="w-full h-full object-cover" />
                           </div>
                        ) : (
                           <p className="text-sm font-bold text-[#2B2B2B]">{t("Not provided")}</p>
                        )}
                     </div>
                  )}
               </div>
            </div>

            {isEditing && (
               <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full bg-[#1F7A63] text-[#F5F5F0] py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 disabled:opacity-60"
               >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {t("Save Changes")}
               </button>
            )}
         </div>
      </div>
   );
};