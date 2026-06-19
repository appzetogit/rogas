import { useState, useEffect, useCallback } from "react";
import { Receipt, TrendingUp, TrendingDown, FileDown, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { adminClient } from "@food/api/axios";

const INVOICE_STATUS = {
  draft:     { label: "Draft",     color: "#6b7280", bg: "#1f2937" },
  submitted: { label: "Submitted", color: "#3b82f6", bg: "#1e3a5f" },
  approved:  { label: "Approved",  color: "#22c55e", bg: "#14532d" },
  rejected:  { label: "Rejected",  color: "#ef4444", bg: "#7f1d1d" },
  paid:      { label: "Paid",      color: "#8b5cf6", bg: "#4c1d95" },
};

function InvoiceStatusBadge({ status }) {
  const cfg = INVOICE_STATUS[status] || INVOICE_STATUS.draft;
  return <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}

function VatReportCard({ report }) {
  if (!report) return null;
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
      <h3 className="font-bold text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" /> VAT Report Summary</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[
          { label: "Revenue (PLN)", value: report.customerOutput?.grossRevenue?.toFixed(2), color: "#22c55e" },
          { label: "VAT Collected", value: report.customerOutput?.vatCollected?.toFixed(2), color: "#3b82f6" },
          { label: "Fleet VAT Paid", value: report.fleetInput?.vatPaid?.toFixed(2), color: "#f59e0b" },
          { label: "Net VAT Position", value: report.netVatPosition?.toFixed(2), color: report.netVatPosition >= 0 ? "#22c55e" : "#ef4444" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <p className="text-xl font-bold" style={{ color }}>{value !== undefined ? `PLN ${value}` : "â€“"}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs text-gray-400">
        <div className="bg-gray-800 rounded-xl p-3">
          <p className="mb-1 text-gray-500">Orders</p>
          <p className="font-semibold text-white">{report.customerOutput?.orderCount ?? 0}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3">
          <p className="mb-1 text-gray-500">Fleet Invoices</p>
          <p className="font-semibold text-white">{report.fleetInput?.invoiceCount ?? 0}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3">
          <p className="mb-1 text-gray-500">Refunds</p>
          <p className="font-semibold text-white">PLN {report.refundAdjustment?.totalRefunded?.toFixed(2) ?? "0.00"}</p>
        </div>
      </div>
    </div>
  );
}

export default function FinancialManagement() {
  const [invoices, setInvoices] = useState([]);
  const [vatReport, setVatReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("invoices");
  const [vatFrom, setVatFrom] = useState("");
  const [vatTo, setVatTo] = useState("");
  const [loadingVat, setLoadingVat] = useState(false);
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [actionLoading, setActionLoading] = useState({});

  const loadInvoices = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/fleet/invoices", { params: { status: statusFilter !== "all" ? statusFilter : undefined } });
      if (res?.data?.success) setInvoices(res.data.data.invoices || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const loadVatReport = async () => {
    setLoadingVat(true);
    try {
      const params = {};
      if (vatFrom) params.from = vatFrom;
      if (vatTo) params.to = vatTo;
      const res = await adminClient.get("/food/admin/reports/vat", { params });
      if (res?.data?.success) setVatReport(res.data.data);
    } catch (e) { console.error(e); }
    finally { setLoadingVat(false); }
  };

  useEffect(() => { if (activeTab === "vat") loadVatReport(); }, [activeTab]);

  const invoiceAction = async (id, action, body = {}) => {
    setActionLoading(prev => ({ ...prev, [id]: action }));
    try {
      const res = await adminClient.patch("/food/admin" + `/fleet/invoices/${id}/${action}`, body);
      if (res?.data?.success) {
        setInvoices(prev => prev.map(inv => inv._id === id ? res.data.data.invoice : inv));
      }
    } catch (e) { console.error(e); }
    finally { setActionLoading(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Financial Management</h1>
            <p className="text-sm text-gray-400">Fleet invoices Â· VAT reports Â· Payouts (PLN)</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex gap-1 border-b border-gray-800">
        {[
          { key: "invoices", label: "Fleet Invoices" },
          { key: "vat", label: "VAT Report" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === tab.key ? "border-green-500 text-green-400" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-6 py-6">
        {activeTab === "invoices" && (
          <>
            {/* Status filter */}
            <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-none pb-1">
              {["all", "submitted", "approved", "paid", "rejected"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${statusFilter === s ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {s === "all" ? "All" : INVOICE_STATUS[s]?.label || s}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" /></div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Receipt className="w-12 h-12 mb-3" />
                <p className="font-semibold">No invoices found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {invoices.map((inv) => (
                  <div key={inv._id} className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <InvoiceStatusBadge status={inv.status} />
                          <span className="font-mono text-xs text-gray-500">{inv.invoiceRef}</span>
                        </div>
                        <h3 className="font-bold text-white">{inv.fleetPartnerId?.companyName || "Fleet Partner"}</h3>
                        <p className="text-sm text-gray-400">{inv.fleetPartnerId?.city}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-white">PLN {(inv.totalAmount || 0).toFixed(2)}</p>
                        <p className="text-xs text-gray-400">incl. {(inv.vatRate * 100).toFixed(0)}% VAT (PLN {(inv.vatAmount || 0).toFixed(2)})</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                      <div className="bg-gray-800 rounded-xl p-2.5">
                        <p className="text-xs text-gray-500">Period</p>
                        <p className="text-white text-xs">{inv.weekStartDate ? new Date(inv.weekStartDate).toLocaleDateString("en-GB") : "-"} â€” {inv.weekEndDate ? new Date(inv.weekEndDate).toLocaleDateString("en-GB") : "-"}</p>
                      </div>
                      <div className="bg-gray-800 rounded-xl p-2.5">
                        <p className="text-xs text-gray-500">Deliveries</p>
                        <p className="text-white font-semibold">{inv.totalDeliveries || 0}</p>
                      </div>
                      <div className="bg-gray-800 rounded-xl p-2.5">
                        <p className="text-xs text-gray-500">Gross Fee</p>
                        <p className="text-white font-semibold">PLN {(inv.grossServiceFee || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {inv.status === "submitted" && (
                        <>
                          <button onClick={() => invoiceAction(inv._id, "approve")} disabled={!!actionLoading[inv._id]}
                            className="px-4 py-2 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-600 transition disabled:opacity-50 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => invoiceAction(inv._id, "reject", { reason: "Review required" })} disabled={!!actionLoading[inv._id]}
                            className="px-4 py-2 rounded-xl bg-red-900/60 text-red-300 text-xs font-bold hover:bg-red-900 transition disabled:opacity-50 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                      {inv.status === "approved" && (
                        <button onClick={() => invoiceAction(inv._id, "paid", { paymentRef: `PAY-${Date.now()}` })} disabled={!!actionLoading[inv._id]}
                          className="px-4 py-2 rounded-xl bg-purple-700 text-white text-xs font-bold hover:bg-purple-600 transition disabled:opacity-50 flex items-center gap-1">
                          <Receipt className="w-3 h-3" /> Mark Paid
                        </button>
                      )}
                      {actionLoading[inv._id] && <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mt-1" />}
                    </div>

                    {inv.accountantNote && (
                      <p className="mt-2 text-xs text-gray-400 italic">Note: {inv.accountantNote}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "vat" && (
          <div className="space-y-5">
            {/* Date range filter */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
              <h3 className="font-semibold text-white mb-3">Report Period</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">From</label>
                  <input type="date" value={vatFrom} onChange={(e) => setVatFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">To</label>
                  <input type="date" value={vatTo} onChange={(e) => setVatTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <button onClick={loadVatReport} disabled={loadingVat}
                  className="mt-5 px-5 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500 transition flex items-center gap-2 text-sm disabled:opacity-50">
                  {loadingVat ? <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <RefreshCw className="w-4 h-4" />}
                  Generate
                </button>
              </div>
            </div>
            <VatReportCard report={vatReport} />
          </div>
        )}
      </div>
    </div>
  );
}
