import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Send, RotateCcw, ChevronDown, User, Truck, ShoppingBag } from "lucide-react";
import { adminClient } from "@food/api/axios";

const STATUS_CONFIG = {
  open:       { label: "Open",       color: "#ef4444", bg: "#7f1d1d" },
  in_review:  { label: "In Review",  color: "#f59e0b", bg: "#78350f" },
  resolved:   { label: "Resolved",   color: "#22c55e", bg: "#14532d" },
  escalated:  { label: "Escalated",  color: "#a855f7", bg: "#581c87" },
};

function RefundDialog({ complaint, onClose, onRefund }) {
  const [type, setType] = useState("partial");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxRefund = complaint?.orderId?.totalAmount || 0;

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError("Enter a valid amount"); return; }
    if (type === "full" && num > maxRefund) { setError(`Cannot exceed order total (PLN ${maxRefund.toFixed(2)})`); return; }
    setSubmitting(true);
    setError("");
    try {
      await onRefund({ refundType: type, refundAmount: num });
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || "Refund failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-white mb-1">Issue Refund</h3>
        <p className="text-sm text-gray-400 mb-4">Order total: <span className="text-white font-semibold">PLN {maxRefund.toFixed(2)}</span></p>
        <div className="flex gap-3 mb-4">
          {["full", "partial"].map(t => (
            <button key={t} onClick={() => { setType(t); if (t === "full") setAmount(maxRefund.toFixed(2)); }}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${type === t ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)} Refund
            </button>
          ))}
        </div>
        <label className="block text-sm text-gray-400 mb-1">Amount (PLN)</label>
        <input
          type="number" value={amount} min={0} max={maxRefund}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
          placeholder="Enter amount"
        />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="bg-gray-800 rounded-xl p-3 mb-4 text-xs text-gray-400 space-y-1">
          <p>Vendor clawback: ~70% Â· Fleet clawback: ~15% Â· Commission return: ~15%</p>
          <p>VAT adjustment applied automatically</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 transition font-semibold">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white hover:bg-green-500 transition font-bold disabled:opacity-50">
            {submitting ? "Processingâ€¦" : "Issue Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RespondDialog({ onClose, onSend }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    try { await onSend(message); onClose(); } finally { setSubmitting(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-white mb-4">Send Response to Customer</h3>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
          placeholder="Type your responseâ€¦" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting || !message.trim()}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-bold disabled:opacity-50">
            {submitting ? "Sendingâ€¦" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComplaintDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [showRespond, setShowRespond] = useState(false);
  const [note, setNote] = useState("");
  const [newStatus, setNewStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin" + `/complaints/${id}`);
      if (res?.data?.success) { setComplaint(res.data.data); setNewStatus(res.data.data.status); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async () => {
    if (!newStatus || newStatus === complaint.status) return;
    setSaving(true);
    try {
      const res = await adminClient.patch("/food/admin" + `/complaints/${id}/status`, { status: newStatus, note });
      if (res?.data?.success) setComplaint(res.data.data.complaint);
    } finally { setSaving(false); }
  };

  const issueRefund = async (body) => {
    const res = await adminClient.post("/food/admin" + `/complaints/${id}/refund`, body);
    if (res?.data?.success) setComplaint(res.data.data.complaint);
  };

  const escalate = async () => {
    setSaving(true);
    try {
      const res = await adminClient.post("/food/admin" + `/complaints/${id}/escalate`, { reason: note || "Escalated by agent" });
      if (res?.data?.success) setComplaint(res.data.data.complaint);
    } finally { setSaving(false); }
  };

  const sendResponse = async (message) => {
    const res = await adminClient.post("/food/admin" + `/complaints/${id}/respond`, { message });
    if (res?.data?.success) setComplaint(res.data.data.complaint);
  };

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full" /></div>;
  if (!complaint) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center"><p>Complaint not found</p></div>;

  const c = complaint;
  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.open;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {showRefund && <RefundDialog complaint={c} onClose={() => setShowRefund(false)} onRefund={issueRefund} />}
      {showRespond && <RespondDialog onClose={() => setShowRespond(false)} onSend={sendResponse} />}

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 transition">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-gray-400">{c.complaintRef}</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                {statusCfg.label}
              </span>
              {c.refundAmount > 0 && <span className="text-xs text-green-400 bg-green-900/40 px-2 py-0.5 rounded-full">PLN {c.refundAmount.toFixed(2)} refunded</span>}
            </div>
            <h1 className="text-lg font-bold text-white mt-0.5">{c.subject || "Complaint Detail"}</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Message */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Customer Message</h3>
            <p className="text-gray-300 leading-relaxed">{c.message}</p>
            {c.proofPhotos?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 mb-2">Proof photos ({c.proofPhotos.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {c.proofPhotos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-xl overflow-hidden border border-gray-700 bg-gray-800">
                      <img src={url} alt={`proof-${i}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Order Info */}
          {c.orderId && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-blue-400" /> Order Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-500 text-xs">Order ID</p><p className="text-white font-mono">{c.orderId.orderId || c.orderId._id}</p></div>
                <div><p className="text-gray-500 text-xs">Status</p><p className="text-white">{c.orderId.orderStatus}</p></div>
                <div><p className="text-gray-500 text-xs">Total (PLN)</p><p className="text-white font-bold">PLN {(c.orderId.totalAmount || 0).toFixed(2)}</p></div>
                <div><p className="text-gray-500 text-xs">Placed</p><p className="text-white">{c.orderId.createdAt ? new Date(c.orderId.createdAt).toLocaleDateString() : "-"}</p></div>
              </div>
            </div>
          )}

          {/* Parties */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-3">Parties Involved</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {c.customerId && (
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1"><User className="w-3.5 h-3.5 text-blue-400" /><span className="text-xs text-gray-400">Customer</span></div>
                  <p className="font-semibold text-white text-sm">{c.customerId.name}</p>
                  <p className="text-xs text-gray-400">{c.customerId.phone}</p>
                  <p className="text-xs text-purple-400 mt-1">{c.customerId.subscriptionStatus || "no subscription"}</p>
                </div>
              )}
              {c.vendorId && (
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1"><ShoppingBag className="w-3.5 h-3.5 text-orange-400" /><span className="text-xs text-gray-400">Vendor</span></div>
                  <p className="font-semibold text-white text-sm">{c.vendorId.restaurantName}</p>
                  <p className="text-xs text-gray-400">{c.vendorId.city}</p>
                </div>
              )}
              {c.driverId && (
                <div className="bg-gray-800 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1"><Truck className="w-3.5 h-3.5 text-green-400" /><span className="text-xs text-gray-400">Driver</span></div>
                  <p className="font-semibold text-white text-sm">{c.driverId.name}</p>
                  <p className="text-xs text-gray-400">{c.driverId.phone}</p>
                </div>
              )}
            </div>
          </div>

          {/* Status Trail */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> Status Trail</h3>
            <div className="space-y-3">
              {(c.statusTrail || []).map((trail, i) => {
                const cfg = STATUS_CONFIG[trail.status] || STATUS_CONFIG.open;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center mt-0.5 shrink-0" style={{ background: cfg.bg }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                        {trail.changedByName && <span className="text-xs text-gray-500">by {trail.changedByName}</span>}
                        <span className="ml-auto text-xs text-gray-600">{trail.at ? new Date(trail.at).toLocaleString() : ""}</span>
                      </div>
                      {trail.note && <p className="text-xs text-gray-400 mt-0.5">{trail.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="space-y-4">
          {/* Update Status */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-4">Update Status</h3>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            >
              {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <textarea
              rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none resize-none mb-3"
              placeholder="Internal note (optional)â€¦"
            />
            <button onClick={updateStatus} disabled={saving || newStatus === c.status}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 disabled:opacity-50 transition">
              {saving ? "Savingâ€¦" : "Update Status"}
            </button>
          </div>

          {/* Refund */}
          {c.status !== "resolved" && c.refundStatus !== "processed" && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="font-semibold text-white mb-3">Issue Refund</h3>
              <p className="text-xs text-gray-400 mb-3">CS agents: max PLN 150 Â· Super Admin: unlimited</p>
              <button onClick={() => setShowRefund(true)}
                className="w-full py-2.5 rounded-xl bg-green-700 text-white font-bold hover:bg-green-600 transition">
                ðŸ’° Issue Refund
              </button>
            </div>
          )}
          {c.refundStatus === "processed" && (
            <div className="bg-green-900/30 rounded-2xl border border-green-800/50 p-4">
              <p className="text-xs text-green-400 font-bold mb-1">âœ“ Refund Processed</p>
              <p className="text-sm text-white">PLN {c.refundAmount?.toFixed(2)}</p>
              {c.refundSplit && (
                <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                  <p>Vendor: PLN {c.refundSplit.vendorClawback?.toFixed(2)}</p>
                  <p>Fleet: PLN {c.refundSplit.fleetClawback?.toFixed(2)}</p>
                  <p>Commission: PLN {c.refundSplit.commissionReturn?.toFixed(2)}</p>
                </div>
              )}
            </div>
          )}

          {/* Escalate */}
          {c.status !== "escalated" && c.status !== "resolved" && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="font-semibold text-white mb-3">Escalate</h3>
              <button onClick={escalate} disabled={saving}
                className="w-full py-2.5 rounded-xl bg-purple-700 text-white font-bold hover:bg-purple-600 transition">
                â¬† Escalate to Super Admin
              </button>
            </div>
          )}

          {/* Respond */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h3 className="font-semibold text-white mb-3">Customer Response</h3>
            {c.customerResponseSent && (
              <div className="mb-3 p-3 bg-blue-900/30 rounded-xl border border-blue-800/50">
                <p className="text-xs text-blue-400 font-bold mb-1">âœ“ Response sent {c.customerResponseAt ? new Date(c.customerResponseAt).toLocaleDateString() : ""}</p>
                <p className="text-xs text-gray-300">{c.customerResponseMessage}</p>
              </div>
            )}
            <button onClick={() => setShowRespond(true)}
              className="w-full py-2.5 rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-700 transition flex items-center justify-center gap-2">
              <Send className="w-4 h-4" />
              {c.customerResponseSent ? "Send Another Response" : "Respond to Customer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
