import { useState, useEffect, useCallback } from "react";
import { FileText, Search, Filter, ChevronDown, Clock } from "lucide-react";
import { adminClient } from "@food/api/axios";

const ACTION_COLORS = {
  create: "#22c55e", update: "#3b82f6", delete: "#ef4444",
  approve: "#22c55e", reject: "#ef4444", refund: "#f59e0b",
  escalate: "#a855f7", login: "#6b7280", publish: "#06b6d4",
};

function getActionColor(action = "") {
  const verb = action.split(".")[0];
  return ACTION_COLORS[verb] || "#6b7280";
}

function DiffView({ before, after }) {
  if (!before && !after) return null;
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changed = [...allKeys].filter(k => {
    const b = JSON.stringify((before || {})[k]);
    const a = JSON.stringify((after || {})[k]);
    return b !== a && !["updatedAt", "__v", "password"].includes(k);
  });
  if (changed.length === 0) return <p className="text-xs text-gray-500 mt-2">No field changes detected</p>;
  return (
    <div className="mt-3 space-y-2">
      {changed.map(key => (
        <div key={key} className="text-xs font-mono bg-gray-800 rounded-xl p-3 border border-gray-700">
          <p className="text-gray-400 mb-1 font-semibold">{key}</p>
          <div className="flex gap-2">
            {before?.[key] !== undefined && (
              <div className="flex-1 bg-red-900/30 rounded-lg p-2">
                <span className="text-red-400 text-xs">Before: </span>
                <span className="text-red-300">{JSON.stringify(before[key])}</span>
              </div>
            )}
            {after?.[key] !== undefined && (
              <div className="flex-1 bg-green-900/30 rounded-lg p-2">
                <span className="text-green-400 text-xs">After: </span>
                <span className="text-green-300">{JSON.stringify(after[key])}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search.trim()) params.search = search.trim();
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entity = entityFilter;
      const res = await adminClient.get("/food/admin/audit-logs", { params });
      if (res?.data?.success) {
        setLogs(res.data.data.logs || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search, actionFilter, entityFilter]);

  useEffect(() => { load(); }, [load]);

  const COMMON_ACTIONS = [
    "complaint.create", "complaint.status.resolved", "complaint.refund.issue", "complaint.escalate",
    "fleetInvoice.approve", "fleetInvoice.reject", "fleetInvoice.paid",
    "admin.employee.create", "admin.employee.update", "admin.employee.deactivate",
    "featureToggle.upsert", "city.create", "city.update",
  ];

  const ENTITY_TYPES = [
    "AdminComplaint", "FleetInvoice", "FoodAdmin", "FeatureToggle",
    "AdminCity", "FoodOrder", "OTAConfig", "IntegrationSetting",
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-600/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Audit Logs</h1>
              <p className="text-sm text-gray-400">Complete record of all admin actions Â· {total} entries</p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              placeholder="Search logs..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 pr-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 w-64"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pt-4 pb-3 flex gap-3 flex-wrap border-b border-gray-800">
        <select
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <option value="">All Actions</option>
          {COMMON_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          <option value="">All Entities</option>
          {ENTITY_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        {(actionFilter || entityFilter || search) && (
          <button
            onClick={() => { setActionFilter(""); setEntityFilter(""); setSearch(""); setPage(1); }}
            className="px-3 py-1.5 rounded-xl bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm font-semibold transition"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500 self-center">
          {total} total Â· page {page} of {Math.ceil(total / limit) || 1}
        </span>
      </div>

      {/* Log entries */}
      <div className="px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-gray-500 border-t-transparent rounded-full" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <FileText className="w-12 h-12 mb-3" />
            <p className="font-semibold">No audit logs found</p>
            <p className="text-sm mt-1">Admin actions will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const isExpanded = expandedId === log._id;
              const actionColor = getActionColor(log.action);
              return (
                <div key={log._id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log._id)}
                    className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-gray-800/40 transition"
                  >
                    {/* Action dot */}
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: actionColor }} />

                    {/* Action */}
                    <span className="font-mono text-xs font-bold w-64 truncate" style={{ color: actionColor }}>
                      {log.action}
                    </span>

                    {/* Entity */}
                    <span className="text-xs text-gray-400 w-40 truncate">
                      {log.entity}{log.entityId ? ` Â· ${String(log.entityId).slice(-6)}` : ""}
                    </span>

                    {/* Admin */}
                    <span className="text-xs text-gray-300 flex-1 truncate">
                      {log.adminId?.name || log.adminId?.email || "System"}
                      {log.adminId?.adminRole && (
                        <span className="ml-1 text-gray-500">({log.adminId.adminRole})</span>
                      )}
                    </span>

                    {/* Time */}
                    <span className="text-xs text-gray-500 shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.createdAt ? new Date(log.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "â€”"}
                    </span>

                    <ChevronDown className={"w-4 h-4 text-gray-600 transition-transform shrink-0 " + (isExpanded ? "rotate-180" : "")} />
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-gray-800 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                        <div>
                          <p className="text-gray-500 mb-0.5">Action</p>
                          <p className="font-mono font-bold" style={{ color: actionColor }}>{log.action}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-0.5">Entity</p>
                          <p className="text-gray-300">{log.entity}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-0.5">Admin</p>
                          <p className="text-gray-300">{log.adminId?.name || "â€”"}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 mb-0.5">IP</p>
                          <p className="font-mono text-gray-400">{log.ipAddress || "â€”"}</p>
                        </div>
                      </div>
                      {log.note && (
                        <div className="mb-3 px-3 py-2 rounded-xl bg-gray-800 text-xs text-gray-300">
                          <span className="text-gray-500">Note: </span>{log.note}
                        </div>
                      )}
                      <DiffView before={log.before} after={log.after} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between mt-5 px-1">
            <p className="text-sm text-gray-400">
              Showing {(page - 1) * limit + 1}â€“{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1}
                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700 transition text-sm font-semibold">
                Prev
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * limit >= total}
                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-300 disabled:opacity-40 hover:bg-gray-700 transition text-sm font-semibold">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
