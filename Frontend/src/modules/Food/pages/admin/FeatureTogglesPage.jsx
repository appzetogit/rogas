import { useState, useEffect, useCallback } from "react";
import { Zap, RotateCcw, Calendar, ChevronDown, Info, AlertTriangle, CheckCircle, MinusCircle } from "lucide-react";
import { adminClient } from "@food/api/axios";

const STATE_CONFIG = {
  on:      { label: "ON",      color: "#22c55e", bg: "#14532d" },
  off:     { label: "OFF",     color: "#ef4444", bg: "#7f1d1d" },
  partial: { label: "PARTIAL", color: "#f59e0b", bg: "#78350f" },
};

const CATEGORY_ICONS = {
  ordering: "ðŸ›’", slots: "ðŸ•", payments: "ðŸ’³", smart: "ðŸ§ ",
  delivery: "ðŸš´", driver: "ðŸ‘¤", language: "ðŸŒ",
  notifications: "ðŸ””", marketing: "ðŸ“£", fleet: "ðŸš›"
};

function ToggleButton({ state, onChange, disabled }) {
  const states = ["on", "partial", "off"];
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.on;
  return (
    <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs font-bold">
      {states.map((s) => (
        <button
          key={s}
          onClick={() => !disabled && onChange(s)}
          className="px-3 py-1.5 transition"
          style={{
            background: state === s ? STATE_CONFIG[s].bg : "#1f2937",
            color: state === s ? STATE_CONFIG[s].color : "#6b7280",
          }}
        >
          {STATE_CONFIG[s].label}
        </button>
      ))}
    </div>
  );
}

function ConfirmDialog({ toggle, newState, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-bold text-white">Confirm Toggle Change</h3>
            <p className="text-sm text-gray-400">{toggle.label}</p>
          </div>
        </div>
        <p className="text-sm text-gray-300 mb-2">
          Changing <span className="font-semibold text-white">{toggle.label}</span> from{" "}
          <span className="font-bold" style={{ color: STATE_CONFIG[toggle.state]?.color }}>{toggle.state?.toUpperCase()}</span>{" "}
          to{" "}
          <span className="font-bold" style={{ color: STATE_CONFIG[newState]?.color }}>{newState?.toUpperCase()}</span>
        </p>
        <p className="text-xs text-gray-500 mb-6">This will take effect immediately. A rollback window of 24 hours applies.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 transition font-semibold">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition font-bold">Confirm Change</button>
        </div>
      </div>
    </div>
  );
}

export default function FeatureTogglesPage() {
  const [data, setData] = useState({ categories: [], states: [], toggles: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [confirm, setConfirm] = useState(null); // { toggle, newState }
  const [expandedCats, setExpandedCats] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [scheduledFor, setScheduledFor] = useState({}); // toggleKey -> datetime
  const [feedback, setFeedback] = useState({}); // toggleId -> msg

  const load = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/feature-toggles");
      if (res?.data?.success) setData(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggleChange = (toggle, newState) => {
    setConfirm({ toggle, newState });
  };

  const confirmChange = async () => {
    if (!confirm) return;
    const { toggle, newState } = confirm;
    setSaving(prev => ({ ...prev, [toggle._id]: true }));
    setConfirm(null);
    try {
      const payload = { key: toggle.key, label: toggle.label, category: toggle.category, state: newState };
      if (scheduledFor[toggle.key]) payload.scheduledRunAt = scheduledFor[toggle.key];
      const res = await adminClient.put("/food/admin/feature-toggles", payload);
      if (res?.data?.success) {
        setData(prev => ({
          ...prev,
          toggles: prev.toggles.map(t => t._id === toggle._id ? { ...t, ...res.data.data.toggle } : t)
        }));
        setFeedback(prev => ({ ...prev, [toggle._id]: scheduledFor[toggle.key] ? "Scheduled âœ“" : "Saved âœ“" }));
        setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[toggle._id]; return n; }), 2500);
      }
    } catch (e) {
      setFeedback(prev => ({ ...prev, [toggle._id]: "Error saving" }));
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[toggle._id]; return n; });
    }
  };

  const handleRollback = async (toggle) => {
    setSaving(prev => ({ ...prev, [toggle._id]: true }));
    try {
      const res = await adminClient.post("/food/admin" + `/feature-toggles/${toggle._id}/rollback`);
      if (res?.data?.success) {
        setData(prev => ({
          ...prev,
          toggles: prev.toggles.map(t => t._id === toggle._id ? { ...t, ...res.data.data.toggle } : t)
        }));
        setFeedback(prev => ({ ...prev, [toggle._id]: "Rolled back âœ“" }));
        setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[toggle._id]; return n; }), 2500);
      }
    } catch (e) {
      setFeedback(prev => ({ ...prev, [toggle._id]: e?.response?.data?.message || "Rollback failed" }));
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[toggle._id]; return n; });
    }
  };

  const togglesByCategory = data.toggles.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  const visibleCategories = activeCategory === "all"
    ? [...new Set(data.toggles.map(t => t.category))]
    : [activeCategory];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {confirm && (
        <ConfirmDialog
          toggle={confirm.toggle}
          newState={confirm.newState}
          onConfirm={confirmChange}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Feature Toggles</h1>
              <p className="text-sm text-gray-400">Platform-wide feature flags with 24h rollback window</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800 rounded-xl px-3 py-2">
            <Info className="w-3 h-3" />
            All changes are audit-logged
          </div>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="px-6 pt-4 pb-2 flex gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${activeCategory === "all" ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
        >
          ðŸŒ All
        </button>
        {[...new Set(data.toggles.map(t => t.category))].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${activeCategory === cat ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
          >
            {CATEGORY_ICONS[cat] || "âš™ï¸"} {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Toggle groups */}
      <div className="px-6 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          visibleCategories.map(cat => {
            const toggles = togglesByCategory[cat] || [];
            const isExpanded = expandedCats[cat] !== false; // default expanded
            return (
              <div key={cat} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                {/* Category header */}
                <button
                  onClick={() => setExpandedCats(prev => ({ ...prev, [cat]: !isExpanded }))}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{CATEGORY_ICONS[cat] || "âš™ï¸"}</span>
                    <div className="text-left">
                      <h2 className="font-bold text-white capitalize">{cat}</h2>
                      <p className="text-xs text-gray-400">{toggles.length} toggles</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {["on", "partial", "off"].map(s => {
                        const count = toggles.filter(t => t.state === s).length;
                        if (count === 0) return null;
                        return (
                          <span key={s} className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: STATE_CONFIG[s].bg, color: STATE_CONFIG[s].color }}>
                            {count} {s}
                          </span>
                        );
                      })}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-800">
                    {toggles.map((toggle, idx) => {
                      const canRollback = toggle.previousState && toggle.rollbackUntil && new Date(toggle.rollbackUntil) > new Date();
                      return (
                        <div
                          key={toggle._id}
                          className={`flex items-start gap-4 px-6 py-4 ${idx < toggles.length - 1 ? "border-b border-gray-800/60" : ""}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white">{toggle.label}</p>
                              {feedback[toggle._id] && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${feedback[toggle._id].includes("Error") || feedback[toggle._id].includes("failed") ? "bg-red-900 text-red-300" : "bg-green-900 text-green-300"}`}>
                                  {feedback[toggle._id]}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 font-mono mt-0.5">{toggle.key}</p>
                            {toggle.lastChangedAt && (
                              <p className="text-xs text-gray-500 mt-1">
                                Last changed: {new Date(toggle.lastChangedAt).toLocaleString()}
                              </p>
                            )}
                          </div>

                          {/* Scheduled toggle */}
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gray-500" />
                            <input
                              type="datetime-local"
                              value={scheduledFor[toggle.key] || ""}
                              onChange={(e) => setScheduledFor(prev => ({ ...prev, [toggle.key]: e.target.value }))}
                              className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              title="Schedule for later (optional)"
                            />
                          </div>

                          <ToggleButton
                            state={toggle.state}
                            onChange={(newState) => handleToggleChange(toggle, newState)}
                            disabled={saving[toggle._id]}
                          />

                          {canRollback && (
                            <button
                              onClick={() => handleRollback(toggle)}
                              disabled={saving[toggle._id]}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-900/40 border border-amber-700/50 text-amber-400 hover:bg-amber-900/60 transition text-xs font-semibold"
                              title={`Rollback to ${toggle.previousState} (expires ${new Date(toggle.rollbackUntil).toLocaleTimeString()})`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Rollback
                            </button>
                          )}

                          {saving[toggle._id] && (
                            <div className="animate-spin w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
