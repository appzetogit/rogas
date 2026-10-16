import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Wallet, Plus, Trash2, Pencil, X, Gift, Power } from 'lucide-react';
import { adminAPI, dmbExtraAdminAPI } from '../../../../../services/api';

const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;
const todayStr = () => new Date().toISOString().slice(0, 10);
const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400';

const PROMO_TYPES = [
  { value: 'delivery_count', label: 'Delivery count', hint: 'Complete N deliveries this week' },
  { value: 'zone_coverage', label: 'Zone coverage', hint: 'Every delivery of the zone (and slot) that day delivered, none failed' },
  { value: 'slot_coverage', label: 'Slot coverage', hint: 'Work the slot on N different days this week' },
  { value: 'rate_boost', label: 'Rate boost', hint: 'Extra pay on every delivery in the period' },
  { value: 'hub_bonus', label: 'Hub transfers', hint: 'Complete N hub drop-offs this week' }
];
const typeLabel = (t) => PROMO_TYPES.find((x) => x.value === t)?.label || t;

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-black text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const useLookups = () => {
  const [zones, setZones] = useState([]);
  const [slots, setSlots] = useState([]);
  const [cities, setCities] = useState([]);
  useEffect(() => {
    adminAPI.getZones({ isActive: true }).then((r) => setZones(r?.data?.data?.zones || [])).catch(() => {});
    adminAPI.getDeliverySlots().then((r) => setSlots(r?.data?.slots || [])).catch(() => {});
    dmbExtraAdminAPI.cities().then((r) => setCities(r?.data?.data?.cities || [])).catch(() => {});
  }, []);
  return { zones, slots, cities };
};

function ScopeFields({ form, set, lookups, zoneRequired = false, slotRequired = false }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Field label="City" hint="Empty = everywhere">
        <select className={inputCls} value={form.cityId || ''} onChange={(e) => set('cityId', e.target.value)}>
          <option value="">All cities</option>
          {lookups.cities.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label={`Zone${zoneRequired ? ' *' : ''}`} hint={zoneRequired ? '' : 'Empty = any zone'}>
        <select className={inputCls} value={form.zoneId || ''} onChange={(e) => set('zoneId', e.target.value)}>
          <option value="">{zoneRequired ? 'Choose a zone' : 'Any zone'}</option>
          {lookups.zones.map((z) => <option key={z._id} value={z._id}>{z.name || z.zoneName}</option>)}
        </select>
      </Field>
      <Field label={`Slot${slotRequired ? ' *' : ''}`} hint={slotRequired ? '' : 'Empty = any slot'}>
        <select className={inputCls} value={form.slotKey || ''} onChange={(e) => set('slotKey', e.target.value)}>
          <option value="">{slotRequired ? 'Choose a slot' : 'Any slot'}</option>
          {lookups.slots.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
      </Field>
    </div>
  );
}

const scopeText = (row, lookups) => {
  const zone = lookups.zones.find((z) => z._id === String(row.zoneId))?.name;
  const slot = lookups.slots.find((s) => s.key === row.slotKey)?.name;
  const city = lookups.cities.find((c) => c._id === String(row.cityId))?.name;
  return [city || 'All cities', zone || 'any zone', slot || 'any slot'].join(' · ');
};

function RatesTab({ lookups, notify }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    dmbExtraAdminAPI.earningsRates().then((r) => setData(r.data)).catch((e) => notify('error', errText(e, 'Could not load rates')));
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    const body = { ...form, ratePln: Number(form.ratePln), hubStopRate: form.hubStopRate === '' || form.hubStopRate == null ? null : Number(form.hubStopRate) };
    try {
      if (form._id) await dmbExtraAdminAPI.updateEarningsRate(form._id, body); else await dmbExtraAdminAPI.createEarningsRate(body);
      notify('success', 'Rate saved'); setEditing(null); load();
    } catch (e) { notify('error', errText(e, 'Could not save the rate')); }
  };
  const remove = async (row) => {
    if (!window.confirm('Delete this rate?')) return;
    try { await dmbExtraAdminAPI.deleteEarningsRate(row._id); notify('success', 'Rate deleted'); load(); } catch (e) { notify('error', errText(e, 'Could not delete')); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        A delivery pays the most specific active rate: <b>zone + slot</b>, then <b>zone</b>, then <b>slot</b>, then the <b>base</b> rate (no zone, no slot).
        A newer start date replaces an older one from that day.{' '}
        {data?.feeSettingsRate != null
          ? <>Where no rate matches, the Fee Settings value ({data.feeSettingsRate}) is used.</>
          : <b className="text-red-600">No base rate and no Fee Settings value: deliveries cannot be paid until you add a base rate.</b>}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing({ ratePln: '', hubStopRate: '', effectiveFrom: todayStr(), isActive: true })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"><Plus size={14} /> Add rate</button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-500 text-left">
            <th className="px-4 py-3 font-bold">Applies to</th><th className="px-4 py-3 font-bold text-right">Per delivery</th>
            <th className="px-4 py-3 font-bold text-right">Hub stop</th><th className="px-4 py-3 font-bold">From</th><th className="px-4 py-3 font-bold">Status</th><th />
          </tr></thead>
          <tbody>
            {data === null ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              : data.rates.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No rates yet.</td></tr>
                : data.rates.map((r) => (
                  <tr key={r._id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-800">{scopeText(r, lookups)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.ratePln}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.hubStopRate ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{String(r.effectiveFrom).slice(0, 10)}</td>
                    <td className="px-4 py-3">{r.isActive ? <span className="text-green-700 font-semibold text-xs">Active</span> : <span className="text-slate-400 font-semibold text-xs">Off</span>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" aria-label="Edit rate" onClick={() => setEditing({ ...r, effectiveFrom: String(r.effectiveFrom).slice(0, 10), zoneId: r.zoneId || '', cityId: r.cityId || '' })} className="p-1.5 text-slate-500 hover:text-indigo-600"><Pencil size={15} /></button>
                      <button type="button" aria-label="Delete rate" onClick={() => remove(r)} className="p-1.5 text-slate-500 hover:text-red-600"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {editing && <RateModal initial={editing} lookups={lookups} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function RateModal({ initial, lookups, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title={form._id ? 'Edit rate' : 'Add rate'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
        <ScopeFields form={form} set={set} lookups={lookups} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Per delivery *"><input type="number" min="0" max="1000" step="0.5" required className={inputCls} value={form.ratePln} onChange={(e) => set('ratePln', e.target.value)} /></Field>
          <Field label="Hub stop" hint="Per hub drop-off. Empty = none"><input type="number" min="0" max="1000" step="0.5" className={inputCls} value={form.hubStopRate ?? ''} onChange={(e) => set('hubStopRate', e.target.value)} /></Field>
          <Field label="Valid from *"><input type="date" required className={inputCls} value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={form.isActive !== false} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function PromotionsTab({ lookups, notify }) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    dmbExtraAdminAPI.earningsPromotions().then((r) => setRows(r.data.promotions)).catch((e) => notify('error', errText(e, 'Could not load promotions')));
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const save = async (form) => {
    const body = { ...form, targetCount: Number(form.targetCount) || 0, bonusPln: Number(form.bonusPln) || 0, rateBoostPln: Number(form.rateBoostPln) || 0 };
    try {
      if (form._id) await dmbExtraAdminAPI.updateEarningsPromotion(form._id, body); else await dmbExtraAdminAPI.createEarningsPromotion(body);
      notify('success', 'Promotion saved'); setEditing(null); load();
    } catch (e) { notify('error', errText(e, 'Could not save the promotion')); }
  };
  const toggle = async (p) => {
    try { await dmbExtraAdminAPI.setEarningsPromotionStatus(p._id, p.status === 'active' ? 'draft' : 'active'); load(); } catch (e) { notify('error', errText(e, 'Could not change the status')); }
  };
  const summary = (p) => (p.type === 'rate_boost' ? `+${p.rateBoostPln} per delivery` : `${p.targetCount > 0 ? `${p.targetCount} → ` : ''}${p.bonusPln} bonus`);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing({ type: 'delivery_count', name: '', targetCount: '', bonusPln: '', rateBoostPln: '', validFrom: todayStr(), validUntil: todayStr(), status: 'draft' })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"><Plus size={14} /> New promotion</button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-500 text-left">
            <th className="px-4 py-3 font-bold">Promotion</th><th className="px-4 py-3 font-bold">Scope</th><th className="px-4 py-3 font-bold">Reward</th>
            <th className="px-4 py-3 font-bold">Period</th><th className="px-4 py-3 font-bold">Status</th><th />
          </tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No promotions yet.</td></tr>
                : rows.map((p) => (
                  <tr key={p._id} className="border-t border-slate-100">
                    <td className="px-4 py-3"><span className="font-semibold text-slate-800">{p.name}</span><span className="block text-[11px] text-slate-400">{typeLabel(p.type)}</span></td>
                    <td className="px-4 py-3 text-slate-600">{scopeText(p, lookups)}</td>
                    <td className="px-4 py-3 text-slate-700">{summary(p)}</td>
                    <td className="px-4 py-3 text-slate-600">{String(p.validFrom).slice(0, 10)} → {String(p.validUntil).slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${p.status === 'active' ? 'bg-green-100 text-green-700' : p.status === 'expired' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {p.status !== 'expired' && <button type="button" aria-label={p.status === 'active' ? 'Switch off' : 'Activate'} title={p.status === 'active' ? 'Switch off' : 'Activate'} onClick={() => toggle(p)} className="p-1.5 text-slate-500 hover:text-indigo-600"><Power size={15} /></button>}
                      <button type="button" aria-label="Edit promotion" onClick={() => setEditing({ ...p, zoneId: p.zoneId || '', cityId: p.cityId || '', validFrom: String(p.validFrom).slice(0, 10), validUntil: String(p.validUntil).slice(0, 10) })} className="p-1.5 text-slate-500 hover:text-indigo-600"><Pencil size={15} /></button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {editing && <PromotionModal initial={editing} lookups={lookups} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function PromotionModal({ initial, lookups, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const type = PROMO_TYPES.find((t) => t.value === form.type);
  const counts = ['delivery_count', 'slot_coverage', 'hub_bonus'].includes(form.type);
  return (
    <Modal title={form._id ? 'Edit promotion' : 'New promotion'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="space-y-4">
        <Field label="Name *"><input required maxLength={80} className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Early Bird Bonus" /></Field>
        <Field label="Type" hint={type?.hint}>
          <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
            {PROMO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <ScopeFields form={form} set={set} lookups={lookups} zoneRequired={form.type === 'zone_coverage'} slotRequired={form.type === 'slot_coverage'} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {counts && <Field label="Target *" hint={form.type === 'slot_coverage' ? 'Different days' : form.type === 'hub_bonus' ? 'Hub drop-offs' : 'Deliveries'}><input type="number" min="1" required className={inputCls} value={form.targetCount} onChange={(e) => set('targetCount', e.target.value)} /></Field>}
          {form.type === 'rate_boost'
            ? <Field label="Extra per delivery *"><input type="number" min="0.5" step="0.5" required className={inputCls} value={form.rateBoostPln} onChange={(e) => set('rateBoostPln', e.target.value)} /></Field>
            : <Field label="Bonus *" hint="Paid once per week (per day for zone coverage)"><input type="number" min="0.5" step="0.5" required className={inputCls} value={form.bonusPln} onChange={(e) => set('bonusPln', e.target.value)} /></Field>}
          <Field label="First day *"><input type="date" required className={inputCls} value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} /></Field>
          <Field label="Last day *"><input type="date" required className={inputCls} value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={form.status === 'active'} onChange={(e) => set('status', e.target.checked ? 'active' : 'draft')} /> Switch on now
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DriverRates() {
  const [tab, setTab] = useState('rates');
  const [toast, setToast] = useState(null);
  const lookups = useLookups();
  const notify = useCallback((type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); }, []);
  const tabs = useMemo(() => [['rates', 'Delivery rates', Wallet], ['promotions', 'Promotions', Gift]], []);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><Wallet size={22} /></div>
        <div><h1 className="text-2xl font-black text-slate-800">Driver Rates &amp; Promotions</h1><p className="text-sm text-slate-500">What a driver earns per delivery, and the bonuses that stack on top.</p></div>
      </div>
      <div className="flex gap-2 mb-6" role="tablist">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Icon size={14} /> {label}</button>
        ))}
      </div>
      {tab === 'rates' ? <RatesTab lookups={lookups} notify={notify} /> : <PromotionsTab lookups={lookups} notify={notify} />}
      {toast && <div role="status" className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white-force ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>}
    </div>
  );
}
