import React, { useState, useEffect } from 'react';
import { serviceManagementAPI } from '@food/api';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, Clock, MessageSquare, Send, Loader2, CheckCircle, XCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useDeliverySlots from '../../../shared/hooks/useDeliverySlots';
import { useTranslation } from "react-i18next";
import { tKey } from "../../../shared/i18n";

const STATUS_CONFIG = {
  pending: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: tKey("Pending") },
  approved: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: tKey("Approved") },
  rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: tKey("Rejected") },
  completed: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: tKey("Completed") },
};

const REASONS = [
  tKey('Kitchen maintenance'),
  tKey('Ingredient shortage'),
  tKey('Staff unavailability'),
  tKey('Equipment issue'),
  tKey('Personal emergency'),
  tKey('Other'),
];

export default function VendorServicePage() {
  const { t } = useTranslation("vendor");
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [date, setDate] = useState('');
  const { enabledSlots: slotList } = useDeliverySlots();
  const [slots, setSlots] = useState([]);
  useEffect(() => { if (slotList.length && slots.length === 0) setSlots([slotList[0].key]); }, [slotList]);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await serviceManagementAPI.getMyVendorRequests();
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
    if (!date || slots.length === 0 || !reason) {
      toast.error(t("Please fill all required fields"));
      return;
    }
    setSubmitting(true);
    try {
      await serviceManagementAPI.submitVendorUnavailable({ date, slots, reason, remarks });
      toast.success(t("Request submitted successfully"));
      setShowForm(false);
      setDate('');
      setSlots(slotList.length ? [slotList[0].key] : []);
      setReason('');
      setRemarks('');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || t("Failed to submit request"));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Header */}
      <div className="sticky top-14 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/vendor/profile')} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">{t("Vendor Service")}</h1>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:opacity-90 active:scale-95 transition-all"
          >
            {showForm ? t("Cancel") : t("+ New Request")}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {/* Submit Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm space-y-4">
            <h2 className="font-bold text-gray-900">{t("Report Meal Unavailability")}</h2>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{t("Date *")}</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{t("Meal Slots *")}</label>
              <div className="flex flex-wrap gap-2">
                {slotList.map(sd => sd.key).map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => {
                      if (slots.includes(s)) {
                        setSlots(slots.filter(x => x !== s));
                      } else {
                        setSlots([...slots, s]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize border transition-all ${
                      slots.includes(s)
                        ? 'bg-primary text-white border-primary'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {slotList.find(x => x.key === s)?.name || s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{t("Reason *")}</label>
              <div className="flex flex-wrap gap-2">
                {REASONS.map(r => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      reason === r
                        ? 'bg-primary text-white border-primary'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {t(r)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{t("Remarks (Optional)")}</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={t("Add any additional notes...")}
                  rows={2}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t("Submit Request")}
            </button>
          </form>
        )}

        {/* Requests List */}
        <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wider">{t("My Requests")}</h2>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-400 font-medium">{t("No requests yet")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={req._id} className={`bg-white rounded-2xl p-4 border ${cfg.bg} transition-all`}>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-900 text-sm">{formatDate(req.date)}</span>
                        <span className="capitalize bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-xs font-medium">
                          {req.slots && req.slots.length > 0 ? req.slots.join(', ') : req.slot}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{req.reason}</p>
                      {req.remarks && <p className="text-xs text-gray-400 italic">{req.remarks}</p>}
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold uppercase ${cfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {t(cfg.label)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
