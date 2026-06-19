import { useState, useEffect, useCallback } from "react";
import { Palette, Plus, Upload, Send, Globe, Eye } from "lucide-react";
import { adminClient } from "@food/api/axios";

const STATUS_COLORS = {
  draft:     { color: "#6b7280", bg: "#1f2937" },
  published: { color: "#22c55e", bg: "#14532d" },
  archived:  { color: "#9ca3af", bg: "#374151" },
};

export default function OTAConfigPage() {
  const [activeTab, setActiveTab] = useState("theme");
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ type: "theme", languageCode: "en", status: "draft", payload: {} });
  const [payloadStr, setPayloadStr] = useState("{}");
  const [payloadError, setPayloadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState({});
  const [feedback, setFeedback] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminClient.get("/food/admin/ota-configs", { params: { type: activeTab } });
      if (res?.data?.success) setConfigs(res.data.data.configs || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    let payload;
    try { payload = JSON.parse(payloadStr); setPayloadError(""); }
    catch { setPayloadError("Invalid JSON payload"); return; }
    setSaving(true);
    try {
      const res = await adminClient.post("/food/admin/ota-configs", { ...form, type: activeTab, payload });
      if (res?.data?.success) { setConfigs(prev => [res.data.data.config, ...prev]); setPayloadStr("{}"); }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const publish = async (id) => {
    setPublishing(prev => ({ ...prev, [id]: true }));
    try {
      const res = await adminClient.post("/food/admin/ota-configs/" + id + "/publish");
      if (res?.data?.success) {
        setConfigs(prev => prev.map(c => c._id === id ? res.data.data.config : c));
        setFeedback(prev => ({ ...prev, [id]: "Published!" }));
        setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[id]; return n; }), 2500);
      }
    } catch (e) {
      setFeedback(prev => ({ ...prev, [id]: e?.response?.data?.message || "Publish failed" }));
    } finally { setPublishing(prev => { const n = { ...prev }; delete n[id]; return n; }); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-600/20 flex items-center justify-center"><Palette className="w-5 h-5 text-pink-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-white">OTA Config and Theme</h1>
            <p className="text-sm text-gray-400">Push theme and language updates over-the-air</p>
          </div>
        </div>
      </div>

      <div className="px-6 pt-4 flex gap-1 border-b border-gray-800">
        {[{ key: "theme", label: "Theme Configs", icon: Palette }, { key: "language", label: "Language Packs", icon: Globe }].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={"flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition " +
              (activeTab === tab.key ? "border-pink-500 text-pink-400" : "border-transparent text-gray-400 hover:text-gray-200")}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create form */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h3 className="font-bold text-white mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-pink-400" /> New {activeTab === "theme" ? "Theme" : "Language Pack"}
          </h3>
          {activeTab === "language" && (
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Language Code</label>
              <select value={form.languageCode} onChange={e => setForm(prev => ({ ...prev, languageCode: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500">
                <option value="pl">Polish (pl)</option>
                <option value="en">English (en)</option>
                <option value="de">German (de)</option>
                <option value="fr">French (fr)</option>
              </select>
            </div>
          )}
          <div className="mb-3">
            <label className="block text-xs text-gray-400 mb-1">Payload (JSON)</label>
            <textarea rows={8} value={payloadStr} onChange={e => setPayloadStr(e.target.value)}
              className={"w-full px-3 py-2 rounded-xl bg-gray-800 border text-white text-xs font-mono focus:outline-none resize-none " +
                (payloadError ? "border-red-500 focus:ring-red-500" : "border-gray-700 focus:ring-pink-500 focus:ring-2")}
              placeholder={activeTab === "theme" ? '{\n  "primaryColor": "#3b82f6",\n  "fontFamily": "Inter"\n}' : '{\n  "app": {"name": "DailyMealBox"},\n  "common": {"save": "Zapisz", "cancel": "Anuluj"}\n}'} />
            {payloadError && <p className="text-xs text-red-400 mt-1">{payloadError}</p>}
          </div>
          <button onClick={handleCreate} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-500 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50">
            {saving ? <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Upload className="w-4 h-4" />}
            Create Draft
          </button>
        </div>

        {/* Config list */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full" /></div>
          ) : configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Palette className="w-12 h-12 mb-3" />
              <p>No {activeTab} configs yet</p>
            </div>
          ) : (
            configs.map(config => {
              const statusCfg = STATUS_COLORS[config.status] || STATUS_COLORS.draft;
              return (
                <div key={config._id} className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{ background: statusCfg.bg, color: statusCfg.color }}>
                          {config.status}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">v{config.version}</span>
                        {config.languageCode && <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">{config.languageCode}</span>}
                      </div>
                      <p className="text-xs text-gray-400">
                        Created: {config.createdAt ? new Date(config.createdAt).toLocaleString() : "-"}
                      </p>
                      {config.publishedAt && (
                        <p className="text-xs text-green-400">Published: {new Date(config.publishedAt).toLocaleString()}</p>
                      )}
                      {config.validation && !config.validation.valid && (
                        <div className="mt-2 text-xs text-amber-400">
                          Missing keys: {config.validation.missingKeys?.join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      {feedback[config._id] && (
                        <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + (feedback[config._id].includes("fail") || feedback[config._id].includes("failed") ? "text-red-400 bg-red-900/40" : "text-green-400 bg-green-900/40")}>
                          {feedback[config._id]}
                        </span>
                      )}
                      {config.status === "draft" && (
                        <button onClick={() => publish(config._id)} disabled={publishing[config._id]}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-green-700 text-white text-xs font-bold hover:bg-green-600 disabled:opacity-50">
                          {publishing[config._id] ? <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Send className="w-3 h-3" />}
                          Publish
                        </button>
                      )}
                      <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-800 text-gray-400 text-xs hover:bg-gray-700">
                        <Eye className="w-3 h-3" /> Preview
                      </button>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">View payload</summary>
                    <pre className="mt-2 text-xs text-gray-400 bg-gray-800 rounded-xl p-3 overflow-auto max-h-40 font-mono">
                      {JSON.stringify(config.payload || {}, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
