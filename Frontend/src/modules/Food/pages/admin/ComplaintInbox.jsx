import { useState, useEffect, useCallback, useRef } from "react";
import { MessageSquare, Search, Clock, CheckCircle2, AlertTriangle, ChevronRight, User, ShoppingBag, Truck } from "lucide-react";
import { adminClient } from "@food/api/axios";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import io from "socket.io-client";

const STATUS_CONFIG = {
  open:       { label: "Open",       color: "#dc2626", bg: "#fef2f2", icon: AlertTriangle },
  in_review:  { label: "In Review",  color: "#d97706", bg: "#fffbeb", icon: Clock },
  resolved:   { label: "Resolved",   color: "#16a34a", bg: "#f0fdf4", icon: CheckCircle2 },
  escalated:  { label: "Escalated",  color: "#9333ea", bg: "#faf5ff", icon: AlertTriangle },
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

  const activeTabRef = useRef(activeTab);
  const searchRef = useRef(search);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { searchRef.current = search; }, [search]);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";
    const socket = io(backendUrl, {
      transports: ["websocket", "polling"],
      auth: { token: localStorage.getItem("admin_accessToken") || localStorage.getItem("token") }
    });

    socket.on("connect", () => {
      console.log("ComplaintInbox socket connected");
    });

    socket.on("new_complaint", (complaint) => {
      setData((prev) => {
        const currentActiveTab = activeTabRef.current;
        const currentSearch = searchRef.current.trim().toLowerCase();

        const matchesStatus = currentActiveTab === "all" || currentActiveTab === complaint.status;
        const matchesSearch = !currentSearch || 
          complaint.complaintRef?.toLowerCase().includes(currentSearch) || 
          complaint.subject?.toLowerCase().includes(currentSearch) ||
          complaint.message?.toLowerCase().includes(currentSearch);

        let newComplaints = prev.complaints;
        if (matchesStatus && matchesSearch) {
          if (!prev.complaints.some((c) => c._id === complaint._id)) {
            newComplaints = [complaint, ...prev.complaints];
          }
        }

        const newStatusCounts = { ...prev.statusCounts };
        newStatusCounts[complaint.status] = (newStatusCounts[complaint.status] || 0) + 1;

        return {
          ...prev,
          complaints: newComplaints,
          total: prev.total + 1,
          statusCounts: newStatusCounts
        };
      });

      toast.success(`New complaint received: ${complaint.complaintRef || "C-NEW"}`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const tabs = [
    { key: "open", label: "Open" },
    { key: "in_review", label: "In Review" },
    { key: "escalated", label: "Escalated" },
    { key: "resolved", label: "Resolved" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#2B2B2B] pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1F7A63]/15 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-[#1F7A63]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#2B2B2B]">Complaint Inbox</h1>
              <p className="text-sm text-gray-500">Customer & vendor complaint management</p>
            </div>
          </div>
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              placeholder="Search ref, subject..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#F5F5F0] border border-gray-300 text-sm text-[#2B2B2B] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1F7A63]"
            />
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="px-6 pt-4 pb-0 flex gap-1 border-b border-gray-200 bg-white shadow-sm overflow-x-auto scrollbar-none">
        {tabs.map(tab => {
          const count = tab.key === "all" ? data.total : (data.statusCounts[tab.key] || 0);
          const isActive = activeTab === tab.key;
          const cfg = STATUS_CONFIG[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap ${isActive ? "border-[#1F7A63] text-[#1F7A63]" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={cfg ? { background: cfg.bg, color: cfg.color } : { background: "#e5e7eb", color: "#4b5563" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Complaint List */}
      <div className="px-6 py-6 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-[#1F7A63] border-t-transparent rounded-full" />
          </div>
        ) : data.complaints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-200">
            <MessageSquare className="w-12 h-12 mb-3 text-gray-300" />
            <p className="font-semibold text-gray-500">No complaints found</p>
            <p className="text-sm mt-1">Adjust filters or check back later</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Number / ID</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-[#2B2B2B]">
                  {data.complaints.map((c) => (
                    <tr 
                      key={c._id} 
                      onClick={() => navigate(`/admin/food/complaints/${c._id}`)}
                      className="hover:bg-slate-50 transition cursor-pointer"
                    >
                      <td className="px-6 py-4 font-mono text-xs font-bold text-[#1F7A63]">
                        {c.complaintRef || `#${String(c._id).slice(-6)}`}
                      </td>
                      <td className="px-6 py-4 font-semibold">
                        {c.complainantType === "delivery_partner" ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">{c.driverId?.name || "Unknown"}</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider w-max mt-0.5">Rider</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800">{c.customerId?.name || "Unknown"}</span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider w-max mt-0.5">Customer</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-medium">
                        {c.complainantType === "delivery_partner" ? (
                          <div className="flex flex-col">
                            <span>{c.driverId?.phone || "-"}</span>
                            {c.driverId?._id && <span className="text-[10px] text-gray-400 font-mono">ID: {String(c.driverId._id).slice(-6).toUpperCase()}</span>}
                          </div>
                        ) : (
                          c.customerId?.phone || "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-xs">
                        {new Date(c.createdAt).toLocaleDateString("en-GB", { 
                          day: "2-digit", 
                          month: "short", 
                          year: "numeric", 
                          hour: "2-digit", 
                          minute: "2-digit" 
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-[#1F7A63] hover:text-[#155a49] font-bold inline-flex items-center gap-1 text-xs bg-[#1F7A63]/10 px-3 py-1.5 rounded-lg transition">
                          View
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {data.total > limit && (
          <div className="flex items-center justify-between mt-6 px-1">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1} - {Math.min(page * limit, data.total)} of {data.total}
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(p - 1, 1))} 
                disabled={page === 1} 
                className="px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition text-sm font-semibold shadow-sm"
              >
                Prev
              </button>
              <button 
                onClick={() => setPage(p => p + 1)} 
                disabled={page * limit >= data.total} 
                className="px-4 py-2 rounded-xl bg-white border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition text-sm font-semibold shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
