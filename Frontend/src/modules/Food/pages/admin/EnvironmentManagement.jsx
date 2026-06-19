import { useState, useEffect, useCallback } from "react";
import { Database, Plus, Save, AlertTriangle } from "lucide-react";
import { adminClient } from "@food/api/axios";

const ENVS = [
  { key: "prod", label: "Production", color: "#ef4444", icon: "P" },
  { key: "qa",   label: "QA / Staging", color: "#f59e0b", icon: "Q" },
  { key: "dev",  label: "Development",  color: "#22c55e", icon: "D" },
];

export default function EnvironmentManagement() {
  const [envData, setEnvData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [forms, setForms] = useState({});
  const [feedback, setFeedback] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/environments");
      if (res?.data?.success) {
        const map = {};
        const f = {};
        (res.data.data.environments || []).forEach(env => {
          map[env.environment] = env;
          f[env.environment] = { ...env };
        });
        ENVS.forEach(e => { if (!f[e.key]) f[e.key] = { environment: e.key, isActive: false, apiBaseUrl: "", adminBaseUrl: "", appVersion: "", releaseChannel: "stable", maintenanceMode: false }; });
        setEnvData(map);
        setForms(f);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setF = (env, key, val) => setForms(prev => ({ ...prev, [env]: { ...prev[env], [key]: val } }));

  const save = async (envKey) => {
    setSaving(prev => ({ ...prev, [envKey]: true }));
    try {
      const res = await adminClient.put("/food/admin/environments", forms[envKey]);
      if (res?.data?.success) {
        setEnvData(prev => ({ ...prev, [envKey]: res.data.data.environment }));
        setFeedback(prev => ({ ...prev, [envKey]: "Saved" }));
        setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[envKey]; return n; }), 2000);
      }
    } catch (e) {
      setFeedback(prev => ({ ...prev, [envKey]: "Error saving" }));
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[envKey]; return n; });
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-600/20 flex items-center justify-center"><Database className="w-5 h-5 text-gray-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-white">Environment Management</h1>
            <p className="text-sm text-gray-400">Configure dev, QA and production environments</p>
          </div>
        </div>
      </div>
      <div className="px-6 py-6 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-gray-500 border-t-transparent rounded-full" /></div>
        ) : (
          ENVS.map(env => {
            const f = forms[env.key] || {};
            return (
              <div key={env.key} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="flex items-center gap-4 p-5 border-b border-gray-800">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm" style={{ background: env.color + "22", color: env.color }}>{env.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white">{env.label}</h3>
                    {envData[env.key]?.updatedAt && <p className="text-xs text-gray-500">Last updated: {new Date(envData[env.key].updatedAt).toLocaleString()}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {feedback[env.key] && (
                      <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + (feedback[env.key] === "Saved" ? "text-green-400 bg-green-900/40" : "text-red-400 bg-red-900/40")}>
                        {feedback[env.key]}
                      </span>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-gray-400">Active</span>
                      <div onClick={() => setF(env.key, "isActive", !f.isActive)} className={"w-10 h-5 rounded-full transition relative cursor-pointer " + (f.isActive ? "bg-green-600" : "bg-gray-700")}>
                        <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all " + (f.isActive ? "left-5" : "left-0.5")} />
                      </div>
                    </label>
                    {f.maintenanceMode && (
                      <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded-full font-semibold">
                        <AlertTriangle className="w-3 h-3" /> Maintenance
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: "apiBaseUrl",   label: "API Base URL",   ph: "https://api.example.com" },
                    { key: "adminBaseUrl", label: "Admin Base URL", ph: "https://admin.example.com" },
                    { key: "appVersion",   label: "App Version",    ph: "1.0.0" },
                    { key: "releaseChannel", label: "Release Channel", ph: "stable" },
                  ].map(({ key, label, ph }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-400 mb-1">{label}</label>
                      <input value={f[key] || ""} onChange={e => setF(env.key, key, e.target.value)} placeholder={ph}
                        className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-600" />
                    </div>
                  ))}
                  <div className="flex items-center gap-3 md:col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div onClick={() => setF(env.key, "maintenanceMode", !f.maintenanceMode)} className={"w-10 h-5 rounded-full transition relative cursor-pointer " + (f.maintenanceMode ? "bg-amber-600" : "bg-gray-700")}>
                        <div className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all " + (f.maintenanceMode ? "left-5" : "left-0.5")} />
                      </div>
                      <span className="text-sm text-gray-300">Maintenance Mode</span>
                    </label>
                    {f.maintenanceMode && <p className="text-xs text-amber-400">App will show maintenance page to users</p>}
                  </div>
                </div>
                <div className="px-5 pb-4 flex justify-end">
                  <button onClick={() => save(env.key)} disabled={saving[env.key]}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 text-sm disabled:opacity-50">
                    {saving[env.key] ? <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Save className="w-4 h-4" />}
                    Save {env.label}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
