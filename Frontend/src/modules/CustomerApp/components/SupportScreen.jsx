import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { userAPI, uploadAPI } from "@food/api";
import { X, Loader2, Camera, MessageCircle, ArrowLeft } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { tKey } from "../../../shared/i18n";

const ISSUE_TYPES = [
  tKey("Delivery Delay"),
  tKey("Missing / Wrong Items"),
  tKey("Food Quality Issue"),
  tKey("Payment / Billing Issue"),
  tKey("App Bug / Tech Support"),
  tKey("Other")
];

export function SupportScreen({ onGoBack, onShowNotificationToast }) {
  const { t: tr } = useTranslation("customer");
  const [searchParams] = useSearchParams();
  const queryOrderId = searchParams.get("orderId");
  const queryType = searchParams.get("type");

  const [activeTab, setActiveTab] = useState("submit"); // "submit" | "history"

  // Form State
  const [type, setType] = useState(queryType || "other");
  const [orderId, setOrderId] = useState(queryOrderId || "");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // History State
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // If query parameters change, update form states
  useEffect(() => {
    if (queryOrderId) {
      setOrderId(queryOrderId);
      setType("order");
    }
  }, [queryOrderId, queryType]);

  // Load ticket history
  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await userAPI.listMySupportTickets();
      const list = res.data?.data?.tickets || res.data?.tickets || [];
      setTickets(list);
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchTickets();
    }
  }, [activeTab]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError("");
    try {
      const res = await uploadAPI.uploadMedia(file);
      const url = res.data?.data?.url || res.data?.url || res.data?.data?.imageUrl;
      if (url) {
        setImage(url);
        onShowNotificationToast(tr("Attachment uploaded successfully!"));
      } else {
        throw new Error("Failed to retrieve upload URL");
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || tr("Failed to upload image"));
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setImage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!issueType) {
      setFormError(tr("Please select an issue type."));
      return;
    }
    if (!description.trim()) {
      setFormError(tr("Please describe your issue."));
      return;
    }
    if (type === "order" && !orderId.trim()) {
      setFormError(tr("Please enter the Order ID."));
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const payload = {
        type,
        issueType,
        description: description.trim(),
        image
      };
      if (type === "order") {
        payload.orderId = orderId.trim();
      }

      await userAPI.createSupportTicket(payload);
      onShowNotificationToast(tr("Complaint submitted successfully! We will review it shortly."));
      
      // Reset Form
      setIssueType("");
      setDescription("");
      setImage("");
      if (!queryOrderId) {
        setOrderId("");
        setType("other");
      }
      
      // Go to ticket list
      setActiveTab("history");
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || tr("Failed to submit ticket"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-screen pb-32">
      {/* Top Header */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button onClick={onGoBack} className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-extrabold text-primary text-center">{tr("Help & Support")}</h1>
        <div className="w-8" />
      </header>

      <main className="pt-20 pb-12 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto">
        {/* Navigation Tabs */}
        <div className="flex bg-white p-1 rounded-2xl border border-[#bec9c3]/20 mb-6">
          <button
            onClick={() => setActiveTab("submit")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeTab === "submit"
                ? "bg-primary text-white shadow-sm"
                : "text-on-surface-variant hover:bg-slate-50"
            }`}
          >
            {tr("Submit Complaint")}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${
              activeTab === "history"
                ? "bg-primary text-white shadow-sm"
                : "text-on-surface-variant hover:bg-slate-50"
            }`}
          >
            {tr("My Complaints ({{length}})", { length: tickets.length })}
          </button>
        </div>

        {/* Tab Content: Submit Complaint */}
        {activeTab === "submit" && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#bec9c3]/20 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 text-brand-red rounded-xl text-xs font-semibold border border-red-100">
                  {formError}
                </div>
              )}

              {/* Type Select */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">{tr("What is this about?")}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium disabled:opacity-60"
                  disabled={Boolean(queryOrderId)}
                >
                  <option value="other">{tr("General / Other Issue")}</option>
                  <option value="order">{tr("Order Specific Issue")}</option>
                </select>
              </div>

              {/* Order ID field */}
              {type === "order" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-on-surface-variant">{tr("Order ID")}</label>
                  <input
                    type="text"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium disabled:opacity-60"
                    disabled={Boolean(queryOrderId)}
                    placeholder={tr("Enter associated Order ID")}
                  />
                </div>
              )}

              {/* Issue Type Select */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">{tr("Complaint Type")}</label>
                <select
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value)}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium"
                >
                  <option value="">{tr("Select Issue Category")}</option>
                  {ISSUE_TYPES.map((it) => (
                    <option key={it} value={it}>{tr(it)}</option>
                  ))}
                </select>
              </div>

              {/* Description Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">{tr("Describe the Complaint")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm p-3 bg-[#F5F5F0] border border-[#bec9c3]/30 rounded-xl focus:outline-none focus:border-primary/50 font-medium min-h-[120px]"
                  placeholder={tr("Tell us what went wrong. Please provide details so we can resolve this quickly.")}
                  disabled={submitting}
                />
              </div>

              {/* Photo Upload Section */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-on-surface-variant">{tr("Attach Photo (Optional)")}</label>
                <div className="flex items-center gap-4 pt-1">
                  {image ? (
                    <div className="relative">
                      <img
                        className="w-20 h-20 rounded-xl object-cover border border-[#bec9c3]/30"
                        src={image}
                        alt={tr("Complaint Attachment")}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-1.5 -right-1.5 bg-brand-red text-white w-5 h-5 rounded-full flex items-center justify-center cursor-pointer shadow-sm active:scale-90 transition-transform"
                      >
                        <X className="text-[12px] font-bold" />
                      </button>
                    </div>
                  ) : (
                    <label className="w-20 h-20 rounded-xl border border-dashed border-[#bec9c3]/60 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors">
                      {uploading ? (
                        <Loader2 className="text-primary text-[24px] animate-spin" />
                      ) : (
                        <>
                          <Camera className="text-primary text-[24px]" />
                          <span className="text-[9px] font-bold text-on-surface-variant mt-1">{tr("Upload")}</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        disabled={uploading || submitting}
                      />
                    </label>
                  )}
                  <div className="text-[10px] text-on-surface-variant font-medium">
                    <p>{tr("Format supported: PNG, JPG, JPEG")}</p>
                    <p>{tr("Max file size: 2 MB")}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm hover:bg-[#155a49] transition-colors active:scale-95 flex items-center justify-center gap-2 shadow-md disabled:opacity-60"
              disabled={submitting || uploading}
            >
              {submitting ? (
                <>
                  <Loader2 className="text-sm animate-spin" />
                  <span>{tr("Submitting Complaint...")}</span>
                </>
              ) : (
                tr("Submit Ticket")
              )}
            </button>
          </form>
        )}

        {/* Tab Content: Complaint History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {loadingTickets ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="text-[36px] text-primary animate-spin" />
                <p className="text-xs text-on-surface-variant mt-2 font-medium">{tr("Loading history...")}</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-[#bec9c3]/20 text-center">
                <MessageCircle className="text-[48px] text-on-surface-variant/40" />
                <h3 className="text-sm font-bold text-[#1a1c1a] mt-2">{tr("No complaints logged")}</h3>
                <p className="text-xs text-on-surface-variant mt-1 font-medium">{tr("You haven't filed any support tickets yet.")}</p>
              </div>
            ) : (
              tickets.map((t) => {
                 const isResolved = t.status === "resolved";
                 const isProgress = t.status === "in_review" || t.status === "in-progress" || t.status === "escalated";
                 const statusColor = isResolved
                   ? "bg-emerald-100 text-emerald-800"
                   : isProgress
                   ? "bg-blue-100 text-blue-800"
                   : "bg-amber-100 text-amber-800";
 
                 let displayStatus = t.status || "";
                 if (displayStatus === "in_review") displayStatus = "in review";
 
                 return (
                   <div key={t._id} className="bg-white rounded-2xl p-4 shadow-sm border border-[#bec9c3]/20 space-y-3">
                     <div className="flex justify-between items-start">
                       <div>
                         <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">
                           {tr("Ticket #")}{String(t._id).slice(-6)}
                         </span>
                         <h4 className="text-sm font-extrabold text-[#1a1c1a] mt-0.5">{t.issueType}</h4>
                       </div>
                       <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${statusColor}`}>
                         {displayStatus}
                       </span>
                     </div>

                    <p className="text-xs text-on-surface-variant font-medium leading-relaxed">
                      {t.description}
                    </p>

                    {t.orderId && (
                      <p className="text-[10px] text-on-surface-variant font-bold">
                        {tr("Order Ref:")} <span className="font-mono text-primary">#{String(t.orderId).slice(-6)}</span>
                      </p>
                    )}

                    {t.image && (
                      <a href={t.image} target="_blank" rel="noreferrer" className="inline-block mt-1">
                        <img
                          src={t.image}
                          alt={tr("Attached proof")}
                          className="w-16 h-16 rounded-lg object-cover border border-slate-200 hover:opacity-85 transition-opacity"
                        />
                      </a>
                    )}

                    {/* Admin Response */}
                    {t.adminResponse && (
                      <div className="bg-[#F5F5F0] rounded-xl p-3 border-l-4 border-primary text-xs mt-2 space-y-1">
                        <p className="font-bold text-primary">{tr("Support Response:")}</p>
                        <p className="text-[#3e4945] font-medium leading-relaxed">{t.adminResponse}</p>
                      </div>
                    )}

                    <div className="text-[9px] text-[#8e9894] pt-2 border-t border-slate-100 flex justify-between">
                      <span>{tr("Logged on {{date}}", { date: new Date(t.createdAt).toLocaleDateString() })}</span>
                      <span>{tr("Last update {{date}}", { date: new Date(t.updatedAt).toLocaleTimeString() })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
}
