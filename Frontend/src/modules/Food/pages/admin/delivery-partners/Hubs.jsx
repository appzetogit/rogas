import React, { useState, useEffect, useCallback } from 'react';
import { Boxes, Search, X, KeyRound, RefreshCw } from 'lucide-react';
import { dmbExtraAdminAPI } from '../../../../../services/api';

const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;
const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400';
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10); };

const STATUS = {
  pending_drop: { cls: 'bg-amber-100 text-amber-800', label: 'Waiting for the drop' },
  holding: { cls: 'bg-blue-100 text-blue-800', label: 'At the hub' },
  picked_up: { cls: 'bg-green-100 text-green-800', label: 'Collected' },
  failed: { cls: 'bg-red-100 text-red-700', label: 'Failed' }
};

function HubModal({ vendor, onClose, onSaved, notify }) {
  const [form, setForm] = useState({
    isHub: Boolean(vendor.isHub), hubCapacity: vendor.hubCapacity ?? '', hubOperatorName: vendor.hubOperatorName || '',
    start: vendor.hubActiveHours?.start || '', end: vendor.hubActiveHours?.end || ''
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    try {
      await dmbExtraAdminAPI.saveHub(vendor._id, { isHub: form.isHub, hubCapacity: form.hubCapacity, hubOperatorName: form.hubOperatorName, hubActiveHours: { start: form.start, end: form.end } });
      notify('success', form.isHub ? `${vendor.restaurantName} is a hub` : `${vendor.restaurantName} is no longer a hub`);
      onSaved();
    } catch (err) { notify('error', errText(err, 'Could not save')); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <form onSubmit={save} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-black text-slate-800">{vendor.restaurantName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={form.isHub} onChange={(e) => set('isHub', e.target.checked)} /> This vendor is a hub</label>
          <p className="text-xs text-slate-500">A hub passes items between zones. It sees only its own transfers, in a Hub Activity tab in its vendor app.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Capacity</span>
              <input type="number" min="1" max="1000" className={inputCls} value={form.hubCapacity} onChange={(e) => set('hubCapacity', e.target.value)} placeholder="Default" /></label>
            <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Operator name</span>
              <input maxLength={80} className={inputCls} value={form.hubOperatorName} onChange={(e) => set('hubOperatorName', e.target.value)} /></label>
            <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Open from</span>
              <input type="time" className={inputCls} value={form.start} onChange={(e) => set('start', e.target.value)} /></label>
            <label className="block"><span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Open until</span>
              <input type="time" className={inputCls} value={form.end} onChange={(e) => set('end', e.target.value)} /></label>
          </div>
          <p className="text-[11px] text-slate-400">Capacity empty = the default from the Hub operations control. Hours are shown to drivers; empty = open whenever the slot runs.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold">Save</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function HubsTab({ notify }) {
  const [vendors, setVendors] = useState(null);
  const [onlyHubs, setOnlyHubs] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    dmbExtraAdminAPI.hubs({ onlyHubs: onlyHubs ? 'true' : 'false', search: search || undefined })
      .then((r) => setVendors(r.data.vendors)).catch((e) => notify('error', errText(e, 'Could not load vendors')));
  }, [onlyHubs, search, notify]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative"><Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input className={`${inputCls} pl-8 w-64`} placeholder="Find a vendor" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={onlyHubs} onChange={(e) => setOnlyHubs(e.target.checked)} /> Hubs only</label>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-500 text-left"><th className="px-4 py-3 font-bold">Vendor</th><th className="px-4 py-3 font-bold">Zone</th><th className="px-4 py-3 font-bold">Capacity</th><th className="px-4 py-3 font-bold">Hours</th><th className="px-4 py-3 font-bold">Hub</th><th /></tr></thead>
          <tbody>
            {vendors === null ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              : vendors.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">{onlyHubs ? 'No hubs yet. Untick "Hubs only" to pick a vendor.' : 'No vendors found.'}</td></tr>
                : vendors.map((v) => (
                  <tr key={v._id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-800">{v.restaurantName}<span className="block text-[11px] font-normal text-slate-400">{v.addressLine1}</span></td>
                    <td className="px-4 py-3 text-slate-600">{v.zoneName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{v.isHub ? (v.hubCapacity ?? 'Default') : '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{v.isHub && v.hubActiveHours?.start ? `${v.hubActiveHours.start}–${v.hubActiveHours.end}` : '—'}</td>
                    <td className="px-4 py-3">{v.isHub ? <span className="text-green-700 font-bold text-xs">Hub</span> : <span className="text-slate-400 text-xs">No</span>}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditing(v)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">{v.isHub ? 'Edit' : 'Make hub'}</button></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {editing && <HubModal vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} notify={notify} />}
    </div>
  );
}

function TransfersTab({ notify }) {
  const [date, setDate] = useState(tomorrowStr());
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    dmbExtraAdminAPI.hubTransfers({ date }).then((r) => setRows(r.data.transfers)).catch((e) => notify('error', errText(e, 'Could not load transfers')));
  }, [date, notify]);
  useEffect(() => { load(); }, [load]);
  const regenerate = async (row, which) => {
    try { await dmbExtraAdminAPI.regenerateHubPin(row._id, which); notify('success', 'A new PIN was issued and the lock cleared'); load(); } catch (e) { notify('error', errText(e, 'Could not issue a PIN')); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={`${inputCls} w-auto`} />
        <button type="button" onClick={load} aria-label="Refresh" className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><RefreshCw size={16} /></button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-500 text-left"><th className="px-4 py-3 font-bold">Items</th><th className="px-4 py-3 font-bold">From → Hub</th><th className="px-4 py-3 font-bold">Source driver</th><th className="px-4 py-3 font-bold">Zone driver</th><th className="px-4 py-3 font-bold">Status</th><th /></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No transfers on this day.</td></tr>
                : rows.map((r) => {
                  const st = STATUS[r.status] || STATUS.pending_drop;
                  return (
                    <tr key={r._id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{(r.items || []).map((i) => `${i.quantity}× ${i.description}`).join(', ')}<span className="block text-[11px] text-slate-400 capitalize">{r.slotKey}</span></td>
                      <td className="px-4 py-3 text-slate-600">{r.from} → {r.hub}</td>
                      <td className="px-4 py-3 text-slate-600">{r.sourceDriver || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.zoneDriver || '—'}</td>
                      <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                        {(r.dropAttempts >= 3 || r.pickupAttempts >= 3) && <span className="block text-[11px] text-red-600 font-semibold">PIN locked</span>}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {r.status === 'pending_drop' && <button type="button" onClick={() => regenerate(r, 'drop')} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><KeyRound size={13} /> New drop PIN</button>}
                        {r.status === 'holding' && <button type="button" onClick={() => regenerate(r, 'pickup')} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><KeyRound size={13} /> New pickup PIN</button>}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Hubs() {
  const [tab, setTab] = useState('hubs');
  const [toast, setToast] = useState(null);
  const notify = useCallback((type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); }, []);
  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><Boxes size={22} /></div>
        <div><h1 className="text-2xl font-black text-slate-800">Hubs</h1><p className="text-sm text-slate-500">Vendors that pass items between zones, and every hand-over of the day. Switch cross-zone delivery on and set the surcharge in Admin Controls (ACM-187).</p></div>
      </div>
      <div className="flex gap-2 mb-6" role="tablist">
        {[['hubs', 'Hubs'], ['transfers', 'Transfers']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      {tab === 'hubs' ? <HubsTab notify={notify} /> : <TransfersTab notify={notify} />}
      {toast && <div role="status" className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white-force ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>{toast.msg}</div>}
    </div>
  );
}
