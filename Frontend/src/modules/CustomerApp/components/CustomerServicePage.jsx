import React, { useState, useEffect } from 'react';
import { serviceManagementAPI } from '@food/api';
import { toast } from 'sonner';
import { ArrowLeft, MessageSquare, Send, Loader2, CheckCircle, XCircle, AlertCircle, Info, RefreshCw, HandCoins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { tKey } from "../../../shared/i18n";

const STATUS_CONFIG = {
  pending: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50/80 border-amber-200/80', label: tKey("Pending") },
  approved: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50/80 border-emerald-200/80', label: tKey("Approved & Refunded") },
  rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50/80 border-red-200/80', label: tKey("Rejected") },
  completed: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50/80 border-blue-200/80', label: tKey("Subscription Extended") },
};

const REASONS = [
  tKey('Food quality issue'),
  tKey('Late delivery'),
  tKey('Missing item'),
  tKey('Wrong order'),
  tKey('Other'),
];

export default function CustomerServicePage() {
  const { t } = useTranslation("customer");
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await serviceManagementAPI.getMyCustomerRequests();
      setRequests(res.data?.data || []);
    } catch {
      toast.error(t("Failed to load requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      toast.error(t("Please select a reason"));
      return;
    }
    setSubmitting(true);
    try {
      await serviceManagementAPI.submitCustomerComplaint({ reason, remarks });
      toast.success(t("Complaint submitted successfully. Our team will review it."));
      setShowForm(false);
      setReason(''); setRemarks('');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || t("Failed to submit request"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtend = async (id) => {
    try {
      await serviceManagementAPI.extendSubscription(id);
      toast.success(t("Subscription extended successfully"));
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || t("Failed to extend subscription"));
    }
  };

  const handleRefund = async (id) => {
    try {
      await serviceManagementAPI.requestRefund(id);
      toast.success(t("Refund request submitted successfully"));
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || t("Failed to request refund"));
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="bg-[#F5F5F0] text-[#1b1c1c] min-h-screen pb-32 font-sans">
      {/* Top Header */}
      <header className="fixed top-0 left-0 w-full md:left-64 md:w-[calc(100%_-_16rem)] z-40 bg-white flex justify-between items-center px-5 h-14 shadow-sm border-b border-[#bec9c3]/20">
        <button 
          onClick={() => navigate(-1)} 
          className="text-primary cursor-pointer active:scale-95 transition-all w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-extrabold text-primary text-center">{t("Customer Support")}</h1>
        <div className="w-8" />
      </header>

      <main className="pt-20 px-4 sm:px-8 lg:px-10 w-full max-w-7xl mx-auto space-y-5">
        {/* Info Banner */}
        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <Info className="w-5 h-5 text-[#1F7A63] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {t("Submit a complaint or request a refund for recent orders. If approved, the amount will be credited to your DailyMealBox Wallet instantly.")}
          </p>
        </div>

        {/* Requests Header & New Complaint Action Row */}
        <div className="flex items-center justify-between pt-2 pb-1">
          <h2 className="font-extrabold text-[12px] text-slate-400 uppercase tracking-widest">{t("My Support History")}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-[#1F7A63] text-white px-4 py-2 rounded-xl font-extrabold text-[13px] hover:bg-[#155a49] transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
            >
              <span>{showForm ? t("Cancel") : t("+ New Complaint")}</span>
            </button>
            <button onClick={fetchRequests} className="p-2 text-[#1F7A63] hover:bg-[#1F7A63]/10 rounded-xl active:rotate-180 transition-all cursor-pointer bg-white border border-slate-200/60 shadow-xs" title={t("Refresh")}>
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Submit Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm space-y-5 animate-in fade-in duration-200">
            <h2 className="font-extrabold text-[16px] text-slate-900">{t("Submit Complaint")}</h2>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-400 uppercase mb-2.5 tracking-wider">{t("Reason *")}</label>
              <div className="flex flex-wrap gap-2.5">
                {REASONS.map(r => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-all cursor-pointer ${
                      reason === r
                        ? 'bg-[#1F7A63] text-white border-[#1F7A63] shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#1F7A63]/50'
                    }`}
                  >
                    {t(r)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-400 uppercase mb-2.5 tracking-wider">{t("Additional Details (Optional)")}</label>
              <div className="relative">
                <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={t("Explain the issue in detail...")}
                  rows={3}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50/70 border border-slate-200 rounded-2xl text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 resize-none transition-all font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-[#1F7A63] text-white font-extrabold text-sm rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:bg-[#155a49] cursor-pointer mt-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {t("Submit to Support")}
            </button>
          </form>
        )}

        {/* Requests List */}
        
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-[#1F7A63]" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80 shadow-xs">
            <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 text-[14px] font-bold">{t("No complaints or refund requests found.")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("Need help with an order? Click New Complaint above.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map(req => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={req._id} className={`bg-white rounded-2xl p-5 border ${cfg.bg} transition-all shadow-xs flex flex-col justify-between`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-[15px] text-slate-900">{req.reason}</span>
                      <span className="text-[11px] text-slate-400 font-medium shrink-0">{formatDate(req.createdAt)}</span>
                    </div>
                    {req.remarks && <p className="text-[13px] text-slate-600 leading-snug font-medium">{req.remarks}</p>}
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide ${cfg.color}`}>
                        <StatusIcon className="w-4 h-4" />
                        {t(cfg.label)}
                      </div>
                      {req.status === 'approved' && req.refundAmount > 0 && (
                        <div className="text-[12px] font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/60">
                          {t("+₹{{refundAmount}} Refunded", { refundAmount: req.refundAmount })}
                        </div>
                      )}
                    </div>

                    {req.requestType === 'customer_refund' && req.status === 'pending' && req.requesterRole === 'SYSTEM' && (
                      <div className="flex gap-2.5 pt-1">
                        {(!req.subscriptionId?.deliverySlots || req.subscriptionId.deliverySlots.length <= 1 || (req.slots && req.slots.length === req.subscriptionId.deliverySlots.length)) && (
                          <button
                            onClick={() => handleExtend(req._id)}
                            className="flex-1 py-2.5 bg-[#1F7A63]/10 text-[#1F7A63] rounded-xl text-xs font-extrabold hover:bg-[#1F7A63]/20 transition-colors cursor-pointer"
                          >
                            {t("Add Day")}
                          </button>
                        )}
                        <button
                          onClick={() => handleRefund(req._id)}
                          className="flex-1 py-2.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-extrabold hover:bg-emerald-200 transition-colors cursor-pointer"
                        >
                          {t("Request Refund")}
                        </button>
                      </div>
                    )}

                    {req.adminNotes && (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[12px] text-slate-600 font-medium"><span className="font-bold text-slate-900">{t("Support Team:")}</span> {req.adminNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
