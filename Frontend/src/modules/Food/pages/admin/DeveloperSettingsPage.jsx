import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Code,
  Zap,
  Clock,
  CheckCircle,
  AlertTriangle,
  RotateCw,
  ExternalLink,
  ShieldAlert,
  Sliders
} from 'lucide-react';
import { adminAPI } from '../../../../services/api';

const to12h = (hhmm) => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

export default function DeveloperSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timingSettings, setTimingSettings] = useState(null);
  const [bypassPrep, setBypassPrep] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getVendorTimingSettings();
      const data = res?.data?.data || res?.data;
      if (data) {
        setTimingSettings(data);
        setBypassPrep(Boolean(data.bypassPrepTimingRestrictions));
      }
    } catch (err) {
      showToast('error', err?.response?.data?.message || 'Failed to load developer settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggleBypass = async (e) => {
    const nextVal = e.target.checked;
    setBypassPrep(nextVal);
    setSaving(true);
    try {
      const payload = {
        ...timingSettings,
        bypassPrepTimingRestrictions: nextVal
      };
      const res = await adminAPI.updateVendorTimingSettings(payload);
      const updated = res?.data?.data || res?.data;
      if (updated) {
        setTimingSettings(updated);
        setBypassPrep(Boolean(updated.bypassPrepTimingRestrictions));
      }
      showToast(
        'success',
        nextVal
          ? '🚀 Testing Mode Enabled: Vendors can now Start Preparing anytime!'
          : '🔒 Restrictions Restored: Vendors can only prepare inside scheduled windows.'
      );
    } catch (err) {
      setBypassPrep(!nextVal); // revert on failure
      showToast('error', err?.response?.data?.message || 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-semibold transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center shadow-lg shadow-indigo-200">
              <Code className="text-white" size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Developer Settings</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                  QA & Testing
                </span>
              </div>
              <p className="text-slate-500 text-sm mt-0.5">
                Manage development overrides, testing toggles, and live environment controls.
              </p>
            </div>
          </div>

          <button
            onClick={loadSettings}
            disabled={loading || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-95 transition-all shadow-xs"
          >
            <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status Callout Banner */}
        <div
          className={`p-4 rounded-2xl border transition-all flex items-start gap-3.5 ${
            bypassPrep
              ? 'bg-purple-50/80 border-purple-200 text-purple-900'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <div
            className={`p-2 rounded-xl shrink-0 ${
              bypassPrep ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Zap size={20} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-extrabold flex items-center gap-2">
              {bypassPrep ? 'Testing Mode Active: Prep Windows Bypassed' : 'Standard Operations Mode Active'}
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {bypassPrep
                ? 'Vendors on /vendor/orders can start preparing and mark orders ready at any time without waiting for slot preparation windows.'
                : 'All operational windows (every delivery slot) are strictly enforced according to vendor timing settings.'}
            </p>
          </div>
        </div>

        {/* Operations & Testing Toggles Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders size={18} className="text-indigo-600" />
              <h2 className="text-base font-extrabold text-slate-800">Kitchen & Order Flow Toggles</h2>
            </div>
            {saving && (
              <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 animate-pulse">
                <RotateCw size={12} className="animate-spin" /> Saving changes...
              </span>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Toggle Item 1: Anytime Prep */}
            <div className="flex items-start justify-between gap-6 p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    Bypass Preparation Timing Restrictions (Anytime Prep)
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full ${
                      bypassPrep
                        ? 'bg-purple-100 text-purple-700 border border-purple-200'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {bypassPrep ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                  Enables vendors to click <strong>"Start Preparing"</strong> and <strong>"Mark Ready"</strong> on <code>/vendor/orders</code> at any time of the day. Bypasses both the frontend checks and backend timing validation for testing and demonstrations.
                </p>
                <div className="flex items-center gap-2 pt-1 text-xs text-amber-700 font-semibold">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>Disable this toggle in production when live operational windows should be enforced.</span>
                </div>
              </div>

              {/* iOS-style toggle switch */}
              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                <input
                  type="checkbox"
                  checked={bypassPrep}
                  onChange={handleToggleBypass}
                  disabled={loading || saving}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Current Configured Timing Windows Reference */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-slate-500" />
              <h2 className="text-base font-extrabold text-slate-800">Current Slot Timing Reference</h2>
            </div>
            <Link
              to="/admin/food/vendor-timing"
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              <span>Edit Windows in Vendor Timing</span>
              <ExternalLink size={13} />
            </Link>
          </div>

          <p className="text-xs text-slate-500">
            Below are the currently configured live preparation windows from Vendor Timing Settings:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(timingSettings?.slots || []).map((sl) => (
              <div key={sl.key} className="p-3.5 rounded-xl border bg-slate-50/60" style={{ borderColor: `${sl.color}66` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: sl.color }}>{sl.icon} {sl.name}</span>
                  <span className="text-[11px] font-bold text-slate-500">{sl.isEnabled ? 'Enabled' : 'Disabled'}</span>
                </div>
                <p className="text-sm font-black text-slate-800">{to12h(sl.startTime)} – {to12h(sl.endTime)}</p>
                <p className="text-[11px] text-slate-500 mt-1">Max prep: {sl.maxPrepMinutes || 60} min</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
