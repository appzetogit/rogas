import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Globe,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Map as MapIcon,
  Activity,
  Edit3,
  X,
  Sparkles,
  Building2,
  MapPin,
  Search,
  Filter,
  Layers,
  Check,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Info,
  ChevronRight,
  Percent,
  Banknote,
  Languages,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { adminClient } from "@food/api/axios";

const STATUS_CONFIG = {
  active: {
    label: "Active",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-500/20",
    dot: "bg-emerald-500",
    description: "Fully operational with live delivery service",
  },
  in_setup: {
    label: "In Setup",
    badge: "bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-500/20",
    dot: "bg-amber-500",
    description: "Configuring zones, partners, or payment gateways",
  },
  planned: {
    label: "Planned",
    badge: "bg-slate-100 text-slate-700 border-slate-200 ring-1 ring-slate-400/20",
    dot: "bg-slate-400",
    description: "Pre-launch preparation and feasibility",
  },
  inactive: {
    label: "Inactive",
    badge: "bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-500/20",
    dot: "bg-rose-500",
    description: "Operations paused or decommissioned",
  },
};

const CHECKLIST_ITEMS = [
  { key: "hasApprovedVendor", label: "At least 1 approved vendor in city", icon: "Store" },
  { key: "hasApprovedDriver", label: "At least 1 approved delivery partner", icon: "Truck" },
  { key: "hasZone",           label: "At least 1 active delivery sub-zone", icon: "MapPin" },
  { key: "hasGateway",        label: "Payment gateway configured & active", icon: "CreditCard" },
  { key: "hasLanguage",       label: "System language locale activated", icon: "Globe" },
];

const VAT_FIELDS = [
  { key: "foodRestaurant", label: "Restaurant Food (%)", placeholder: "e.g. 5.0" },
  { key: "foodBasic",      label: "Basic / Grocery Food (%)", placeholder: "e.g. 0.0" },
  { key: "delivery",       label: "Delivery Fee (%)", placeholder: "e.g. 18.0" },
  { key: "service",        label: "Service / Platform Fee (%)", placeholder: "e.g. 18.0" },
  { key: "tips",           label: "Driver Tips (%)", placeholder: "e.g. 0.0" },
];

const EMPTY_VAT = {
  foodRestaurant: "",
  foodBasic: "",
  delivery: "",
  service: "",
  tips: "",
};

// Form Modal for Adding / Editing a City
function CityFormModal({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    country: "",
    currency: "INR",
    defaultLanguage: "en",
    status: "planned",
    enabledLanguages: ["en"],
    ...(initial || {}),
    vat: { ...EMPTY_VAT, ...((initial && initial.vat) || {}) },
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.country) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200/90 w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00604c]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg tracking-tight">
                {initial ? "Edit City Configuration" : "Add New Operational City"}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Set up municipal boundaries, currency, and category-level tax rates
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-100 px-6 bg-white gap-6">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`py-3 text-xs font-bold border-b-2 transition ${
              activeTab === "general"
                ? "border-[#00604c] text-[#00604c]"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            General Settings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vat")}
            className={`py-3 text-xs font-bold border-b-2 transition ${
              activeTab === "vat"
                ? "border-[#00604c] text-[#00604c]"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            VAT &amp; Tax Rates
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} className="overflow-y-auto p-6 space-y-5 flex-1">
          {activeTab === "general" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    City Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Indore"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#00604c] transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Country <span className="text-rose-500">*</span>
                  </label>
                  <input
                    required
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                    placeholder="e.g. India"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#00604c] transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Operating Currency
                  </label>
                  <select
                    value={form.currency}
                    onChange={(e) => set("currency", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#00604c] transition cursor-pointer"
                  >
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="USD">USD — US Dollar ($)</option>
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="GBP">GBP — British Pound (£)</option>
                    <option value="PLN">PLN — Polish Złoty (zł)</option>
                    <option value="AED">AED — UAE Dirham</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Default Language
                  </label>
                  <select
                    value={form.defaultLanguage}
                    onChange={(e) => set("defaultLanguage", e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#00604c] transition cursor-pointer"
                  >
                    <option value="en">English (en)</option>
                    <option value="hi">Hindi (hi)</option>
                    <option value="pl">Polish (pl)</option>
                    <option value="de">German (de)</option>
                    <option value="ru">Russian (ru)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Launch / Operational Status
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {["planned", "in_setup", "active"].map((statusKey) => {
                    const cfg = STATUS_CONFIG[statusKey];
                    const isSelected = form.status === statusKey;
                    return (
                      <button
                        key={statusKey}
                        type="button"
                        onClick={() => set("status", statusKey)}
                        className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? "border-[#00604c] bg-emerald-50/60 ring-1 ring-[#00604c]"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`w-2 h-2 rounded-full ${cfg.dot} ${
                              isSelected ? "ring-2 ring-emerald-500/30" : ""
                            }`}
                          />
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#00604c]" />}
                        </div>
                        <span className="text-xs font-bold text-slate-900">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Tax and VAT percentages are applied at checkout when customer orders are placed inside this city's defined zones.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {VAT_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key} className="bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      {label}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={form.vat[key] ?? ""}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            vat: { ...prev.vat, [key]: e.target.value },
                          }))
                        }
                        placeholder={placeholder}
                        className="w-full pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#00604c] transition"
                      />
                      <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name || !form.country}
              className="px-6 py-2.5 rounded-xl bg-[#00604c] hover:bg-[#004d3d] text-white font-bold text-xs shadow-sm transition active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : initial ? (
                "Save Changes"
              ) : (
                "Create City"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Interactive Checklist Modal
function ChecklistModal({ city, checklist, onClose, onRefresh }) {
  const allDone = CHECKLIST_ITEMS.every((item) => checklist?.[item.key]);
  const doneCount = CHECKLIST_ITEMS.filter((item) => checklist?.[item.key]).length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200/90 w-full max-w-lg shadow-2xl overflow-hidden p-6">
        <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00604c]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg capitalize tracking-tight">
                {city.name} — Operational Checklist
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Prerequisites required before declaring active delivery status
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Readiness Banner */}
        <div
          className={`p-4 rounded-2xl border mb-5 flex items-center justify-between ${
            allDone
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
              : "bg-amber-50/80 border-amber-200 text-amber-900"
          }`}
        >
          <div className="flex items-center gap-3">
            {allDone ? (
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
            )}
            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                {allDone ? "Operational Ready" : "Setup In Progress"}
              </p>
              <p className="text-xs mt-0.5 opacity-90 font-medium">
                {allDone
                  ? "All 5 platform launch criteria are completely met!"
                  : `${5 - doneCount} requirement(s) pending before full launch.`}
              </p>
            </div>
          </div>
          <span className="text-sm font-black px-2.5 py-1 rounded-xl bg-white/80 shadow-2xs">
            {doneCount}/5
          </span>
        </div>

        {/* List of items */}
        <div className="space-y-2.5 mb-6">
          {CHECKLIST_ITEMS.map(({ key, label }) => {
            const isDone = checklist?.[key];
            return (
              <div
                key={key}
                className={`p-3.5 rounded-2xl border flex items-center justify-between transition ${
                  isDone
                    ? "bg-emerald-50/40 border-emerald-200/80 text-emerald-900"
                    : "bg-slate-50/80 border-slate-200 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  {isDone ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <span className="text-xs font-bold">{label}</span>
                </div>
                <span
                  className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-md ${
                    isDone
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200/70 text-slate-500"
                  }`}
                >
                  {isDone ? "Ready" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
          >
            Re-check Status
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#00604c] text-white hover:bg-[#004d3d] font-bold text-xs shadow-sm transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CityManagement() {
  const navigate = useNavigate();
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editCity, setEditCity] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await adminClient.get("/food/admin/cities");
      if (res?.data?.success) {
        setCities(res.data.data.cities || []);
      }
    } catch (e) {
      console.error("Failed to load cities", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (form) => {
    const res = await adminClient.post("/food/admin/cities", form);
    if (res?.data?.success) {
      setCities((prev) => [res.data.data.city, ...prev]);
      setShowForm(false);
    }
  };

  const handleUpdate = async (form) => {
    const res = await adminClient.patch(`/food/admin/cities/${editCity._id}`, form);
    if (res?.data?.success) {
      setCities((prev) =>
        prev.map((c) => (c._id === editCity._id ? res.data.data.city : c))
      );
      setEditCity(null);
    }
  };

  const loadChecklist = async (city) => {
    setLoadingChecklist((prev) => ({ ...prev, [city._id]: true }));
    try {
      const res = await adminClient.get(
        `/food/admin/cities/${city._id}/activation-checklist`
      );
      if (res?.data?.success) {
        setChecklist({ city, data: res.data.data.checklist });
      }
    } finally {
      setLoadingChecklist((prev) => ({ ...prev, [city._id]: false }));
    }
  };

  // Filtered Cities list
  const filteredCities = useMemo(() => {
    return cities.filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.country?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === "all" || c.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [cities, searchQuery, filterStatus]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = cities.length;
    const active = cities.filter((c) => c.status === "active").length;
    const inSetup = cities.filter((c) => c.status === "in_setup").length;
    const planned = cities.filter((c) => c.status === "planned" || !c.status).length;
    const totalSubZones = cities.reduce(
      (sum, c) => sum + (c.zoneIds?.length || 0),
      0
    );
    return { total, active, inSetup, planned, totalSubZones };
  }, [cities]);

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-slate-800 p-4 sm:p-6 lg:p-8 font-sans">
      {/* Modals */}
      {showForm && (
        <CityFormModal onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}
      {editCity && (
        <CityFormModal
          initial={editCity}
          onSave={handleUpdate}
          onCancel={() => setEditCity(null)}
        />
      )}
      {checklist && (
        <ChecklistModal
          city={checklist.city}
          checklist={checklist.data}
          onClose={() => setChecklist(null)}
          onRefresh={() => loadChecklist(checklist.city)}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 lg:p-7 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00604c] shadow-xs">
                <Globe className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    City &amp; Sub-Zone Management
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-[#00604c] border border-emerald-200/80">
                    {cities.length} {cities.length === 1 ? "City" : "Cities"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Configure municipal delivery boundaries, nested sub-zones, tax rates &amp; currencies
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#00604c] hover:bg-[#004d3d] text-white text-xs font-bold shadow-md shadow-emerald-950/10 transition active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" /> Add Operational City
            </button>
          </div>

          {/* Operational Metrics Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-slate-100">
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Total Cities
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">{stats.total}</span>
                <span className="text-xs font-bold text-emerald-600">
                  {stats.active} Active
                </span>
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Active Sub-Zones
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {stats.totalSubZones}
                </span>
                <span className="text-xs font-bold text-slate-400">Mapped polygons</span>
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                In Setup / Planned
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900">
                  {stats.inSetup + stats.planned}
                </span>
                <span className="text-xs font-bold text-amber-600">Pre-launch</span>
              </div>
            </div>

            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Primary Currency
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-[#00604c]">
                  {cities[0]?.currency || "INR"}
                </span>
                <span className="text-xs font-bold text-slate-400">Active market</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by city or country..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#00604c] transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {[
              { id: "all", label: "All Cities", count: stats.total },
              { id: "active", label: "Active", count: stats.active },
              { id: "in_setup", label: "In Setup", count: stats.inSetup },
              { id: "planned", label: "Planned", count: stats.planned },
            ].map(({ id, label, count }) => (
              <button
                key={id}
                onClick={() => setFilterStatus(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  filterStatus === id
                    ? "bg-[#00604c] text-white shadow-2xs"
                    : "bg-slate-100/70 text-slate-600 hover:bg-slate-200/60"
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    filterStatus === id
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Layout: Grid of Cities + Info / Guidance Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left 2 Columns: Cities Grid */}
          <div className="lg:col-span-2 space-y-5">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-3xl border border-slate-200/80 p-6 animate-pulse h-72 shadow-xs"
                  />
                ))}
              </div>
            ) : filteredCities.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center justify-center shadow-xs">
                <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mb-3.5">
                  <Globe className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-slate-800">No matching cities found</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
                  {searchQuery || filterStatus !== "all"
                    ? "No cities match your search filter criteria. Try clearing search or selecting 'All Cities'."
                    : "Configure your first city boundary to start defining sub-zones and onboarding vendors."}
                </p>
                {searchQuery || filterStatus !== "all" ? (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterStatus("all");
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-5 py-2.5 rounded-xl bg-[#00604c] text-white text-xs font-bold hover:bg-[#004d3d] shadow-sm transition"
                  >
                    Add First City
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredCities.map((city) => {
                  const cfg = STATUS_CONFIG[city.status] || STATUS_CONFIG.planned;
                  const checklistProgress = city.activationChecklist;
                  const doneCount = checklistProgress
                    ? Object.values(checklistProgress).filter(Boolean).length
                    : 2; // fallback to computed
                  const totalItems = CHECKLIST_ITEMS.length;
                  const progressPct = Math.round((doneCount / totalItems) * 100);
                  const subZonesCount = city.zoneIds?.length || 0;

                  return (
                    <div
                      key={city._id}
                      className="bg-white rounded-3xl border border-slate-200/90 hover:border-slate-300 hover:shadow-lg transition-all duration-200 p-6 flex flex-col justify-between shadow-xs group"
                    >
                      <div>
                        {/* Top Card Header */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-[#00604c] font-black text-base shadow-2xs">
                              {city.name?.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-black text-slate-900 text-lg capitalize tracking-tight group-hover:text-[#00604c] transition">
                                  {city.name}
                                </h3>
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${cfg.badge}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-slate-400 capitalize flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {city.country}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => setEditCity(city)}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            title="Edit city configuration"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Operational Stats Grid */}
                        <div className="grid grid-cols-2 gap-2.5 mb-4">
                          {/* Currency Block */}
                          <div className="bg-slate-50/90 border border-slate-100 rounded-2xl p-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                              <Banknote className="w-3 h-3 text-slate-400" /> Currency
                            </span>
                            <span className="font-black text-sm text-slate-900">
                              {city.currency || "INR"}
                            </span>
                          </div>

                          {/* Sub-Zones Count Block */}
                          <div className="bg-slate-50/90 border border-slate-100 rounded-2xl p-3">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                              <Layers className="w-3 h-3 text-slate-400" /> Sub-Zones
                            </span>
                            <span className="font-black text-sm text-slate-900">
                              {subZonesCount > 0
                                ? `${subZonesCount} Active`
                                : "No sub-zones"}
                            </span>
                          </div>

                          {/* VAT Rates Block */}
                          <div className="col-span-2 bg-slate-50/90 border border-slate-100 rounded-2xl p-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <Percent className="w-3 h-3 text-slate-400" /> Tax &amp; VAT
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-md">
                                Category Rates
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-bold text-slate-700">
                              <div>
                                <span className="text-[11px] text-slate-400 font-medium">Food: </span>
                                <span>{city.vat?.foodRestaurant != null && city.vat?.foodRestaurant !== "" ? `${city.vat.foodRestaurant}%` : "5%"}</span>
                              </div>
                              <span className="text-slate-300">•</span>
                              <div>
                                <span className="text-[11px] text-slate-400 font-medium">Delivery: </span>
                                <span>{city.vat?.delivery != null && city.vat?.delivery !== "" ? `${city.vat.delivery}%` : "18%"}</span>
                              </div>
                              <span className="text-slate-300">•</span>
                              <div>
                                <span className="text-[11px] text-slate-400 font-medium">Lang: </span>
                                <span className="uppercase">{city.defaultLanguage || "en"}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Activation Progress Bar */}
                        <div className="mb-5 bg-slate-50/90 border border-slate-100 rounded-2xl p-3.5">
                          <div className="flex justify-between items-center text-xs mb-2">
                            <span className="font-bold text-slate-600 text-[11px] flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-[#00604c]" /> Activation Progress
                            </span>
                            <span className="font-black text-slate-900 text-xs">
                              {doneCount}/{totalItems}{" "}
                              <span className="text-slate-400 font-semibold">({progressPct}%)</span>
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-600 to-[#00604c]"
                              style={{ width: `${Math.max(12, progressPct)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => loadChecklist(city)}
                          disabled={loadingChecklist[city._id]}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
                        >
                          {loadingChecklist[city._id] ? (
                            <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          Checklist
                        </button>

                        <button
                          onClick={() => navigate(`/admin/food/cities/${city._id}/map`)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-[#00604c] hover:bg-[#004d3d] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm shadow-emerald-950/10 cursor-pointer"
                        >
                          <MapIcon className="w-3.5 h-3.5" />
                          Map &amp; Sub-Zones
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Zone Architecture & Quick Actions Panel */}
          <div className="space-y-5">
            {/* Quick Setup Workflow Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-[#00604c]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm tracking-tight">
                    Zone Hierarchy Workflow
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">How cities &amp; delivery zones interact</p>
                </div>
              </div>

              <div className="space-y-4 text-xs font-medium text-slate-600">
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Define Main City Perimeter</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Click <strong>Map &amp; Sub-Zones</strong> to draw the outer municipal boundary. This prevents any orders from leaking outside service jurisdiction.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Partition into Sub-Zones</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Draw nested delivery polygons (e.g., Central, North, West). Vendors and drivers are pinned to these sub-zones.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Activate City Operations</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Verify the 5 checklist conditions (vendors, drivers, active zones, payment gateways, and languages) to switch to <strong>Active</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Navigation Links */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-3">
                Related Admin Controls
              </h4>
              <div className="space-y-2">
                <button
                  onClick={() => navigate("/admin/food/zone-setup")}
                  className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-left flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#00604c]" /> All Zone Definitions
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => navigate("/admin/food/zone-ranking")}
                  className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-left flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" /> Zone Demand Ranking
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => navigate("/admin/food/kitchen-partners")}
                  className="w-full p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-left flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" /> Kitchen Partners by Zone
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
