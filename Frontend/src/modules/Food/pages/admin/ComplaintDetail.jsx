import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Send, User, Truck, ShoppingBag } from "lucide-react";
import { adminClient } from "@food/api/axios";

const STATUS_CONFIG = {
  open: { label: "Open", color: "#dc2626", bg: "#fef2f2" },
  in_review: { label: "In Review", color: "#d97706", bg: "#fffbeb" },
  resolved: { label: "Resolved", color: "#16a34a", bg: "#f0fdf4" },
  escalated: { label: "Escalated", color: "#9333ea", bg: "#faf5ff" },
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md shadow-2xl text-[#2B2B2B]">
        <h3 className="font-bold text-lg mb-1">Issue Refund</h3>
        <p className="text-sm text-gray-500 mb-4">Order total: <span className="font-semibold text-[#2B2B2B]">PLN {maxRefund.toFixed(2)}</span></p>
        <div className="flex gap-3 mb-4">
          {["full", "partial"].map(t => (
            <button key={t} onClick={() => { setType(t); if (t === "full") setAmount(maxRefund.toFixed(2)); }}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${type === t ? "bg-[#1F7A63] text-white-force" : "bg-[#F5F5F0] text-[#2B2B2B] hover:bg-gray-200 border border-gray-300/40"}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)} Refund
            </button>
          ))}
        </div>
        <label className="block text-sm text-gray-500 mb-1">Amount (PLN)</label>
        <input
          type="number" value={amount} min={0} max={maxRefund}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#1F7A63] mb-2"
          placeholder="Enter amount"
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-500 space-y-1 border border-gray-100">
          <p>Vendor clawback: ~70% · Fleet clawback: ~15% · Commission return: ~15%</p>
          <p>VAT adjustment applied automatically</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[#F5F5F0] text-[#2B2B2B] hover:bg-gray-200 transition font-semibold border border-gray-300/40 shadow-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-[#1F7A63] text-white-force hover:bg-[#155a49] transition font-bold disabled:opacity-50 shadow-sm">
            {submitting ? "Processing..." : "Issue Refund"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RespondDialog({ complaint, onClose, onSend }) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const xlSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    try { await onSend(message); onClose(); } finally { setSubmitting(false); }
  };
  const isDriver = complaint?.complainantType === "delivery_partner";
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md shadow-2xl text-[#2B2B2B]">
        <h3 className="font-bold text-lg mb-4">Send Response to {isDriver ? "Delivery Partner" : "Customer"}</h3>
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-300 text-[#2B2B2B] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F7A63] resize-none mb-4"
          placeholder="Type your response..." />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[#F5F5F0] text-[#2B2B2B] hover:bg-gray-200 font-semibold border border-gray-300/40 shadow-sm transition">Cancel</button>
          <button onClick={xlSubmit} disabled={submitting || !message.trim()}
            className="flex-1 py-2.5 rounded-xl bg-[#1F7A63] text-white-force hover:bg-[#155a49] font-bold disabled:opacity-50 transition shadow-sm">
            {submitting ? "Sending..." : "Send"}
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

  if (loading) return <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-[#1F7A63] border-t-transparent rounded-full" /></div>;
  if (!complaint) return <div className="min-h-screen bg-[#F5F5F0] text-[#2B2B2B] flex items-center justify-center"><p>Complaint not found</p></div>;

  const c = complaint;
  const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.open;

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#2B2B2B] pb-12">
      {showRefund && <RefundDialog complaint={c} onClose={() => setShowRefund(false)} onRefund={issueRefund} />}
      {showRespond && <RespondDialog complaint={c} onClose={() => setShowRespond(false)} onSend={sendResponse} />}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition text-[#2B2B2B]">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-gray-500 font-bold">{c.complaintRef}</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                {statusCfg.label}
              </span>
              {c.complainantType === "delivery_partner" ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  Rider
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  Customer
                </span>
              )}
              {c.refundAmount > 0 && <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 font-bold">PLN {c.refundAmount.toFixed(2)} refunded</span>}
            </div>
            <h1 className="text-lg font-bold text-[#2B2B2B] mt-0.5">{c.subject || "Complaint Detail"}</h1>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main detail */}
        <div className="lg:col-span-2 space-y-4">
          {/* Message */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-[#2B2B2B] mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> 
              {c.complainantType === "delivery_partner" ? "Delivery Partner Message" : "Customer Message"}
            </h3>
            <p className="text-gray-700 leading-relaxed font-medium">{c.message}</p>
            {c.proofPhotos?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2 font-bold">Proof photos ({c.proofPhotos.length})</p>
                <div className="flex gap-2 flex-wrap">
                  {c.proofPhotos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gray-100 hover:opacity-85 transition">
                      <img src={url} alt={`proof-${i}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Order Info */}
          {c.orderId && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-[#2B2B2B] mb-3 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-[#1F7A63]" /> Order Information</h3>
              <div className="grid grid-cols-2 gap-3 text-sm text-[#2B2B2B]">
                <div><p className="text-gray-500 text-xs font-bold">Order ID</p><p className="font-mono mt-0.5">{c.orderId.orderId || c.orderId._id}</p></div>
                <div><p className="text-gray-500 text-xs font-bold">Status</p><p className="capitalize mt-0.5">{c.orderId.orderStatus}</p></div>
                <div><p className="text-gray-500 text-xs font-bold">Total</p><p className="font-bold text-[#1F7A63] mt-0.5">PLN {(c.orderId.totalAmount || 0).toFixed(2)}</p></div>
                <div><p className="text-gray-500 text-xs font-bold">Placed</p><p className="mt-0.5">{c.orderId.createdAt ? new Date(c.orderId.createdAt).toLocaleDateString() : "-"}</p></div>
              </div>
            </div>
          )}

          {/* Parties */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-[#2B2B2B] mb-3">Parties Involved</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {c.customerId && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1.5"><User className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs text-gray-500 font-bold">Customer</span></div>
                  <p className="font-semibold text-[#2B2B2B] text-sm">{c.customerId.name}</p>
                  <p className="text-xs text-gray-500">{c.customerId.phone}</p>
                  <p className="text-xs text-purple-600 font-bold mt-1.5 capitalize">{c.customerId.subscriptionStatus || "no subscription"}</p>
                </div>
              )}
              {c.vendorId && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1.5"><ShoppingBag className="w-3.5 h-3.5 text-orange-500" /><span className="text-xs text-gray-500 font-bold">Vendor</span></div>
                  <p className="font-semibold text-[#2B2B2B] text-sm">{c.vendorId.restaurantName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.vendorId.city}</p>
                </div>
              )}
              {c.driverId && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center gap-2 mb-1.5"><Truck className="w-3.5 h-3.5 text-green-600" /><span className="text-xs text-gray-500 font-bold">Driver</span></div>
                  <p className="font-semibold text-[#2B2B2B] text-sm">{c.driverId.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.driverId.phone}</p>
                  {c.driverId.vehicleType && <p className="text-xs text-gray-400 mt-1.5 capitalize">Vehicle: {c.driverId.vehicleType}</p>}
                  {c.driverId._id && <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {String(c.driverId._id).slice(-6).toUpperCase()}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Status Trail */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-[#2B2B2B] mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-500" /> Status Trail</h3>
            <div className="space-y-4">
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
                        <span className="ml-auto text-xs text-gray-400">{trail.at ? new Date(trail.at).toLocaleString() : ""}</span>
                      </div>
                      {trail.note && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{trail.note}</p>}
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
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-[#2B2B2B] mb-4">Update Status</h3>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-gray-300 text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#1F7A63] mb-3 text-sm font-semibold"
            >
              {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <textarea
              rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-gray-300 text-sm text-[#2B2B2B] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F7A63] resize-none mb-3"
              placeholder="Internal note (optional)..."
            />
            <button onClick={updateStatus} disabled={saving || newStatus === c.status}
              className="w-full py-2.5 rounded-xl bg-[#1F7A63] text-white-force font-bold hover:bg-[#155a49] disabled:opacity-50 transition shadow-sm">
              {saving ? "Saving..." : "Update Status"}
            </button>
          </div>

          {/* Refund */}
          {c.orderId && c.status !== "resolved" && c.refundStatus !== "processed" && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-[#2B2B2B] mb-3">Issue Refund</h3>
              <p className="text-xs text-gray-500 mb-3">CS agents: max PLN 150 · Super Admin: unlimited</p>
              <button onClick={() => setShowRefund(true)}
                className="w-full py-2.5 rounded-xl bg-[#1F7A63] text-white-force font-bold hover:bg-[#155a49] transition shadow-sm">
                Issue Refund
              </button>
            </div>
          )}
          {c.refundStatus === "processed" && (
            <div className="bg-green-50 rounded-2xl border border-green-200 p-5 shadow-sm text-[#2B2B2B]">
              <p className="text-xs text-green-700 font-bold mb-1">✓ Refund Processed</p>
              <p className="text-lg font-bold text-[#1F7A63]">PLN {c.refundAmount?.toFixed(2)}</p>
              {c.refundSplit && (
                <div className="mt-3 pt-3 border-t border-green-200/50 text-xs text-gray-500 space-y-1 font-semibold">
                  <p>Vendor: PLN {c.refundSplit.vendorClawback?.toFixed(2)}</p>
                  <p>Fleet: PLN {c.refundSplit.fleetClawback?.toFixed(2)}</p>
                  <p>Commission: PLN {c.refundSplit.commissionReturn?.toFixed(2)}</p>
                </div>
              )}
            </div>
          )}

          {/* Escalate */}
          {c.status !== "escalated" && c.status !== "resolved" && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-semibold text-[#2B2B2B] mb-3">Escalate</h3>
              <button onClick={escalate} disabled={saving}
                className="w-full py-2.5 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition shadow-sm">
                Escalate to Super Admin
              </button>
            </div>
          )}

          {/* Respond */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-[#2B2B2B] mb-3">{c.complainantType === "delivery_partner" ? "Delivery Partner Response" : "Customer Response"}</h3>
            {c.customerResponseSent && (
              <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-200 text-[#2B2B2B]">
                <p className="text-xs text-blue-700 font-bold mb-1">✓ Response sent {c.customerResponseAt ? new Date(c.customerResponseAt).toLocaleDateString() : ""}</p>
                <p className="text-xs text-gray-600 leading-relaxed font-semibold">{c.customerResponseMessage}</p>
              </div>
            )}
            <button onClick={() => setShowRespond(true)}
              className="w-full py-2.5 rounded-xl bg-[#F5F5F0] text-[#2B2B2B] hover:bg-gray-200 font-semibold transition flex items-center justify-center gap-2 border border-gray-300/60 shadow-sm">
              <Send className="w-4 h-4" />
              {c.customerResponseSent ? "Send Another Response" : `Respond to ${c.complainantType === "delivery_partner" ? "Delivery Partner" : "Customer"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
