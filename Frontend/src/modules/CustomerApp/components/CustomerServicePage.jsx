import React, { useState, useEffect } from 'react';
import { serviceManagementAPI } from '@food/api';
import { toast } from 'sonner';
import { ArrowLeft, MessageSquare, Send, Loader2, CheckCircle, XCircle, AlertCircle, Info, RefreshCw, HandCoins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_CONFIG = {
  pending: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', label: 'Pending' },
  approved: { icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', label: 'Approved & Refunded' },
  rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Rejected' },
};

const REASONS = [
  'Food quality issue',
  'Late delivery',
  'Missing item',
  'Wrong order',
  'Other',
];

export default function CustomerServicePage() {
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
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) {
      toast.error('Please select a reason');
      return;
    }
    setSubmitting(true);
    try {
      await serviceManagementAPI.submitCustomerComplaint({ reason, remarks });
      toast.success('Complaint submitted successfully. Our team will review it.');
      setShowForm(false);
      setReason(''); setRemarks('');
      fetchRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="w-[390px] min-h-screen bg-slate-50/50 mx-auto relative flex flex-col font-sans">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 shadow-sm h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-800" />
          </button>
          <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">Customer Support</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-primary font-bold text-[13px]"
        >
          {showForm ? 'Cancel' : 'New Complaint'}
        </button>
      </div>

      <div className="flex-grow p-4 space-y-4 pb-20 overflow-y-auto">
        
        {/* Info Banner */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-start gap-2.5">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Submit a complaint or request a refund for recent orders. If approved, the amount will be credited to your DailyMealBox Wallet instantly.
          </p>
        </div>

        {/* Submit Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-5 border border-outline-variant/20 shadow-xs space-y-4 animate-fadeIn">
            <h2 className="font-bold text-[15px] text-on-surface">Submit Complaint</h2>

            <div>
              <label className="block text-[10px] font-bold text-outline uppercase mb-2 tracking-wider">Reason *</label>
              <div className="flex flex-wrap gap-2">
                {REASONS.map(r => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setReason(r)}
                    className={`px-3 py-2 rounded-xl text-[13px] font-medium border transition-all ${
                      reason === r
                        ? 'bg-primary text-on-primary border-primary shadow-sm'
                        : 'bg-white text-on-surface-variant border-outline-variant hover:border-primary/50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-outline uppercase mb-2 tracking-wider">Additional Details (Optional)</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-outline" />
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Explain the issue in detail..."
                  rows={3}
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-outline-variant rounded-xl text-[13px] text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-primary text-on-primary font-bold rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm mt-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit to Support
            </button>
          </form>
        )}

        {/* Requests List */}
        <div className="flex items-center justify-between mt-6 mb-1">
          <h2 className="font-bold text-[12px] text-outline uppercase tracking-wider">My Support History</h2>
          <button onClick={fetchRequests} className="p-1 text-primary active:rotate-180 transition-transform">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-outline-variant/20 shadow-xs">
            <HandCoins className="w-8 h-8 text-outline mx-auto mb-2 opacity-50" />
            <p className="text-on-surface-variant text-[13px] font-medium">No complaints or refund requests found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const StatusIcon = cfg.icon;
              return (
                <div key={req._id} className={`bg-white rounded-2xl p-4 border ${cfg.bg} transition-all shadow-xs`}>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-bold text-[14px] text-on-surface">{req.reason}</span>
                      </div>
                      <p className="text-[10px] text-outline font-medium">{formatDate(req.createdAt)}</p>
                      {req.remarks && <p className="text-[13px] text-on-surface-variant mt-1 leading-snug">{req.remarks}</p>}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-black/5">
                    <div className={`flex items-center gap-1 text-[11px] font-bold uppercase ${cfg.color}`}>
                      <StatusIcon className="w-4 h-4" />
                      {cfg.label}
                    </div>
                    {req.status === 'approved' && req.refundAmount > 0 && (
                      <div className="text-[12px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                        +₹{req.refundAmount} Refunded
                      </div>
                    )}
                  </div>

                  {req.adminNotes && (
                    <div className="mt-2 bg-black/5 rounded-lg p-2">
                      <p className="text-[11px] text-on-surface-variant"><span className="font-bold text-on-surface">Support Team:</span> {req.adminNotes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
