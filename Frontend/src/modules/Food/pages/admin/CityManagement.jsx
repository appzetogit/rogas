import { useState, useEffect, useCallback } from "react";
import { Globe, Plus, CheckCircle, XCircle, Clock, ChevronRight, Activity } from "lucide-react";
import { adminClient } from "@food/api/axios";

const STATUS_CONFIG = {
  active:    { label: "Active",    color: "#22c55e", bg: "#14532d" },
  in_setup:  { label: "In Setup",  color: "#f59e0b", bg: "#78350f" },
  planned:   { label: "Planned",   color: "#6b7280", bg: "#1f2937" },
};

const CHECKLIST_ITEMS = [
  { key: "hasApprovedVendor", label: "At least 1 approved vendor" },
  { key: "hasApprovedDriver",  label: "At least 1 approved driver" },
  { key: "hasZone",           label: "At least 1 active zone" },
  { key: "hasGateway",        label: "Payment gateway configured" },
  { key: "hasLanguage",       label: "Language file uploaded" },
];

function CityForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "", country: "", currency: "PLN", vatRate: 23, defaultLanguage: "en",
    status: "planned", enabledLanguages: ["en", "pl"],
    ...(initial || {})
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.country) return;
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-screen">
        <h3 className="font-bold text-white text-lg mb-4">{initial ? "Edit City" : "Add New City"}</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { key: "name", label: "City Name", placeholder: "London" },
            { key: "country", label: "Country", placeholder: "United Kingdom" },
            { key: "currency", label: "Currency", placeholder: "GBP" },
            { key: "defaultLanguage", label: "Default Language", placeholder: "en" },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs text-gray-400 mb-1">{label}</label>
              <input value={form[key] || ""} onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-400 mb-1">VAT Rate (%)</label>
            <input type="number" value={form.vatRate} onChange={(e) => set("vatRate", Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.name || !form.country}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-bold disabled:opacity-50">
            {saving ? "Savingâ€¦" : "Save City"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChecklistModal({ city, checklist, onClose }) {
  const allDone = CHECKLIST_ITEMS.every(item => checklist?.[item.key]);
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-md shadow-2xl">
        <h3 className="font-bold text-white mb-1">{city.name} â€” Activation Checklist</h3>
        <p className={`text-sm mb-4 font-semibold ${allDone ? "text-green-400" : "text-amber-400"}`}>
          {allDone ? "âœ“ Ready to activate!" : "Some requirements still pending"}
        </p>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map(({ key, label }) => {
            const done = checklist?.[key];
            return (
              <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border ${done ? "border-green-800/50 bg-green-900/20" : "border-gray-700 bg-gray-800"}`}>
                {done ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                <span className={`text-sm ${done ? "text-green-300" : "text-gray-300"}`}>{label}</span>
              </div>
            );
          })}
        </div>
        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Close</button>
      </div>
    </div>
  );
}

export default function CityManagement() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editCity, setEditCity] = useState(null);
  const [checklist, setChecklist] = useState(null); // { city, data }
  const [loadingChecklist, setLoadingChecklist] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/cities");
      if (res?.data?.success) setCities(res.data.data.cities || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (form) => {
    const res = await adminClient.post("/food/admin/cities", form);
    if (res?.data?.success) { setCities(prev => [res.data.data.city, ...prev]); setShowForm(false); }
  };

  const handleUpdate = async (form) => {
    const res = await adminClient.patch("/food/admin" + `/cities/${editCity._id}`, form);
    if (res?.data?.success) {
      setCities(prev => prev.map(c => c._id === editCity._id ? res.data.data.city : c));
      setEditCity(null);
    }
  };

  const loadChecklist = async (city) => {
    setLoadingChecklist(prev => ({ ...prev, [city._id]: true }));
    try {
      const res = await adminClient.get("/food/admin" + `/cities/${city._id}/activation-checklist`);
      if (res?.data?.success) setChecklist({ city, data: res.data.data.checklist });
    } finally {
      setLoadingChecklist(prev => ({ ...prev, [city._id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {(showForm) && <CityForm onSave={handleCreate} onCancel={() => setShowForm(false)} />}
      {editCity && <CityForm initial={editCity} onSave={handleUpdate} onCancel={() => setEditCity(null)} />}
      {checklist && <ChecklistModal city={checklist.city} checklist={checklist.data} onClose={() => setChecklist(null)} />}

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">City Management</h1>
              <p className="text-sm text-gray-400">Manage cities, zones, languages, and gateways</p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-500 transition text-sm">
            <Plus className="w-4 h-4" /> Add City
          </button>
        </div>
      </div>

      {/* City grid */}
      <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-gray-900 rounded-2xl border border-gray-800 p-5 animate-pulse h-48" />
          ))
        ) : cities.length === 0 ? (
          <div className="col-span-3 flex flex-col items-center justify-center py-20 text-gray-500">
            <Globe className="w-12 h-12 mb-3" />
            <p className="font-semibold">No cities configured</p>
            <button onClick={() => setShowForm(true)} className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500">Add First City</button>
          </div>
        ) : (
          cities.map(city => {
            const cfg = STATUS_CONFIG[city.status] || STATUS_CONFIG.planned;
            const checklist_progress = city.activationChecklist;
            const doneCount = checklist_progress ? Object.values(checklist_progress).filter(Boolean).length : 0;
            const totalItems = CHECKLIST_ITEMS.length;
            return (
              <div key={city._id} className="bg-gray-900 rounded-2xl border border-gray-800 hover:border-gray-700 transition p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white text-lg">{city.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    <p className="text-sm text-gray-400">{city.country}</p>
                  </div>
                  <button onClick={() => setEditCity(city)} className="text-xs text-gray-500 hover:text-gray-300 transition">Edit</button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-xs text-gray-500">Currency</p>
                    <p className="font-bold text-white">{city.currency || "PLN"}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3">
                    <p className="text-xs text-gray-500">VAT Rate</p>
                    <p className="font-bold text-white">{city.vatRate || 0}%</p>
                  </div>
                </div>

                {/* Checklist progress */}
                {checklist_progress && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Activation progress</span>
                      <span>{doneCount}/{totalItems}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${(doneCount / totalItems) * 100}%`, background: doneCount === totalItems ? "#22c55e" : "#f59e0b" }} />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => loadChecklist(city)}
                    disabled={loadingChecklist[city._id]}
                    className="flex-1 py-2 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 text-xs font-semibold flex items-center justify-center gap-1 transition"
                  >
                    {loadingChecklist[city._id] ? <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full" /> : <Activity className="w-3 h-3" />}
                    Checklist
                  </button>
                  <button className="py-2 px-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700 transition">
                    <ChevronRight className="w-4 h-4" />
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
