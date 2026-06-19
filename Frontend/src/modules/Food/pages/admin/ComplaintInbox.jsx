import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Filter, Search, Clock, CheckCircle2, AlertTriangle, ChevronRight, XCircle } from "lucide-react";
import { adminClient } from "@food/api/axios";
import { useNavigate } from "react-router-dom";

const STATUS_CONFIG = {
  open:       { label: "Open",       color: "#ef4444", bg: "#7f1d1d", icon: AlertTriangle },
  in_review:  { label: "In Review",  color: "#f59e0b", bg: "#78350f", icon: Clock },
  resolved:   { label: "Resolved",   color: "#22c55e", bg: "#14532d", icon: CheckCircle2 },
  escalated:  { label: "Escalated",  color: "#a855f7", bg: "#581c87", icon: AlertTriangle },
};

const CATEGORY_LABELS = {
  wrong_item: "Wrong Item", missing_item: "Missing Item", late_delivery: "Late Delivery",
  delivery_failed: "Failed Delivery", quality: "Quality Issue", payment: "Payment Issue",
  driver_behaviour: "Driver Behaviour", other: "Other",
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function ComplaintInbox() {
  const navigate = useNavigate();
  const [data, setData] = useState({ complaints: [], total: 0, statusCounts: {} });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: activeTab !== "all" ? activeTab : undefined, page, limit };
      if (search.trim()) params.search = search.trim();
      const res = await adminClient.get("/food/admin/complaints", { params });
      if (res?.data?.success) setData(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, page]);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { key: "open", label: "Open" },
    { key: "in_review", label: "In Review" },
    { key: "escalated", label: "Escalated" },
    { key: "resolved", label: "Resolved" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Complaint Inbox</h1>
              <p className="text-sm text-gray-400">Customer & vendor complaint management</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              placeholder="Search ref, subjectâ€¦"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 pr-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="px-6 pt-4 pb-0 flex gap-1 border-b border-gray-800">
        {tabs.map(tab => {
          const count = tab.key === "all" ? data.total : (data.statusCounts[tab.key] || 0);
          const isActive = activeTab === tab.key;
          const cfg = STATUS_CONFIG[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${isActive ? "border-blue-500 text-blue-400" : "border-transparent text-gray-400 hover:text-gray-200"}`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={cfg ? { background: cfg.bg, color: cfg.color } : { background: "#374151", color: "#d1d5db" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Complaint List */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full" />
          </div>
        ) : data.complaints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="font-semibold">No complaints found</p>
            <p className="text-sm mt-1">Adjust filters or check back later</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.complaints.map((c) => (
              <button
                key={c._id}
                onClick={() => navigate(`/admin/food/complaints/${c._id}`)}
                className="w-full text-left bg-gray-900 rounded-2xl border border-gray-800 hover:border-gray-700 hover:bg-gray-900/80 transition p-5 group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-gray-500 font-mono">{c.complaintRef}</span>
                      <span className="text-xs text-gray-600">â€¢</span>
                      <span className="text-xs text-gray-500">{CATEGORY_LABELS[c.category] || "Other"}</span>
                    </div>
                    <p className="font-semibold text-white truncate">{c.subject || c.message?.substring(0, 80) || "No subject"}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>ðŸ‘¤ {c.customerId?.name || "Unknown"} ({c.customerId?.phone || "-"})</span>
                      {c.vendorId && <span>ðŸª {c.vendorId.restaurantName}</span>}
                      {c.driverId && <span>ðŸš´ {c.driverId.name}</span>}
                      <span className="ml-auto">{new Date(c.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {c.refundAmount > 0 && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">
                          ðŸ’° Refund: PLN {c.refundAmount.toFixed(2)} Â· {c.refundStatus}
                        </span>
                      </div>
                    )}
                    {c.assignedAgentId && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs text-blue-400">
                        ðŸ§‘â€ðŸ’¼ Assigned: {c.assignedAgentName || c.assignedAgentId.name}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data.total > limit && (
          <div className="flex items-center justify-between mt-6 px-1">
            <p className="text-sm text-gray-400">
              Showing {(page - 1) * limit + 1}â€“{Math.min(page * limit, data.total)} of {data.total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700 transition text-sm font-semibold">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= data.total} className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700 transition text-sm font-semibold">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
