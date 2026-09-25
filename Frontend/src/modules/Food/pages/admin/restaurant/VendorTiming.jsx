import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Pencil, Trash2, Save, CheckCircle, AlertTriangle, X, CalendarDays } from 'lucide-react';
import { adminAPI } from '../../../../../services/api';

const to12h = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const DAYS = [
  { v: 1, l: 'Mon' }, { v: 2, l: 'Tue' }, { v: 3, l: 'Wed' }, { v: 4, l: 'Thu' },
  { v: 5, l: 'Fri' }, { v: 6, l: 'Sat' }, { v: 0, l: 'Sun' },
];
const ICONS = ['🌅', '☕', '🥐', '☀️', '🍱', '🥗', '🍲', '🍎', '🌙', '🍽️', '🌮', '🥪'];
const COLORS = ['#f59e0b', '#10b981', '#6366f1', '#ef4444', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6'];

const EMPTY = {
  name: '', key: '', description: '', icon: '🍽️', color: '#f97316',
  startTime: '11:00', endTime: '15:00', maxPrepMinutes: 60,
  deliveryStartTime: '', deliveryEndTime: '', orderCutoffHours: 0,
  availableDays: [1, 2, 3, 4, 5, 6, 0], sortOrder: 0, isEnabled: true,
};

const slugify = (v) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '').slice(0, 30);

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50 disabled:text-slate-400';

function SlotModal({ initial, onClose, onSaved, onError }) {
  const editing = Boolean(initial?._id);
  const [form, setForm] = useState({ ...EMPTY, ...initial });
  const [keyTouched, setKeyTouched] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleDay = (d) =>
    set('availableDays', form.availableDays.includes(d) ? form.availableDays.filter((x) => x !== d) : [...form.availableDays, d]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) return setErr('Slot name is required');
    if (form.startTime >= form.endTime) return setErr('End time must be later than start time');
    if (!form.availableDays.length) return setErr('Select at least one day');
    setSaving(true);
    try {
      const body = {
        name: form.name, description: form.description, icon: form.icon, color: form.color,
        startTime: form.startTime, endTime: form.endTime, maxPrepMinutes: Number(form.maxPrepMinutes) || 60,
        deliveryStartTime: form.deliveryStartTime, deliveryEndTime: form.deliveryEndTime,
        orderCutoffHours: Number(form.orderCutoffHours) || 0, availableDays: form.availableDays,
        sortOrder: Number(form.sortOrder) || 0, isEnabled: form.isEnabled,
      };
      if (editing) await adminAPI.updateDeliverySlot(initial._id, body);
      else await adminAPI.createDeliverySlot({ ...body, key: form.key || slugify(form.name) });
      onSaved(editing ? 'Delivery slot updated' : 'Delivery slot created');
    } catch (e2) {
      const msg = e2?.response?.data?.message || 'Failed to save slot';
      setErr(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-800">{editing ? 'Edit Delivery Slot' : 'Add Delivery Slot'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">{err}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Slot name *">
              <input className={inputCls} value={form.name} placeholder="e.g. Brunch"
                onChange={(e) => { set('name', e.target.value); if (!keyTouched) set('key', slugify(e.target.value)); }} />
            </Field>
            <Field label="Key" hint={editing ? 'Cannot be changed' : 'Used internally; lowercase'}>
              <input className={inputCls} value={form.key} disabled={editing} placeholder="brunch"
                onChange={(e) => { setKeyTouched(true); set('key', slugify(e.target.value)); }} />
            </Field>
          </div>

          <Field label="Description (shown to customers)">
            <input className={inputCls} value={form.description} maxLength={200} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((i) => (
                  <button type="button" key={i} onClick={() => set('icon', i)}
                    className={`w-9 h-9 rounded-lg text-lg border ${form.icon === i ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>{i}</button>
                ))}
              </div>
            </Field>
            <Field label="Colour">
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button type="button" key={c} onClick={() => set('color', c)} style={{ background: c }}
                    className={`w-8 h-8 rounded-full border-2 ${form.color === c ? 'border-slate-800 scale-110' : 'border-white shadow'}`} />
                ))}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Prep starts" hint={to12h(form.startTime)}>
              <input type="time" className={inputCls} value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </Field>
            <Field label="Prep ends" hint={to12h(form.endTime)}>
              <input type="time" className={inputCls} value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </Field>
            <Field label="Max prep (min)">
              <input type="number" min={1} max={480} className={inputCls} value={form.maxPrepMinutes} onChange={(e) => set('maxPrepMinutes', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Delivery from" hint="Optional">
              <input type="time" className={inputCls} value={form.deliveryStartTime} onChange={(e) => set('deliveryStartTime', e.target.value)} />
            </Field>
            <Field label="Delivery until" hint="Optional">
              <input type="time" className={inputCls} value={form.deliveryEndTime} onChange={(e) => set('deliveryEndTime', e.target.value)} />
            </Field>
            <Field label="Skip cutoff (hrs)" hint="0 = global rule">
              <input type="number" min={0} className={inputCls} value={form.orderCutoffHours} onChange={(e) => set('orderCutoffHours', e.target.value)} />
            </Field>
          </div>

          <Field label="Available days">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button type="button" key={d.v} onClick={() => toggleDay(d.v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${form.availableDays.includes(d.v) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>{d.l}</button>
              ))}
            </div>
          </Field>

          <div className="flex items-center justify-between gap-4">
            <Field label="Display order">
              <input type="number" className={`${inputCls} w-24`} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
            </Field>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm font-bold text-slate-600">{form.isEnabled ? 'Enabled' : 'Disabled'}</span>
              <button type="button" onClick={() => set('isEnabled', !form.isEnabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${form.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isEnabled ? 'translate-x-6' : ''}`} />
              </button>
            </label>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create slot'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function VendorTiming() {
  const [slots, setSlots] = useState([]);
  const [cutoff, setCutoff] = useState('20:00');
  const [loading, setLoading] = useState(true);
  const [savingCutoff, setSavingCutoff] = useState(false);
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(nowHHMM());

  useEffect(() => {
    const t = setInterval(() => setTick(nowHHMM()), 30000);
    return () => clearInterval(t);
  }, []);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([adminAPI.getDeliverySlots(), adminAPI.getVendorTimingSettings()]);
      setSlots(s?.data?.slots || []);
      setCutoff(t?.data?.data?.mealChangeCutoffTime || '20:00');
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to load delivery slots');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async (slot) => {
    try {
      await adminAPI.updateDeliverySlot(slot._id, { isEnabled: !slot.isEnabled });
      setSlots((prev) => prev.map((s) => (s._id === slot._id ? { ...s, isEnabled: !s.isEnabled } : s)));
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to update slot');
    }
  };

  const doDelete = async () => {
    const slot = confirmDel;
    try {
      await adminAPI.deleteDeliverySlot(slot._id);
      setConfirmDel(null);
      showToast('success', `"${slot.name}" deleted`);
      load();
    } catch (e) {
      setConfirmDel(null);
      showToast('error', e?.response?.data?.message || 'Failed to delete slot');
    }
  };

  const saveCutoff = async () => {
    setSavingCutoff(true);
    try {
      await adminAPI.updateVendorTimingSettings({ mealChangeCutoffTime: cutoff });
      showToast('success', 'Cutoff time saved');
    } catch (e) {
      showToast('error', e?.response?.data?.message || 'Failed to save cutoff');
    } finally {
      setSavingCutoff(false);
    }
  };

  const isActiveNow = (s) => s.isEnabled && tick >= s.startTime && tick <= s.endTime;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-6">
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl text-sm font-semibold ${toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
              <Clock className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Delivery Slots</h1>
              <p className="text-slate-500 text-sm mt-0.5">Create, edit and remove meal slots. Changes appear instantly for customers, vendors and drivers.</p>
            </div>
          </div>
          <button onClick={() => setModal({})} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-2xl shadow-lg">
            <Plus size={18} /> Add slot
          </button>
        </div>

        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3">
          <AlertTriangle size={18} className="text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-indigo-700 text-sm leading-relaxed">
            Vendors can only mark meals <em>Preparing</em>/<em>Ready</em> inside a slot&apos;s prep window. A slot that is in use by subscriptions or upcoming orders can be
            <strong> disabled</strong> but not deleted, so customers&apos; existing plans are never broken.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[0, 1, 2].map((i) => <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : slots.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl text-slate-500">No slots yet. Click &ldquo;Add slot&rdquo; to create one.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {slots.map((s) => (
              <div key={s._id} className={`rounded-2xl border-2 bg-white p-5 shadow-sm transition ${s.isEnabled ? '' : 'opacity-60'}`} style={{ borderColor: `${s.color}55` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${s.color}22` }}>{s.icon}</div>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800 truncate">{s.name}</h3>
                      <p className="text-[11px] text-slate-400 font-mono">{s.key}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActiveNow(s) && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active now</span>}
                    <button onClick={() => toggleEnabled(s)} aria-label="Toggle"
                      className={`relative w-11 h-6 rounded-full transition-colors ${s.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${s.isEnabled ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                </div>

                {s.description && <p className="text-sm text-slate-500 mt-3">{s.description}</p>}

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Prep window</p>
                    <p className="font-bold text-slate-700">{to12h(s.startTime)} – {to12h(s.endTime)}</p>
                    <p className="text-[11px] text-slate-400">max {s.maxPrepMinutes} min</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivery window</p>
                    <p className="font-bold text-slate-700">
                      {s.deliveryStartTime && s.deliveryEndTime ? `${to12h(s.deliveryStartTime)} – ${to12h(s.deliveryEndTime)}` : 'Same as prep'}
                    </p>
                    {s.orderCutoffHours > 0 && <p className="text-[11px] text-slate-400">skip cutoff {s.orderCutoffHours}h before</p>}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <CalendarDays size={14} className="text-slate-400" />
                  {DAYS.map((d) => (
                    <span key={d.v} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.availableDays?.includes(d.v) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-300'}`}>{d.l}</span>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                  <button onClick={() => setModal(s)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50"><Pencil size={14} /> Edit</button>
                  <button onClick={() => setConfirmDel(s)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-200 text-red-600 font-bold text-sm hover:bg-red-50"><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2"><Clock size={18} className="text-indigo-500" /> Customer Modification Cutoff</h3>
              <p className="text-sm text-slate-500 mt-1">Time on the <strong>day before delivery</strong> after which customers cannot skip or change a meal (a slot&apos;s own cutoff overrides this).</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <span className="text-xs font-semibold text-slate-500 w-16">{to12h(cutoff)}</span>
              <button onClick={saveCutoff} disabled={savingCutoff} className="flex items-center gap-2 bg-indigo-600 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-60">
                <Save size={16} /> {savingCutoff ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <SlotModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={(msg) => { setModal(null); showToast('success', msg); load(); }}
        />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-black text-slate-800">Delete &ldquo;{confirmDel.name}&rdquo;?</h3>
            <p className="text-sm text-slate-500 mt-2">This cannot be undone. If customers have subscriptions or upcoming orders in this slot, deletion is blocked — disable the slot instead.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
              <button onClick={doDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
