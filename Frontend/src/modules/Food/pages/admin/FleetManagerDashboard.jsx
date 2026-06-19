import { useState, useEffect, useCallback } from "react";
import { Truck, Users, FileText, CheckCircle2, XCircle, AlertTriangle, Plus, Building2 } from "lucide-react";
import { adminClient } from "@food/api/axios";

const STATUS_CONFIG = {
  active:    { label: "Active",    color: "#22c55e", bg: "#14532d" },
  suspended: { label: "Suspended", color: "#ef4444", bg: "#7f1d1d" },
  pending:   { label: "Pending",   color: "#f59e0b", bg: "#78350f" },
};

const DOC_STATUS = {
  pending_review: { label: "Pending Review", color: "#f59e0b" },
  approved:       { label: "Approved",       color: "#22c55e" },
  rejected:       { label: "Rejected",       color: "#ef4444" },
  needs_reupload: { label: "Needs Reupload", color: "#a855f7" },
  expired:        { label: "Expired",        color: "#6b7280" },
};

function FleetDashboard({ stats }) {
  const cards = [
    { label: "Total Partners",  value: stats?.partnersTotal ?? "-",  color: "#3b82f6" },
    { label: "Active Partners", value: stats?.partnersActive ?? "-", color: "#22c55e" },
    { label: "Total Drivers",   value: stats?.driversTotal ?? "-",   color: "#8b5cf6" },
    { label: "Pending Docs",    value: stats?.pendingDocs ?? "-",    color: "#f59e0b" },
    { label: "Expiring Docs",   value: stats?.expiringDocs ?? "-",   color: "#ef4444" },
    { label: "Pending Invoices",value: stats?.pendingInvoices ?? "-",color: "#f97316" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
      {cards.map(({ label, value, color }) => (
        <div key={label} className="bg-gray-900 rounded-2xl border border-gray-800 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}22` }}>
            <div className="w-3 h-3 rounded-full" style={{ background: color }} />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FleetManagerDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [partners, setPartners] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [newPartner, setNewPartner] = useState({ companyName: "", city: "", nip: "", bankIban: "", contactName: "", contactPhone: "", contactEmail: "" });
  const [docFilter, setDocFilter] = useState("pending_review");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, partnerRes, docRes] = await Promise.all([
        adminClient.get("/food/admin/fleet/dashboard"),
        adminClient.get("/food/admin/fleet/partners"),
        adminClient.get("/food/admin/fleet/driver-documents", { params: { status: docFilter !== "all" ? docFilter : undefined } }),
      ]);
      if (dashRes?.data?.success) setStats(dashRes.data.data);
      if (partnerRes?.data?.success) setPartners(partnerRes.data.data.partners || []);
      if (docRes?.data?.success) setDocuments(docRes.data.data.documents || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [docFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const updatePartnerStatus = async (id, status) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await adminClient.patch("/food/admin" + `/fleet/partners/${id}/status`, { status });
      if (res?.data?.success) setPartners(prev => prev.map(p => p._id === id ? res.data.data.partner : p));
    } finally { setActionLoading(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  const reviewDocument = async (id, status, reason = "") => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await adminClient.patch("/food/admin" + `/fleet/driver-documents/${id}/review`, { status, reason });
      if (res?.data?.success) setDocuments(prev => prev.map(d => d._id === id ? res.data.data.document : d));
    } finally { setActionLoading(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  const createPartner = async () => {
    try {
      const res = await adminClient.post("/food/admin/fleet/partners", newPartner);
      if (res?.data?.success) {
        setPartners(prev => [res.data.data.partner, ...prev]);
        setShowAddPartner(false);
        setNewPartner({ companyName: "", city: "", nip: "", bankIban: "", contactName: "", contactPhone: "", contactEmail: "" });
      }
    } catch (e) { console.error(e); }
  };

  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: Truck },
    { key: "partners",  label: "Partners",  icon: Building2 },
    { key: "documents", label: "Driver Docs", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Add Partner Modal */}
      {showAddPartner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-lg shadow-2xl">
            <h3 className="font-bold text-white mb-4">Add Fleet Partner</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                ["companyName", "Company Name"],
                ["city", "City"],
                ["nip", "NIP (Tax ID)"],
                ["bankIban", "Bank IBAN"],
                ["contactName", "Contact Name"],
                ["contactPhone", "Contact Phone"],
                ["contactEmail", "Contact Email"],
              ].map(([key, label]) => (
                <div key={key} className={key === "companyName" || key === "bankIban" || key === "contactEmail" ? "col-span-2" : ""}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input value={newPartner[key]} onChange={e => setNewPartner(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAddPartner(false)} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Cancel</button>
              <button onClick={createPartner} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-bold">Add Partner</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Fleet Management</h1>
              <p className="text-sm text-gray-400">Partners Â· Documents Â· Compliance</p>
            </div>
          </div>
          {activeTab === "partners" && (
            <button onClick={() => setShowAddPartner(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-500 text-sm">
              <Plus className="w-4 h-4" /> Add Partner
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex gap-1 border-b border-gray-800">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === key ? "border-orange-500 text-orange-400" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
          </div>
        ) : activeTab === "dashboard" ? (
          <FleetDashboard stats={stats} />
        ) : activeTab === "partners" ? (
          <div className="space-y-3">
            {partners.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Building2 className="w-12 h-12 mb-3" />
                <p className="font-semibold">No fleet partners yet</p>
                <button onClick={() => setShowAddPartner(true)} className="mt-4 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold">Add First Partner</button>
              </div>
            ) : (
              partners.map(p => {
                const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.active;
                return (
                  <div key={p._id} className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-white">{p.companyName}</h3>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                        </div>
                        <p className="text-sm text-gray-400">{p.city} Â· NIP: {p.nip || "â€”"}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-400">
                          <p>ðŸ“§ {p.contactEmail || "â€”"}</p>
                          <p>ðŸ“ž {p.contactPhone || "â€”"}</p>
                          <p>ðŸ¦ {p.bankIban || "â€”"}</p>
                          <p>VAT: {(p.deliveryVatRate * 100 || 23).toFixed(0)}%</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {p.status !== "active" && (
                          <button onClick={() => updatePartnerStatus(p._id, "active")} disabled={actionLoading[p._id]}
                            className="px-3 py-1.5 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-600 disabled:opacity-50">Activate</button>
                        )}
                        {p.status !== "suspended" && (
                          <button onClick={() => updatePartnerStatus(p._id, "suspended")} disabled={actionLoading[p._id]}
                            className="px-3 py-1.5 rounded-xl bg-red-900/60 text-red-300 text-xs font-bold hover:bg-red-900 disabled:opacity-50">Suspend</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Documents tab */
          <div>
            <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none pb-1">
              {["all", "pending_review", "approved", "rejected", "needs_reupload", "expired"].map(s => (
                <button key={s} onClick={() => setDocFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${docFilter === s ? "bg-orange-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {s === "all" ? "All" : DOC_STATUS[s]?.label || s}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <FileText className="w-12 h-12 mb-3" />
                  <p>No documents found</p>
                </div>
              ) : (
                documents.map(doc => {
                  const docCfg = DOC_STATUS[doc.status] || DOC_STATUS.pending_review;
                  return (
                    <div key={doc._id} className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-white capitalize">{doc.documentType?.replace(/_/g, " ")}</span>
                            <span className="text-xs font-bold" style={{ color: docCfg.color }}>â— {docCfg.label}</span>
                          </div>
                          <p className="text-sm text-gray-400">Driver: {doc.driverId?.name || "â€”"} Â· {doc.driverId?.phone || ""}</p>
                          {doc.fleetPartnerId && <p className="text-xs text-gray-500 mt-1">ðŸš› {doc.fleetPartnerId.companyName}</p>}
                          {doc.expiryDate && (
                            <p className={`text-xs mt-1 ${new Date(doc.expiryDate) < new Date() ? "text-red-400" : "text-gray-400"}`}>
                              Expires: {new Date(doc.expiryDate).toLocaleDateString("en-GB")}
                            </p>
                          )}
                          {doc.documentUrl && (
                            <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline mt-1 block">View Document</a>
                          )}
                        </div>
                        {doc.status === "pending_review" && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={() => reviewDocument(doc._id, "approved")} disabled={actionLoading[doc._id]}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-600 disabled:opacity-50">
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                            <button onClick={() => reviewDocument(doc._id, "rejected", "Does not meet requirements")} disabled={actionLoading[doc._id]}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-900/60 text-red-300 text-xs font-bold hover:bg-red-900 disabled:opacity-50">
                              <XCircle className="w-3 h-3" /> Reject
                            </button>
                            <button onClick={() => reviewDocument(doc._id, "needs_reupload", "Please resubmit a clearer photo")} disabled={actionLoading[doc._id]}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-900/60 text-purple-300 text-xs font-bold hover:bg-purple-900 disabled:opacity-50">
                              <AlertTriangle className="w-3 h-3" /> Reupload
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
