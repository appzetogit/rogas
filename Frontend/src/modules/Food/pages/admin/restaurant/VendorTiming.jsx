import React, { useState, useEffect } from 'react';
import { Clock, Sun, Coffee, Moon, Save, RotateCcw, CheckCircle, AlertTriangle } from 'lucide-react';
import { adminAPI } from '../../../../../services/api';

// ─── helpers ──────────────────────────────────────────────────────────────────
const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const now24h = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const isInsideWindow = (start, end) => {
  if (!start || !end) return null;
  const cur = now24h();
  return cur >= start && cur <= end;
};

const SLOT_META = {
  breakfast: {
    label: 'Breakfast',
    emoji: '☀️',
    Icon: Sun,
    gradient: 'from-amber-50 to-orange-50',
    border: 'border-amber-200',
    accent: 'text-amber-600',
    ring: 'focus:ring-amber-400',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    badgeActive: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-amber-400',
  },
  lunch: {
    label: 'Lunch',
    emoji: '🌤️',
    Icon: Coffee,
    gradient: 'from-sky-50 to-blue-50',
    border: 'border-sky-200',
    accent: 'text-sky-600',
    ring: 'focus:ring-sky-400',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    badgeActive: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-sky-400',
  },
  dinner: {
    label: 'Dinner',
    emoji: '🌙',
    Icon: Moon,
    gradient: 'from-violet-50 to-purple-50',
    border: 'border-violet-200',
    accent: 'text-violet-600',
    ring: 'focus:ring-violet-400',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
    badgeActive: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dot: 'bg-violet-400',
  },
};

const DEFAULT_SETTINGS = {
  breakfast: { startTime: '04:00', endTime: '10:00', maxPrepMinutes: 60, isEnabled: true },
  lunch:     { startTime: '11:00', endTime: '15:00', maxPrepMinutes: 60, isEnabled: true },
  dinner:    { startTime: '17:00', endTime: '21:00', maxPrepMinutes: 90, isEnabled: true },
};

// ─── SlotCard ─────────────────────────────────────────────────────────────────
function SlotCard({ slot, config, onChange }) {
  const meta = SLOT_META[slot];
  const inside = config.isEnabled ? isInsideWindow(config.startTime, config.endTime) : null;

  return (
    <div className={`rounded-2xl border-2 ${meta.border} bg-gradient-to-br ${meta.gradient} p-5 transition-all hover:shadow-md`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm bg-white border ${meta.border}`}>
            {meta.emoji}
          </div>
          <div>
            <h3 className={`font-bold text-base ${meta.accent}`}>{meta.label}</h3>
            {config.isEnabled && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${inside ? meta.badgeActive : meta.badge}`}>
                {inside === true ? '✅ Active now' : inside === false ? '⏸ Outside window' : ''}
              </span>
            )}
          </div>
        </div>
        {/* Enable toggle */}
        <button
          onClick={() => onChange(slot, 'isEnabled', !config.isEnabled)}
          className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${config.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          aria-label={config.isEnabled ? 'Disable' : 'Enable'}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${config.isEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      <div className={`space-y-3 transition-opacity ${config.isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        {/* Time row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Start Time</label>
            <input
              type="time"
              value={config.startTime}
              onChange={e => onChange(slot, 'startTime', e.target.value)}
              className={`w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 ${meta.ring} transition`}
            />
            <p className="text-[10px] text-slate-400 mt-1">{to12h(config.startTime)}</p>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">End Time</label>
            <input
              type="time"
              value={config.endTime}
              onChange={e => onChange(slot, 'endTime', e.target.value)}
              className={`w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 ${meta.ring} transition`}
            />
            <p className="text-[10px] text-slate-400 mt-1">{to12h(config.endTime)}</p>
          </div>
        </div>
        {/* Max prep duration */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Max Prep Duration (minutes)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={360}
              value={config.maxPrepMinutes}
              onChange={e => onChange(slot, 'maxPrepMinutes', Number(e.target.value))}
              className={`w-28 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 ${meta.ring} transition`}
            />
            <span className="text-slate-400 text-sm">mins</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function VendorTiming() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', msg }
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch on mount
  useEffect(() => {
    setLoading(true);
    adminAPI.getVendorTimingSettings()
      .then(res => {
        const d = res?.data?.data;
        if (d) {
          setSettings({
            breakfast: { ...DEFAULT_SETTINGS.breakfast, ...d.breakfast },
            lunch:     { ...DEFAULT_SETTINGS.lunch,     ...d.lunch },
            dinner:    { ...DEFAULT_SETTINGS.dinner,    ...d.dinner },
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleChange = (slot, field, value) => {
    setSettings(prev => ({
      ...prev,
      [slot]: { ...prev[slot], [field]: value }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminAPI.updateVendorTimingSettings(settings);
      showToast('success', 'Vendor timing settings saved successfully!');
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    showToast('success', 'Reset to default values (not saved yet)');
  };

  const fmt12h = (d) => {
    let h = d.getHours();
    const m = d.getMinutes();
    const ampm = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-semibold transition-all animate-fadeIn ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
              <Clock className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Vendor Timing</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Configure meal preparation windows for vendors
              </p>
            </div>
          </div>
          {/* Live clock */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
            <Clock size={15} className="text-indigo-500" />
            <span className="text-sm font-bold text-slate-700">{fmt12h(currentTime)}</span>
            <span className="text-[10px] text-slate-400 font-medium">server time</span>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={18} className="text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-indigo-700 text-sm leading-relaxed">
            <strong>How it works:</strong> Vendors can only mark orders as <em>Preparing</em> or <em>Ready</em> within the configured time window for each meal slot. Attempts outside this window are blocked on both the frontend and backend.
          </p>
        </div>

        {/* Slot cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {['breakfast', 'lunch', 'dinner'].map(s => (
              <div key={s} className="h-64 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {['breakfast', 'lunch', 'dinner'].map(slot => (
              <SlotCard
                key={slot}
                slot={slot}
                config={settings[slot]}
                onChange={handleChange}
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold py-3.5 px-6 rounded-2xl shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-violet-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {saving ? 'Saving…' : 'Save All Settings'}
          </button>
          <button
            onClick={handleReset}
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-600 font-bold py-3.5 px-6 rounded-2xl hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-60"
          >
            <RotateCcw size={16} />
            Reset to Defaults
          </button>
        </div>

        {/* Summary table */}
        <div className="mt-8 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-700">Current Configuration Summary</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {['breakfast', 'lunch', 'dinner'].map(slot => {
              const cfg = settings[slot];
              const meta = SLOT_META[slot];
              const active = cfg.isEnabled ? isInsideWindow(cfg.startTime, cfg.endTime) : false;
              return (
                <div key={slot} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="text-xl">{meta.emoji}</span>
                  <div className="flex-1">
                    <span className="font-bold text-slate-700 text-sm">{meta.label}</span>
                    {cfg.isEnabled ? (
                      <span className="text-slate-500 text-xs ml-2">
                        {to12h(cfg.startTime)} – {to12h(cfg.endTime)}
                        <span className="ml-2 text-slate-400">({cfg.maxPrepMinutes} min max prep)</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs ml-2">Disabled (no restriction)</span>
                    )}
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                    !cfg.isEnabled
                      ? 'bg-slate-100 text-slate-400 border-slate-200'
                      : active
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {!cfg.isEnabled ? 'Off' : active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
